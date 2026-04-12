import { NextRequest, NextResponse } from "next/server";

/**
 * Simple in-memory sliding-window rate limiter for API routes.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });
 *
 *   export async function POST(req: NextRequest) {
 *     const limited = limiter.check(req);
 *     if (limited) return limited;
 *     // ... handle request
 *   }
 *
 * Note: In-memory limiters reset on each serverless cold start.
 * For strict enforcement at scale, swap to Redis (Upstash) or
 * Vercel's built-in rate limiting.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Max requests per window per IP (default: 30) */
  max?: number;
}

export function createRateLimiter(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 30;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leaks
  const CLEANUP_INTERVAL = 5 * 60_000; // 5 minutes
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }

  function getKey(req: NextRequest): string {
    // Vercel sets x-forwarded-for; fall back to x-real-ip or "unknown"
    return (
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown"
    );
  }

  return {
    /**
     * Check rate limit for this request.
     * Returns a 429 NextResponse if over limit, or null if OK.
     */
    check(req: NextRequest): NextResponse | null {
      cleanup();
      const key = getKey(req);
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return null;
      }

      entry.count++;
      if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": String(max),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
            },
          }
        );
      }

      return null;
    },
  };
}
