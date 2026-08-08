import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma-inventory/client.js";

// Separate database from the core one in `prisma.ts`. Cross-database joins are
// impossible by construction: read core data through the core client/service.
const connectionString = process.env.INVENTORY_DATABASE_URL;

if (!connectionString) {
  throw new Error("INVENTORY_DATABASE_URL environment variable is not set");
}

/**
 * `?schema=` in the URL, which is how the inventory database is separated from
 * the core one when both live on the same Postgres server.
 *
 * The Prisma CLI reads this parameter on its own — `db push` reports the schema
 * it targeted — but `pg` does not, so without passing it through, migrations
 * would land in `inventory` while the running app queried `public` and found
 * nothing. Undefined for a URL with no parameter, which leaves the adapter's
 * own default alone.
 */
const schemaFromUrl = (() => {
  try {
    return new URL(connectionString).searchParams.get("schema") ?? undefined;
  } catch {
    return undefined;
  }
})();

/**
 * The schema Prisma's generated queries are qualified with. Exported because
 * raw SQL is *not* — `$executeRawUnsafe` sends the string as written, so an
 * unqualified table name there resolves through `search_path` (i.e. `public`)
 * no matter what the adapter was told. Anything writing raw SQL against this
 * database must qualify its table names with this.
 */
export const INVENTORY_SCHEMA = schemaFromUrl ?? "public";

const adapter = new PrismaPg(
  {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
  { schema: schemaFromUrl },
);

const logLevels: Prisma.LogLevel[] =
  process.env.NODE_ENV === "test"
    ? []
    : process.env.NODE_ENV === "development"
      ? ["error", "warn"]
      : ["error"];

const inventoryPrisma = new PrismaClient({
  adapter,
  log: logLevels,
});

export { inventoryPrisma };
