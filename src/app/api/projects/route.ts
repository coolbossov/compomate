import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
} from "@/lib/server/supabase-admin";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import type { ProjectSnapshot } from "@/lib/shared/project-snapshot";

export const runtime = "nodejs";

const TABLE = "compomate_projects";
const MAX_PAYLOAD_BYTES = 1_250_000;

type SaveProjectBody = {
  name?: string;
  snapshot?: ProjectSnapshot;
};

function assertSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { version?: unknown };
  return candidate.version === 1;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`projects:list:${ip}`, 80, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and retry." },
      { status: 429 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ projects: [], configured: false }, { status: 200 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase client unavailable." }, { status: 503 });
  }

  const { data, error } = await client
    .from(TABLE)
    .select("id,name,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`projects:save:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many save attempts. Please wait and retry." },
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

  const body = (await request.json()) as SaveProjectBody;
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }
  if (!assertSnapshot(body.snapshot)) {
    return NextResponse.json({ error: "Invalid project snapshot payload." }, { status: 400 });
  }

  const encoded = Buffer.from(JSON.stringify(body.snapshot), "utf8");
  if (encoded.byteLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: "Project payload is too large to store. Use fewer/lower-resolution assets." },
      { status: 413 },
    );
  }

  const { data, error } = await client
    .from(TABLE)
    .insert({
      name,
      payload: body.snapshot,
    })
    .select("id,name,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
