import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/server/r2", () => ({
  getPresignedUploadUrl: vi.fn().mockResolvedValue("https://r2.test/upload/signed"),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.test/download/signed"),
  generateSubjectKey: vi.fn().mockReturnValue("subjects/mock-key.png"),
  generateBackdropKey: vi.fn().mockReturnValue("backdrops/mock-key.png"),
  generateExportKey: vi.fn().mockReturnValue("exports/mock-key.png"),
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { getR2Env } from "@/lib/server/env";
import { checkRateLimit } from "@/lib/server/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    new URL("http://localhost:3000/api/r2/presign"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host: "localhost:3000",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/r2/presign", () => {
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
  });

  it("returns 200 with uploadUrl, key, downloadUrl for valid request", async () => {
    const res = await POST(
      createRequest({
        filename: "photo.png",
        contentType: "image/png",
        purpose: "subject",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.uploadUrl).toBeDefined();
    expect(json.key).toBeDefined();
    expect(json.downloadUrl).toBeDefined();
  });

  it("returns 503 when R2 is not configured", async () => {
    vi.mocked(getR2Env).mockReturnValue(null);

    const res = await POST(
      createRequest({
        filename: "photo.png",
        contentType: "image/png",
        purpose: "subject",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toMatch(/R2/i);
  });

  it("returns 400 when purpose is invalid", async () => {
    const res = await POST(
      createRequest({
        filename: "photo.png",
        contentType: "image/png",
        purpose: "unknown",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/purpose/i);
  });

  it("returns 415 when contentType is non-image for subject purpose", async () => {
    const res = await POST(
      createRequest({
        filename: "data.json",
        contentType: "application/json",
        purpose: "subject",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(415);
    expect(json.error).toMatch(/content type|unsupported/i);
  });

  it("returns 400 when filename is missing", async () => {
    const res = await POST(
      createRequest({
        contentType: "image/png",
        purpose: "subject",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/filename/i);
  });

  it("returns 403 when Origin host does not match Host header", async () => {
    const res = await POST(
      createRequest(
        {
          filename: "photo.png",
          contentType: "image/png",
          purpose: "subject",
        },
        { origin: "https://evil.com" },
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBeDefined();
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(
      createRequest({
        filename: "photo.png",
        contentType: "image/png",
        purpose: "subject",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });

  it("accepts backdrop purpose with image/jpeg", async () => {
    const res = await POST(
      createRequest({
        filename: "backdrop.jpg",
        contentType: "image/jpeg",
        purpose: "backdrop",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.key).toBeDefined();
  });

  it("returns 403 for malformed Origin header", async () => {
    const res = await POST(
      createRequest(
        {
          filename: "photo.png",
          contentType: "image/png",
          purpose: "subject",
        },
        { origin: "not-a-valid-url" },
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/invalid|forbidden/i);
  });
});
