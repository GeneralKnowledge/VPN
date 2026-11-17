import { HttpError } from "./http";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Hard cap so a flood of unique keys cannot grow memory without bound.
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= overflow) break;
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterSeconds: number } {
  if (buckets.size > MAX_BUCKETS / 2) prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP; never the sole control. The leftmost X-Forwarded-For entry is whatever the
 * client sent, so it is never used. Instead:
 * - CLIENT_IP_HEADER names a header the edge proxy overwrites (e.g. cf-connecting-ip), or
 * - the entry TRUSTED_PROXY_COUNT places from the right of X-Forwarded-For (default 1: the address
 *   the nearest proxy saw), which a client cannot forge as long as that many proxies append to it.
 */
export function clientIp(req: Request, env: Record<string, string | undefined> = process.env): string | null {
  const headerName = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (headerName) {
    return req.headers.get(headerName)?.split(",")[0]?.trim() || null;
  }
  const hops = Math.max(1, Number.parseInt(env.TRUSTED_PROXY_COUNT ?? "1", 10) || 1);
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  // Fewer entries than trusted proxies means the chain is not what we expect; do not guess.
  const forwarded = chain.length >= hops ? chain[chain.length - hops] : undefined;
  return forwarded || req.headers.get("x-real-ip") || null;
}

/**
 * Throw a 429 when any of the given keys is over its limit. Per-identity keys (email, user id)
 * are the real protection because forwarded-for headers can be spoofed; IP keys only add noise
 * reduction and are skipped when no client address is known (so unknown clients never share a bucket).
 */
export function enforceRateLimit(
  scope: string,
  keys: Array<string | null | undefined>,
  limit: number,
  windowMs: number,
) {
  for (const key of keys) {
    if (!key) continue;
    const result = checkRateLimit(`${scope}:${key}`, limit, windowMs);
    if (!result.ok) {
      throw new HttpError(429, "Too many attempts. Try again shortly.");
    }
  }
}

/** Read-only check: throws 429 if a key has already reached its limit, without counting this call. */
export function assertNotRateLimited(
  scope: string,
  keys: Array<string | null | undefined>,
  limit: number,
  now = Date.now(),
) {
  for (const key of keys) {
    if (!key) continue;
    const bucket = buckets.get(`${scope}:${key}`);
    if (bucket && bucket.resetAt > now && bucket.count >= limit) {
      throw new HttpError(429, "Too many attempts. Try again shortly.");
    }
  }
}

/** Count one event (e.g. a failed login) against the given keys. */
export function recordRateLimitHit(
  scope: string,
  keys: Array<string | null | undefined>,
  windowMs: number,
  now = Date.now(),
) {
  for (const key of keys) {
    if (!key) continue;
    const full = `${scope}:${key}`;
    const bucket = buckets.get(full);
    if (!bucket || bucket.resetAt <= now) buckets.set(full, { count: 1, resetAt: now + windowMs });
    else bucket.count += 1;
  }
}

export function resetRateLimits() {
  buckets.clear();
}
