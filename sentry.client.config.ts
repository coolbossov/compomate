import * as Sentry from '@sentry/nextjs';

const PRESIGNED_PATTERN = /X-Amz-Signature/i;
const REDACTED_URL = '[REDACTED_PRESIGNED_URL]';

function getSamplingUrl(context: unknown): string {
  const record = context as { request?: { url?: string }; name?: string };
  return record.request?.url ?? record.name ?? '';
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampler: (samplingContext) => {
    const url = getSamplingUrl(samplingContext);
    if (url.includes('/api/export')) return 1.0;
    if (url.includes('/api/r2')) return 0.5;
    return 0.0;
  },
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.5,
  integrations: [],
  beforeSend(event) {
    for (const breadcrumb of event.breadcrumbs ?? []) {
      const data = breadcrumb.data as Record<string, unknown> | undefined;
      if (data && typeof data.url === 'string' && PRESIGNED_PATTERN.test(data.url)) {
        data.url = REDACTED_URL;
      }
    }

    if (typeof event.request?.url === 'string' && PRESIGNED_PATTERN.test(event.request.url)) {
      event.request.url = REDACTED_URL;
    }

    return event;
  },
});
