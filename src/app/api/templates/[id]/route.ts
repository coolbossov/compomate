import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { DB_TABLES } from "@/lib/constants";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;

const SESSION_COOKIE = "compomate-session-id";

async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/templates/[id] — fetch single template
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`templates:get:${ip}`, 80, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many template requests. Please wait and retry." },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const sessionId = await getSessionId();
  if (!sessionId) {
    return NextResponse.json({ error: "No session. Load the templates list first." }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = getSupabaseAdminClient();

  try {
    const { data, error } = await supabase!
      .from(DB_TABLES.TEMPLATES)
      .select("id, name, composition, export_profile_id, name_style_id, font_pair_id, created_at, updated_at")
      .eq("id", id)
      .eq("session_id", sessionId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    return NextResponse.json({ template: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch template.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/templates/[id] — delete a template
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`templates:delete:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many template delete attempts. Please wait and retry." },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const sessionId = await getSessionId();
  if (!sessionId) {
    return NextResponse.json({ error: "No session." }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = getSupabaseAdminClient();

  try {
    const { error } = await supabase!
      .from(DB_TABLES.TEMPLATES)
      .delete()
      .eq("id", id)
      .eq("session_id", sessionId);

    if (error) throw error;

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete template.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
