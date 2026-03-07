type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

function cleanup(now: number): void {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  cleanup(now);

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
