import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 }),
  requestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { GET } from './route';
import { checkRateLimit } from '@/lib/server/rate-limit';

const originalFetch = globalThis.fetch;

function requestFor(sourceUrl: string): NextRequest {
  const url = new URL('http://localhost:3000/api/generate-backdrop/image');
  url.searchParams.set('url', sourceUrl);
  return new NextRequest(url);
}

describe('GET /api/generate-backdrop/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('streams an allowlisted fal.media image without buffering it into JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('image-bytes', {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    }));

    const response = await GET(requestFor('https://v3.fal.media/files/example/master.jpg'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(await response.text()).toBe('image-bytes');
  });

  it('rejects non-fal URLs before fetching them', async () => {
    globalThis.fetch = vi.fn();

    const response = await GET(requestFor('https://example.com/private-file'));

    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects non-image provider responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not an image', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }));

    const response = await GET(requestFor('https://fal.media/files/example/result'));

    expect(response.status).toBe(502);
  });
});
