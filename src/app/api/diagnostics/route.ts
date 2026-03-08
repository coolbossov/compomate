import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

import { ErrorCodes } from "@/lib/server/error-codes";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  detail?: string;
  duration_ms: number;
}

function getDiagnosticsAccessError(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const expectedToken = process.env.DIAGNOSTICS_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: ErrorCodes.ENV_MISSING }, { status: 503 });
  }

  const providedToken = request.headers.get("x-diagnostics-token")?.trim();
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return null;
}

async function checkEnv(): Promise<CheckResult> {
  const startedAt = Date.now();
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.R2_ACCESS_KEY_ID) {
    missing.push("R2_ACCESS_KEY_ID");
  }
  if (!process.env.R2_SECRET_ACCESS_KEY) {
    missing.push("R2_SECRET_ACCESS_KEY");
  }
  if (!process.env.R2_BUCKET_NAME) {
    missing.push("R2_BUCKET_NAME");
  }
  if (!process.env.R2_ENDPOINT) {
    missing.push("R2_ENDPOINT");
  }

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

    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
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
  const accessError = getDiagnosticsAccessError(request);
  if (accessError) {
    return accessError;
  }

  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? "unknown";

  const [env, supabase, r2] = await Promise.all([checkEnv(), checkSupabase(), checkR2()]);

  const checks = { env, supabase, r2 };
  const allOk = Object.values(checks).every((check) => check.ok);
  const status = allOk ? "ok" : "degraded";

  const shouldIncludeDetails = process.env.NODE_ENV !== "production";
  const responseChecks = {
    env: {
      ok: checks.env.ok,
      duration_ms: checks.env.duration_ms,
      ...(shouldIncludeDetails ? { detail: checks.env.detail } : {}),
    },
    supabase: {
      ok: checks.supabase.ok,
      duration_ms: checks.supabase.duration_ms,
      ...(shouldIncludeDetails ? { detail: checks.supabase.detail } : {}),
    },
    r2: {
      ok: checks.r2.ok,
      duration_ms: checks.r2.duration_ms,
      ...(shouldIncludeDetails ? { detail: checks.r2.detail } : {}),
    },
  };

  return NextResponse.json(
    {
      status,
      checks: responseChecks,
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    },
    { status: allOk ? 200 : 503 },
  );
}
