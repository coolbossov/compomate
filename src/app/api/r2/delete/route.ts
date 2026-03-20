// ============================================================
// DELETE /api/r2/delete
// Deletes an object from R2 (cleanup after export or session end).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { deleteR2Object } from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { removeR2ObjectOwnership, verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { ErrorCodes, HTTP_STATUS } from "@/lib/server/error-codes";
import { log } from "@/lib/server/logger";

export const runtime = "nodejs";
export const maxDuration = 10;

// Only allow deletion of keys within our managed prefixes
const ALLOWED_PREFIXES = ["subjects/", "backdrops/", "exports/"];

type DeleteRequestBody = {
  key?: unknown;
};

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();
  const requestId = request.headers.get("x-request-id") ?? "unknown";

  // --- R2 credentials check ---
  const r2Env = getR2Env();
  if (!r2Env) {
    log.warn("r2.delete.unconfigured", {
      request_id: requestId,
      error_code: ErrorCodes.R2_NOT_CONFIGURED,
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_NOT_CONFIGURED },
      { status: HTTP_STATUS[ErrorCodes.R2_NOT_CONFIGURED] },
    );
  }

  // --- Rate limit: 60 delete requests per minute per IP ---
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`r2:delete:${ip}`, 60, 60_000);
  if (!limit.allowed) {
    log.warn("r2.delete.rate_limited", {
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
  let body: DeleteRequestBody;
  try {
    body = (await request.json()) as DeleteRequestBody;
  } catch {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }

  const { key } = body;

  if (typeof key !== "string" || !key.trim()) {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }

  // --- Key prefix guard: prevent arbitrary deletion ---
  const isAllowed = ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!isAllowed) {
    return NextResponse.json(
      { error: ErrorCodes.R2_WRONG_PREFIX },
      { status: HTTP_STATUS[ErrorCodes.R2_WRONG_PREFIX] },
    );
  }

  const sessionId = await getSessionIdFromCookie();
  if (!sessionId) {
    return NextResponse.json(
      { error: ErrorCodes.SESSION_MISSING },
      { status: HTTP_STATUS[ErrorCodes.SESSION_MISSING] },
    );
  }

  try {
    const isOwned = await verifyR2ObjectOwnership(key, sessionId);
    if (!isOwned) {
      return NextResponse.json(
        { error: ErrorCodes.R2_OWNERSHIP_MISS },
        { status: HTTP_STATUS[ErrorCodes.R2_OWNERSHIP_MISS] },
      );
    }
  } catch (error) {
    log.error("r2.delete.ownership_check_failed", {
      request_id: requestId,
      error_code: ErrorCodes.R2_OWNERSHIP_TIMEOUT,
      duration_ms: Date.now() - t0,
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_OWNERSHIP_TIMEOUT },
      { status: HTTP_STATUS[ErrorCodes.R2_OWNERSHIP_TIMEOUT] },
    );
  }

  // --- Delete ---
  try {
    await deleteR2Object(key);

    try {
      await removeR2ObjectOwnership(key, sessionId);
    } catch (error) {
      log.warn("r2.delete.cleanup_warning", {
        request_id: requestId,
        duration_ms: Date.now() - t0,
        key,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    log.info("r2.delete.ok", {
      request_id: requestId,
      duration_ms: Date.now() - t0,
      key,
    });

    return NextResponse.json({ deleted: true, key });
  } catch (error) {
    log.error("r2.delete.failed", {
      request_id: requestId,
      error_code: ErrorCodes.R2_DELETE_FAILED,
      duration_ms: Date.now() - t0,
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_DELETE_FAILED },
      { status: HTTP_STATUS[ErrorCodes.R2_DELETE_FAILED] },
    );
  }
}
