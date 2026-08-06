import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

/**
 * Normalize AWS_ENDPOINT into an origin (scheme + host + port).
 *
 * Accepts either a full URL (`http://storage.example.com:9000`) or a bare host
 * (`storage.example.com`, assumed https).  Any path or trailing slash is
 * dropped so URLs can be built by simple concatenation.
 */
function resolveEndpoint(): string {
  const raw = getEnvVar("AWS_ENDPOINT");
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    throw new Error(`Invalid AWS_ENDPOINT: ${raw}`);
  }
}

// Config is resolved on first use rather than at import time so the API still
// boots when storage is unconfigured — only the helpers below fail.
let cachedClient: S3Client | undefined;
let cachedEndpoint: string | undefined;

function getEndpoint(): string {
  return (cachedEndpoint ??= resolveEndpoint());
}

function getClient(): S3Client {
  return (cachedClient ??= new S3Client({
    endpoint: getEndpoint(),
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: getEnvVar("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getEnvVar("AWS_SECRET_ACCESS_KEY"),
    },
    // Non-AWS S3 implementations (RustFS, MinIO) address buckets by path,
    // not by subdomain.
    forcePathStyle: true,
    // The SDK sends CRC32 checksum headers by default; several S3-compatible
    // servers reject them.  Only send/verify when the operation requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }));
}

function getPublicBucket(): string {
  return getEnvVar("PUBLIC_BUCKET_NAME");
}

function getPrivateBucket(): string {
  return getEnvVar("PRIVATE_BUCKET_NAME");
}

/**
 * Build a collision-proof object key.  The original file name is preserved for
 * debugging but sanitized — it is attacker-controlled and must not be able to
 * introduce path segments.
 */
function buildKey(fileName: string, folderName: string): string {
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-100);
  return `${folderName}/${randomUUID()}-${safeName || "file"}`;
}

// ─── Public bucket (anonymously readable: avatars, logos, app icons) ─────────

/**
 * Upload a file buffer to the public bucket and return its object key.
 *
 * The key is what belongs in the database: the endpoint is deployment config,
 * so baking it into a stored URL means every row has to be rewritten to add
 * TLS, move hosts or put a CDN in front.  Call `publicUrl` to build the URL a
 * browser needs.
 */
export async function uploadToS3(
  fileBuffer: Buffer,
  fileName: string,
  folderName: string,
): Promise<string> {
  const key = buildKey(fileName, folderName);

  await getClient().send(
    new PutObjectCommand({
      Bucket: getPublicBucket(),
      Key: key,
      Body: fileBuffer,
      ContentType: getContentType(fileName),
    }),
  );

  return key;
}

let warnedUnconfigured = false;

/**
 * Build the browser-facing URL for a public object key.
 *
 * A value that already carries a scheme is returned untouched.  Two kinds of
 * row need that: ones registered before uploads existed, which point at an
 * arbitrary host, and ones written before icons were stored as keys.  Both keep
 * resolving, so the backfill can be lazy rather than a flag day.
 *
 * Returns null when storage is unconfigured rather than throwing — this runs on
 * every read path, and an unset endpoint should cost a placeholder glyph, not a
 * 500 on every list.
 */
export function publicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("://")) return value;
  try {
    return `${getEndpoint()}/${getPublicBucket()}/${value}`;
  } catch (error: any) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(`[S3] Cannot build public URLs: ${error.message}`);
    }
    return null;
  }
}

/**
 * Delete a file from the public bucket by its object key.
 *
 * Also accepts a legacy absolute URL, since rows written before the key
 * migration still hold one; the key is recovered from the URL path rather than
 * by matching the current endpoint, so a URL stored before an endpoint change
 * remains deletable.  Errors are swallowed so a failed delete never blocks the
 * request.
 */
export async function deleteFromPublicS3(keyOrUrl: string): Promise<void> {
  try {
    const bucket = getPublicBucket();
    const key = keyOrUrl.includes("://")
      ? extractKey(keyOrUrl, bucket)
      : keyOrUrl;
    if (!key) {
      console.warn(
        `[S3] Not a ${bucket} object URL, skipping delete: ${keyOrUrl}`,
      );
      return;
    }
    await getClient().send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  } catch (error: any) {
    console.warn(`[S3] Failed to delete object: ${error.message}`);
  }
}

/**
 * Recover an object key from a public URL, ignoring scheme and host.
 * Returns undefined when the URL does not point at `bucket`.
 */
function extractKey(url: string, bucket: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const prefix = `/${bucket}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const key = decodeURIComponent(pathname.slice(prefix.length));
  return key || undefined;
}

// ─── Private bucket (not anonymously readable) ───────────────────────────────

/**
 * Upload a file buffer to the private bucket and return the object key.
 * Never returns a URL — access is only via generateSignedUrl().
 */
export async function uploadToPrivateS3(
  fileBuffer: Buffer,
  fileName: string,
  folderName: string,
): Promise<string> {
  const key = buildKey(fileName, folderName);

  await getClient().send(
    new PutObjectCommand({
      Bucket: getPrivateBucket(),
      Key: key,
      Body: fileBuffer,
      ContentType: getContentType(fileName),
    }),
  );

  return key;
}

/**
 * Delete a file from the private bucket by its object key.
 * Silently ignores errors so a failed delete never blocks the request.
 */
export async function deleteFromPrivateS3(objectKey: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: getPrivateBucket(), Key: objectKey }),
    );
  } catch (error: any) {
    console.warn(`[S3 Private] Failed to delete object: ${error.message}`);
  }
}

/**
 * Generate a pre-signed GET URL for a private object.
 * The URL is valid for `expirySeconds` (default: 15 minutes).
 *
 * The URL grants access to anyone holding it until it expires — return it only
 * to callers already authorized to read the object, and never persist it.
 */
export async function generateSignedUrl(
  objectKey: string,
  expirySeconds = 900,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getPrivateBucket(),
    Key: objectKey,
  });

  return getSignedUrl(getClient(), command, { expiresIn: expirySeconds });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function getContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  };
  return types[ext || ""] || "application/octet-stream";
}
