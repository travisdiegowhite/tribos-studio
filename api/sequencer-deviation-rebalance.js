/**
 * Sequencer — Deviation Rebalance
 *
 * POST /api/sequencer-deviation-rebalance  body: { user_id, date? }
 *
 * Builds a suggest-and-confirm rebalance PROPOSAL for the athlete's active
 * event-anchored sequence (writes a `block_modifications` row with
 * proposal_state='proposed'; writes nothing to session_prescriptions). The
 * athlete applies or dismisses it from the Coach Intel strip.
 *
 * Normally invoked in-process by /api/process-deviation after an activity sync;
 * this endpoint exposes it for manual re-evaluation.
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { proposeBlockRebalance } from './utils/sequencerRebalance.js';

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
    const result = await proposeBlockRebalance({ supabase, user_id, fromDate });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[sequencer-deviation-rebalance] error:', err);
    return res.status(500).json({
      error: 'Failed to build rebalance proposal',
      detail: err?.message ?? String(err),
    });
  }
}
