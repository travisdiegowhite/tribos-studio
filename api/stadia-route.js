/**
 * Stadia Maps (Valhalla) routing proxy — POST /api/stadia-route
 *
 * The browser used to call api.stadiamaps.com with VITE_STADIA_API_KEY in the
 * query string, so the key shipped in the bundle and nothing limited usage.
 * With VITE_ROUTING_PROXY=true, src/utils/stadiaMapsRouter.js posts the same
 * JSON body here; this adds the server-side STADIA_API_KEY, applies the
 * routing rate limit and passes Stadia's status and body back unchanged.
 */
import { setupCors } from './utils/cors.js';
import { enforceRoutingQuota } from './utils/routingQuota.js';

const STADIA_ROUTE_URL = 'https://api.stadiamaps.com/route/v1';
const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_LOCATIONS = 50;
const ALLOWED_KEYS = [
  'locations',
  'costing',
  'costing_options',
  'directions_type',
  'units',
  'language',
  'id',
  'alternates',
];
const ALLOWED_COSTING = new Set(['bicycle', 'pedestrian']);

/** Keep only the keys the client sends; returns null when the body is unusable. */
export function sanitizeStadiaBody(raw) {
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object') return null;
  const { locations } = body;
  if (!Array.isArray(locations) || locations.length < 2 || locations.length > MAX_LOCATIONS) return null;
  const validLocation = (l) =>
    l && Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lon)) &&
    Math.abs(Number(l.lat)) <= 90 && Math.abs(Number(l.lon)) <= 180;
  if (!locations.every(validLocation)) return null;
  if (!ALLOWED_COSTING.has(body.costing)) return null;

  const clean = {};
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) clean[key] = body[key];
  }
  if (clean.alternates !== undefined) {
    const n = Number(clean.alternates);
    clean.alternates = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
  }
  return clean;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (process.env.STADIA_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'stadia_not_configured' });

  const body = sanitizeStadiaBody(req.body);
  if (!body) return res.status(400).json({ error: 'Invalid route request' });

  if (await enforceRoutingQuota(req, res)) return;

  try {
    const upstream = await fetch(`${STADIA_ROUTE_URL}?api_key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).send(text);
  } catch (err) {
    const timedOut = /abort|timeout/i.test(String(err?.name || err?.message || ''));
    return res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' });
  }
}
