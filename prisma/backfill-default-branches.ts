import "dotenv/config";
import { BranchStatus } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/prisma.js";
import { DEFAULT_BRANCH_CODE } from "../src/features/core/organization/org.helpers.js";

/**
 * Gives every pre-existing organization the default branch that
 * `createOrganization` now creates inline. New orgs never need this.
 *
 * Idempotent — an org that already has a live branch is skipped, so it is safe
 * to re-run. It exists as a script rather than a migration because this repo
 * applies schema with `prisma db push`, which has no migration hook to carry
 * data changes.
 */
async function main() {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, address: true, ownerId: true },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let skipped = 0;

  for (const organization of organizations) {
    const existing = await prisma.branch.findFirst({
      where: { organizationId: organization.id, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.branch.create({
      data: {
        organizationId: organization.id,
        name: organization.name,
        code: DEFAULT_BRANCH_CODE,
        location: organization.address,
        isDefault: true,
        status: BranchStatus.ACTIVE,
        createdBy: organization.ownerId,
      },
    });

    created += 1;
  }

  console.log(
    `Default branches backfilled. Created: ${created}, already had one: ${skipped}.`,
  );
}

main()
  .catch((error) => {
    console.error("Default branch backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
