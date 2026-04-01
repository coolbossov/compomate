import posthog from 'posthog-js';

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    // Route via Next.js proxy rewrites to avoid adblocker interference
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest',
    ui_host: 'https://us.posthog.com',
    // 'always' — CompoMate uses anonymous sessions (httpOnly cookie, no user auth),
    // so we profile every device to track cross-session engagement.
    person_profiles: 'always',
    capture_pageview: false,
    capture_pageleave: true,
    // Session recording — mask form inputs to avoid capturing sensitive data
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true },
    },
  });
  initialized = true;
}

/**
 * Fire a PostHog event. Safe to call even if PostHog is not initialised —
 * it will silently no-op when the key is absent or the SDK is not yet ready.
 */
export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !initialized) return;
  posthog.capture(event, properties);
}

export { posthog };
