import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route
// ---------------------------------------------------------------------------

vi.mock("@vercel/functions", () => ({
  waitUntil: vi.fn(),
}));

vi.mock("@/lib/compositing/pipeline", () => ({
  runCompositorPipeline: vi.fn(),
}));

vi.mock("@/lib/server/r2", () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.test/download/mock.png"),
  getPresignedUploadUrl: vi.fn().mockResolvedValue("https://r2.test/upload/mock.png"),
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

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue(null),
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
import { runCompositorPipeline } from "@/lib/compositing/pipeline";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { CompositionState } from "@/lib/shared/composition";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Minimal 1x1 red PNG as a valid base64 data URL
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const VALID_COMPOSITION: CompositionState = {
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
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    subjectDataUrl: TINY_PNG,
    backdropDataUrl: TINY_PNG,
    composition: VALID_COMPOSITION,
    exportProfileId: "8x10",
    nameOverlay: {
      firstName: "John",
      lastName: "Doe",
      style: "classic",
      fontPairId: "classic",
      enabled: false,
      sizePct: 8,
      yFromBottomPct: 5,
    },
    jobName: "TestJob",
    firstName: "John",
    lastName: "Doe",
    index: 1,
    ...overrides,
  };
}

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/export"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Fake PNG buffer returned by the compositor
const FAKE_PNG_BUFFER = Buffer.from("fake-png-data");

// Mock fetch globally for R2 upload
const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: pipeline returns a fake buffer
    vi.mocked(runCompositorPipeline).mockResolvedValue({
      buffer: FAKE_PNG_BUFFER,
      width: 4000,
      height: 5000,
      format: "png",
    });

    // Mock fetch for R2 upload (PUT) and any presigned download
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    // Default: rate limit allowed
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 200 with filename and downloadUrl for valid body", async () => {
    const res = await POST(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.filename).toBeDefined();
    expect(json.filename).toContain("TestJob");
    expect(json.downloadUrl).toBeDefined();
    expect(typeof json.downloadUrl).toBe("string");
  });

  it("returns 400 when missing both subjectDataUrl and subjectR2Key", async () => {
    const body = validBody({ subjectDataUrl: undefined, subjectR2Key: undefined });
    delete (body as Record<string, unknown>).subjectDataUrl;

    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/subject/i);
  });

  it("returns 400 when missing both backdropDataUrl and backdropR2Key", async () => {
    const body = validBody({ backdropDataUrl: undefined, backdropR2Key: undefined });
    delete (body as Record<string, unknown>).backdropDataUrl;

    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/backdrop/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBeDefined();
  });

  it("response includes filename and downloadUrl on success", async () => {
    const res = await POST(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("filename");
    expect(json).toHaveProperty("downloadUrl");
    expect(json.width).toBe(4000);
    expect(json.height).toBe(5000);
  });

  it("returns 500 when compositor throws a generic error", async () => {
    vi.mocked(runCompositorPipeline).mockRejectedValue(
      new Error("Sharp processing failed"),
    );

    const res = await POST(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain("Sharp processing failed");
  });

  it("returns 503 with retryable flag when compositor times out", async () => {
    const timeoutError = new Error("Pipeline timed out");
    (timeoutError as { isTimeout?: boolean }).isTimeout = true;
    vi.mocked(runCompositorPipeline).mockRejectedValue(timeoutError);

    const res = await POST(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.retryable).toBe(true);
    expect(json.error).toMatch(/too long|retry/i);
  });

  it("passes correct composition values to runCompositorPipeline", async () => {
    const body = validBody({
      composition: { ...VALID_COMPOSITION, xPct: 25, yPct: 75 },
    });

    await POST(createRequest(body));

    expect(runCompositorPipeline).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runCompositorPipeline).mock.calls[0][0];
    expect(callArgs.composition.xPct).toBe(25);
    expect(callArgs.composition.yPct).toBe(75);
    expect(callArgs.outputWidth).toBe(4000);
    expect(callArgs.outputHeight).toBe(5000);
    expect(callArgs.subjectBuffer).toBeInstanceOf(Buffer);
    expect(callArgs.backdropBuffer).toBeInstanceOf(Buffer);
  });
});
