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
import type {
  CategoryTreeNode,
  CreateCategoryInput,
  SerializedCategory,
  UpdateCategoryInput,
} from "./category.types.js";

/**
 * Product categories — a tree, via the self-referencing `parentCategoryId`.
 *
 * Three rules the database cannot enforce and this file therefore must:
 *
 * 1. **Tenancy of the parent.** The FK proves the parent row exists, not that it
 *    belongs to the caller's organization. Without an explicit check a caller
 *    could hang their category off another tenant's tree and read its shape.
 * 2. **No cycles.** `A → B → A` is a perfectly valid pair of foreign keys and an
 *    infinite loop for every reader. `moveCategory` walks the ancestor chain
 *    before committing.
 * 3. **Depth.** Unbounded nesting renders as an unusable UI and makes the walk
 *    in rule 2 unbounded too.
 */

const NAME_MAX = 150;

/**
 * Five levels — e.g. Grocery → Beverages → Soft Drinks → Cola → Diet — is past
 * the point where a person can hold the path in their head. Deeper than this
 * usually wants attributes, not more nesting.
 */
export const MAX_CATEGORY_DEPTH = 5;

export const CATEGORY_SELECT = {
  id: true,
  organizationId: true,
  parentCategoryId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

const parseName = (value: unknown): string => {
  const name = normalizeRequiredText(value, NAME_MAX);
  if (!name) {
    throw badRequest(`A category name of 1-${NAME_MAX} characters is required`);
  }
  return name;
};

/**
 * Live category, or a 404. Every other function starts here, so a bad id can
 * never reach a write.
 */
const requireLiveCategory = async (
  organizationId: string,
  categoryId: string,
) => {
  const category = await inventoryPrisma.category.findFirst({
    where: { id: categoryId, organizationId, deletedAt: null },
    select: CATEGORY_SELECT,
  });

  if (!category) throw notFound("Category not found");
  return category;
};

/**
 * Distance from the root, counting the category itself as 1.
 *
 * Bounded by `MAX_CATEGORY_DEPTH + 1` iterations rather than trusting the data:
 * if a cycle ever did get written — by a migration, a manual SQL fix — this
 * still returns instead of spinning.
 */
const depthOf = async (
  organizationId: string,
  categoryId: string,
): Promise<number> => {
  let depth = 1;
  let cursor: string | null = categoryId;

  while (cursor && depth <= MAX_CATEGORY_DEPTH + 1) {
    const parent: { parentCategoryId: string | null } | null =
      await inventoryPrisma.category.findFirst({
        where: { id: cursor, organizationId },
        select: { parentCategoryId: true },
      });

    cursor = parent?.parentCategoryId ?? null;
    if (cursor) depth += 1;
  }

  return depth;
};

/** True when `ancestorId` appears above `categoryId`, or is it. */
const isAncestorOf = async (
  organizationId: string,
  ancestorId: string,
  categoryId: string,
): Promise<boolean> => {
  let cursor: string | null = categoryId;
  let steps = 0;

  while (cursor && steps <= MAX_CATEGORY_DEPTH + 1) {
    if (cursor === ancestorId) return true;

    const parent: { parentCategoryId: string | null } | null =
      await inventoryPrisma.category.findFirst({
        where: { id: cursor, organizationId },
        select: { parentCategoryId: true },
      });

    cursor = parent?.parentCategoryId ?? null;
    steps += 1;
  }

  return false;
};

/**
 * The schema has no unique index on category names — two "Accessories" under
 * different parents are legitimate — so uniqueness is enforced per sibling
 * group here. Case-insensitive, because "Drinks" and "drinks" side by side is a
 * data-entry mistake every time.
 */
const assertNameFreeAmongSiblings = async (
  organizationId: string,
  name: string,
  parentCategoryId: string | null,
  excludeId?: string,
) => {
  const clash = await inventoryPrisma.category.findFirst({
    where: {
      organizationId,
      parentCategoryId,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (clash) {
    throw duplicate(
      parentCategoryId
        ? `A category named "${name}" already exists under this parent`
        : `A top-level category named "${name}" already exists`,
    );
  }
};

/** Validates a caller-supplied parent: live, same tenant, room beneath it. */
const resolveParent = async (
  organizationId: string,
  parentCategoryId: string | null | undefined,
): Promise<string | null> => {
  if (!parentCategoryId) return null;

  const parent = await inventoryPrisma.category.findFirst({
    where: { id: parentCategoryId, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (!parent) throw badRequest("Parent category not found");

  const parentDepth = await depthOf(organizationId, parent.id);
  if (parentDepth >= MAX_CATEGORY_DEPTH) {
    throw badRequest(
      `Categories cannot nest more than ${MAX_CATEGORY_DEPTH} levels deep`,
    );
  }

  return parent.id;
};

export const createCategory = async (
  organizationId: string,
  input: CreateCategoryInput,
) => {
  const name = parseName(input.name);
  const parentCategoryId = await resolveParent(
    organizationId,
    input.parentCategoryId,
  );

  await assertNameFreeAmongSiblings(organizationId, name, parentCategoryId);

  return inventoryPrisma.category.create({
    data: { organizationId, name, parentCategoryId },
    select: CATEGORY_SELECT,
  });
};

export const getCategory = async (
  organizationId: string,
  categoryId: string,
) => {
  const category = await inventoryPrisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: CATEGORY_SELECT,
  });

  if (!category) throw notFound("Category not found");
  return category;
};

/** Renames only. Reparenting is `moveCategory`, which has cycles to worry about. */
export const updateCategory = async (
  organizationId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) => {
  const existing = await requireLiveCategory(organizationId, categoryId);

  if (input.name === undefined) {
    throw badRequest("Provide a name to update");
  }

  const name = parseName(input.name);
  await assertNameFreeAmongSiblings(
    organizationId,
    name,
    existing.parentCategoryId,
    existing.id,
  );

  return inventoryPrisma.category.update({
    where: { id: existing.id },
    data: { name },
    select: CATEGORY_SELECT,
  });
};

/**
 * Reparents a category, subtree and all.
 *
 * The cycle check is the whole point: making a category a descendant of itself
 * detaches its subtree from every root, so nothing lists it and nothing can
 * reach it to put it back. The depth check runs against the *deepest* leaf
 * below it, not the category itself — moving a three-level subtree under a
 * level-three parent would otherwise land at six.
 */
export const moveCategory = async (
  organizationId: string,
  categoryId: string,
  newParentId: string | null,
) => {
  const category = await requireLiveCategory(organizationId, categoryId);

  if (newParentId === categoryId) {
    throw badRequest("A category cannot be its own parent");
  }

  if (!newParentId) {
    if (category.parentCategoryId === null) return category;
    await assertNameFreeAmongSiblings(
      organizationId,
      category.name,
      null,
      category.id,
    );
    return inventoryPrisma.category.update({
      where: { id: category.id },
      data: { parentCategoryId: null },
      select: CATEGORY_SELECT,
    });
  }

  const parent = await inventoryPrisma.category.findFirst({
    where: { id: newParentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!parent) throw badRequest("Parent category not found");

  if (await isAncestorOf(organizationId, categoryId, newParentId)) {
    throw badRequest(
      "A category cannot be moved beneath one of its own descendants",
    );
  }

  const parentDepth = await depthOf(organizationId, parent.id);
  const subtreeHeight = await heightOf(organizationId, categoryId);
  if (parentDepth + subtreeHeight > MAX_CATEGORY_DEPTH) {
    throw badRequest(
      `That move would nest categories more than ${MAX_CATEGORY_DEPTH} levels deep`,
    );
  }

  await assertNameFreeAmongSiblings(
    organizationId,
    category.name,
    parent.id,
    category.id,
  );

  return inventoryPrisma.category.update({
    where: { id: category.id },
    data: { parentCategoryId: parent.id },
    select: CATEGORY_SELECT,
  });
};

/** Levels in the subtree rooted at `categoryId`, counting itself as 1. */
const heightOf = async (
  organizationId: string,
  categoryId: string,
): Promise<number> => {
  const all = await inventoryPrisma.category.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, parentCategoryId: true },
  });

  const childrenOf = new Map<string, string[]>();
  for (const row of all) {
    const key = row.parentCategoryId ?? "";
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(row.id);
    childrenOf.set(key, siblings);
  }

  // Iterative rather than recursive: the guard above bounds real depth, but a
  // corrupted parent chain would blow the stack, and this cannot.
  let height = 0;
  let level = [categoryId];
  const seen = new Set<string>();

  while (level.length && height <= MAX_CATEGORY_DEPTH + 1) {
    height += 1;
    const next: string[] = [];
    for (const id of level) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(...(childrenOf.get(id) ?? []));
    }
    level = next;
  }

  return height;
};

/**
 * Soft delete, refused while anything still hangs off the category.
 *
 * `Product.categoryId` is required and `onDelete: Restrict`, so there is no
 * detach to offer — a product must always name a category. Children are
 * refused for the same reason a parent cannot silently vanish beneath them:
 * move them first, and the intent is explicit.
 */
export const deleteCategory = async (
  organizationId: string,
  categoryId: string,
) => {
  const category = await requireLiveCategory(organizationId, categoryId);

  const [childCount, productCount] = await Promise.all([
    inventoryPrisma.category.count({
      where: { organizationId, parentCategoryId: categoryId, deletedAt: null },
    }),
    inventoryPrisma.product.count({
      where: { organizationId, categoryId, deletedAt: null },
    }),
  ]);

  if (childCount > 0) {
    throw inUse(
      `This category has ${childCount} sub-categor${childCount === 1 ? "y" : "ies"}. Move or delete them first.`,
    );
  }

  if (productCount > 0) {
    throw inUse(
      `This category is used by ${productCount} product(s) and cannot be deleted`,
    );
  }

  return inventoryPrisma.category.update({
    where: { id: category.id },
    data: { deletedAt: new Date() },
    select: CATEGORY_SELECT,
  });
};

export const restoreCategory = async (
  organizationId: string,
  categoryId: string,
) => {
  const category = await getCategory(organizationId, categoryId);
  if (!category.deletedAt) throw badRequest("This category is not archived");

  // Restoring under an archived parent would produce a node no tree walk
  // reaches, so it comes back at the root instead.
  const parentAlive = category.parentCategoryId
    ? await inventoryPrisma.category.findFirst({
        where: {
          id: category.parentCategoryId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      })
    : null;

  return inventoryPrisma.category.update({
    where: { id: category.id },
    data: {
      deletedAt: null,
      parentCategoryId: category.parentCategoryId
        ? (parentAlive?.id ?? null)
        : null,
    },
    select: CATEGORY_SELECT,
  });
};

export const listCategories = async (
  organizationId: string,
  query: ListQuery,
  filters: { parentCategoryId?: string | null; rootOnly?: boolean } = {},
) => {
  const where = {
    ...scopeWhere(organizationId, query),
    ...(filters.rootOnly ? { parentCategoryId: null } : {}),
    ...(filters.parentCategoryId
      ? { parentCategoryId: filters.parentCategoryId }
      : {}),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    inventoryPrisma.category.findMany({
      where,
      select: CATEGORY_SELECT,
      orderBy: { name: "asc" },
      take: query.take,
      skip: query.skip,
    }),
    inventoryPrisma.category.count({ where }),
  ]);

  return paginated(items, total, query);
};

/**
 * The whole tree in one query, nested in memory.
 *
 * Depth is capped at five and an organization's category count is in the
 * hundreds at most, so a recursive CTE would be machinery without a payoff —
 * and this stays readable when the next person needs to change it.
 */
export const getCategoryTree = async (
  organizationId: string,
): Promise<CategoryTreeNode[]> => {
  const rows = await inventoryPrisma.category.findMany({
    where: { organizationId, deletedAt: null },
    select: CATEGORY_SELECT,
    orderBy: { name: "asc" },
  });

  const nodes = new Map<string, CategoryTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      ...(row as SerializedCategory),
      depth: 0,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentCategoryId
      ? nodes.get(node.parentCategoryId)
      : undefined;
    // A node whose parent is archived is orphaned, not lost: surface it at the
    // root rather than dropping it out of the tree entirely.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const stamp = (node: CategoryTreeNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) stamp(child, depth + 1);
  };
  for (const root of roots) stamp(root, 1);

  return roots;
};
