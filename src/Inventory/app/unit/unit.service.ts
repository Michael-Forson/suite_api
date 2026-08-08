import { Prisma } from "../../generated/prisma-inventory/client.js";
import { inventoryPrisma } from "../../prismaInventory.js";
import { normalizeRequiredText } from "../../../utils/validation.utils.js";
import {
  badRequest,
  duplicate,
  inUse,
  notFound,
} from "../../shared/inventory.errors.js";
import {
  ListQuery,
  paginated,
  scopeWhere,
} from "../../shared/inventory.utils.js";
import type { CreateUnitInput, UpdateUnitInput } from "./unit.types.js";

/**
 * Units of measure — the vocabulary a product is stocked in.
 *
 * Small, but load-bearing: `Product.baseUnitId` is required and
 * `InventoryMovement.unitId` stamps every ledger row, so a unit is referenced
 * from an append-only table. That is why `deleteUnit` refuses rather than
 * cascades — a movement whose unit vanished is a quantity nobody can read, and
 * the row cannot be edited to say otherwise.
 */

const NAME_MAX = 100;
const SYMBOL_MAX = 20;

export const UNIT_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  symbol: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/**
 * Seeded into every organization the first time it looks at its units. Chosen
 * to cover retail and light wholesale without becoming a list nobody reads;
 * anything else the org adds itself.
 */
export const DEFAULT_UNITS: ReadonlyArray<{ name: string; symbol: string }> = [
  { name: "Piece", symbol: "pc" },
  { name: "Pack", symbol: "pack" },
  { name: "Box", symbol: "box" },
  { name: "Carton", symbol: "ctn" },
  { name: "Dozen", symbol: "dz" },
  { name: "Kilogram", symbol: "kg" },
  { name: "Gram", symbol: "g" },
  { name: "Litre", symbol: "L" },
  { name: "Millilitre", symbol: "ml" },
  { name: "Metre", symbol: "m" },
];

const parseName = (value: unknown): string => {
  const name = normalizeRequiredText(value, NAME_MAX);
  if (!name) {
    throw badRequest(`A unit name of 1-${NAME_MAX} characters is required`);
  }
  return name;
};

const parseSymbol = (value: unknown): string => {
  const symbol = normalizeRequiredText(value, SYMBOL_MAX);
  if (!symbol) {
    throw badRequest(`A unit symbol of 1-${SYMBOL_MAX} characters is required`);
  }
  return symbol;
};

/**
 * `Unit` carries `@@unique([organizationId, name])`, so the database is the
 * arbiter and this only translates its complaint. Pre-checking would race:
 * two concurrent creates of "Box" would both find nothing and one would still
 * hit the constraint.
 */
const asDuplicateName = (error: unknown, name: string): unknown => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return duplicate(`A unit named "${name}" already exists`);
  }
  return error;
};

/**
 * Idempotent, and safe to call on every list. `skipDuplicates` makes the second
 * caller a no-op rather than a constraint violation, which is what lets this be
 * lazy instead of an org-creation hook — that hook would have to run inside a
 * *core* database transaction and write the inventory database, the same
 * cross-database hazard `location.service.ts` documents at length.
 */
export const seedDefaultUnits = async (
  organizationId: string,
  client: Prisma.TransactionClient = inventoryPrisma,
): Promise<number> => {
  const result = await client.unit.createMany({
    data: DEFAULT_UNITS.map((unit) => ({
      organizationId,
      name: unit.name,
      symbol: unit.symbol,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  return result.count;
};

export const createUnit = async (
  organizationId: string,
  input: CreateUnitInput,
) => {
  const name = parseName(input.name);
  const symbol = parseSymbol(input.symbol);

  try {
    return await inventoryPrisma.unit.create({
      data: { organizationId, name, symbol, isSystem: false },
      select: UNIT_SELECT,
    });
  } catch (error) {
    throw asDuplicateName(error, name);
  }
};

export const getUnit = async (organizationId: string, unitId: string) => {
  const unit = await inventoryPrisma.unit.findFirst({
    where: { id: unitId, organizationId },
    select: UNIT_SELECT,
  });

  if (!unit) throw notFound("Unit not found");
  return unit;
};

export const updateUnit = async (
  organizationId: string,
  unitId: string,
  input: UpdateUnitInput,
) => {
  const existing = await getUnit(organizationId, unitId);
  if (existing.deletedAt) throw notFound("Unit not found");

  const data: { name?: string; symbol?: string } = {};
  if (input.name !== undefined) data.name = parseName(input.name);
  if (input.symbol !== undefined) data.symbol = parseSymbol(input.symbol);

  if (!Object.keys(data).length) {
    throw badRequest("Provide a name or a symbol to update");
  }

  try {
    return await inventoryPrisma.unit.update({
      where: { id: existing.id },
      data,
      select: UNIT_SELECT,
    });
  } catch (error) {
    throw asDuplicateName(error, data.name ?? existing.name);
  }
};

/**
 * Soft delete, and only when nothing points at the unit.
 *
 * Note what the soft delete does *not* free: `@@unique([organizationId, name])`
 * still holds the name, so recreating a deleted "Box" returns 409. That is the
 * same trade-off the schema already accepts for `ProductVariant.sku`, and
 * relaxing it would mean giving up the constraint that keeps duplicates out in
 * the first place. Restoring the archived row is the intended path.
 */
export const deleteUnit = async (organizationId: string, unitId: string) => {
  const unit = await getUnit(organizationId, unitId);
  if (unit.deletedAt) throw notFound("Unit not found");

  if (unit.isSystem) {
    throw badRequest(
      "Default units cannot be deleted. Rename it instead if the label is wrong.",
    );
  }

  const [productCount, movementCount] = await Promise.all([
    inventoryPrisma.product.count({
      where: { baseUnitId: unitId, deletedAt: null },
    }),
    inventoryPrisma.inventoryMovement.count({ where: { unitId } }),
  ]);

  if (productCount > 0) {
    throw inUse(
      `This unit is the base unit of ${productCount} product(s) and cannot be deleted`,
    );
  }

  // The ledger is append-only: a movement stamped with this unit can never be
  // rewritten to name another one, so the unit has to outlive it.
  if (movementCount > 0) {
    throw inUse(
      "This unit is recorded on stock movements and cannot be deleted",
    );
  }

  return inventoryPrisma.unit.update({
    where: { id: unitId },
    data: { deletedAt: new Date() },
    select: UNIT_SELECT,
  });
};

export const restoreUnit = async (organizationId: string, unitId: string) => {
  const unit = await getUnit(organizationId, unitId);
  if (!unit.deletedAt) throw badRequest("This unit is not archived");

  return inventoryPrisma.unit.update({
    where: { id: unitId },
    data: { deletedAt: null },
    select: UNIT_SELECT,
  });
};

/**
 * Seeds the defaults on the org's first look. `seedDefaultUnits` is idempotent,
 * so the check is an optimization, not a correctness guard — two concurrent
 * first-lists both seed and both succeed.
 */
export const listUnits = async (organizationId: string, query: ListQuery) => {
  const total = await inventoryPrisma.unit.count({
    where: { organizationId },
  });

  if (total === 0) await seedDefaultUnits(organizationId);

  const where = {
    ...scopeWhere(organizationId, query),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            {
              symbol: { contains: query.search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };

  const [items, matching] = await Promise.all([
    inventoryPrisma.unit.findMany({
      where,
      select: UNIT_SELECT,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      take: query.take,
      skip: query.skip,
    }),
    inventoryPrisma.unit.count({ where }),
  ]);

  return paginated(items, matching, query);
};
