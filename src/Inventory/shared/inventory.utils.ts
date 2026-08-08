import { badRequest } from "./inventory.errors.js";

/**
 * List-query handling shared by every inventory list endpoint.
 *
 * Nothing in the core features paginates — they return whole collections,
 * which is fine for members and invitations and not fine for a catalog that
 * grows to thousands of rows. This establishes the convention for inventory
 * only, deliberately not retrofitting it onto core.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface ListQuery {
  /** Case-insensitive `contains` match, applied per module to its name column. */
  search: string | null;
  /** Include soft-deleted rows. Off unless explicitly asked for. */
  includeDeleted: boolean;
  take: number;
  skip: number;
  page: number;
}

const parseBooleanFlag = (value: unknown): boolean =>
  value === true || value === "true" || value === "1";

const parsePositiveInt = (
  value: unknown,
  label: string,
  fallback: number,
  max: number,
): number => {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw badRequest(`${label} must be a positive integer`);
  }

  return Math.min(parsed, max);
};

export const parseListQuery = (query: Record<string, unknown>): ListQuery => {
  const rawSearch = query.search;
  const search =
    typeof rawSearch === "string" && rawSearch.trim()
      ? rawSearch.trim().slice(0, 100)
      : null;

  // `page` is capped high rather than unbounded: a large offset is a slow scan,
  // and nobody paging a catalog by hand reaches page 10,000.
  const page = parsePositiveInt(query.page, "page", 1, 10_000);
  const take = parsePositiveInt(
    query.pageSize ?? query.limit,
    "pageSize",
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  return {
    search,
    includeDeleted: parseBooleanFlag(query.includeDeleted),
    take,
    skip: (page - 1) * take,
    page,
  };
};

/** The `{ items, pagination }` envelope every inventory list returns. */
export const paginated = <T>(items: T[], total: number, query: ListQuery) => ({
  items,
  pagination: {
    total,
    page: query.page,
    pageSize: query.take,
    pageCount: Math.max(1, Math.ceil(total / query.take)),
  },
});

/**
 * `deletedAt: null` unless the caller asked for archived rows too. Every
 * inventory read is tenant-scoped through this, so forgetting the filter takes
 * deliberate effort.
 */
export const scopeWhere = (organizationId: string, query: ListQuery) => ({
  organizationId,
  ...(query.includeDeleted ? {} : { deletedAt: null }),
});
