// Inventory app schema — its own database, so its own config. Prisma only ever
// looks at one datasource per invocation; run inventory commands with
// `--config prisma.inventory.config.ts` (see the `inventory:*` npm scripts).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "src/Inventory/prisma/schema.prisma",
  migrations: {
    path: "src/Inventory/prisma/migrations",
  },
  datasource: {
    url: process.env["INVENTORY_DATABASE_URL"],
  },
});
