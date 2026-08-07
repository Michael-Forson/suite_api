import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma-inventory/client.js";

// Separate database from the core one in `prisma.ts`. Cross-database joins are
// impossible by construction: read core data through the core client/service.
const connectionString = process.env.INVENTORY_DATABASE_URL;

if (!connectionString) {
  throw new Error("INVENTORY_DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

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
