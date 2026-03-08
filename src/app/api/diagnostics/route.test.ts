import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  HeadBucketCommand: vi.fn(),
}));

import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

import { GET } from "./route";

const R2_ENV = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
};

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/diagnostics", {
    headers: { "x-request-id": "test-request-id" },
  });
}

describe("GET /api/diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of [...Object.keys(R2_ENV), ...Object.keys(SUPABASE_ENV)]) {
      delete process.env[key];
    }
  });

  it("returns structured checks when env and supabase are configured", async () => {
    Object.assign(process.env, R2_ENV, SUPABASE_ENV);
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ error: null }),
        }),
      }),
    } as unknown as ReturnType<typeof getSupabaseAdminClient>);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect([200, 503]).toContain(response.status);
    expect(body.checks.env.ok).toBe(true);
    expect(body.checks.supabase.ok).toBe(true);
    expect(typeof body.checks.r2.ok).toBe("boolean");
  });

  it("returns degraded when env vars are missing", async () => {
    vi.mocked(getSupabaseAdminClient).mockReturnValue(
      null as unknown as ReturnType<typeof getSupabaseAdminClient>,
    );

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.env.ok).toBe(false);
  });

  it("returns request id from incoming header", async () => {
    Object.assign(process.env, R2_ENV, SUPABASE_ENV);
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ error: null }),
        }),
      }),
    } as unknown as ReturnType<typeof getSupabaseAdminClient>);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.request_id).toBe("test-request-id");
  });

  it("includes numeric duration in response", async () => {
    Object.assign(process.env, R2_ENV, SUPABASE_ENV);
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ error: null }),
        }),
      }),
    } as unknown as ReturnType<typeof getSupabaseAdminClient>);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(typeof body.duration_ms).toBe("number");
    expect(body.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("marks supabase check failed when select returns error", async () => {
    Object.assign(process.env, R2_ENV, SUPABASE_ENV);
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ error: { message: "DB error" } }),
        }),
      }),
    } as unknown as ReturnType<typeof getSupabaseAdminClient>);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.supabase.ok).toBe(false);
    expect(body.checks.supabase.detail).toContain("DB error");
  });
});
