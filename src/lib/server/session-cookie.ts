import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "compomate-session-id";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function getSessionIdFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

export async function getOrCreateSessionId(): Promise<{ sessionId: string; isNew: boolean }> {
  const existing = await getSessionIdFromCookie();
  if (existing) {
    return { sessionId: existing, isNew: false };
  }

  return { sessionId: crypto.randomUUID(), isNew: true };
}

export function applySessionCookie(response: NextResponse, sessionId: string, isNew: boolean): void {
  if (!isNew) {
    return;
  }

  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}
