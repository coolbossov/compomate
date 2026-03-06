import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
} from "@/lib/server/supabase-admin";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const TABLE = "compomate_projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`projects:get:${ip}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and retry." },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
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

  const { data, error } = await client
    .from(TABLE)
    .select("id,name,payload,created_at,updated_at")
    .eq("id", projectId)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ project: data });
}
