import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/project-persistence", () => ({
  getProjectPersistenceStatus: vi.fn().mockReturnValue({ available: true }),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 10,
    resetAt: Date.now() + 60_000,
  }),
  requestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/server/session-cookie", () => ({
  getSessionIdFromCookie: vi.fn().mockResolvedValue("session-123"),
}));

import { getProjectPersistenceStatus } from "@/lib/server/project-persistence";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

import { GET } from "./route";

function createRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/projects/p1", { method: "GET" });
}

function createContext(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function buildMockClient(result?: { data: unknown; error: unknown }) {
  const maybeSingleMock = vi.fn().mockResolvedValue(
    result ?? {
      data: {
        id: "p1",
        name: "Project 1",
        payload: { version: 1 },
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      error: null,
    },
  );

  const sessionEqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const idEqMock = vi.fn().mockReturnValue({ eq: sessionEqMock });
  const selectMock = vi.fn().mockReturnValue({ eq: idEqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  return {
    from: fromMock,
    _idEqMock: idEqMock,
    _sessionEqMock: sessionEqMock,
    _maybeSingleMock: maybeSingleMock,
  };
}

describe("GET /api/projects/[projectId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectPersistenceStatus).mockReturnValue({ available: true });
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
    vi.mocked(getSessionIdFromCookie).mockResolvedValue("session-123");
    vi.mocked(getSupabaseAdminClient).mockReturnValue(buildMockClient() as never);
  });

  it("returns 200 with project when id belongs to current session", async () => {
    const client = buildMockClient();
    vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);

    const res = await GET(createRequest(), createContext("p1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.project?.id).toBe("p1");
    expect(client._idEqMock).toHaveBeenCalledWith("id", "p1");
    expect(client._sessionEqMock).toHaveBeenCalledWith("session_id", "session-123");
  });

  it("returns 401 when session cookie is missing", async () => {
    vi.mocked(getSessionIdFromCookie).mockResolvedValue(null);

    const res = await GET(createRequest(), createContext("p1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toMatch(/No session/i);
  });

  it("returns 404 when project is not found for session", async () => {
    vi.mocked(getSupabaseAdminClient).mockReturnValue(
      buildMockClient({ data: null, error: null }) as never,
    );

    const res = await GET(createRequest(), createContext("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Project not found.");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await GET(createRequest(), createContext("p1"));
    expect(res.status).toBe(429);
  });

  it("returns 503 when persistence is unavailable", async () => {
    vi.mocked(getProjectPersistenceStatus).mockReturnValue({
      available: false,
      reason: "Supabase not configured",
    });

    const res = await GET(createRequest(), createContext("p1"));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toMatch(/Supabase not configured/i);
  });

  it("returns 503 when supabase client is unavailable", async () => {
    vi.mocked(getSupabaseAdminClient).mockReturnValue(null as never);

    const res = await GET(createRequest(), createContext("p1"));
    expect(res.status).toBe(503);
  });

  it("returns 400 when project id is missing", async () => {
    const res = await GET(createRequest(), createContext(""));
    expect(res.status).toBe(400);
  });

  it("returns 500 with generic error when database query fails", async () => {
    vi.mocked(getSupabaseAdminClient).mockReturnValue(
      buildMockClient({ data: null, error: { message: "relation missing" } }) as never,
    );

    const res = await GET(createRequest(), createContext("p1"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to load project.");
    expect(json.error).not.toMatch(/relation missing/i);
  });
});
