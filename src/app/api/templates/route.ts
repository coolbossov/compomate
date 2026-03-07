import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { DB_TABLES } from "@/lib/constants";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;

const SESSION_COOKIE = "compomate-session-id";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

async function getOrCreateSessionId(): Promise<{ sessionId: string; isNew: boolean }> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) return { sessionId: existing, isNew: false };
  const sessionId = crypto.randomUUID();
  return { sessionId, isNew: true };
}

function applySessionCookie(response: NextResponse, sessionId: string, isNew: boolean): void {
  if (isNew) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  }
}

// ---------------------------------------------------------------------------
// GET /api/templates — list templates for the current session
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`templates:list:${ip}`, 80, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many template requests. Please wait and retry." },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ templates: [], configured: false, reason: "Supabase not configured." });
  }

  const { sessionId, isNew } = await getOrCreateSessionId();
  const supabase = getSupabaseAdminClient();

  try {
    const { data, error } = await supabase!
      .from(DB_TABLES.TEMPLATES)
      .select("id, name, composition, export_profile_id, name_style_id, font_pair_id, created_at, updated_at")
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const response = NextResponse.json({ templates: data ?? [], configured: true });
    applySessionCookie(response, sessionId, isNew);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load templates.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applySessionCookie(response, sessionId, isNew);
    return response;
  }
}

// ---------------------------------------------------------------------------
// POST /api/templates — save a new template
// ---------------------------------------------------------------------------

type SaveTemplateBody = {
  name?: string;
  composition?: Record<string, unknown>;
  exportProfileId?: string;
  nameStyleId?: string;
  fontPairId?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`templates:save:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many template save attempts. Please wait and retry." },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const { sessionId, isNew } = await getOrCreateSessionId();
  const supabase = getSupabaseAdminClient();

  try {
    const body = (await request.json()) as SaveTemplateBody;
    const name = (body.name ?? "").trim();
    if (!name) {
      const response = NextResponse.json({ error: "Template name is required." }, { status: 400 });
      applySessionCookie(response, sessionId, isNew);
      return response;
    }

    const { data, error } = await supabase!
      .from(DB_TABLES.TEMPLATES)
      .insert({
        session_id: sessionId,
        name,
        composition: body.composition ?? {},
        export_profile_id: body.exportProfileId ?? null,
        name_style_id: body.nameStyleId ?? null,
        font_pair_id: body.fontPairId ?? null,
      })
      .select("id, name, composition, export_profile_id, name_style_id, font_pair_id, created_at, updated_at")
      .single();

    if (error) throw error;

    const response = NextResponse.json({ template: data });
    applySessionCookie(response, sessionId, isNew);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save template.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applySessionCookie(response, sessionId, isNew);
    return response;
  }
}
