/**
 * Rate limiter — distributed via Upstash Redis when credentials are present,
 * falls back to an in-process Map when UPSTASH_REDIS_REST_URL is absent
 * (local development or environments without Redis).
 *
 * All call sites use the same checkRateLimit(key, limit, windowMs) signature.
 * No call-site changes required when toggling between implementations.
 *
 * To enable Upstash:
 *   UPSTASH_REDIS_REST_URL=https://…
 *   UPSTASH_REDIS_REST_TOKEN=…
 */

// ─────────────────────────────────────────────
// Upstash implementation (distributed)
// ─────────────────────────────────────────────

let upstashLimit: ((key: string, limit: number, windowMs: number) => Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}>) | null = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  const { Redis } = await import("@upstash/redis");
  const { Ratelimit } = await import("@upstash/ratelimit");
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  // Cache Ratelimit instances keyed by "limit:windowMs" to avoid recreating
  // on every request.
  const limiterCache = new Map<string, InstanceType<typeof Ratelimit>>();

  upstashLimit = async (key: string, limit: number, windowMs: number) => {
    const cacheKey = `${limit}:${windowMs}`;
    let limiter = limiterCache.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
        prefix: "compomate:rl",
        analytics: false,
      });
      limiterCache.set(cacheKey, limiter);
    }

    const result = await limiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  };
}

// ─────────────────────────────────────────────
// In-process fallback (single-instance dev)
// ─────────────────────────────────────────────

type RateBucket = { count: number; resetAt: number };
const buckets = new Map<string, RateBucket>();

function localCheckRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  // Periodic cleanup
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt <= now) buckets.delete(k);
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next: RateBucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (upstashLimit) {
    return upstashLimit(key, limit, windowMs);
  }
  return localCheckRateLimit(key, limit, windowMs);
}

export function requestIp(headers: Headers): string {
  // Vercel sets this to the actual client IP (trusted, not spoofable)
  const vercelIp = headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();

  // Fallback: use the RIGHTMOST x-forwarded-for entry (set by the last trusted proxy)
  // NOT the leftmost (which is client-controlled)
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim());
    return parts[parts.length - 1] ?? "unknown";
  }

  return "unknown";
}
