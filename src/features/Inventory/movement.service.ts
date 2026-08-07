import { Prisma } from "../../generated/prisma-inventory/client.js";
import { inventoryPrisma } from "../../prismaInventory.js";
import { resolveBranchId } from "./branch.service.js";

/**
 * The only writer of `inventory_movements`.
 *
 * Everything that moves stock — receipts, sales, adjustments, transfers,
 * opening balances — funnels through `postMovement`. Nothing else appends to the
 * ledger, because the ledger is append-only: a row written with the wrong
 * `balanceAfter` cannot be corrected, only compensated, and a compensating row
 * does not repair the history a report reads.
 *
 * ## Why this file exists at all
 *
 * `balanceAfter` is the trap. The obvious implementation reads the current
 * on-hand, adds the delta, and writes both the movement and the new cache value:
 *
 *     const inv = await tx.inventory.findUnique(...);      // reads 100
 *     const balanceAfter = inv.quantity + delta;           // computes 110
 *     await tx.inventoryMovement.create({ balanceAfter }); // writes 110
 *
 * Two concurrent receipts of 10 both read 100, both compute 110, and both write
 * 110. On-hand ends at 110 when it should be 120, and the ledger now contains
 * two rows claiming the same closing balance — an audit trail that does not add
 * up and cannot be edited. Nothing in the schema prevents this; a transaction
 * alone does not either, because Postgres' default READ COMMITTED isolation
 * happily lets both reads see the pre-write value.
 *
 * So this module never reads-then-writes. `applyDelta` below performs one
 * atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING quantity`: Postgres takes
 * the row lock, applies the arithmetic, and hands back the post-write value. The
 * second concurrent poster blocks on that lock until the first commits, then
 * reads 110 and returns 120. `balanceAfter` is whatever that statement returned,
 * never a number this process calculated from a stale read.
 *
 * That single statement is why there is no explicit `SELECT … FOR UPDATE` here.
 * A separate lock-then-compute would also be correct, but it needs the
 * `Inventory` row to already exist, and the first movement for a variant+branch
 * is exactly when it does not — leaving a create/lock race in the one path the
 * lock was meant to protect.
 */

/** Direction is carried by `type`; `quantity` is always positive. */
export type MovementType = "IN" | "OUT";

export type ReferenceType =
  | "PURCHASE"
  | "SALE"
  | "ADJUSTMENT"
  | "TRANSFER"
  | "RETURN"
  | "OPENING"
  | "MANUAL";

export interface PostMovementInput {
  organizationId: string;
  variantId: string;
  /** Optional: resolved through `branch.service.ts`, defaulting to the org's default branch. */
  branchId?: string | null;
  type: MovementType;
  /** Must be > 0. Expressed in the product's base unit — see `assertBaseUnit`. */
  quantity: Prisma.Decimal | number | string;
  unitCost?: Prisma.Decimal | number | string;
  referenceType: ReferenceType;
  referenceId?: string | null;
  /**
   * Batch this movement draws from. Rejected unless the org has
   * `InventorySettings.lotTracking` on; required once it does.
   */
  lotId?: string | null;
  /**
   * The unit `quantity` is expressed in. Optional, and validated rather than
   * trusted: if supplied it must equal the product's `baseUnitId`. Callers that
   * omit it are asserting the same thing implicitly.
   */
  unitId?: string | null;
  reason?: string | null;
  createdBy?: string | null;
  /** Refuse to drive on-hand below zero. Off for adjustments and corrections. */
  allowNegative?: boolean;
}

/**
 * Resolves the variant's stocking unit and rejects any other.
 *
 * `Product.baseUnitId` says what a quantity means, but nothing on a movement
 * used to. Receive "1 box of 12" and `quantity = 1` enters an immutable ledger
 * indistinguishable from one single item — no later migration can tell the two
 * apart. Until a real conversion model exists (`Unit.baseUnitId` + `factor`),
 * base-unit-only is the hard rule, enforced here and stamped onto every row so
 * the guarantee is recorded in the data rather than assumed of the code.
 */
const assertBaseUnit = async (
  tx: Prisma.TransactionClient,
  variantId: string,
  organizationId: string,
  suppliedUnitId?: string | null,
): Promise<{ baseUnitId: string; trackInventory: boolean }> => {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId, organizationId, deletedAt: null },
    select: {
      product: { select: { baseUnitId: true, trackInventory: true } },
    },
  });

  if (!variant) {
    throw new Error(
      `Variant ${variantId} does not belong to organization ${organizationId}, or has been deleted.`,
    );
  }

  const { baseUnitId, trackInventory } = variant.product;

  if (suppliedUnitId && suppliedUnitId !== baseUnitId) {
    throw new Error(
      `Movement for variant ${variantId} was posted in unit ${suppliedUnitId}, but its stocking unit is ${baseUnitId}. ` +
        `Convert the quantity to the base unit before posting — the ledger stores base units only, and the row cannot be corrected afterwards.`,
    );
  }

  return { baseUnitId, trackInventory };
};

/**
 * Rejects a lot on an org that does not track them, and demands one on an org
 * that does. Half-populated `lotId`s are worse than none: they make the column
 * look authoritative while stock silently splits between "batch X" and "no
 * batch", which no recall report can reconcile.
 */
const assertLotConsistent = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  variantId: string,
  lotId?: string | null,
): Promise<string | null> => {
  const settings = await tx.inventorySettings.findUnique({
    where: { organizationId },
    select: { lotTracking: true },
  });

  const lotTracking = settings?.lotTracking ?? false;

  if (!lotTracking) {
    if (lotId) {
      throw new Error(
        `Movement supplied lot ${lotId}, but organization ${organizationId} does not have lot tracking enabled.`,
      );
    }
    return null;
  }

  if (!lotId) {
    throw new Error(
      `Organization ${organizationId} tracks lots, so every movement must name one. Variant ${variantId} was posted without a lot.`,
    );
  }

  const lot = await tx.stockLot.findFirst({
    where: { id: lotId, organizationId, variantId },
    select: { id: true },
  });

  if (!lot) {
    throw new Error(
      `Lot ${lotId} does not exist for variant ${variantId} in organization ${organizationId}.`,
    );
  }

  return lotId;
};

/**
 * Applies `delta` to the on-hand cache and returns the value *after* the write.
 *
 * This is the concurrency control for the entire ledger. The statement is a
 * single atomic upsert, so Postgres serializes concurrent posters for the same
 * variant+branch+lot on the row lock: the loser blocks until the winner commits
 * and then reads the committed value, rather than both proceeding from the same
 * stale number.
 *
 * The `ON CONFLICT` target relies on the `inventory` unique index being declared
 * `NULLS NOT DISTINCT` (see `sql/inventory-constraints.sql`). Under a plain
 * unique index Postgres treats every NULL `lot_id` as distinct, no conflict is
 * ever detected for untracked stock, and this silently inserts a fresh row per
 * movement — on-hand would read as the last delta rather than the running total.
 */
const applyDelta = async (
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    variantId: string;
    branchId: string;
    lotId: string | null;
    delta: Prisma.Decimal;
  },
): Promise<Prisma.Decimal> => {
  // `delta` goes over the wire as a string and is cast in SQL: a Decimal object
  // has no reliable serialization through the driver, and routing it via
  // JS number would quietly round at 15 significant digits — on a column
  // deliberately declared numeric(18,4).
  const rows = await tx.$queryRaw<Array<{ quantity: string | Prisma.Decimal }>>`
    INSERT INTO inventory (id, organization_id, variant_id, branch_id, lot_id, quantity, updated_at)
    VALUES (
      gen_random_uuid(),
      ${params.organizationId}::uuid,
      ${params.variantId}::uuid,
      ${params.branchId}::uuid,
      ${params.lotId}::uuid,
      ${params.delta.toString()}::numeric(18,4),
      now()
    )
    ON CONFLICT (variant_id, branch_id, lot_id) DO UPDATE
      SET quantity = inventory.quantity + EXCLUDED.quantity,
          updated_at = now()
    RETURNING quantity
  `;

  const row = rows[0];

  if (!row) {
    // Unreachable: the upsert either inserts or updates, and both RETURNING.
    throw new Error(
      `Upsert of inventory for variant ${params.variantId} at branch ${params.branchId} returned no row.`,
    );
  }

  return new Prisma.Decimal(row.quantity);
};

/**
 * Appends one movement and moves the on-hand cache with it, in one transaction.
 *
 * Pass an existing `tx` when the movement is part of a larger document — a
 * transfer posts its OUT and IN rows together, and neither should survive alone.
 */
export const postMovement = async (
  input: PostMovementInput,
  tx?: Prisma.TransactionClient,
) => {
  const run = async (client: Prisma.TransactionClient) => {
    const quantity = new Prisma.Decimal(input.quantity);

    if (quantity.lessThanOrEqualTo(0)) {
      throw new Error(
        `Movement quantity must be positive; direction comes from \`type\`. Got ${quantity.toString()}.`,
      );
    }

    const branchId = await resolveBranchId(input.organizationId, input.branchId);

    const { baseUnitId, trackInventory } = await assertBaseUnit(
      client,
      input.variantId,
      input.organizationId,
      input.unitId,
    );

    if (!trackInventory) {
      throw new Error(
        `Variant ${input.variantId} belongs to a product with \`trackInventory\` off (a service or non-stock item) and cannot take stock movements.`,
      );
    }

    const lotId = await assertLotConsistent(
      client,
      input.organizationId,
      input.variantId,
      input.lotId,
    );

    const delta = input.type === "IN" ? quantity : quantity.negated();

    // The lock is taken here, and `balanceAfter` is the value this statement
    // returned — never a number computed from an earlier read.
    const balanceAfter = await applyDelta(client, {
      organizationId: input.organizationId,
      variantId: input.variantId,
      branchId,
      lotId,
      delta,
    });

    if (!input.allowNegative && balanceAfter.lessThan(0)) {
      // Rolls back the upsert above along with the rest of the transaction.
      throw new Error(
        `Movement would take variant ${input.variantId} at branch ${branchId} to ${balanceAfter.toString()}. ` +
          `Pass \`allowNegative\` if this is a correction that is meant to.`,
      );
    }

    return client.inventoryMovement.create({
      data: {
        organizationId: input.organizationId,
        variantId: input.variantId,
        branchId,
        lotId,
        type: input.type,
        quantity,
        unitId: baseUnitId,
        unitCost: new Prisma.Decimal(input.unitCost ?? 0),
        balanceAfter,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        reason: input.reason ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
  };

  return tx ? run(tx) : inventoryPrisma.$transaction(run);
};

/**
 * Corrects a movement by appending its opposite. The original row is never
 * touched — that is the whole point of an append-only ledger.
 *
 * Note that the reversal is a normal movement and gets its own `balanceAfter`
 * from the same locked upsert, so it stays correct under concurrency too.
 */
export const reverseMovement = async (
  movementId: string,
  organizationId: string,
  reason: string,
  createdBy?: string | null,
  tx?: Prisma.TransactionClient,
) => {
  const run = async (client: Prisma.TransactionClient) => {
    const original = await client.inventoryMovement.findFirst({
      where: { id: movementId, organizationId },
    });

    if (!original) {
      throw new Error(
        `Movement ${movementId} not found in organization ${organizationId}.`,
      );
    }

    return postMovement(
      {
        organizationId,
        variantId: original.variantId,
        branchId: original.branchId,
        lotId: original.lotId,
        type: original.type === "IN" ? "OUT" : "IN",
        quantity: original.quantity,
        unitCost: original.unitCost,
        referenceType: original.referenceType,
        referenceId: original.referenceId,
        reason,
        createdBy,
        // A reversal must be able to undo stock that has since been sold.
        allowNegative: true,
      },
      client,
    );
  };

  return tx ? run(tx) : inventoryPrisma.$transaction(run);
};
