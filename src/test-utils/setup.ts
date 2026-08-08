import dotenv from "dotenv";

process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config({ quiet: true });

/**
 * Both databases get the same treatment: required, parseable, and named
 * something containing "test". The inventory app has its own database (see
 * `prismaInventory.ts`), so pointing only the core one at a test instance would
 * leave `INVENTORY_DATABASE_URL` aimed at whatever `.env` says — development,
 * most likely — and truncate it between tests.
 */
const requireTestDatabaseUrl = (variable: string): string => {
  const url = process.env[variable];

  if (!url) {
    throw new Error(
      `${variable} environment variable is required for endpoint tests.`,
    );
  }

  let databaseName = "";
  try {
    databaseName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error(`${variable} must be a valid PostgreSQL connection URL.`);
  }

  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}". ${variable} database name must include "test".`,
    );
  }

  return url;
};

const testDatabaseUrl = requireTestDatabaseUrl("TESTDB_URL");
const inventoryTestDatabaseUrl = requireTestDatabaseUrl("INVENTORY_TESTDB_URL");

process.env.DATABASE_URL = testDatabaseUrl;
process.env.INVENTORY_DATABASE_URL = inventoryTestDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret";
process.env.SUPER_ADMIN_JWT_SECRET =
  process.env.SUPER_ADMIN_JWT_SECRET || "test-super-admin-jwt-secret";
process.env.SUPER_ADMIN_JWT_REFRESH_SECRET =
  process.env.SUPER_ADMIN_JWT_REFRESH_SECRET ||
  "test-super-admin-jwt-refresh-secret";
process.env.PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY || "test-paystack-secret";
process.env.PAYSTACK_WEBHOOK_SECRET =
  process.env.PAYSTACK_WEBHOOK_SECRET || "test-paystack-webhook-secret";
process.env.MAIL_FROM_ADDRESS =
  process.env.MAIL_FROM_ADDRESS || "noreply@example.test";
process.env.INVITATION_ACCEPT_URL =
  process.env.INVITATION_ACCEPT_URL ||
  "https://app.example.test/accept-invitation";
