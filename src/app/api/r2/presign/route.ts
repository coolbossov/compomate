// ============================================================
// POST /api/r2/presign
// Returns a presigned PUT URL + key + presigned download URL.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  generateSubjectKey,
  generateBackdropKey,
  generateExportKey,
} from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { applySessionCookie, getOrCreateSessionId } from "@/lib/server/session-cookie";
import { recordR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { ErrorCodes, HTTP_STATUS } from "@/lib/server/error-codes";
import { log } from "@/lib/server/logger";

export const runtime = "nodejs";
export const maxDuration = 30; // Fluid Compute

// Allowed MIME types for image uploads
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp",
]);

type Purpose = "subject" | "backdrop" | "export";
const VALID_PURPOSES = new Set<Purpose>(["subject", "backdrop", "export"]);

type PresignRequestBody = {
  filename?: unknown;
  contentType?: unknown;
  purpose?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();
  const requestId = request.headers.get("x-request-id") ?? "unknown";

  // --- R2 credentials check (graceful 503 when unconfigured) ---
  const r2Env = getR2Env();
  if (!r2Env) {
    log.warn("r2.presign.unconfigured", {
      request_id: requestId,
      error_code: ErrorCodes.R2_NOT_CONFIGURED,
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_NOT_CONFIGURED },
      { status: HTTP_STATUS[ErrorCodes.R2_NOT_CONFIGURED] },
    );
  }

  // --- CORS: same-origin only ---
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      log.warn("r2.presign.invalid_origin", {
        request_id: requestId,
        error_code: ErrorCodes.R2_WRONG_PREFIX,
        duration_ms: Date.now() - t0,
      });
      return NextResponse.json(
        { error: ErrorCodes.R2_WRONG_PREFIX },
        { status: HTTP_STATUS[ErrorCodes.R2_WRONG_PREFIX] },
      );
    }
    if (host && originHost !== host) {
      log.warn("r2.presign.forbidden_origin", {
        request_id: requestId,
        error_code: ErrorCodes.R2_WRONG_PREFIX,
        duration_ms: Date.now() - t0,
      });
      return NextResponse.json(
        { error: ErrorCodes.R2_WRONG_PREFIX },
        { status: HTTP_STATUS[ErrorCodes.R2_WRONG_PREFIX] },
      );
    }
  }

  // --- Rate limit: 100 presign requests per minute per IP ---
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`r2:presign:${ip}`, 100, 60_000);
  if (!limit.allowed) {
    log.warn("r2.presign.rate_limited", {
      request_id: requestId,
      error_code: ErrorCodes.R2_RATE_LIMITED,
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_RATE_LIMITED },
      { status: HTTP_STATUS[ErrorCodes.R2_RATE_LIMITED] },
    );
  }

  // --- Parse body ---
  let body: PresignRequestBody;
  try {
    body = (await request.json()) as PresignRequestBody;
  } catch {
    log.warn("r2.presign.invalid_json", {
      request_id: requestId,
      error_code: ErrorCodes.R2_INVALID_KEY,
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }

  const { filename, contentType, purpose } = body;

  if (typeof filename !== "string" || !filename.trim()) {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }
  if (typeof contentType !== "string" || !contentType.trim()) {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }
  if (typeof purpose !== "string" || !VALID_PURPOSES.has(purpose as Purpose)) {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }

  const normalizedPurpose = purpose as Purpose;
  const { sessionId, isNew } = await getOrCreateSessionId();

  // --- Content type validation (images only for subject/backdrop) ---
  if (normalizedPurpose !== "export" && !ALLOWED_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }

  // --- Generate R2 key based on purpose ---
  let key: string;
  switch (normalizedPurpose) {
    case "subject":
      key = generateSubjectKey(filename);
      break;
    case "backdrop":
      key = generateBackdropKey(filename);
      break;
    case "export":
      key = generateExportKey(filename);
      break;
  }

  // --- Generate presigned URLs ---
  try {
    await recordR2ObjectOwnership(key, sessionId, normalizedPurpose);

    const [uploadUrl, downloadUrl] = await Promise.all([
      getPresignedUploadUrl(key, contentType),
      getPresignedDownloadUrl(key),
    ]);

    log.info("r2.presign.ok", {
      request_id: requestId,
      duration_ms: Date.now() - t0,
      key,
      purpose: normalizedPurpose,
    });

    const response = NextResponse.json({ uploadUrl, key, downloadUrl });
    applySessionCookie(response, sessionId, isNew);
    return response;
  } catch (error) {
    log.error("r2.presign.failed", {
      request_id: requestId,
      error_code: ErrorCodes.R2_UPLOAD_FAILED,
      duration_ms: Date.now() - t0,
      message: error instanceof Error ? error.message : String(error),
    });

    const response = NextResponse.json(
      { error: ErrorCodes.R2_UPLOAD_FAILED },
      { status: HTTP_STATUS[ErrorCodes.R2_UPLOAD_FAILED] },
    );
    applySessionCookie(response, sessionId, isNew);
    return response;
  }
}
