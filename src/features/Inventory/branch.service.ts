import { prisma } from "../../prisma.js";

/**
 * The inventory app's only door to branch data.
 *
 * Branches live in the core database, so inventory holds `branchId` as a
 * logical reference with no foreign key. That means nothing at the database
 * level stops a bad id from reaching the ledger — these functions are the
 * guardrail, and every inventory write path resolves its branch through here.
 *
 * Today core and inventory share a process, so this reads the core Prisma
 * client directly. When inventory splits into its own service these become HTTP
 * calls to core; keeping them in one file makes that a one-file change.
 */

/**
 * Every organization has exactly one default branch, created alongside the
 * organization itself. A single-location business never picks a branch — its
 * writes land here.
 */
export const getDefaultBranchId = async (
  organizationId: string,
): Promise<string> => {
  const branch = await prisma.branch.findFirst({
    where: { organizationId, isDefault: true, deletedAt: null },
    select: { id: true },
  });

  if (branch) return branch.id;

  // Only reachable if the default was archived without another being promoted.
  // Any live branch beats failing the write.
  const fallback = await prisma.branch.findFirst({
    where: { organizationId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!fallback) {
    throw new Error(
      `Organization ${organizationId} has no branches. Every organization must have at least one — run \`npm run backfill:branches\`.`,
    );
  }

  return fallback.id;
};

/**
 * Guards the cross-database reference on write. Without it a caller could post
 * stock to another tenant's branch, since no FK constraint spans the two
 * databases.
 */
export const assertBranchBelongsToOrg = async (
  organizationId: string,
  branchId: string,
): Promise<void> => {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (!branch) {
    throw new Error(
      `Branch ${branchId} does not belong to organization ${organizationId}, or has been deleted.`,
    );
  }
};

/**
 * Resolves an optional caller-supplied branch: validates it when given, falls
 * back to the default when omitted. The shape most inventory write paths want.
 */
export const resolveBranchId = async (
  organizationId: string,
  branchId?: string | null,
): Promise<string> => {
  if (!branchId) return getDefaultBranchId(organizationId);
  await assertBranchBelongsToOrg(organizationId, branchId);
  return branchId;
};
