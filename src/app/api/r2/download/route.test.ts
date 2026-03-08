import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/r2", () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.test/download/signed"),
}));

vi.mock("@/lib/server/env", () => ({
  getR2Env: vi.fn().mockReturnValue({
    R2_ACCESS_KEY_ID: "test-id",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET_NAME: "test-bucket",
    R2_ENDPOINT: "https://r2.test",
  }),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    remaining: 10,
    resetAt: Date.now() + 60_000,
  }),
  requestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/server/session-cookie", () => ({
  getSessionIdFromCookie: vi.fn().mockResolvedValue("session-test-123"),
}));

vi.mock("@/lib/server/r2-ownership", () => ({
  verifyR2ObjectOwnership: vi.fn().mockResolvedValue(true),
}));

import { GET } from "./route";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { getPresignedDownloadUrl } from "@/lib/server/r2";
import { ErrorCodes } from "@/lib/server/error-codes";

function createRequest(key?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/r2/download");
  if (key) {
    url.searchParams.set("key", key);
  }

  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/r2/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getR2Env).mockReturnValue({
      R2_ACCESS_KEY_ID: "test-id",
      R2_SECRET_ACCESS_KEY: "test-secret",
      R2_BUCKET_NAME: "test-bucket",
      R2_ENDPOINT: "https://r2.test",
    });

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    vi.mocked(getSessionIdFromCookie).mockResolvedValue("session-test-123");
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(true);
    vi.mocked(getPresignedDownloadUrl).mockResolvedValue("https://r2.test/download/signed");
  });

  it("returns 200 with downloadUrl when key is owned by session", async () => {
    const res = await GET(createRequest("subjects/mock-key.png"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.downloadUrl).toBe("https://r2.test/download/signed");
    expect(verifyR2ObjectOwnership).toHaveBeenCalledWith("subjects/mock-key.png", "session-test-123");
  });

  it("returns 400 when key is missing", async () => {
    const res = await GET(createRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe(ErrorCodes.R2_INVALID_KEY);
  });

  it("returns 503 when R2 is not configured", async () => {
    vi.mocked(getR2Env).mockReturnValue(null);

    const res = await GET(createRequest("subjects/mock-key.png"));
    expect(res.status).toBe(503);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await GET(createRequest("subjects/mock-key.png"));
    expect(res.status).toBe(429);
  });

  it("returns 403 when key prefix is not allowed", async () => {
    const res = await GET(createRequest("private/mock-key.png"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when session cookie is missing", async () => {
    vi.mocked(getSessionIdFromCookie).mockResolvedValue(null);

    const res = await GET(createRequest("subjects/mock-key.png"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when key is not owned by session", async () => {
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(false);

    const res = await GET(createRequest("subjects/mock-key.png"));
    expect(res.status).toBe(403);
  });

  it("returns 503 when ownership check throws", async () => {
    vi.mocked(verifyR2ObjectOwnership).mockRejectedValue(new Error("db failure"));

    const res = await GET(createRequest("subjects/mock-key.png"));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe(ErrorCodes.R2_OWNERSHIP_TIMEOUT);
  });
});
