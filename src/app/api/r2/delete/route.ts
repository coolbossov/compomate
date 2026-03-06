// ============================================================
// DELETE /api/r2/delete
// Deletes an object from R2 (cleanup after export or session end).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { deleteR2Object } from "@/lib/server/r2";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;

// Only allow deletion of keys within our managed prefixes
const ALLOWED_PREFIXES = ["subjects/", "backdrops/", "exports/"];

type DeleteRequestBody = {
  key?: unknown;
};

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  // --- R2 credentials check ---
  const r2Env = getR2Env();
  if (!r2Env) {
    return NextResponse.json(
      { error: "R2 not configured." },
      { status: 503 },
    );
  }

  // --- Rate limit: 60 delete requests per minute per IP ---
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`r2:delete:${ip}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many delete requests. Please wait and try again." },
      { status: 429 },
    );
  }

  // --- Parse body ---
  let body: DeleteRequestBody;
  try {
    body = (await request.json()) as DeleteRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { key } = body;

  if (typeof key !== "string" || !key.trim()) {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }

  // --- Key prefix guard: prevent arbitrary deletion ---
  const isAllowed = ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Key must be within a managed prefix (subjects/, backdrops/, exports/)." },
      { status: 403 },
    );
  }

  // --- Delete ---
  try {
    await deleteR2Object(key);
    return NextResponse.json({ deleted: true, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete object.";
    console.error("[r2/delete] Error:", key, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
