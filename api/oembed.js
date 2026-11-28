/**
 * oEmbed for shared routes — GET /api/oembed?url=https://www.tribos.studio/r/<id>[&maxwidth&maxheight]
 *
 * Returns oEmbed 1.0 `rich` JSON whose html is an iframe of /r/<id>/embed, so
 * blogs, club sites and anything that speaks oEmbed can drop a route in by
 * URL (Phase 2, docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.6). Only shared
 * routes (public or unlisted) answer; private ones are a 404, same as the
 * share page. Called cross-origin by servers and browsers, so CORS is open;
 * IP rate-limited.
 *
 * Not done: the <link rel="alternate" type="application/json+oembed">
 * discovery tag, which needs server-rendered HTML for /r/<id>.
 */
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { isSharedRoute } from './routes.js';

const ALLOWED_HOSTS = new Set(['www.tribos.studio', 'tribos.studio', 'tribos-studio.vercel.app']);
const ROUTE_PATH = /^\/r\/([0-9a-f-]{36})(?:\/embed)?\/?$/i;
const DEFAULT_W = 640;
const DEFAULT_H = 420;

/** The route id and canonical origin from a share URL, or null. */
export function parseShareUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return null;
  const m = u.pathname.match(ROUTE_PATH);
  if (!m) return null;
  return { routeId: m[1].toLowerCase(), origin: `https://${u.hostname}` };
}

function clampSize(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const limited = await rateLimitMiddleware(req, res, 'oembed', 120, 1);
  if (limited) return;

  const q = req.query || {};
  if (q.format && q.format !== 'json') return res.status(501).json({ error: 'Only format=json is supported' });

  const parsed = parseShareUrl(q.url);
  if (!parsed) return res.status(404).json({ error: 'Not a tribos route link' });

  const { data: route, error } = await getSupabaseAdmin()
    .from('routes')
    .select('id, name, distance_km, elevation_gain_m, visibility, is_private')
    .eq('id', parsed.routeId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Lookup failed' });
  if (!route || !isSharedRoute(route)) return res.status(404).json({ error: 'Route not found' });

  const width = clampSize(q.maxwidth, DEFAULT_W, 280, DEFAULT_W);
  const height = clampSize(q.maxheight, DEFAULT_H, 240, DEFAULT_H);
  const title = route.name || 'Route';
  const src = `${parsed.origin}/r/${route.id}/embed`;

  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    version: '1.0',
    type: 'rich',
    provider_name: 'tribos.studio',
    provider_url: parsed.origin,
    title,
    width,
    height,
    html: `<iframe src="${src}" width="${width}" height="${height}" style="border:0;max-width:100%" loading="lazy" title="${escapeHtml(title)} on tribos.studio" allowfullscreen></iframe>`,
  });
}
