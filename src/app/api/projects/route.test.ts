import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted; no top-level variable references
// ---------------------------------------------------------------------------

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "p1", name: "Project 1", created_at: "2025-01-01", updated_at: "2025-01-01" }],
            error: null,
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "p2", name: "New Project", created_at: "2025-01-01", updated_at: "2025-01-01" },
            error: null,
          }),
        }),
      }),
    }),
  }),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/server/project-persistence", () => ({
  getProjectPersistenceStatus: vi.fn().mockReturnValue({ available: true }),
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
import { getProjectPersistenceStatus } from "@/lib/server/project-persistence";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { PROJECT_SNAPSHOT_VERSION } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createGetRequest(): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/projects"), {
    method: "GET",
  });
}

function createPostRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/projects"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validSnapshot() {
  return {
    version: PROJECT_SNAPSHOT_VERSION,
    firstName: "John",
    lastName: "Doe",
    nameStyle: "classic",
    exportProfile: "8x10",
    composition: {
      xPct: 50,
      yPct: 84,
      subjectHeightPct: 64,
      reflectionEnabled: false,
      reflectionSizePct: 100,
      reflectionPositionPct: 100,
      reflectionOpacityPct: 36,
      reflectionBlurPx: 2,
      legFadeEnabled: false,
      legFadeStartPct: 74,
      fogEnabled: false,
      fogOpacityPct: 30,
      fogHeightPct: 26,
      shadowEnabled: false,
      shadowStrengthPct: 40,
      lightDirectionDeg: 38,
      lightElevationDeg: 40,
      shadowStretchPct: 100,
      shadowBlurPx: 12,
    },
    activeBackdrop: null,
    activeSubject: null,
  };
}

/** Build a fresh mock Supabase client with configurable results */
function buildMockClient(overrides?: {
  listResult?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
}) {
  const limitMock = vi.fn().mockResolvedValue(
    overrides?.listResult ?? {
      data: [{ id: "p1", name: "Project 1", created_at: "2025-01-01", updated_at: "2025-01-01" }],
      error: null,
    },
  );
  const singleMock = vi.fn().mockResolvedValue(
    overrides?.insertResult ?? {
      data: { id: "p2", name: "New Project", created_at: "2025-01-01", updated_at: "2025-01-01" },
      error: null,
    },
  );

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: limitMock,
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: singleMock,
        }),
      }),
    }),
    _limitMock: limitMock,
    _singleMock: singleMock,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectPersistenceStatus).mockReturnValue({ available: true });
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    const client = buildMockClient();
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);
  });

  it("returns 200 with array of projects", async () => {
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.projects).toBeDefined();
    expect(Array.isArray(json.projects)).toBe(true);
    expect(json.projects.length).toBe(1);
  });

  it("returns 200 with empty projects when persistence unavailable", async () => {
    vi.mocked(getProjectPersistenceStatus).mockReturnValue({
      available: false,
      reason: "Supabase not configured.",
    });

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.projects).toEqual([]);
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

  it("returns 500 with generic error message on DB error (no raw Supabase details)", async () => {
    const client = buildMockClient({
      listResult: {
        data: null,
        error: { message: "relation does not exist", code: "42P01" },
      },
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to load projects.");
    // Should NOT leak the raw Supabase error
    expect(json.error).not.toMatch(/relation does not exist/);
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectPersistenceStatus).mockReturnValue({ available: true });
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    const client = buildMockClient();
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);
  });

  it("returns 201 with project data for valid body", async () => {
    const res = await POST(
      createPostRequest({ name: "My Project", snapshot: validSnapshot() }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.project).toBeDefined();
    expect(json.project.id).toBe("p2");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest(new URL("http://localhost:3000/api/projects"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json{{{",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid|body/i);
  });

  it("returns 400 when project name is missing", async () => {
    const res = await POST(
      createPostRequest({ name: "", snapshot: validSnapshot() }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/name/i);
  });

  it("returns 400 when snapshot is invalid", async () => {
    const res = await POST(
      createPostRequest({ name: "Test", snapshot: { invalid: true } }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/snapshot/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(
      createPostRequest({ name: "Test", snapshot: validSnapshot() }),
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });

  it("error responses should NOT contain raw Supabase error details", async () => {
    const client = buildMockClient({
      insertResult: {
        data: null,
        error: { message: "duplicate key value violates unique constraint", code: "23505" },
      },
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);

    const res = await POST(
      createPostRequest({ name: "Test", snapshot: validSnapshot() }),
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to save project.");
    expect(json.error).not.toMatch(/duplicate key/);
  });

  it("returns 503 when persistence is unavailable", async () => {
    vi.mocked(getProjectPersistenceStatus).mockReturnValue({
      available: false,
      reason: "Supabase is not configured.",
    });

    const res = await POST(
      createPostRequest({ name: "Test", snapshot: validSnapshot() }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
  });
});
