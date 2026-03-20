import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { getPresignedDownloadUrl } from "@/lib/server/r2";
import { verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEMINI_MODEL = "gemini-2.0-flash";
const BACKDROP_DESIGNER_PROMPT =
  "You are a photography backdrop designer. Analyze this reference image and write a detailed prompt " +
  "for an AI image generator to create a similar backdrop for sports/dance photography. " +
  "The backdrop should be dramatic, professional, with studio lighting. " +
  "Return ONLY the prompt text, no explanation.";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_R2_PREFIXES = ["backdrops/", "subjects/"];
const MAX_DATA_URL_LENGTH = 10_000_000;
const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

type AnalyzeRequestBody = {
  imageDataUrl?: string;
  r2Key?: string;
};

type PreparedImage = {
  base64: string;
  mimeType: string;
};

class AnalyzeReferenceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeMimeType(value: string | null | undefined): string {
  return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function extractBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL format.");
  return { mimeType: normalizeMimeType(match[1]) || "image/jpeg", base64: match[2] ?? "" };
}

function prepareImageFromDataUrl(imageDataUrl: string): PreparedImage {
  if (imageDataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new AnalyzeReferenceError(413, "Image too large for analysis.");
  }

  const mimeMatch = imageDataUrl.match(/^data:([^;]+);base64,/);
  const mimeType = normalizeMimeType(mimeMatch?.[1]);
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AnalyzeReferenceError(400, "Unsupported image format. Use JPEG, PNG, or WebP.");
  }

  const { base64 } = extractBase64(imageDataUrl);
  if (!base64) {
    throw new AnalyzeReferenceError(400, "Invalid data URL format.");
  }

  return { base64, mimeType };
}

async function prepareImageFromR2(r2Key: string, sessionId: string): Promise<PreparedImage> {
  const isAllowedPrefix = ALLOWED_R2_PREFIXES.some((prefix) => r2Key.startsWith(prefix));
  if (!isAllowedPrefix) {
    throw new AnalyzeReferenceError(403, "Reference photo key is not allowed.");
  }

  let isOwned = false;
  try {
    isOwned = await verifyR2ObjectOwnership(r2Key, sessionId);
  } catch {
    throw new AnalyzeReferenceError(503, "Failed to verify reference photo access.");
  }

  if (!isOwned) {
    throw new AnalyzeReferenceError(403, "Reference photo is not owned by this session.");
  }

  let downloadUrl = "";
  try {
    downloadUrl = await getPresignedDownloadUrl(r2Key);
  } catch {
    throw new AnalyzeReferenceError(502, "Failed to load reference photo.");
  }

  const imageResponse = await fetch(downloadUrl, { cache: "no-store" });
  if (!imageResponse.ok) {
    throw new AnalyzeReferenceError(502, "Failed to load reference photo.");
  }

  const mimeType = normalizeMimeType(imageResponse.headers.get("content-type"));
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AnalyzeReferenceError(400, "Unsupported image format. Use JPEG, PNG, or WebP.");
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  if (imageBuffer.byteLength === 0) {
    throw new AnalyzeReferenceError(400, "Reference photo is empty.");
  }

  if (imageBuffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new AnalyzeReferenceError(413, "Reference photo is too large for analysis.");
  }

  return {
    base64: imageBuffer.toString("base64"),
    mimeType,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`gemini:analyze:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and retry." },
      { status: 429 },
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json({ error: "AI analysis service is not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as AnalyzeRequestBody;
    const r2Key = typeof body.r2Key === "string" ? body.r2Key.trim() : "";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";

    if (!r2Key && !imageDataUrl) {
      return NextResponse.json({ error: "Either imageDataUrl or r2Key is required." }, { status: 400 });
    }

    let image: PreparedImage;
    if (r2Key) {
      const sessionId = await getSessionIdFromCookie();
      if (!sessionId) {
        return NextResponse.json({ error: "Session missing for reference photo analysis." }, { status: 401 });
      }

      image = await prepareImageFromR2(r2Key, sessionId);
    } else {
      image = prepareImageFromDataUrl(imageDataUrl);
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: image.mimeType, data: image.base64 } },
                { text: BACKDROP_DESIGNER_PROMPT },
              ],
            },
          ],
        }),
        cache: "no-store",
      },
    );

    if (!geminiRes.ok) {
      const errBody = (await geminiRes.json().catch(() => ({}))) as GeminiResponse;
      const message = errBody.error?.message ?? `Gemini API error (${geminiRes.status}).`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const geminiData = (await geminiRes.json()) as GeminiResponse;
    const promptText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!promptText) {
      return NextResponse.json({ error: "Gemini returned no prompt text." }, { status: 502 });
    }

    return NextResponse.json({ prompt: promptText });
  } catch (error) {
    if (error instanceof AnalyzeReferenceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Reference analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
