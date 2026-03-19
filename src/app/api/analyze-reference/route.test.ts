import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    remaining: 10,
    resetAt: Date.now() + 60_000,
  }),
  requestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/server/session-cookie", () => ({
  getSessionIdFromCookie: vi.fn().mockResolvedValue("session-123"),
}));

vi.mock("@/lib/server/r2-ownership", () => ({
  verifyR2ObjectOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/server/r2", () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.example.com/reference.jpg"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getSessionIdFromCookie } from "@/lib/server/session-cookie";
import { verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";
import { getPresignedDownloadUrl } from "@/lib/server/r2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Tiny valid JPEG data URL (1x1 pixel)
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAFBABAAAAAAAAAAAAAAAAAAAACf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/B/9k=";

function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL("http://localhost:3000/api/analyze-reference"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/analyze-reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    vi.mocked(getSessionIdFromCookie).mockResolvedValue("session-123");
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(true);
    vi.mocked(getPresignedDownloadUrl).mockResolvedValue("https://r2.example.com/reference.jpg");

    // Default mock: Gemini returns a valid prompt
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "A dramatic dark studio backdrop with purple haze and spotlight effects.",
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 200 with prompt for valid image data URL", async () => {
    const res = await POST(createRequest({ imageDataUrl: TINY_JPEG }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.prompt).toBeDefined();
    expect(typeof json.prompt).toBe("string");
    expect(json.prompt.length).toBeGreaterThan(0);
  });

  it("returns 400 when both imageDataUrl and r2Key are missing", async () => {
    const res = await POST(createRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/imageDataUrl|r2Key/i);
  });

  it("returns 200 with prompt when r2Key is valid and owned", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([255, 216, 255, 217]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "A cinematic dark backdrop with haze and rim light." }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const res = await POST(createRequest({ r2Key: "backdrops/ref-photo.jpg" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(typeof json.prompt).toBe("string");
    expect(json.prompt.length).toBeGreaterThan(0);
    expect(verifyR2ObjectOwnership).toHaveBeenCalledWith("backdrops/ref-photo.jpg", "session-123");
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith("backdrops/ref-photo.jpg");
  });

  it("returns 401 for r2Key flow when session cookie is missing", async () => {
    vi.mocked(getSessionIdFromCookie).mockResolvedValueOnce(null);

    const res = await POST(createRequest({ r2Key: "backdrops/ref-photo.jpg" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toMatch(/session/i);
  });

  it("returns 403 when r2 key is not owned by the current session", async () => {
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValueOnce(false);

    const res = await POST(createRequest({ r2Key: "backdrops/ref-photo.jpg" }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/owned|session/i);
  });

  it("returns 400 when MIME type is invalid (text/html)", async () => {
    const htmlDataUrl = "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";
    const res = await POST(createRequest({ imageDataUrl: htmlDataUrl }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/unsupported|format/i);
  });

  it("returns 413 when image data URL exceeds 10MB", async () => {
    // Create a data URL string longer than 10_000_000 characters
    const hugeBase64 = "A".repeat(10_000_001 - "data:image/jpeg;base64,".length);
    const hugeDataUrl = `data:image/jpeg;base64,${hugeBase64}`;

    const res = await POST(createRequest({ imageDataUrl: hugeDataUrl }));
    const json = await res.json();

    expect(res.status).toBe(413);
    expect(json.error).toMatch(/large/i);
  });

  it("returns 503 with generic error when GEMINI_API_KEY is missing (no key leak)", async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await POST(createRequest({ imageDataUrl: TINY_JPEG }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).not.toMatch(/GEMINI_API_KEY/);
    expect(json.error).toMatch(/not configured/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(createRequest({ imageDataUrl: TINY_JPEG }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });

  it("returns 502 when Gemini API returns an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Quota exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await POST(createRequest({ imageDataUrl: TINY_JPEG }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBeDefined();
  });
});
