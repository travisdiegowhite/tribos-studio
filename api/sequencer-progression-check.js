/**
 * Sequencer — Progression Check
 *
 * POST /api/sequencer-progression-check  body: { user_id, date? }
 *
 * Evaluates the "push harder" signals (Form Score too fresh / FTP risen) for the
 * athlete's active event-anchored sequence and, if warranted, writes a
 * suggest-and-confirm `block_modifications` proposal (proposal_state='proposed').
 * Writes nothing to session_prescriptions — the athlete confirms via the Coach
 * Intel strip. Normally run by the daily rollover; this endpoint exposes it for
 * manual re-evaluation/testing.
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { proposeProgression } from './utils/sequencerProgression.js';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, date } = req.body ?? {};
    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }
    const fromDate = date || todayUtc();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    const supabase = getSupabaseAdmin();
    const result = await proposeProgression({ supabase, user_id, fromDate });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[sequencer-progression-check] error:', err);
    return res.status(500).json({
      error: 'Failed to build progression proposal',
      detail: err?.message ?? String(err),
    });
  }
}
