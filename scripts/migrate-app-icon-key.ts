/**
 * Move `apps.icon_url` to `apps.icon_key`.
 *
 * Two steps, both idempotent:
 *   1. Rename the column, so `prisma db push` sees the schema change as already
 *      applied instead of dropping the old column and adding an empty new one.
 *   2. Strip the `{endpoint}/{bucket}/` prefix from values this API uploaded,
 *      leaving a bare object key.
 *
 * URLs pointing anywhere else are left alone on purpose — rows registered before
 * uploads existed name a host that was never ours, and there is no key to reduce
 * them to. `publicUrl` passes any absolute value through untouched, so those keep
 * resolving and this script stays safe to re-run.
 *
 *   npx tsx scripts/migrate-app-icon-key.ts           # dry run, shows the plan
 *   npx tsx scripts/migrate-app-icon-key.ts --apply   # writes it
 */
import "dotenv/config";
import { prisma } from "../src/prisma.js";

const apply = process.argv.includes("--apply");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

const raw = requireEnv("AWS_ENDPOINT");
const endpoint = new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
const prefix = `${endpoint}/${requireEnv("PUBLIC_BUCKET_NAME")}/`;

const columns = await prisma.$queryRaw<{ column_name: string }[]>`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'apps' AND column_name IN ('icon_url', 'icon_key')
`;
const names = columns.map((c) => c.column_name);
const hasOld = names.includes("icon_url");
const hasNew = names.includes("icon_key");

if (!hasOld && !hasNew) {
  throw new Error("apps has neither icon_url nor icon_key — wrong database?");
}

console.log("prefix to strip:", prefix);
console.log("\n--- step 1: rename column ---");
if (hasNew) {
  console.log("icon_key already exists, nothing to rename.");
} else if (apply) {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE apps RENAME COLUMN icon_url TO icon_key`,
  );
  console.log("renamed icon_url -> icon_key");
} else {
  console.log("would rename icon_url -> icon_key");
}

// Only meaningful once the column exists; on a dry run against an unrenamed
// table there is nothing to read yet.
if (hasNew || apply) {
  const rows = await prisma.$queryRaw<{ key: string; icon_key: string }[]>`
    SELECT key, icon_key FROM apps WHERE icon_key IS NOT NULL
  `;
  const ours = rows.filter((r) => r.icon_key.startsWith(prefix));
  const foreign = rows.filter(
    (r) => r.icon_key.includes("://") && !r.icon_key.startsWith(prefix),
  );

  console.log("\n--- step 2: strip prefix ---");
  for (const row of ours) {
    console.log(`  ${row.key}: ${row.icon_key} -> ${row.icon_key.slice(prefix.length)}`);
  }
  if (!ours.length) console.log("  (no rows need stripping)");

  if (foreign.length) {
    console.log("\n  left as absolute URLs (not in our bucket):");
    for (const row of foreign) console.log(`  ${row.key}: ${row.icon_key}`);
  }

  if (apply && ours.length) {
    const updated = await prisma.$executeRaw`
      UPDATE apps SET icon_key = substring(icon_key from ${prefix.length + 1})
      WHERE icon_key LIKE ${`${prefix}%`}
    `;
    console.log(`\nStripped ${updated} row(s).`);
  }
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write these changes.");
}

await prisma.$disconnect();
