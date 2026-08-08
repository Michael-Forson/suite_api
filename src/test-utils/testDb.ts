import { prisma } from "../core/prisma.js";
import { INVENTORY_SCHEMA, inventoryPrisma } from "../Inventory/prismaInventory.js";

const TABLES = [
  "super_admins",
  "subscription_checkout_sessions",
  "organization_subscriptions",
  "organization_billing_customers",
  "subscription_plan_prices",
  "subscription_plan_apps",
  "subscription_plans",
  "member_app_roles",
  "app_role_permissions",
  "app_roles",
  "permissions",
  "organization_apps",
  "apps",
  "organization_invitations",
  "organization_members",
  "branches",
  "transactions",
  "notifications",
  "verification_attempts",
  "verification_codes",
  "organizations",
  "users",
];

export async function truncateTestDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function assertTestDatabaseReady() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: any) {
    throw new Error(
      `TESTDB_URL is not ready. Create and migrate/push the test database before running tests. Original error: ${error.message}`,
    );
  }
}

export async function disconnectTestDatabase() {
  await prisma.$disconnect();
}

// The inventory app has its own database (see `prismaInventory.ts`), so it
// needs its own truncate: `TRUNCATE` cannot span two connections, and the core
// helper above knows nothing about these tables.
//
// Children before parents. `CASCADE` would cover it, but listing the order
// makes an accidentally-missed table visible as an FK error rather than a
// silent extra delete.
const INVENTORY_TABLES = [
  "stock_transfer_items",
  "stock_transfers",
  "stock_adjustment_items",
  "stock_adjustments",
  "inventory_movements",
  "inventory",
  "reorder_rules",
  "stock_lots",
  "product_images",
  "variant_attribute_values",
  "product_variants",
  "product_attributes",
  "products",
  "attribute_values",
  "attributes",
  "brands",
  "categories",
  "units",
  "stock_locations",
  "inventory_settings",
];

export async function truncateInventoryTestDatabase() {
   // Schema-qualified: raw SQL bypasses the adapter's schema setting and would
  // otherwise look for these tables in `public`. See `INVENTORY_SCHEMA`.
  const tables = INVENTORY_TABLES.map(
    (table) => `"${INVENTORY_SCHEMA}"."${table}"`,
  ).join(", ");

  await inventoryPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
 );
}

export async function assertInventoryTestDatabaseReady() {
  try {
    await inventoryPrisma.$queryRaw`SELECT 1`;
  } catch (error: any) {
    throw new Error(
      `INVENTORY_TESTDB_URL is not ready. Run \`npm run test:db:push\` before running tests. Original error: ${error.message}`,
    );
  }
}

export async function disconnectInventoryTestDatabase() {
  await inventoryPrisma.$disconnect();
}

/** Both databases, for suites that touch core auth and inventory rows. */
export async function truncateAllTestDatabases() {
  await truncateTestDatabase();
  await truncateInventoryTestDatabase();
}

export async function disconnectAllTestDatabases() {
  await Promise.all([disconnectTestDatabase(), disconnectInventoryTestDatabase()]);
}
