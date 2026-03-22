import { NextRequest, NextResponse } from "next/server";
import path from "path";
import JSZip from "jszip";
import { z } from "zod";
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
import { recordR2ObjectOwnership } from "@/lib/server/r2-ownership";
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

export const runtime = "nodejs";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerBatchItem {
  id: string;
  label: string;
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
  firstName: string;
  lastName: string;
  index: number;
}

interface BatchJobItem {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  error?: string;
  filename?: string;
  exportKey?: string;
}



// ---------------------------------------------------------------------------
// Image helpers (same as /api/export)
// ---------------------------------------------------------------------------

// 20 MB limit — prevents OOM in serverless container (base64 ~33% overhead so 20 MB encoded ≈ 15 MB decoded)
const DATA_URL_MAX_BYTES = 20 * 1024 * 1024;

function dataUrlToBuffer(dataUrl: string): Buffer {
  if (dataUrl.length > DATA_URL_MAX_BYTES) {
    throw new Error(`Data URL exceeds ${DATA_URL_MAX_BYTES / 1024 / 1024} MB limit.`);
  }
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid data URL format.");
  return Buffer.from(match[2].replace(/\s/g, ""), "base64");
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

// ---------------------------------------------------------------------------
// Supabase job helpers
// ---------------------------------------------------------------------------

async function updateJobItems(
  jobId: string,
  items: BatchJobItem[],
  extra?: Partial<{
    status: string;
    done_count: number;
    failed_count: number;
    download_url: string;
    error: string;
  }>,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase
    .from(DB_TABLES.BATCH_JOBS)
    .update({ items, updated_at: new Date().toISOString(), ...extra })
    .eq("id", jobId);
}

// ---------------------------------------------------------------------------
// Core processing (runs inside waitUntil)
// ---------------------------------------------------------------------------

// Inferred from Zod schema — used as the processJob parameter to avoid unsafe casts
type ValidatedBatchItem = z.infer<typeof ServerBatchItemSchema>;

async function processJob(
  jobId: string,
  inputItems: ValidatedBatchItem[],
  jobName: string,
  sessionId: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const r2Env = getR2Env();
  const fontBasePath = path.join(process.cwd(), "public", "fonts");

  // Mutable local copy of item status tracked for JSONB updates
  const jobItems: BatchJobItem[] = inputItems.map((i) => ({
    id: i.id,
    label: i.label,
    status: "pending" as const,
  }));

  // Mark job running
  await supabase
    .from(DB_TABLES.BATCH_JOBS)
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  let doneCount = 0;
  let failedCount = 0;

  for (let idx = 0; idx < inputItems.length; idx++) {
    const item = inputItems[idx];
    const jobItem = jobItems[idx];

    // Mark item running
    jobItem.status = "running";
    await updateJobItems(jobId, jobItems);

    try {
      const [subjectBuffer, backdropBuffer] = await Promise.all([
        resolveImageBuffer(item.subjectR2Key, item.subjectDataUrl, "subject"),
        resolveImageBuffer(item.backdropR2Key, item.backdropDataUrl, "backdrop"),
      ]);

      const result = await runCompositorPipeline({
        subjectBuffer,
        backdropBuffer,
        // Composition fields are validated by Zod schema but typed loosely; cast here
        composition: item.composition as CompositionState,
        outputWidth: EXPORT_WIDTH_PX,
        outputHeight: EXPORT_HEIGHT_PX,
        nameOverlay: {
          firstName: item.nameOverlay.firstName,
          lastName: item.nameOverlay.lastName,
          // Style/fontPairId are validated by the client as literal union types; cast here
          style: item.nameOverlay.style as NameStyleId,
          fontPairId: item.nameOverlay.fontPairId as FontPairId,
          enabled: item.nameOverlay.enabled,
          sizePct: item.nameOverlay.sizePct,
          yFromBottomPct: item.nameOverlay.yFromBottomPct,
        },
        fontBasePath,
      });

      const filename = buildExportFilename(
        jobName,
        item.firstName,
        item.lastName,
        item.index,
      );

      if (r2Env) {
        const exportKey = generateExportKey(filename);

        await recordR2ObjectOwnership(exportKey, sessionId, "export");

        const putUrl = await getPresignedUploadUrl(exportKey, "image/png");
        const uploadResponse = await fetch(putUrl, {
          method: "PUT",
          body: new Uint8Array(result.buffer),
          headers: { "Content-Type": "image/png" },
        });

        if (!uploadResponse.ok) {
          throw new Error(`R2 upload failed (${uploadResponse.status}).`);
        }

        jobItem.status = "done";
        jobItem.filename = filename;
        jobItem.exportKey = exportKey;
      } else {
        throw new Error("R2 storage not configured.");
      }

      doneCount += 1;
    } catch (err) {
      jobItem.status = "failed";
      jobItem.error = err instanceof Error ? err.message : "Unknown error.";
      failedCount += 1;
    }

    await updateJobItems(jobId, jobItems, { done_count: doneCount, failed_count: failedCount });
  }

  // ---------------------------------------------------------------------------
  // Assemble ZIP from all done items
  // ---------------------------------------------------------------------------
  try {
    if (doneCount === 0 || !r2Env) {
      await supabase
        .from(DB_TABLES.BATCH_JOBS)
        .update({
          status: failedCount === inputItems.length ? "failed" : "done",
          error: doneCount === 0 ? "All items failed to export." : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    const zip = new JSZip();

    // Download each done item from R2 and add to zip
    await Promise.all(
      jobItems
        .filter((i) => i.status === "done" && i.exportKey && i.filename)
        .map(async (i) => {
          try {
            const downloadUrl = await getPresignedDownloadUrl(i.exportKey!);
            const res = await fetch(downloadUrl);
            if (!res.ok) throw new Error(`R2 fetch failed for ${i.filename}`);
            const buf = await res.arrayBuffer();
            zip.file(i.filename!, buf);
          } catch {
            // Non-fatal — item still shows as done; just won't be in zip
          }
        }),
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const zipFilename = `batch-${jobId.slice(0, 8)}.zip`;
    const zipKey = `batch-zips/${jobId}.zip`;

    await recordR2ObjectOwnership(zipKey, sessionId, "export");
    const zipPutUrl = await getPresignedUploadUrl(zipKey, "application/zip");
    const zipUpload = await fetch(zipPutUrl, {
      method: "PUT",
      body: new Uint8Array(zipBuffer),
      headers: { "Content-Type": "application/zip" },
    });

    if (!zipUpload.ok) throw new Error(`ZIP upload failed (${zipUpload.status}).`);

    // 1-hour presigned download URL
    const downloadUrl = await getPresignedDownloadUrl(zipKey, 3600);

    await supabase
      .from(DB_TABLES.BATCH_JOBS)
      .update({
        status: "done",
        download_url: downloadUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    log.info("batch_export.done", { job_id: jobId, done: doneCount, failed: failedCount, zip: zipFilename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ZIP assembly failed.";
    log.error("batch_export.zip_failed", { job_id: jobId, message });
    await supabase
      .from(DB_TABLES.BATCH_JOBS)
      .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------------
// POST /api/batch-export/start
// ---------------------------------------------------------------------------

const MAX_BATCH_ITEMS = 100;

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

const NameOverlaySchema = z.object({
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  style: z.string().max(50),
  fontPairId: z.string().max(50),
  enabled: z.boolean(),
  sizePct: z.number().min(0).max(200),
  yFromBottomPct: z.number().min(0).max(100),
});

const ServerBatchItemSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(256),
  subjectR2Key: z.string().max(512).optional(),
  subjectDataUrl: z.string().max(DATA_URL_MAX_BYTES).optional(),
  backdropR2Key: z.string().max(512).optional(),
  backdropDataUrl: z.string().max(DATA_URL_MAX_BYTES).optional(),
  composition: z.record(z.string(), z.unknown()),
  exportProfileId: z.string().max(50),
  nameOverlay: NameOverlaySchema,
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  index: z.number().int().min(0),
}).refine(
  (item) => Boolean(item.subjectR2Key || item.subjectDataUrl),
  { message: "Each item must provide subjectR2Key or subjectDataUrl." },
);

const BatchStartSchema = z.object({
  items: z.array(ServerBatchItemSchema).min(1).max(MAX_BATCH_ITEMS),
  jobName: z.string().max(100).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`batch-export:${ip}`, EXPORT_RATE_LIMIT_PER_MINUTE, 60_000);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.R2_RATE_LIMITED },
      { status: HTTP_STATUS[ErrorCodes.R2_RATE_LIMITED] },
    );
  }

  // Reject requests that are clearly too large before JSON parsing (OOM guard).
  // Max: 100 items × 2 images × ~26.7 MB base64 per 20 MB decoded ≈ 5.3 GB theoretical max.
  // We cap the raw body at 50 MB which is more than enough for a realistic batch.
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: ErrorCodes.BATCH_INVALID_INPUT, message: "Request body too large." },
      { status: HTTP_STATUS[ErrorCodes.BATCH_INVALID_INPUT] },
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
    // Establish session before validation so all error responses carry the cookie
    sessionState = await getOrCreateSessionId();

    const rawBody = await request.json();
    const parseResult = BatchStartSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.BATCH_INVALID_INPUT, message: parseResult.error.message },
          { status: HTTP_STATUS[ErrorCodes.BATCH_INVALID_INPUT] },
        ),
      );
    }

    const body = parseResult.data;

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.ENV_MISSING },
          { status: HTTP_STATUS[ErrorCodes.ENV_MISSING] },
        ),
      );
    }

    const jobId = crypto.randomUUID();
    const jobName = (body.jobName ?? "").trim() || "Job";

    const initialItems: BatchJobItem[] = body.items.map((i) => ({
      id: i.id,
      label: i.label,
      status: "pending" as const,
    }));

    const { error: insertError } = await supabase.from(DB_TABLES.BATCH_JOBS).insert({
      id: jobId,
      session_id: sessionState.sessionId,
      status: "pending",
      total: body.items.length,
      done_count: 0,
      failed_count: 0,
      items: initialItems,
    });

    if (insertError) {
      log.error("batch_export.insert_failed", { message: insertError.message });
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.SUPABASE_WRITE_FAILED },
          { status: HTTP_STATUS[ErrorCodes.SUPABASE_WRITE_FAILED] },
        ),
      );
    }

    // Fire-and-forget: process job server-side
    waitUntil(processJob(jobId, body.items, jobName, sessionState.sessionId));

    log.info("batch_export.started", { job_id: jobId, total: body.items.length });

    return withSessionCookie(NextResponse.json({ jobId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    log.error("batch_export.start_failed", { message });
    return withSessionCookie(
      NextResponse.json(
        { error: ErrorCodes.EXPORT_INVALID_INPUT },
        { status: HTTP_STATUS[ErrorCodes.EXPORT_INVALID_INPUT] },
      ),
    );
  }
}
