import type * as RateLimit from './rate-limit';

let checkRateLimit: typeof RateLimit.checkRateLimit;
let requestIp: typeof RateLimit.requestIp;

// ── checkRateLimit ──────────────────────────────────────────
describe('checkRateLimit', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.resetModules();
    ({ checkRateLimit, requestIp } = await import('./rate-limit'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('allows the first request with remaining = limit - 1', async () => {
    const result = await checkRateLimit('test-first', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('allows N requests up to the limit', async () => {
    const key = 'test-up-to-limit';
    const limit = 3;
    const window = 60_000;

    for (let i = 0; i < limit; i++) {
      const result = await checkRateLimit(key, limit, window);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - (i + 1));
    }
  });

  it('blocks request at limit + 1', async () => {
    const key = 'test-over-limit';
    const limit = 3;
    const window = 60_000;

    // Use up all requests
    for (let i = 0; i < limit; i++) {
      await checkRateLimit(key, limit, window);
    }

    // Next request should be blocked
    const result = await checkRateLimit(key, limit, window);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks different keys independently', async () => {
    const limit = 2;
    const window = 60_000;

    // Exhaust key A
    await checkRateLimit('key-a', limit, window);
    await checkRateLimit('key-a', limit, window);
    const blockedA = await checkRateLimit('key-a', limit, window);
    expect(blockedA.allowed).toBe(false);

    // Key B should still be allowed
    const resultB = await checkRateLimit('key-b', limit, window);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(1);
  });

  it('allows requests again after window expires', async () => {
    const key = 'test-window-expire';
    const limit = 2;
    const window = 60_000;

    // Exhaust limit
    await checkRateLimit(key, limit, window);
    await checkRateLimit(key, limit, window);
    const blocked = await checkRateLimit(key, limit, window);
    expect(blocked.allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(window + 1);

    // Should be allowed again
    const result = await checkRateLimit(key, limit, window);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });

  it('returns correct resetAt timestamp', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const window = 60_000;
    const result = await checkRateLimit('test-reset', 5, window);

    const expectedResetAt = Date.now() + window;
    expect(result.resetAt).toBe(expectedResetAt);
  });
});

// ── requestIp ───────────────────────────────────────────────
describe('requestIp', () => {
  it('returns x-vercel-forwarded-for when present', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.2.3.4',
    });
    expect(requestIp(headers)).toBe('1.2.3.4');
  });

  it('x-vercel-forwarded-for takes precedence over x-forwarded-for', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.1.1.1',
      'x-forwarded-for': '9.9.9.9, 8.8.8.8',
    });
    expect(requestIp(headers)).toBe('1.1.1.1');
  });

  it('returns the RIGHTMOST x-forwarded-for entry (last proxy)', () => {
    const headers = new Headers({
      'x-forwarded-for': '10.0.0.1, 172.16.0.1, 192.168.1.1',
    });
    expect(requestIp(headers)).toBe('192.168.1.1');
  });

  it('returns single x-forwarded-for value', () => {
    const headers = new Headers({
      'x-forwarded-for': '5.5.5.5',
    });
    expect(requestIp(headers)).toBe('5.5.5.5');
  });

  it('returns "unknown" when no IP headers present', () => {
    const headers = new Headers();
    expect(requestIp(headers)).toBe('unknown');
  });

  it('trims whitespace from IP addresses', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '  3.3.3.3  ',
    });
    expect(requestIp(headers)).toBe('3.3.3.3');
  });

  it('returns first IP from x-vercel-forwarded-for when multiple', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.1.1.1, 2.2.2.2',
    });
    expect(requestIp(headers)).toBe('1.1.1.1');
  });
});
