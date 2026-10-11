// Vercel API Route: race search for the season planner (Phase 6).
//
// POST { action: 'directory', query }        → races athletes already confirmed (no AI)
// POST { action: 'web', query, near? }       → candidates from a Claude web search
// POST { action: 'confirm', raceGoalId, url? } → after the athlete SAVED a found race:
//      copy their saved race_goals values into the shared directory.
//
// Nothing here creates a race_goals row. The athlete reviews every candidate
// in the race form and saves it; the directory only ever takes their saved
// values, never a raw web candidate. See api/utils/raceSearch.js.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { requireAuth } from './utils/auth.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { enforceAiQuota } from './utils/aiQuota.js';
import { setupCors } from './utils/cors.js';
import {
  MAX_NEAR_CHARS,
  MAX_QUERY_CHARS,
  searchDirectory,
  upsertDirectory,
  webSearchRaces,
} from './utils/raceSearch.js';

const supabase = getSupabaseAdmin();

const clip = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Today in the athlete's calendar, as sent by the browser; the server's UTC date otherwise. */
function todayFrom(body) {
  const t = typeof body?.today === 'string' ? body.today : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const body = req.body ?? {};
  switch (body.action) {
    case 'directory':
      return directory(req, res, user, body);
    case 'web':
      return web(req, res, user, body);
    case 'confirm':
      return confirm(req, res, user, body);
    default:
      return res.status(400).json({ success: false, error: 'Unknown action.' });
  }
}

async function directory(req, res, user, body) {
  if ((await rateLimitByUser(req, res, 'RACE_SEARCH', user.id, 30, 5)) !== null) return;
  const query = clip(body.query, MAX_QUERY_CHARS);
  if (query.length < 3) return res.status(400).json({ success: false, error: 'Type at least 3 letters of the race name.' });
  try {
    const races = await searchDirectory(supabase, { query, today: todayFrom(body) });
    return res.status(200).json({ success: true, races });
  } catch (err) {
    console.error('[race-search] directory:', err?.message ?? err);
    return res.status(500).json({ success: false, error: "Couldn't search the race list. Try again in a moment." });
  }
}

async function web(req, res, user, body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[race-search] MISSING ANTHROPIC_API_KEY');
    return res.status(500).json({ success: false, error: 'Race search not configured' });
  }
  const query = clip(body.query, MAX_QUERY_CHARS);
  if (query.length < 3) return res.status(400).json({ success: false, error: 'Type at least 3 letters of the race name.' });

  // Each web search costs real money: a burst limit, a daily cap, then the shared AI quota.
  if ((await rateLimitByUser(req, res, 'RACE_SEARCH_WEB', user.id, 5, 10)) !== null) return;
  if ((await rateLimitByUser(req, res, 'RACE_SEARCH_WEB_DAY', user.id, 20, 1440)) !== null) return;
  if ((await enforceAiQuota(req, res, user.id)) !== null) return;

  try {
    const client = new Anthropic({ apiKey });
    const { candidates, message } = await webSearchRaces(client, {
      query,
      near: clip(body.near, MAX_NEAR_CHARS) || null,
      today: todayFrom(body),
    });
    return res.status(200).json({ success: true, candidates, message });
  } catch (error) {
    console.error('[race-search] web:', error?.status ?? '', error?.message ?? error);
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ success: false, error: 'Race search is busy. Try again in a minute.' });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return res.status(500).json({ success: false, error: 'Service authentication error' });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return res.status(400).json({ success: false, error: 'The search request was invalid.' });
    }
    return res.status(502).json({ success: false, error: 'The web search failed. Try again, or enter the race yourself.' });
  }
}

async function confirm(req, res, user, body) {
  if ((await rateLimitByUser(req, res, 'RACE_SEARCH_CONFIRM', user.id, 20, 5)) !== null) return;
  const raceGoalId = typeof body.raceGoalId === 'string' ? body.raceGoalId : '';
  if (!raceGoalId) return res.status(400).json({ success: false, error: 'Missing race.' });

  // The athlete's own saved race: user_id scoping is the security boundary here.
  const { data: race, error } = await supabase
    .from('race_goals')
    .select('id, name, race_date, race_type, distance_km, elevation_gain_m, location')
    .eq('id', raceGoalId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[race-search] confirm read:', error.message);
    return res.status(500).json({ success: false, error: "Couldn't read your race." });
  }
  if (!race) return res.status(404).json({ success: false, error: 'Race not found.' });

  const url = typeof body.url === 'string' && /^https?:\/\//.test(body.url) ? body.url.slice(0, 500) : null;
  try {
    const result = await upsertDirectory(supabase, race, { source: body.source === 'web' ? 'web' : 'athlete', url });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    // Best effort: the athlete's race is already saved.
    console.error('[race-search] confirm:', err?.message ?? err);
    return res.status(500).json({ success: false, error: "Saved your race, but couldn't share it with the race list." });
  }
}
