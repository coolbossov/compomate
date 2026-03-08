import { S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  detail?: string;
  duration_ms: number;
}

async function checkEnv(): Promise<CheckResult> {
  const startedAt = Date.now();
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ACCOUNT_ID",
    "R2_ENDPOINT",
  ];

  const missing = required.filter((key) => !process.env[key]);
  return {
    ok: missing.length === 0,
    detail: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined,
    duration_ms: Date.now() - startedAt,
  };
}

async function checkSupabase(): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const client = getSupabaseAdminClient();
    if (!client) {
      return {
        ok: false,
        detail: "Supabase not configured",
        duration_ms: Date.now() - startedAt,
      };
    }

    const { error } = await client.from("compomate_projects").select("id").limit(1);
    if (error) {
      return {
        ok: false,
        detail: error.message,
        duration_ms: Date.now() - startedAt,
      };
    }

    return { ok: true, duration_ms: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startedAt,
    };
  }
}

async function checkR2(): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const endpoint = process.env.R2_ENDPOINT;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
      return {
        ok: false,
        detail: "R2 env vars missing",
        duration_ms: Date.now() - startedAt,
      };
    }

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    void client;
    return { ok: true, duration_ms: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startedAt,
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? "unknown";

  const [env, supabase, r2] = await Promise.all([checkEnv(), checkSupabase(), checkR2()]);

  const checks = { env, supabase, r2 };
  const allOk = Object.values(checks).every((check) => check.ok);
  const status = allOk ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      checks,
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    },
    { status: allOk ? 200 : 503 },
  );
}
