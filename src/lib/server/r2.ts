// ============================================================
// CompoMate — Cloudflare R2 Client (S3-compatible + Worker fallback)
// ============================================================
// Primary path: S3-compatible presigned URLs (requires R2_ACCESS_KEY_ID/SECRET).
// Fallback path: Cloudflare Worker with R2 binding (R2_WORKER_URL env var).
//   Worker: https://compomate-r2.compomate-sapd.workers.dev
//   PUT /object/:key → upload   GET /object/:key → download
// The fallback activates when R2_WORKER_URL is set, bypassing S3 credentials.
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
// Worker fallback helpers
// ---------------------------------------------------------------------------

function getWorkerBaseUrl(): string | null {
  const url = process.env.R2_WORKER_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * Returns a Worker-based direct upload URL.
 * The client PUTs the file directly to this URL.
 */
export function getWorkerUploadUrl(key: string): string | null {
  const base = getWorkerBaseUrl();
  if (!base) return null;
  return `${base}/object/${encodeURIComponent(key)}`;
}

/**
 * Returns a Worker-based direct download URL.
 */
export function getWorkerDownloadUrl(key: string): string | null {
  const base = getWorkerBaseUrl();
  if (!base) return null;
  return `${base}/object/${encodeURIComponent(key)}`;
}

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
 * `exports/{timestamp}-{nanoid(8)}-{sanitizedFilename}`
 */
export function generateExportKey(filename: string): string {
  return `exports/${Date.now()}-${nanoid(8)}-${sanitizeFilename(filename)}`;
}

// ---------------------------------------------------------------------------
// Presigned URLs (primary) / Worker direct URLs (fallback)
// ---------------------------------------------------------------------------

/**
 * Returns a presigned PUT URL for direct client-to-R2 upload.
 * Falls back to Worker direct upload URL if R2_WORKER_URL is configured.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = R2_PRESIGNED_EXPIRY_SECONDS,
): Promise<string> {
  // Worker fallback: return direct Worker upload URL
  const workerUrl = getWorkerUploadUrl(key);
  if (workerUrl) return workerUrl;

  // S3-compatible presigned URL
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME ?? R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Returns a presigned GET URL for server-side or temporary client-side reads.
 * Falls back to Worker direct download URL if R2_WORKER_URL is configured.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = R2_PRESIGNED_EXPIRY_SECONDS,
): Promise<string> {
  // Worker fallback
  const workerUrl = getWorkerDownloadUrl(key);
  if (workerUrl) return workerUrl;

  // S3-compatible presigned URL
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME ?? R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Deletes an object from R2.
 * Falls back to Worker DELETE if R2_WORKER_URL is configured.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const base = getWorkerBaseUrl();
  if (base) {
    // Worker fallback: HTTP DELETE
    const res = await fetch(`${base}/object/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`R2 Worker delete failed: ${res.status}`);
    }
    return;
  }

  // S3-compatible delete
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME ?? R2_BUCKET,
    Key: key,
  });

  await getClient().send(command);
}
