/**
 * Routing proxy switch (Phase 1, docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md).
 *
 * With VITE_ROUTING_PROXY=true the browser stops calling BRouter and Stadia
 * directly and goes through our own endpoints instead:
 *   - api/brouter.js            GET  /api/brouter?lonlats=…   (BROUTER_URL upstream)
 *   - api/brouter/profile.js    POST /api/brouter/profile     (custom profile upload)
 *   - api/stadia-route.js       POST /api/stadia-route        (server-side STADIA_API_KEY)
 * Those apply the routing rate limit (guests per IP, riders per user) and keep
 * the Stadia key out of the bundle. There is deliberately no direct fallback
 * while the proxy is on: a fallback would let anyone bypass the limit.
 */
import { supabase } from '../lib/supabase';

export function routingProxyEnabled(): boolean {
  return String(import.meta.env.VITE_ROUTING_PROXY).toLowerCase() === 'true';
}

/** Base the BRouter client uses for the proxy: `${base}/brouter` → /api/brouter. */
export function routingProxyBase(): string {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/api`;
}

/** Stadia route endpoint behind the proxy. */
export function stadiaProxyUrl(): string {
  return `${routingProxyBase()}/stadia-route`;
}

/**
 * Bearer header for the signed-in rider (earns the per-user limit), or none
 * for a guest. Never throws: routing must not fail because auth is slow.
 */
export async function routingAuthHeaders(): Promise<Record<string, string>> {
  if (!routingProxyEnabled()) return {};
  try {
    const result = await supabase?.auth?.getSession?.();
    const token = result?.data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export const ROUTING_RATE_LIMITED_EVENT = 'tribos:routing-rate-limited';

/**
 * Tell the page the routing proxy refused a request (429) so it can explain
 * instead of showing a generic "no route". Fire-and-forget.
 */
export function announceRoutingRateLimited(detail: { guest?: boolean; resetAt?: string } = {}): void {
  try {
    window.dispatchEvent(new CustomEvent(ROUTING_RATE_LIMITED_EVENT, { detail }));
  } catch {
    // no window (tests, SSR) — nothing to tell
  }
}
