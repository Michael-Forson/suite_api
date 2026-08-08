import "dotenv/config";
import { prisma } from "../prisma.js";
import { inventoryPrisma } from "../../Inventory/prismaInventory.js";
import {
  DEFAULT_LOCATION_CODE,
  DEFAULT_LOCATION_NAME,
} from "../../Inventory/location.service.js";

/**
 * Gives every existing branch the default stock location that
 * `getDefaultLocationId` would otherwise create on first use.
 *
 * Purely a pre-warm: nothing depends on this having run. Locations are created
 * lazily because branches live in the core database and locations live in the
 * inventory one, so no transaction can span both — a create-alongside-branch
 * hook could commit the branch and then fail to write the location, leaving a
 * branch that cannot take stock. Lazy creation has no such ordering to get
 * wrong. This script only spares the first movement of a branch's life from
 * also being a schema write.
 *
 * Idempotent, and safe to re-run. Reads core, writes inventory.
 */
async function main() {
  const branches = await prisma.branch.findMany({
    where: { deletedAt: null },
    select: { id: true, organizationId: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let skipped = 0;

  for (const branch of branches) {
    const existing = await inventoryPrisma.stockLocation.findFirst({
      where: { branchId: branch.id, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await inventoryPrisma.stockLocation.upsert({
      where: {
        branchId_code: { branchId: branch.id, code: DEFAULT_LOCATION_CODE },
      },
      update: {},
      create: {
        organizationId: branch.organizationId,
        branchId: branch.id,
        name: DEFAULT_LOCATION_NAME,
        code: DEFAULT_LOCATION_CODE,
        type: "PHYSICAL",
        isDefault: true,
        isSellable: true,
      },
    });

    created += 1;
  }

  console.log(
    `Default stock locations backfilled. Created: ${created}, already had one: ${skipped}.`,
  );
}

main()
  .catch((error) => {
    console.error("Default location backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), inventoryPrisma.$disconnect()]);
  });
