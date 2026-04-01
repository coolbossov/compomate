'use client';

// PostHog is initialised in instrumentation-client.ts (Next.js 15.3+ pattern).
// Pageviews are automatic via defaults: '2026-01-30' → capture_pageview: 'history_change'.
// This wrapper exists so child components can use the usePostHog() hook.

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
