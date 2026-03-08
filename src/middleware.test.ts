import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "./middleware";

describe("middleware request id propagation", () => {
  it("preserves incoming x-request-id", () => {
    const request = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-request-id": "existing-id-123" },
    });

    const response = middleware(request);
    expect(response.headers.get("x-request-id")).toBe("existing-id-123");
  });

  it("generates x-request-id when missing", () => {
    const request = new NextRequest("http://localhost:3000/api/test");

    const response = middleware(request);
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toBeTruthy();
    expect(requestId?.length).toBe(16);
  });
});
