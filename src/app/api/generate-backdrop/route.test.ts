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

import { POST, GET } from "./route";
import { checkRateLimit } from "@/lib/server/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPostRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/generate-backdrop"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/generate-backdrop");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

const originalFetch = globalThis.fetch;

// A fal.ai queue response (pending)
const FAL_QUEUE_RESPONSE = {
  request_id: "test-req-123",
  status_url: "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/test-req-123/status",
  response_url: "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/test-req-123",
  queue_position: 0,
};

// A fal.ai completed response with image
const FAL_COMPLETED_RESPONSE = {
  images: [{ url: "https://fal-cdn.test/result.png" }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/generate-backdrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_KEY = "test-fal-key";

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });

    // Default mock: fal returns image directly (no queue)
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(
        // fal submit: returns completed response with image
        new Response(JSON.stringify(FAL_COMPLETED_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        // image download
        new Response(Buffer.from("fake-image"), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 200 with valid prompt when fal completes immediately", async () => {
    const res = await POST(createPostRequest({ prompt: "A starry night backdrop" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pending).toBe(false);
    expect(json.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("returns 202 when fal queues the job (pending)", async () => {
    // Override fetch: submit returns pending (no image), polls stay pending
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        // submit → queued
        return Promise.resolve(
          new Response(JSON.stringify(FAL_QUEUE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      // poll → still pending
      return Promise.resolve(
        new Response(
          JSON.stringify({ status: "IN_QUEUE", queue_position: 2 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    const res = await POST(createPostRequest({ prompt: "A dramatic purple backdrop" }));
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json.pending).toBe(true);
    expect(json.statusUrl).toBeDefined();
  });

  it("returns 400 when prompt is empty", async () => {
    const res = await POST(createPostRequest({ prompt: "" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/prompt/i);
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await POST(createPostRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/prompt/i);
  });

  it("returns 400 when prompt exceeds 700 characters", async () => {
    const longPrompt = "A".repeat(701);
    const res = await POST(createPostRequest({ prompt: longPrompt }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/too long|700/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(createPostRequest({ prompt: "test" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });

  it("returns 500 with generic error when FAL_KEY is missing (does not leak env var name)", async () => {
    delete process.env.FAL_KEY;

    const res = await POST(createPostRequest({ prompt: "test" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toMatch(/FAL_KEY/);
    expect(json.error).toMatch(/not configured|generation/i);
  });
});

describe("GET /api/generate-backdrop (poll)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_KEY = "test-fal-key";

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns status for a valid statusUrl", async () => {
    const statusPayload = {
      status: "IN_QUEUE",
      queue_position: 1,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(
      createGetRequest({
        statusUrl:
          "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/test-req-123/status",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json.pending).toBe(true);
  });

  it("returns 429 when GET poll rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await GET(
      createGetRequest({
        statusUrl:
          "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/test-req-123/status",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when statusUrl is missing", async () => {
    globalThis.fetch = vi.fn();

    const res = await GET(createGetRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/statusUrl/i);
  });
});
