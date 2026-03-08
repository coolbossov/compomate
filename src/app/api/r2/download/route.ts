import { NextRequest, NextResponse } from "next/server";
import { getPresignedDownloadUrl } from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { ErrorCodes, HTTP_STATUS } from "@/lib/server/error-codes";
import { log } from "@/lib/server/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_PREFIXES = ["subjects/", "backdrops/", "exports/"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();
  const requestId = request.headers.get("x-request-id") ?? "unknown";

  const r2Env = getR2Env();
  if (!r2Env) {
    log.warn("r2.download.unconfigured", {
      request_id: requestId,
      error_code: ErrorCodes.R2_NOT_CONFIGURED,
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_NOT_CONFIGURED },
      { status: HTTP_STATUS[ErrorCodes.R2_NOT_CONFIGURED] },
    );
  }

  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`r2:download:${ip}`, 120, 60_000);
  if (!limit.allowed) {
    log.warn("r2.download.rate_limited", {
      request_id: requestId,
      error_code: ErrorCodes.R2_RATE_LIMITED,
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_RATE_LIMITED },
      { status: HTTP_STATUS[ErrorCodes.R2_RATE_LIMITED] },
    );
  }

  const key = request.nextUrl.searchParams.get("key")?.trim();
  if (!key) {
    return NextResponse.json(
      { error: ErrorCodes.R2_INVALID_KEY },
      { status: HTTP_STATUS[ErrorCodes.R2_INVALID_KEY] },
    );
  }

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
    log.error("r2.download.ownership_check_failed", {
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

  try {
    const downloadUrl = await getPresignedDownloadUrl(key);
    log.info("r2.download.ok", {
      request_id: requestId,
      duration_ms: Date.now() - t0,
      key,
    });
    return NextResponse.json({ key, downloadUrl });
  } catch (error) {
    log.error("r2.download.failed", {
      request_id: requestId,
      error_code: ErrorCodes.R2_DOWNLOAD_FAILED,
      duration_ms: Date.now() - t0,
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_DOWNLOAD_FAILED },
      { status: HTTP_STATUS[ErrorCodes.R2_DOWNLOAD_FAILED] },
    );
  }
}
