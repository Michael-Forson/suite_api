import "dotenv/config";

const testDatabaseUrl = process.env.TESTDB_URL;

if (!testDatabaseUrl) {
  throw new Error("TESTDB_URL environment variable is required for endpoint tests.");
}

let databaseName = "";
try {
  databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
} catch {
  throw new Error("TESTDB_URL must be a valid PostgreSQL connection URL.");
}

if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run tests against database "${databaseName}". TESTDB_URL database name must include "test".`,
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret";
process.env.PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY || "test-paystack-secret";
process.env.PAYSTACK_WEBHOOK_SECRET =
  process.env.PAYSTACK_WEBHOOK_SECRET || "test-paystack-webhook-secret";
process.env.MAIL_FROM_ADDRESS =
  process.env.MAIL_FROM_ADDRESS || "noreply@example.test";
process.env.INVITATION_ACCEPT_URL =
  process.env.INVITATION_ACCEPT_URL ||
  "https://app.example.test/accept-invitation";
