import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted, so no top-level variable references
// ---------------------------------------------------------------------------

// Mock next/headers cookies()
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: "test-session-id-uuid" }),
  }),
}));

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [{ id: "t1", name: "Template 1", composition: {}, created_at: "2025-01-01", updated_at: "2025-01-01" }],
            error: null,
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "t2", name: "New Template", composition: {}, export_profile_id: null, name_style_id: null, font_pair_id: null, created_at: "2025-01-01", updated_at: "2025-01-01" },
            error: null,
          }),
        }),
      }),
    }),
  }),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    remaining: 10,
    resetAt: Date.now() + 60_000,
  }),
  requestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from "./route";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { isSupabaseConfigured, getSupabaseAdminClient } from "@/lib/server/supabase-admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createGetRequest(): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/templates"), {
    method: "GET",
  });
}

function createPostRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/templates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Rebuilds the mock Supabase client chain with fresh mocks */
function buildMockClient(overrides?: {
  orderResult?: { data: unknown; error: unknown };
  insertSingleResult?: { data: unknown; error: unknown };
}) {
  const orderMock = vi.fn().mockResolvedValue(
    overrides?.orderResult ?? {
      data: [{ id: "t1", name: "Template 1", composition: {}, created_at: "2025-01-01", updated_at: "2025-01-01" }],
      error: null,
    },
  );
  const singleMock = vi.fn().mockResolvedValue(
    overrides?.insertSingleResult ?? {
      data: { id: "t2", name: "New Template", composition: {}, export_profile_id: null, name_style_id: null, font_pair_id: null, created_at: "2025-01-01", updated_at: "2025-01-01" },
      error: null,
    },
  );

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: orderMock,
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: singleMock,
        }),
      }),
    }),
    _orderMock: orderMock,
    _singleMock: singleMock,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    const client = buildMockClient();
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);
  });

  it("returns 200 with array of templates", async () => {
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.templates).toBeDefined();
    expect(Array.isArray(json.templates)).toBe(true);
    expect(json.templates.length).toBeGreaterThan(0);
  });

  it("returns templates with configured: false when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.templates).toEqual([]);
    expect(json.configured).toBe(false);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });
});

describe("POST /api/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    const client = buildMockClient();
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);
  });

  it("returns 200 with template for valid save", async () => {
    const res = await POST(
      createPostRequest({ name: "My Template", composition: { xPct: 50 } }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.template).toBeDefined();
    expect(json.template.name).toBe("New Template");
  });

  it("returns 400 when name is empty", async () => {
    const res = await POST(createPostRequest({ name: "", composition: {} }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/name/i);
  });

  it("returns 400 when name exceeds 200 characters", async () => {
    const longName = "A".repeat(201);
    const res = await POST(createPostRequest({ name: longName, composition: {} }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/200/);
  });

  it("returns 503 when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await POST(
      createPostRequest({ name: "Test", composition: {} }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toMatch(/supabase|configured/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(
      createPostRequest({ name: "Test", composition: {} }),
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });
});
