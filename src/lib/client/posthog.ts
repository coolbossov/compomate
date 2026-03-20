import posthog from 'posthog-js';

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
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
