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
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import {
  EXPORT_WIDTH_PX,
  EXPORT_HEIGHT_PX,
  buildExportFilename,
} from "@/lib/constants";
import type { CompositionState, ExportProfileId, NameStyleId } from "@/lib/shared/composition";
import type { FontPairId } from "@/types/composition";
import type { NameOverlayConfig } from "@/types/composition";

export const runtime = "nodejs";
export const maxDuration = 300;

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
}

// ---------------------------------------------------------------------------
// Image source helpers
// ---------------------------------------------------------------------------

function dataUrlToBuffer(dataUrl: string): Buffer {
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
// POST /api/export
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`export:${ip}`, 45, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Export rate limit reached. Please wait and retry." },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as ExportRequest;

    // ── Resolve image buffers (R2 preferred, data URL fallback) ─────────────
    const [subjectBuffer, backdropBuffer] = await Promise.all([
      resolveImageBuffer(body.subjectR2Key, body.subjectDataUrl, "subject"),
      resolveImageBuffer(body.backdropR2Key, body.backdropDataUrl, "backdrop"),
    ]);

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

      // Generate presigned PUT URL, then upload via waitUntil (non-blocking)
      const putUrl = await getPresignedUploadUrl(exportKey, "image/png");
      const uploadBuffer = result.buffer;

      waitUntil(
        fetch(putUrl, {
          method: "PUT",
          body: new Uint8Array(uploadBuffer),
          headers: { "Content-Type": "image/png" },
        }).catch((err: unknown) => {
          console.error("[export] R2 upload failed:", err);
        }),
      );

      const downloadUrl = await getPresignedDownloadUrl(exportKey);

      return NextResponse.json({
        filename,
        downloadUrl,
        width: EXPORT_WIDTH_PX,
        height: EXPORT_HEIGHT_PX,
      });
    }

    // No R2 — return inline base64 data URL
    const base64 = result.buffer.toString("base64");
    const downloadUrl = `data:image/png;base64,${base64}`;

    return NextResponse.json({
      filename,
      downloadUrl,
      width: EXPORT_WIDTH_PX,
      height: EXPORT_HEIGHT_PX,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected export error.";
    const status =
      message.includes("Missing") || message.includes("Invalid data URL") ? 400
      : message.includes("too large") || message.includes("image limits") ? 413
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
