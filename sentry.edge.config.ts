import * as Sentry from '@sentry/nextjs';

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
});
