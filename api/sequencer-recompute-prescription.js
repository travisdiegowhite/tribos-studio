/**
 * Sequencer — Recompute Prescription
 *
 * POST /api/sequencer-recompute-prescription  body: { user_id, date }
 *
 * Regenerates a single day's prescription. Called when:
 *   - User logs an unplanned ride that changes today's load picture
 *   - Subjective wellness changes mid-day (e.g., HRV reading comes in)
 *   - Coach manually requests a re-eval
 *
 * Writes a `block_modifications` row whenever the prescription actually changes
 * so the Coach Intel Strip can surface the explanation.
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  generateSessionsForBlock,
  evaluateGating,
} from './utils/sequencerBlockOps.js';
import { buildSequencerContext } from './utils/sequencerContext.js';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, date } = req.body ?? {};
    if (!user_id || !date) {
      return res.status(400).json({ error: 'user_id and date required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    const supabase = getSupabaseAdmin();

    // Find the block covering this date
    const { data: block } = await supabase
      .from('block_instances')
      .select('id, block_type, start_date, end_date, parent_event_id, parent_event_tier, coefficients_snapshot')
      .eq('user_id', user_id)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!block) {
      return res.status(404).json({ error: 'no_block_for_date' });
    }

    // Capture the "before" prescription for audit
    const { data: before } = await supabase
      .from('session_prescriptions')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', date)
      .maybeSingle();

    // Build context (ensures anchor event surfaces correctly to taper/race_specific)
    const baseCtx = await buildSequencerContext(user_id, date);
    let ctx = baseCtx;
    if (block.parent_event_id && block.parent_event_tier) {
      const anchor = baseCtx.upcoming_events.find(
        (e) => e.id === block.parent_event_id
      );
      if (anchor) {
        ctx = {
          ...baseCtx,
          upcoming_events: [
            anchor,
            ...baseCtx.upcoming_events.filter((e) => e.id !== anchor.id),
          ],
          coefficients: block.coefficients_snapshot ?? baseCtx.coefficients,
        };
      }
    }

    // Generate the candidate prescription via the block-typed dispatcher.
    // Generators key intra-block patterns off block.start_date so weekly cadence
    // stays consistent; we then pick the row matching `date`.
    const allSessions = generateSessionsForBlock(
      block.block_type,
      block.start_date,
      block.end_date,
      ctx
    );
    const generated = allSessions.find((s) => s.date === date);
    if (!generated) {
      return res.status(500).json({
        error: 'generator_returned_no_row',
        block_type: block.block_type,
        date,
      });
    }

    const gating = evaluateGating(ctx, generated);
    const final = gating.gated
      ? { ...generated, ...gating.substitute }
      : generated;

    const { data: after, error: upsertErr } = await supabase
      .from('session_prescriptions')
      .upsert(
        {
          user_id,
          block_id: block.id,
          date,
          session_type: final.session_type,
          target_rss: final.target_rss,
          target_duration_min: final.target_duration_min,
          prescribed_intervals: final.prescribed_intervals,
          long_ride_flag: final.long_ride_flag,
          notes: final.notes,
          gating_reason: gating.gated ? gating.reason : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      )
      .select('*')
      .single();

    if (upsertErr) throw upsertErr;

    // If session_type or target_rss changed, log the modification
    const changed =
      !before ||
      before.session_type !== after.session_type ||
      Number(before.target_rss) !== Number(after.target_rss);

    if (changed) {
      const reason = gating.gated
        ? gating.reason
        : 'Prescription recomputed (no gating change).';
      await supabase.from('block_modifications').insert({
        user_id,
        block_id: block.id,
        modified_by: 'system',
        reason,
        before: before
          ? {
              session_type: before.session_type,
              target_rss: before.target_rss,
              target_duration_min: before.target_duration_min,
            }
          : null,
        after: {
          session_type: after.session_type,
          target_rss: after.target_rss,
          target_duration_min: after.target_duration_min,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      changed,
      prescription: after,
      gating: gating.gated
        ? { gated: true, reason: gating.reason }
        : { gated: false },
    });
  } catch (err) {
    console.error('[sequencer-recompute-prescription] error:', err);
    return res.status(500).json({
      error: 'Failed to recompute prescription',
      detail: err?.message ?? String(err),
    });
  }
}
