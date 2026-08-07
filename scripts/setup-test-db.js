import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDatabaseUrl = process.env.TESTDB_URL;

if (!testDatabaseUrl) {
  console.error("TESTDB_URL environment variable is required.");
  process.exit(1);
}

let databaseName = "";
try {
  databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
} catch {
  console.error("TESTDB_URL must be a valid PostgreSQL connection URL.");
  process.exit(1);
}

if (!/test/i.test(databaseName)) {
  console.error(
    `Refusing to migrate database "${databaseName}". TESTDB_URL database name must include "test".`,
  );
  process.exit(1);
}

const prismaCliPath = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
// `db push`, not `migrate deploy`: this repo has no migration history, so
// `deploy` silently no-ops and leaves the test database behind the schema.
// `--accept-data-loss` is safe here and avoids an interactive prompt that would
// hang CI — the guard above already refuses any database not named "*test*".
const result = spawnSync(
  process.execPath,
  [prismaCliPath, "db", "push", "--accept-data-loss"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
    },
  },
);

if (result.error) {
  console.error(`Failed to run Prisma: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
