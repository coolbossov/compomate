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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { checkRateLimit } from "@/lib/server/rate-limit";

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

  it("returns 400 when imageDataUrl is missing", async () => {
    const res = await POST(createRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/imageDataUrl/i);
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
