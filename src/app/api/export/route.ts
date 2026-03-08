import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { waitUntil } from "@vercel/functions";
import { runCompositorPipeline } from "@/lib/compositing/pipeline";
import {
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  generateExportKey,
} from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { applySessionCookie, getOrCreateSessionId } from "@/lib/server/session-cookie";
import {
  recordR2ObjectOwnership,
  removeR2ObjectOwnership,
  verifyR2ObjectOwnership,
} from "@/lib/server/r2-ownership";
import { ErrorCodes, HTTP_STATUS } from "@/lib/server/error-codes";
import { log } from "@/lib/server/logger";
import {
  EXPORT_WIDTH_PX,
  EXPORT_HEIGHT_PX,
  EXPORT_RATE_LIMIT_PER_MINUTE,
  buildExportFilename,
  DB_TABLES,
} from "@/lib/constants";
import type { CompositionState, ExportProfileId, NameStyleId } from "@/lib/shared/composition";
import type { FontPairId } from "@/types/composition";
import type { NameOverlayConfig } from "@/types/composition";

export const runtime = "nodejs";
export const maxDuration = 300;

// Module-level cache — valid within a warm Vercel instance
const backdropCache = new Map<string, Buffer>();
const BACKDROP_CACHE_MAX = 20;
const backdropCacheOrder: string[] = [];
const MANAGED_R2_PREFIXES = ["subjects/", "backdrops/", "exports/"] as const;

// ---------------------------------------------------------------------------
// Request interface
// ---------------------------------------------------------------------------

interface ExportRequest {
  subjectR2Key?: string;
  subjectDataUrl?: string;
  backdropR2Key?: string;
  backdropDataUrl?: string;
  composition: CompositionState;
  exportProfileId: ExportProfileId;
  nameOverlay: {
    firstName: string;
    lastName: string;
    style: NameStyleId;
    fontPairId: FontPairId;
    enabled: boolean;
    sizePct: number;
    yFromBottomPct: number;
  };
  jobName: string;
  firstName: string;
  lastName: string;
  index: number;
  sessionToken?: string;
}

// ---------------------------------------------------------------------------
// Image source helpers
// ---------------------------------------------------------------------------

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid data URL format.");
  return Buffer.from(match[2].replace(/\s/g, ""), "base64");
}

function cacheSet(key: string, data: Buffer): void {
  if (backdropCache.has(key)) return;
  if (backdropCacheOrder.length >= BACKDROP_CACHE_MAX) {
    const oldestKey = backdropCacheOrder.shift();
    if (oldestKey) {
      backdropCache.delete(oldestKey);
    }
  }
  backdropCacheOrder.push(key);
  backdropCache.set(key, data);
}

async function resolveImageBuffer(
  r2Key: string | undefined,
  dataUrl: string | undefined,
  label: string,
): Promise<Buffer> {
  const r2Env = getR2Env();

  if (r2Key && r2Env) {
    const signedUrl = await getPresignedDownloadUrl(r2Key);
    const res = await fetch(signedUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${label} from R2 (${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  if (dataUrl) {
    return dataUrlToBuffer(dataUrl);
  }

  throw new Error(`Missing ${label}: provide r2Key or dataUrl.`);
}

async function assertR2Access(
  key: string | undefined,
  label: string,
  sessionId: string,
): Promise<void> {
  if (!key) {
    return;
  }

  const isManaged = MANAGED_R2_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!isManaged) {
    throw new Error(`${label} key must be within a managed prefix (subjects/, backdrops/, exports/).`);
  }

  const isOwned = await verifyR2ObjectOwnership(key, sessionId);
  if (!isOwned) {
    throw new Error(`${label} key is not accessible in this session.`);
  }
}

// ---------------------------------------------------------------------------
// POST /api/export
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? "unknown";
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`export:${ip}`, EXPORT_RATE_LIMIT_PER_MINUTE, 60_000);
  if (!limit.allowed) {
    log.warn("export.rate_limited", {
      request_id: requestId,
      error_code: ErrorCodes.R2_RATE_LIMITED,
      duration_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: ErrorCodes.R2_RATE_LIMITED },
      { status: HTTP_STATUS[ErrorCodes.R2_RATE_LIMITED] },
    );
  }

  let sessionState: { sessionId: string; isNew: boolean } | null = null;
  const withSessionCookie = (response: NextResponse): NextResponse => {
    if (sessionState) {
      applySessionCookie(response, sessionState.sessionId, sessionState.isNew);
    }
    return response;
  };

  try {
    const body = (await request.json()) as ExportRequest;
    sessionState = await getOrCreateSessionId();

    await Promise.all([
      assertR2Access(body.subjectR2Key, "Subject", sessionState.sessionId),
      assertR2Access(body.backdropR2Key, "Backdrop", sessionState.sessionId),
    ]);

    // ── Resolve image buffers (R2 preferred, data URL fallback) ─────────────
    const backdropCacheKey = body.backdropR2Key;
    const cachedBackdrop = backdropCacheKey ? backdropCache.get(backdropCacheKey) : undefined;

    const [subjectBuffer, resolvedBackdropBuffer] = await Promise.all([
      resolveImageBuffer(body.subjectR2Key, body.subjectDataUrl, "subject"),
      cachedBackdrop !== undefined
        ? Promise.resolve(cachedBackdrop)
        : resolveImageBuffer(body.backdropR2Key, body.backdropDataUrl, "backdrop"),
    ]);

    const backdropBuffer = resolvedBackdropBuffer;
    if (backdropCacheKey && cachedBackdrop === undefined) {
      cacheSet(backdropCacheKey, backdropBuffer);
    }

    // ── Build name overlay config ────────────────────────────────────────────
    const nameOverlay: NameOverlayConfig = {
      firstName: body.nameOverlay?.firstName ?? body.firstName ?? "",
      lastName: body.nameOverlay?.lastName ?? body.lastName ?? "",
      style: body.nameOverlay?.style ?? "classic",
      fontPairId: body.nameOverlay?.fontPairId ?? "classic",
      enabled: body.nameOverlay?.enabled ?? false,
      sizePct: body.nameOverlay?.sizePct ?? 8,
      yFromBottomPct: body.nameOverlay?.yFromBottomPct ?? 5,
    };

    // ── Run compositor pipeline (always 4000×5000, 300 DPI) ─────────────────
    const result = await runCompositorPipeline({
      subjectBuffer,
      backdropBuffer,
      composition: body.composition,
      outputWidth: EXPORT_WIDTH_PX,
      outputHeight: EXPORT_HEIGHT_PX,
      nameOverlay,
      fontBasePath: path.join(process.cwd(), "public", "fonts"),
    });

    // ── Fire-and-forget usage log ────────────────────────────────────────────
    waitUntil((async () => {
      try {
        const supabase = getSupabaseAdminClient();
        if (supabase) {
          await supabase.from(DB_TABLES.USAGE_LOGS).insert({
            session_token: body.sessionToken ?? "anonymous",
            event_type: "export",
            model: "sharp",
            duration_ms: Date.now() - startTime,
            output_width: EXPORT_WIDTH_PX,
            output_height: EXPORT_HEIGHT_PX,
          });
        }
      } catch {
        // non-critical — never block or fail the export
      }
    })());

    // ── File naming ──────────────────────────────────────────────────────────
    const filename = buildExportFilename(
      body.jobName ?? "",
      body.firstName ?? "",
      body.lastName ?? "",
      body.index ?? 1,
    );

    // ── Return result: R2 presigned GET, or inline base64 ───────────────────
    const r2Env = getR2Env();

    if (r2Env) {
      const exportKey = generateExportKey(filename);

      try {
        await recordR2ObjectOwnership(exportKey, sessionState.sessionId, "export");

        const putUrl = await getPresignedUploadUrl(exportKey, "image/png");
        const downloadUrl = await getPresignedDownloadUrl(exportKey);

        const uploadResponse = await fetch(putUrl, {
          method: "PUT",
          body: new Uint8Array(result.buffer),
          headers: { "Content-Type": "image/png" },
        });

        if (!uploadResponse.ok) {
          throw new Error(`R2 upload failed (${uploadResponse.status}).`);
        }

        log.info("export.ok", {
          request_id: requestId,
          duration_ms: Date.now() - startTime,
          filename,
          key: exportKey,
        });

        return withSessionCookie(NextResponse.json({
          filename,
          downloadUrl,
          width: EXPORT_WIDTH_PX,
          height: EXPORT_HEIGHT_PX,
        }));
      } catch (error) {
        log.error("export.r2_upload_failed", {
          request_id: requestId,
          error_code: ErrorCodes.R2_UPLOAD_FAILED,
          duration_ms: Date.now() - startTime,
          key: exportKey,
          message: error instanceof Error ? error.message : String(error),
        });

        try {
          await removeR2ObjectOwnership(exportKey, sessionState.sessionId);
        } catch {
          // best effort cleanup only
        }
      }
    }

    // No R2 — inline base64 would exceed Vercel's 4.5MB response limit for 4K exports
    log.error("export.storage_unavailable", {
      request_id: requestId,
      error_code: ErrorCodes.ENV_MISSING,
      duration_ms: Date.now() - startTime,
    });

    return withSessionCookie(NextResponse.json(
      { error: ErrorCodes.ENV_MISSING, retryable: true },
      { status: HTTP_STATUS[ErrorCodes.ENV_MISSING] },
    ));
  } catch (error) {
    if ((error as { isTimeout?: boolean }).isTimeout) {
      log.warn("export.timeout", {
        request_id: requestId,
        error_code: ErrorCodes.EXPORT_TIMEOUT,
        duration_ms: Date.now() - startTime,
      });

      return withSessionCookie(NextResponse.json(
        { error: ErrorCodes.EXPORT_TIMEOUT, retryable: true },
        { status: HTTP_STATUS[ErrorCodes.EXPORT_TIMEOUT] },
      ));
    }

    const message = error instanceof Error ? error.message : "Unexpected export error.";

    const errorCode =
      message.includes("managed prefix") || message.includes("not accessible in this session")
        ? ErrorCodes.R2_OWNERSHIP_MISS
        : message.includes("Missing") || message.includes("Invalid data URL")
          ? ErrorCodes.EXPORT_INVALID_INPUT
          : message.includes("too large") || message.includes("image limits")
            ? ErrorCodes.EXPORT_TOO_LARGE
            : ErrorCodes.R2_UPLOAD_FAILED;

    log.error("export.failed", {
      request_id: requestId,
      error_code: errorCode,
      duration_ms: Date.now() - startTime,
      message,
    });

    return withSessionCookie(
      NextResponse.json({ error: errorCode }, { status: HTTP_STATUS[errorCode] }),
    );
  }
}
