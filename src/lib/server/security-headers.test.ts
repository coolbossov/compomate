import { describe, expect, it } from 'vitest';

import nextConfig from '../../../next.config';

describe('production security headers', () => {
  it('allows the configured R2 Worker upload origin', async () => {
    const headers = await nextConfig.headers?.();
    const globalHeaders = headers?.find((entry) => entry.source === '/:path*')?.headers;
    const csp = globalHeaders?.find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(csp).toContain('https://compomate-r2.compomate-sapd.workers.dev');
  });
});
