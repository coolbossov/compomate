import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/r2", () => ({
  deleteR2Object: vi.fn().mockResolvedValue(undefined),
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
  checkRateLimit: vi.fn().mockResolvedValue({
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
  removeR2ObjectOwnership: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from "./route";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { removeR2ObjectOwnership, verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { deleteR2Object } from "@/lib/server/r2";
import { ErrorCodes } from "@/lib/server/error-codes";

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/r2/delete"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/r2/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getR2Env).mockReturnValue({
      R2_ACCESS_KEY_ID: "test-id",
      R2_SECRET_ACCESS_KEY: "test-secret",
      R2_BUCKET_NAME: "test-bucket",
      R2_ENDPOINT: "https://r2.test",
    });

    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    vi.mocked(getSessionIdFromCookie).mockResolvedValue("session-test-123");
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(true);
    vi.mocked(removeR2ObjectOwnership).mockResolvedValue(undefined);
    vi.mocked(deleteR2Object).mockResolvedValue(undefined);
  });

  it("returns 200 when key is owned and delete succeeds", async () => {
    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(true);
    expect(verifyR2ObjectOwnership).toHaveBeenCalledWith("subjects/mock-key.png", "session-test-123");
    expect(deleteR2Object).toHaveBeenCalledWith("subjects/mock-key.png");
    expect(removeR2ObjectOwnership).toHaveBeenCalledWith("subjects/mock-key.png", "session-test-123");
  });

  it("returns 503 when R2 is not configured", async () => {
    vi.mocked(getR2Env).mockReturnValue(null);

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    expect(res.status).toBe(503);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when key is missing", async () => {
    const res = await DELETE(createRequest({ key: "" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe(ErrorCodes.R2_INVALID_KEY);
  });

  it("returns 403 when key prefix is not allowed", async () => {
    const res = await DELETE(createRequest({ key: "private/mock-key.png" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 when session cookie is missing", async () => {
    vi.mocked(getSessionIdFromCookie).mockResolvedValue(null);

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when key is not owned by session", async () => {
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(false);

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    expect(res.status).toBe(403);
  });

  it("returns 503 when ownership check throws", async () => {
    vi.mocked(verifyR2ObjectOwnership).mockRejectedValue(new Error("db failure"));

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe(ErrorCodes.R2_OWNERSHIP_TIMEOUT);
  });

  it("returns 500 when deleteR2Object throws", async () => {
    vi.mocked(deleteR2Object).mockRejectedValue(new Error("r2 delete failure"));

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe(ErrorCodes.R2_DELETE_FAILED);
  });

  it("returns 200 even when ownership cleanup fails", async () => {
    vi.mocked(removeR2ObjectOwnership).mockRejectedValue(new Error("cleanup failed"));

    const res = await DELETE(createRequest({ key: "subjects/mock-key.png" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(true);
  });
});
