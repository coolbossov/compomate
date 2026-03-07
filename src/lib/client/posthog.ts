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

export { posthog };
