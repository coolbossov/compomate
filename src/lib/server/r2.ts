// ============================================================
// CompoMate — Cloudflare R2 Client (S3-compatible)
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { R2_BUCKET, R2_PRESIGNED_EXPIRY_SECONDS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Client factory (lazy — only constructed when credentials are present)
// ---------------------------------------------------------------------------

function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = createR2Client();
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Key sanitization
// ---------------------------------------------------------------------------

const MAX_KEY_LENGTH = 200;

/**
 * Strips characters that are unsafe in R2/S3 object keys and enforces length.
 * Keeps: alphanumeric, dash, underscore, dot, forward-slash.
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._\-/]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, MAX_KEY_LENGTH);
}

// ---------------------------------------------------------------------------
// Key generators
// ---------------------------------------------------------------------------

/**
 * `subjects/{timestamp}-{nanoid(8)}-{sanitizedFilename}`
 */
export function generateSubjectKey(filename: string): string {
  return `subjects/${Date.now()}-${nanoid(8)}-${sanitizeFilename(filename)}`;
}

/**
 * `backdrops/{timestamp}-{nanoid(8)}-{sanitizedFilename}`
 */
export function generateBackdropKey(filename: string): string {
  return `backdrops/${Date.now()}-${nanoid(8)}-${sanitizeFilename(filename)}`;
}

/**
 * `exports/{timestamp}-{sanitizedFilename}`
 */
export function generateExportKey(filename: string): string {
  return `exports/${Date.now()}-${sanitizeFilename(filename)}`;
}

// ---------------------------------------------------------------------------
// Presigned URLs
// ---------------------------------------------------------------------------

/**
 * Returns a presigned PUT URL for direct client-to-R2 upload.
 * The caller must PUT the file with the matching `Content-Type` header.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = R2_PRESIGNED_EXPIRY_SECONDS,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME ?? R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Returns a presigned GET URL for server-side or temporary client-side reads.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = R2_PRESIGNED_EXPIRY_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME ?? R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Deletes an object from R2.
 * Safe to call with a non-existent key (R2 returns 204 regardless).
 */
export async function deleteR2Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME ?? R2_BUCKET,
    Key: key,
  });

  await getClient().send(command);
}
