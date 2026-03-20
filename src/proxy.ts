import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  const requestId = request.headers.get("x-request-id") ?? nanoid(16);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
