import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

let ENDPOINT: string;
let BUCKET: string;
let PRIVATE_BUCKET: string;
let s3: S3Client;
let s3Private: S3Client;

try {
  ENDPOINT = getEnvVar("MINIO_ENDPOINT");
  const ACCESS_KEY = getEnvVar("MINIO_ACCESS_KEY");
  const SECRET_KEY = getEnvVar("MINIO_SECRET_KEY");
  BUCKET = getEnvVar("MINIO_BUCKET_NAME");
  PRIVATE_BUCKET = getEnvVar("MINIO_PRIVATE_BUCKET_NAME");

  const clientConfig = {
    endpoint: `https://${ENDPOINT}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
    forcePathStyle: true,
  };

  s3 = new S3Client(clientConfig);
  s3Private = new S3Client(clientConfig);
} catch (error: any) {
  console.error(`[S3] Failed to initialize MinIO client: ${error.message}`);
  throw error;
}

/**
 * Upload a file buffer to the public S3/MinIO bucket and return its public URL.
 */
export async function uploadToS3(
  fileBuffer: Buffer,
  fileName: string,
  folderName: string,
): Promise<string> {
  const key = `${folderName}/${Date.now()}-${fileName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: getContentType(fileName),
    }),
  );

  return `https://${ENDPOINT}/${BUCKET}/${key}`;
}

/**
 * Delete a file from the public S3/MinIO bucket by its public URL.
 * Silently ignores errors so a failed delete never blocks the request.
 */
export async function deleteFromS3(url: string): Promise<void> {
  try {
    const prefix = `https://${ENDPOINT}/${BUCKET}/`;
    if (!url.startsWith(prefix)) return;
    const key = url.slice(prefix.length);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (error: any) {
    console.warn(`[S3] Failed to delete object: ${error.message}`);
  }
}

// ─── Private bucket (sensitive documents e.g. rider ID images) ──────────────

/**
 * Upload a file buffer to the private bucket and return the object key.
 * Never returns a URL — access is only via generateSignedUrl().
 */
export async function uploadToPrivateS3(
  fileBuffer: Buffer,
  fileName: string,
  folderName: string,
): Promise<string> {
  const key = `${folderName}/${Date.now()}-${fileName}`;

  await s3Private.send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
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
    await s3Private.send(
      new DeleteObjectCommand({ Bucket: PRIVATE_BUCKET, Key: objectKey }),
    );
  } catch (error: any) {
    console.warn(`[S3 Private] Failed to delete object: ${error.message}`);
  }
}

/**
 * Generate a pre-signed GET URL for a private object.
 * The URL is valid for `expirySeconds` (default: 15 minutes).
 * Use this in admin endpoints only — never expose to riders/vendors directly.
 */
export async function generateSignedUrl(
  objectKey: string,
  expirySeconds = 900,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: PRIVATE_BUCKET,
    Key: objectKey,
  });

  return getSignedUrl(s3Private, command, { expiresIn: expirySeconds });
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
  };
  return types[ext || ""] || "application/octet-stream";
}
