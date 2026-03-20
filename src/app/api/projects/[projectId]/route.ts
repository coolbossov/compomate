import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
} from "@/lib/server/supabase-admin";
import { getProjectPersistenceStatus } from "@/lib/server/project-persistence";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";

export const runtime = "nodejs";
export const maxDuration = 10;

const TABLE = "compomate_projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`projects:get:${ip}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and retry." },
      { status: 429 },
    );
  }

  const persistence = getProjectPersistenceStatus();
  if (!persistence.available) {
    return NextResponse.json(
      { error: persistence.reason ?? "Project persistence is unavailable." },
      { status: 503 },
    );
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase client unavailable." }, { status: 503 });
  }

  const { projectId } = await context.params;
  if (!projectId) {
    return NextResponse.json({ error: "Missing project id." }, { status: 400 });
  }

  const sessionId = await getSessionIdFromCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "No session. Save or list projects first." }, { status: 401 });
  }

  const { data, error } = await client
    .from(TABLE)
    .select("id,name,payload,created_at,updated_at")
    .eq("id", projectId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("[projects] Database error:", error.message);
    return NextResponse.json({ error: "Failed to load project." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project: data });
}
