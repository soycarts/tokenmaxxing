/**
 * Fixed-window, in-memory rate limiter.
 *
 * Limitation (accepted for v1): on Vercel each serverless instance has its own Map, and
 * instances are recycled, so the effective limit is per instance, not global. It stops a
 * single runaway poller; it does not stop a distributed attacker. Swap for Upstash/Redis
 * if that ever matters.
 */
type Window = { start: number; count: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, Window>();
  return function check(key: string, now = Date.now()): { ok: boolean; retryAfterS: number } {
    if (hits.size > 10_000) {
      for (const [k, w] of hits) if (now - w.start >= windowMs) hits.delete(k);
    }
    const w = hits.get(key);
    if (!w || now - w.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return { ok: true, retryAfterS: 0 };
    }
    w.count += 1;
    if (w.count > limit) {
      return { ok: false, retryAfterS: Math.ceil((w.start + windowMs - now) / 1000) };
    }
    return { ok: true, retryAfterS: 0 };
  };
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
