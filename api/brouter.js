/**
 * BRouter routing proxy — GET /api/brouter?lonlats=…&profile=…&alternativeidx=…&format=geojson
 *
 * Forwards to the upstream BRouter (BROUTER_URL, else brouter.de) and returns
 * its status, content-type and body unchanged: src/utils/brouter.js parses the
 * plain-text 500s ("no route", unknown profile) and the GeoJSON
 * `properties.messages` way tags that the comfort validator needs.
 *
 * Exists so routing can be rate limited (guests per IP) — the browser only
 * talks to it when VITE_ROUTING_PROXY=true. See docs/brouter-self-host-runbook.md.
 */
import { setupCors } from './utils/cors.js';
import { enforceRoutingQuota, brouterUpstream } from './utils/routingQuota.js';

const UPSTREAM_TIMEOUT_MS = 11_000;
const ALLOWED_PARAMS = ['lonlats', 'profile', 'alternativeidx', 'format', 'nogos', 'polylines', 'polygons'];
const MAX_LONLATS_CHARS = 8_000;

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.query || {};
  const lonlats = typeof query.lonlats === 'string' ? query.lonlats : '';
  if (!lonlats || lonlats.length > MAX_LONLATS_CHARS || !/^[-0-9.,|]+$/.test(lonlats)) {
    return res.status(400).json({ error: 'Invalid lonlats' });
  }
  if (typeof query.profile !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(query.profile)) {
    return res.status(400).json({ error: 'Invalid profile' });
  }

  if (await enforceRoutingQuota(req, res)) return;

  const params = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    if (typeof query[key] === 'string') params.set(key, query[key]);
  }
  if (!params.has('format')) params.set('format', 'geojson');

  try {
    const upstream = await fetch(`${brouterUpstream()}/brouter?${params.toString()}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).send(body);
  } catch (err) {
    const timedOut = /abort|timeout/i.test(String(err?.name || err?.message || ''));
    return res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' });
  }
}
