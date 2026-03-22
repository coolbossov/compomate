import { NextRequest, NextResponse } from "next/server";

import { CLEANUP_BATCH_SIZE, DB_TABLES } from "@/lib/constants";
import { deleteR2Object } from "@/lib/server/r2";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function getCleanupAccessError(request: NextRequest): NextResponse | null {
  const expectedToken = process.env.DIAGNOSTICS_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: "CLEANUP_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }

  const providedToken = request.headers.get("x-cleanup-token")?.trim();
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const accessError = getCleanupAccessError(request);
  if (accessError) return accessError;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });
  }

  const { data: expired, error: queryError } = await supabase
    .from(DB_TABLES.R2_OBJECTS)
    .select("key, purpose")
    .lt("expires_at", new Date().toISOString())
    .limit(CLEANUP_BATCH_SIZE);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0, errors: 0 });
  }

  let deleted = 0;
  let errors = 0;

  for (const row of expired) {
    try {
      await deleteR2Object(row.key);

      const { error: deleteError } = await supabase
        .from(DB_TABLES.R2_OBJECTS)
        .delete()
        .eq("key", row.key);

      if (deleteError) {
        errors++;
      } else {
        deleted++;
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ deleted, errors });
}
