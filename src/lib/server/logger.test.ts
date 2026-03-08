import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "./logger";

describe("server logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.COMPOMATE_LOG_LEVEL = "info";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.COMPOMATE_LOG_LEVEL;
  });

  it("emits JSON with level, event and timestamp", () => {
    log.info("test.event", { request_id: "abc123" });
    const payload = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? "{}");
    expect(payload.level).toBe("info");
    expect(payload.event).toBe("test.event");
    expect(payload.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.request_id).toBe("abc123");
  });

  it("redacts secret-like keys", () => {
    log.info("test.redact", {
      secret: "abc",
      token: "abc",
      password: "abc",
      apiKey: "abc",
      cookie: "abc",
    });
    const payload = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? "{}");
    expect(payload.secret).toBe("[REDACTED]");
    expect(payload.token).toBe("[REDACTED]");
    expect(payload.password).toBe("[REDACTED]");
    expect(payload.apiKey).toBe("[REDACTED]");
    expect(payload.cookie).toBe("[REDACTED]");
  });

  it("redacts presigned url strings", () => {
    log.info("test.presign", {
      url: "https://example.com?X-Amz-Signature=abc",
    });
    const payload = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? "{}");
    expect(payload.url).toBe("[REDACTED_PRESIGNED_URL]");
  });

  it("routes warn and error to appropriate console methods", () => {
    log.warn("warn.event", {});
    log.error("error.event", {});
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("suppresses info logs when level is warn", () => {
    process.env.COMPOMATE_LOG_LEVEL = "warn";
    log.info("suppressed", {});
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("keeps error logs when level is error", () => {
    process.env.COMPOMATE_LOG_LEVEL = "error";
    log.warn("warn.suppressed", {});
    log.error("error.allowed", {});
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
