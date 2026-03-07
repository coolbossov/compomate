import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEMINI_MODEL = "gemini-2.0-flash";
const BACKDROP_DESIGNER_PROMPT =
  "You are a photography backdrop designer. Analyze this reference image and write a detailed prompt " +
  "for an AI image generator to create a similar backdrop for sports/dance photography. " +
  "The backdrop should be dramatic, professional, with studio lighting. " +
  "Return ONLY the prompt text, no explanation.";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

function extractBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL format.");
  return { mimeType: match[1] ?? "image/jpeg", base64: match[2] ?? "" };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`gemini:analyze:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and retry." },
      { status: 429 },
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });
  }

  try {
    const body = (await request.json()) as { imageDataUrl?: string };
    if (!body.imageDataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
    }

    const { base64, mimeType } = extractBase64(body.imageDataUrl);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
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
    const message = error instanceof Error ? error.message : "Reference analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
