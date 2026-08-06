/**
 * Grant anonymous read on the public bucket.
 *
 * `publicUrl` builds unsigned URLs that go straight into `<img>` tags, so the
 * public bucket has to serve objects without a signature or every avatar, logo
 * and app icon renders as the fallback glyph. That policy is bucket state,
 * not code, so it does not survive moving to a new object store — this script is
 * how a fresh environment (or a migration, as from SeaweedFS to RustFS) gets it.
 *
 *   npx tsx scripts/set-public-bucket-policy.ts           # dry run, shows current + proposed
 *   npx tsx scripts/set-public-bucket-policy.ts --apply   # writes it
 */
import "dotenv/config";
import {
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const apply = process.argv.includes("--apply");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

const endpoint = new URL(requireEnv("AWS_ENDPOINT")).origin;
const publicBucket = requireEnv("PUBLIC_BUCKET_NAME");
const privateBucket = process.env.PRIVATE_BUCKET_NAME;

// The one mistake this script must never make. Anonymous read on the private
// bucket would silently defeat every pre-signed URL in the codebase.
if (privateBucket && publicBucket === privateBucket) {
  throw new Error(
    `PUBLIC_BUCKET_NAME and PRIVATE_BUCKET_NAME are both "${publicBucket}". Refusing to make the private bucket public.`,
  );
}

/**
 * `s3:GetObject` on the objects only — deliberately no `s3:ListBucket`, so a URL
 * holder can fetch that object but nobody can enumerate the bucket. The keys
 * embed a UUID, so they are unguessable without the URL.
 */
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicReadObjects",
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${publicBucket}/*`],
    },
  ],
};

const client = new S3Client({
  endpoint,
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
  },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

console.log("endpoint     :", endpoint);
console.log("public bucket:", publicBucket);

console.log("\n--- current policy ---");
try {
  const current = await client.send(
    new GetBucketPolicyCommand({ Bucket: publicBucket }),
  );
  console.log(JSON.stringify(JSON.parse(current.Policy ?? "{}"), null, 2));
} catch (error: any) {
  // NoSuchBucketPolicy is the expected answer on a bucket that has never had one.
  console.log(`(none — ${error.name})`);
}

console.log("\n--- proposed policy ---");
console.log(JSON.stringify(policy, null, 2));

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write this policy.");
  process.exit(0);
}

await client.send(
  new PutBucketPolicyCommand({
    Bucket: publicBucket,
    Policy: JSON.stringify(policy),
  }),
);
console.log("\nPolicy applied.");

// Prove it from the outside rather than trusting the write: an unsigned fetch is
// what the browser actually does.
const probeKey = process.argv.find((arg) => arg.startsWith("--probe="));
if (probeKey) {
  const url = `${endpoint}/${publicBucket}/${probeKey.slice("--probe=".length)}`;
  const res = await fetch(url, { redirect: "manual" });
  console.log(
    `anonymous GET ${url}\n  → HTTP ${res.status} ${res.headers.get("content-type") ?? ""}`,
  );
}
