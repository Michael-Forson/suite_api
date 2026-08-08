import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const resolveTestDatabaseUrl = (variable) => {
  const url = process.env[variable];

  if (!url) {
    console.error(`${variable} environment variable is required.`);
    process.exit(1);
  }

  let databaseName = "";
  try {
    databaseName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    console.error(`${variable} must be a valid PostgreSQL connection URL.`);
    process.exit(1);
  }

  if (!/test/i.test(databaseName)) {
    console.error(
      `Refusing to migrate database "${databaseName}". ${variable} database name must include "test".`,
    );
    process.exit(1);
  }

  return url;
};

const testDatabaseUrl = resolveTestDatabaseUrl("TESTDB_URL");
const inventoryTestDatabaseUrl = resolveTestDatabaseUrl("INVENTORY_TESTDB_URL");

const prismaCliPath = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);

// `db push`, not `migrate deploy`: this repo has no migration history, so
// `deploy` silently no-ops and leaves the test database behind the schema.
// `--accept-data-loss` is safe here and avoids an interactive prompt that would
// hang CI — the guard above already refuses any database not named "*test*".
const push = (label, args, env) => {
  console.log(`\n[test-db] pushing ${label} schema…`);
  const result = spawnSync(
    process.execPath,
    [prismaCliPath, "db", "push", "--accept-data-loss", ...args],
    { stdio: "inherit", env: { ...process.env, ...env } },
  );

  if (result.error) {
    console.error(`Failed to run Prisma: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
};

push("core", [], { DATABASE_URL: testDatabaseUrl });
push("inventory", ["--config", "prisma.inventory.config.ts"], {
  INVENTORY_DATABASE_URL: inventoryTestDatabaseUrl,
});

/**
 * `db push` emits `inventory(variant_id, location_id, lot_id)` as a plain
 * unique index, under which Postgres treats two NULL `lot_id`s as distinct —
 * untracked stock would get a fresh row per movement and the upsert in
 * `postMovement` would never find its conflict target. The schema comment on
 * `Inventory.@@unique` says not to skip this; applying it here means the test
 * database matches production rather than passing under a looser constraint.
 */
const constraintsSql = readFileSync(
  fileURLToPath(
    new URL("../src/Inventory/prisma/sql/inventory-constraints.sql", import.meta.url),
  ),
  "utf8",
);

console.log("\n[test-db] applying inventory constraints…");
const { Client } = await import("pg");
const client = new Client({ connectionString: inventoryTestDatabaseUrl });

// The inventory database may be a *schema* on the same server as the core one
// (`?schema=inventory`). Prisma's CLI reads that parameter; `pg` does not, so
// the statements below would run against `public` and report that the tables do
// not exist.
const inventorySchema =
  new URL(inventoryTestDatabaseUrl).searchParams.get("schema") ?? "public";

try {
  await client.connect();
  await client.query(`SET search_path TO "${inventorySchema}"`);
  // One simple query with every statement in it — the file is idempotent, so a
  // re-run is a no-op rather than a pile of "already exists".
  await client.query(constraintsSql);
} catch (error) {
  console.error(
    `Failed to apply inventory constraints: ${error.message}\n` +
      "Apply them by hand:\n" +
      '  psql "$INVENTORY_TESTDB_URL" -f src/Inventory/prisma/sql/inventory-constraints.sql',
  );
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

console.log("\n[test-db] ready.");
