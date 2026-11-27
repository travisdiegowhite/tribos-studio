/**
 * Rate limiting for the routing proxy (api/brouter.js, api/brouter/profile.js,
 * api/stadia-route.js).
 *
 * Signed-in riders are limited per user, guests per IP (RATE_LIMITS.ROUTING_*).
 * A token is verified with Supabase Auth before it earns the user limit — an
 * unverified JWT would let anyone mint a fresh "user" per request and dodge the
 * guest limit. Verified tokens are cached per function instance until shortly
 * before they expire, so drag-editing doesn't pay an auth round trip per snap.
 *
 * Uses the shared supabaseAdmin singleton (CLAUDE.md connection hygiene).
 */
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { checkRateLimit, getClientIp, RATE_LIMITS } from './rateLimit.js';

const TOKEN_CACHE_MAX = 500;
const TOKEN_CACHE_FALLBACK_MS = 5 * 60 * 1000;
const tokenCache = new Map(); // token -> { userId, expiresAt }

function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Resolve the caller's user id from a Bearer token, or null for a guest. */
export async function routingUserId(req) {
  const header = req.headers?.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) return cached.userId;

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    const userId = !error && data?.user?.id ? data.user.id : null;
    if (userId) {
      const exp = tokenExpiryMs(token);
      const expiresAt = Math.min(exp ? exp - 30_000 : Infinity, now + TOKEN_CACHE_FALLBACK_MS);
      if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.delete(tokenCache.keys().next().value);
      tokenCache.set(token, { userId, expiresAt });
    }
    return userId;
  } catch (err) {
    // Auth backend hiccup: treat as a guest rather than failing the route.
    console.warn('[routing] token validation unavailable:', err?.message);
    return null;
  }
}

/**
 * Apply the routing rate limit. Returns true when the request was refused
 * (a 429 has been sent), false when it may proceed.
 */
export async function enforceRoutingQuota(req, res) {
  const userId = await routingUserId(req);
  const cfg = userId ? RATE_LIMITS.ROUTING_USER : RATE_LIMITS.ROUTING_GUEST;
  const key = userId ? `${cfg.name}:user:${userId}` : `${cfg.name}:${getClientIp(req)}`;
  const result = await checkRateLimit(key, cfg.limit, cfg.windowMinutes);

  res.setHeader('X-RateLimit-Limit', String(cfg.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
  if (result.allowed) return false;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    error: 'routing_rate_limited',
    guest: !userId,
    message: userId
      ? 'Too many routing requests. Try again shortly.'
      : 'Too many routing requests from this network. Create a free account for a higher limit.',
    resetAt: result.resetAt.toISOString(),
  });
  return true;
}

/** Upstream BRouter base (self-hosted when BROUTER_URL is set). */
export function brouterUpstream() {
  const raw = (process.env.BROUTER_URL || '').trim().replace(/\/+$/, '').replace(/\/brouter$/, '');
  return /^https?:\/\//.test(raw) ? raw : 'https://brouter.de';
}

/** Test hook. */
export function __resetRoutingTokenCache() {
  tokenCache.clear();
}
