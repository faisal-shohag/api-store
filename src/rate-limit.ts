import type { Context, Next } from 'hono'

// Fixed-window, in-memory rate limiter for the public read API.
//
// Runs inside the Worker isolate (no extra bindings or cost). Note this means
// the counter is per-isolate, not global: a client hammering from many
// Cloudflare PoPs may get roughly `max × isolates` requests through. Good
// enough as abuse protection for a cached read API; for strict global limits
// add a Cloudflare Rate Limiting rule / `ratelimit` binding in front instead.
export interface RateLimitEnv {
  RATE_LIMIT_MAX?: string
  RATE_LIMIT_WINDOW_MS?: string
}

export const RATE_LIMIT_DEFAULT_MAX = 100
export const RATE_LIMIT_DEFAULT_WINDOW_MS = 60_000

const TOO_MANY = '{"error":"Too many requests"}'
const NO_STORE = 'no-store'

interface Bucket {
  count: number
  reset: number // epoch ms when the current window ends
}

// Keyed by client IP. Counts every /api/* hit per IP, not per route, so
// switching endpoints does not dodge the quota.
const buckets = new Map<string, Bucket>()

function clientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export async function apiRateLimit(
  c: Context<{ Bindings: RateLimitEnv }>,
  next: Next,
): Promise<Response | void> {
  // CORS preflights are already answered by the cors() middleware registered
  // before this; never spend quota on them even if ordering changes.
  if (c.req.method === 'OPTIONS') {
    await next()
    return
  }

  const max = Math.max(
    1,
    Number(c.env?.RATE_LIMIT_MAX ?? RATE_LIMIT_DEFAULT_MAX) || RATE_LIMIT_DEFAULT_MAX,
  )
  const windowMs = Math.max(
    1000,
    Number(c.env?.RATE_LIMIT_WINDOW_MS ?? RATE_LIMIT_DEFAULT_WINDOW_MS) ||
      RATE_LIMIT_DEFAULT_WINDOW_MS,
  )

  const now = Date.now()
  const key = `rl:${clientIp(c)}`
  let bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  const remaining = Math.max(0, max - bucket.count)
  const resetSec = Math.max(1, Math.ceil((bucket.reset - now) / 1000))

  // Opportunistic sweep so the map cannot grow without bound.
  if (buckets.size > 5000 && Math.random() < 0.01) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k)
  }

  if (bucket.count > max) {
    return new Response(TOO_MANY, {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': NO_STORE,
        'Retry-After': String(resetSec),
        'RateLimit-Limit': String(max),
        'RateLimit-Remaining': '0',
        'RateLimit-Reset': String(resetSec),
      },
    })
  }

  await next()

  c.header('RateLimit-Limit', String(max))
  c.header('RateLimit-Remaining', String(remaining))
  c.header('RateLimit-Reset', String(resetSec))
}
