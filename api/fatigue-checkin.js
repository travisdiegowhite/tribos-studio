/**
 * Morning readiness check-in.
 *
 * POST /api/fatigue-checkin
 *   Records the survey. Body: { sleep?, leg_feel, energy, motivation,
 *   illness?, hrv_status?, notes? } — the 1–5 items are integers.
 *
 * GET /api/fatigue-checkin
 *   Answers "am I cleared today?". Returns today's check-in (or null) and the
 *   readiness verdict, which is whichever RDY rule the coaching rules engine
 *   fires for this athlete right now — or null when none does.
 *
 * Auth: Bearer <JWT> on both.
 *
 * The GET exists so the Today page can answer the clearance question without
 * spending an LLM turn on it. The verdict is computed by the same pure engine
 * the coach prompt uses (api/utils/rulesEngine.js), from the same RiderState,
 * so the page and the coach cannot disagree about whether today is a rest day.
 * That is also why the engine is NOT re-implemented in the browser: two copies
 * of the rules is two sets of rules.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { fetchRiderStateData, toRiderState } from './utils/toRiderState.js';
import { evaluateRules } from './utils/rulesEngine.js';

const supabase = getSupabaseAdmin();

/** Rules that answer "am I cleared today?". Everything else is prescription. */
const READINESS_PREFIX = 'RDY-';

async function requireUser(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return user;
}

/** YYYY-MM-DD in the athlete's timezone, falling back to UTC. */
function todayIn(timezone) {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' });
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    return req.method === 'GET' ? await handleGet(user, res) : await handlePost(req, user, res);
  } catch (error) {
    console.error('fatigue-checkin error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

async function handlePost(req, user, res) {
  const { sleep, leg_feel, energy, motivation, illness, hrv_status, notes } = req.body || {};

  if (!leg_feel || !energy || !motivation) {
    return res.status(400).json({ error: 'leg_feel, energy, and motivation are required (1-5)' });
  }

  const validate = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (!validate(leg_feel) || !validate(energy) || !validate(motivation)) {
    return res.status(400).json({ error: 'leg_feel, energy, and motivation must be integers 1-5' });
  }
  // Optional, because clients written before migration 118 still post without
  // it. Absent means "not asked", which the readiness adapter reads as unknown
  // and which skips the rules that need it — never as a middling 3.
  if (sleep !== undefined && sleep !== null && !validate(sleep)) {
    return res.status(400).json({ error: 'sleep must be an integer 1-5' });
  }
  if (illness !== undefined && illness !== null && typeof illness !== 'boolean') {
    return res.status(400).json({ error: 'illness must be a boolean' });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();
  const today = todayIn(profile?.timezone);

  const { data, error } = await supabase
    .from('fatigue_checkins')
    .upsert({
      user_id: user.id,
      date: today,
      sleep: sleep ?? null,
      leg_feel,
      energy,
      motivation,
      illness: illness ?? null,
      hrv_status: hrv_status || null,
      notes: notes || null,
    }, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) throw error;

  // Answer the clearance question in the same round trip the athlete just
  // paid for — they filled the survey in to find out.
  const readiness = await computeReadiness(user.id, today).catch((err) => {
    console.error('readiness verdict failed (non-blocking):', err.message);
    return null;
  });

  return res.status(200).json({ status: 'saved', checkin: data, readiness });
}

// ─── GET ─────────────────────────────────────────────────────────────────────

async function handleGet(user, res) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();
  const today = todayIn(profile?.timezone);

  const { data: checkin } = await supabase
    .from('fatigue_checkins')
    .select('date, sleep, leg_feel, energy, motivation, illness, notes')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();

  const readiness = await computeReadiness(user.id, today).catch((err) => {
    console.error('readiness verdict failed (non-blocking):', err.message);
    return null;
  });

  return res.status(200).json({ date: today, checkin: checkin || null, readiness });
}

// ─── The verdict ─────────────────────────────────────────────────────────────

/**
 * The readiness rule that applies to this athlete today, or null.
 *
 * Only RDY rules are returned. A taper or distribution rule is a real decision
 * but it is not an answer to "am I cleared" — surfacing one here would put a
 * prescription where the athlete asked a yes/no question.
 *
 * @returns {{id,claim,confidence,personaLine,neverSay}|null}
 */
export async function computeReadiness(userId, todayStr) {
  const [data, goals] = await Promise.all([
    fetchRiderStateData(supabase, userId),
    supabase
      .from('race_goals')
      .select('id, name, race_date, race_type, priority')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .gte('race_date', todayStr)
      .order('race_date', { ascending: true })
      .limit(10),
  ]);

  const riderState = toRiderState(data, {
    raceGoals: goals?.data || [],
    // fitness_evidence_weekly is not read here: no RDY rule consults the
    // evidence trends, so fetching them would be a round trip for nothing.
    evidenceSignals: null,
    todayStr,
  });

  const { fired } = evaluateRules(riderState);
  const rdy = fired.find((r) => r.id.startsWith(READINESS_PREFIX));
  if (!rdy) return null;

  return {
    id: rdy.id,
    claim: rdy.claim,
    confidence: rdy.confidence,
    personaLine: rdy.personaLine,
    neverSay: rdy.neverSay,
  };
}
