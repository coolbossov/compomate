import { NextRequest, NextResponse } from "next/server";
import { getPresignedDownloadUrl } from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_PREFIXES = ["subjects/", "backdrops/", "exports/"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const r2Env = getR2Env();
  if (!r2Env) {
    return NextResponse.json({ error: "R2 not configured." }, { status: 503 });
  }

  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`r2:download:${ip}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many download requests. Please wait and try again." },
      { status: 429 },
    );
  }

  const key = request.nextUrl.searchParams.get("key")?.trim();
  if (!key) {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }

  const isAllowed = ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Key must be within a managed prefix (subjects/, backdrops/, exports/)." },
      { status: 403 },
    );
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(key);
    return NextResponse.json({ key, downloadUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve object URL.";
    console.error("[r2/download] Error:", key, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
