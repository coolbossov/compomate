// PostHog is initialised in instrumentation-client.ts (Next.js 15.3+ pattern).
// Import posthog directly from posthog-js anywhere you need to capture events.

import posthog from 'posthog-js';

/**
 * Fire a PostHog event. Safe to call before SDK is ready — posthog-js queues
 * events internally until init completes.
 */
export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  posthog.capture(event, properties);
}

export { posthog };
