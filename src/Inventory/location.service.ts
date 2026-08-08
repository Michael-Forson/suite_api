import { Prisma } from "./generated/prisma-inventory/client.js";
import { inventoryPrisma } from "./prismaInventory.js";
import {
  assertBranchBelongsToOrg,
  getDefaultBranchId,
} from "./branch.service.js";

/**
 * Stock locations — the places inside a branch where stock actually sits.
 *
 * The sibling of `branch.service.ts`, and deliberately shaped like it: resolve
 * an optional caller-supplied id, fall back to a default, validate on write.
 * The difference is which database owns the row. Branches live in core, so that
 * file guards a reference no foreign key can protect. Locations live here, with
 * real FKs, because no other app has an opinion about which shelf something is
 * on.
 *
 * ## Why the default is created lazily
 *
 * Every branch needs exactly one default location, the way every organization
 * needs exactly one default branch. The obvious place to create it is wherever
 * branches are created — but branches are created inside a *core* database
 * transaction (`org.controller.ts`), and this row lives in the inventory
 * database. No transaction spans both. A hook there could commit the branch and
 * then fail to write the location, leaving a branch that can never take stock.
 *
 * So `getDefaultLocationId` creates it on demand instead. That has no ordering
 * to get wrong, cannot be missed by a caller that forgot to call a hook, and is
 * naturally idempotent. `backfill-default-locations.ts` exists only to pre-warm
 * these rows so the first stock movement of the day is not also a schema write —
 * skipping it costs nothing but that.
 */

/** Matches core's `DEFAULT_BRANCH_CODE`; the location analogue of "MAIN". */
export const DEFAULT_LOCATION_CODE = "MAIN";
export const DEFAULT_LOCATION_NAME = "Main";

/**
 * The branch's default location, created if it does not exist yet.
 *
 * Concurrent first-movements for the same branch race here, so the create is an
 * upsert against `(branchId, code)`: the loser of the race finds the winner's
 * row rather than failing on the unique constraint.
 */
export const getDefaultLocationId = async (
  organizationId: string,
  branchId: string,
  client: Prisma.TransactionClient = inventoryPrisma,
): Promise<string> => {
  const existing = await client.stockLocation.findFirst({
    where: { organizationId, branchId, isDefault: true, deletedAt: null },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Only reachable if the default was archived without another being promoted.
  // Any live location beats failing the write.
  const fallback = await client.stockLocation.findFirst({
    where: { organizationId, branchId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (fallback) return fallback.id;

  const created = await client.stockLocation.upsert({
    where: { branchId_code: { branchId, code: DEFAULT_LOCATION_CODE } },
    update: {},
    create: {
      organizationId,
      branchId,
      name: DEFAULT_LOCATION_NAME,
      code: DEFAULT_LOCATION_CODE,
      type: "PHYSICAL",
      isDefault: true,
      isSellable: true,
    },
    select: { id: true },
  });

  return created.id;
};

/**
 * Guards a caller-supplied location: it must exist, be live, and belong to this
 * tenant. Without this a caller could post stock into another organization's
 * location — the FK proves the location exists, not that it is theirs.
 */
export const assertLocationBelongsToOrg = async (
  organizationId: string,
  locationId: string,
  client: Prisma.TransactionClient = inventoryPrisma,
): Promise<{ id: string; branchId: string; isSellable: boolean }> => {
  const location = await client.stockLocation.findFirst({
    where: { id: locationId, organizationId, deletedAt: null },
    select: { id: true, branchId: true, isSellable: true },
  });

  if (!location) {
    throw new Error(
      `Location ${locationId} does not belong to organization ${organizationId}, or has been deleted.`,
    );
  }

  return location;
};

/**
 * The shape every inventory write path wants: takes whatever the caller
 * supplied — a location, only a branch, or nothing at all — and returns a
 * validated location plus the branch to denormalize alongside it.
 *
 * A single-location business supplies neither and lands in the default of the
 * default branch, never having to know this model exists.
 */
export const resolveLocation = async (
  organizationId: string,
  input: { locationId?: string | null; branchId?: string | null },
  client: Prisma.TransactionClient = inventoryPrisma,
): Promise<{ locationId: string; branchId: string }> => {
  if (input.locationId) {
    const location = await assertLocationBelongsToOrg(
      organizationId,
      input.locationId,
      client,
    );

    // A location knows its own branch. If the caller named both and they
    // disagree, one of the two is a bug — guessing which would post stock
    // somewhere nobody asked for.
    if (input.branchId && input.branchId !== location.branchId) {
      throw new Error(
        `Location ${input.locationId} belongs to branch ${location.branchId}, but the caller supplied branch ${input.branchId}.`,
      );
    }

    return { locationId: location.id, branchId: location.branchId };
  }

  let branchId: string;

  if (input.branchId) {
    await assertBranchBelongsToOrg(organizationId, input.branchId);
    branchId = input.branchId;
  } else {
    branchId = await getDefaultBranchId(organizationId);
  }

  return {
    locationId: await getDefaultLocationId(organizationId, branchId, client),
    branchId,
  };
};
