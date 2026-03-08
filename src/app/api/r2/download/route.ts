import { NextRequest, NextResponse } from "next/server";
import { getPresignedDownloadUrl } from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";

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

  const sessionId = await getSessionIdFromCookie();
  if (!sessionId) {
    return NextResponse.json(
      { error: "No session. Upload assets first to establish a session." },
      { status: 401 },
    );
  }

  try {
    const isOwned = await verifyR2ObjectOwnership(key, sessionId);
    if (!isOwned) {
      return NextResponse.json({ error: "Key is not accessible in this session." }, { status: 403 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate key ownership.";
    console.error("[r2/download] Ownership check error:", key, message);
    return NextResponse.json({ error: "Failed to validate key access." }, { status: 500 });
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
