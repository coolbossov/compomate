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
  // --- R2 credentials check (graceful 503 when unconfigured) ---
  const r2Env = getR2Env();
  if (!r2Env) {
    return NextResponse.json(
      {
        error:
          "R2 not configured. Add R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to your environment.",
      },
      { status: 503 },
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
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    if (host && originHost !== host) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // --- Rate limit: 100 presign requests per minute per IP ---
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`r2:presign:${ip}`, 100, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many upload requests. Please wait and try again." },
      { status: 429 },
    );
  }

  // --- Parse body ---
  let body: PresignRequestBody;
  try {
    body = (await request.json()) as PresignRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { filename, contentType, purpose } = body;

  if (typeof filename !== "string" || !filename.trim()) {
    return NextResponse.json({ error: "filename is required." }, { status: 400 });
  }
  if (typeof contentType !== "string" || !contentType.trim()) {
    return NextResponse.json({ error: "contentType is required." }, { status: 400 });
  }
  if (typeof purpose !== "string" || !VALID_PURPOSES.has(purpose as Purpose)) {
    return NextResponse.json(
      { error: "purpose must be 'subject', 'backdrop', or 'export'." },
      { status: 400 },
    );
  }

  const normalizedPurpose = purpose as Purpose;

  // --- Content type validation (images only for subject/backdrop) ---
  if (normalizedPurpose !== "export" && !ALLOWED_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json(
      {
        error: `Unsupported content type '${contentType}'. Allowed: image/png, image/jpeg, image/tiff, image/webp`,
      },
      { status: 415 },
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
    const [uploadUrl, downloadUrl] = await Promise.all([
      getPresignedUploadUrl(key, contentType),
      getPresignedDownloadUrl(key),
    ]);

    return NextResponse.json({ uploadUrl, key, downloadUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate presigned URL.";
    console.error("[r2/presign] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
