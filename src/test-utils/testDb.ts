import { prisma } from "../prisma.js";

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
