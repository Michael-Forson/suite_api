import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
// const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
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

const prisma = new PrismaClient({
  adapter,
  log: logLevels,
});

export { prisma };
