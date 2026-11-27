/**
 * BRouter custom-profile upload proxy — POST /api/brouter/profile (text/plain .brf)
 *
 * Forwards src/utils/brouterProfiles.ts's rendered Tribos profile to the
 * upstream BRouter and passes its `{ profileid: "custom_…" }` JSON back.
 * Rate limited with the routing proxy (api/utils/routingQuota.js).
 */
import { setupCors } from '../utils/cors.js';
import { enforceRoutingQuota, brouterUpstream } from '../utils/routingQuota.js';

const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_PROFILE_BYTES = 64 * 1024;

function bodyText(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return null;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const text = bodyText(req);
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_PROFILE_BYTES) {
    return res.status(400).json({ error: 'Invalid profile' });
  }

  if (await enforceRoutingQuota(req, res)) return;

  try {
    const upstream = await fetch(`${brouterUpstream()}/brouter/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).send(body);
  } catch (err) {
    const timedOut = /abort|timeout/i.test(String(err?.name || err?.message || ''));
    return res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' });
  }
}
