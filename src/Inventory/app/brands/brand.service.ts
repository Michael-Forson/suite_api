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
import type { CreateBrandInput, UpdateBrandInput } from "./brand.types.js";

/**
 * Brands — a flat label on a product, and the simplest module here.
 *
 * `Brand` has no unique index in the schema, unlike `Unit`, so uniqueness is a
 * service-layer promise rather than a database one: a case-insensitive check
 * before write. That leaves a narrow race two concurrent creates of the same
 * name could win together. Accepted on purpose — a duplicate brand is a
 * cosmetic annoyance an admin can merge, whereas adding the constraint would
 * permanently hold names hostage to soft-deleted rows the way `Unit` does.
 */

const NAME_MAX = 150;

export const BRAND_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

const parseName = (value: unknown): string => {
  const name = normalizeRequiredText(value, NAME_MAX);
  if (!name) {
    throw badRequest(`A brand name of 1-${NAME_MAX} characters is required`);
  }
  return name;
};

const assertNameFree = async (
  organizationId: string,
  name: string,
  excludeId?: string,
) => {
  const clash = await inventoryPrisma.brand.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (clash) throw duplicate(`A brand named "${name}" already exists`);
};

export const createBrand = async (
  organizationId: string,
  input: CreateBrandInput,
) => {
  const name = parseName(input.name);
  await assertNameFree(organizationId, name);

  return inventoryPrisma.brand.create({
    data: { organizationId, name },
    select: BRAND_SELECT,
  });
};

export const getBrand = async (organizationId: string, brandId: string) => {
  const brand = await inventoryPrisma.brand.findFirst({
    where: { id: brandId, organizationId },
    select: BRAND_SELECT,
  });

  if (!brand) throw notFound("Brand not found");
  return brand;
};

export const updateBrand = async (
  organizationId: string,
  brandId: string,
  input: UpdateBrandInput,
) => {
  const existing = await getBrand(organizationId, brandId);
  if (existing.deletedAt) throw notFound("Brand not found");

  if (input.name === undefined) throw badRequest("Provide a name to update");

  const name = parseName(input.name);
  await assertNameFree(organizationId, name, existing.id);

  return inventoryPrisma.brand.update({
    where: { id: existing.id },
    data: { name },
    select: BRAND_SELECT,
  });
};

/**
 * Soft delete, refused while products still carry the brand.
 *
 * `Product.brandId` is `onDelete: SetNull`, so the database would happily
 * un-brand the catalog on a hard delete. Doing that quietly on a soft delete
 * would lose information nobody asked to lose — clear the brand on the products
 * first and the intent is on the record.
 */
export const deleteBrand = async (organizationId: string, brandId: string) => {
  const brand = await getBrand(organizationId, brandId);
  if (brand.deletedAt) throw notFound("Brand not found");

  const productCount = await inventoryPrisma.product.count({
    where: { organizationId, brandId, deletedAt: null },
  });

  if (productCount > 0) {
    throw inUse(
      `This brand is used by ${productCount} product(s) and cannot be deleted`,
    );
  }

  return inventoryPrisma.brand.update({
    where: { id: brand.id },
    data: { deletedAt: new Date() },
    select: BRAND_SELECT,
  });
};

export const restoreBrand = async (organizationId: string, brandId: string) => {
  const brand = await getBrand(organizationId, brandId);
  if (!brand.deletedAt) throw badRequest("This brand is not archived");

  await assertNameFree(organizationId, brand.name, brand.id);

  return inventoryPrisma.brand.update({
    where: { id: brand.id },
    data: { deletedAt: null },
    select: BRAND_SELECT,
  });
};

export const listBrands = async (organizationId: string, query: ListQuery) => {
  const where = {
    ...scopeWhere(organizationId, query),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    inventoryPrisma.brand.findMany({
      where,
      select: BRAND_SELECT,
      orderBy: { name: "asc" },
      take: query.take,
      skip: query.skip,
    }),
    inventoryPrisma.brand.count({ where }),
  ]);

  return paginated(items, total, query);
};
