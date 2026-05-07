/**
 * Sequencer — Today's Prescription
 *
 * GET /api/sequencer-today?user_id=...
 *
 * Returns today's prescribed session, applying gating rules from spec §4.4.
 *
 *   1. Reads session_prescriptions for today's date
 *   2. If missing, generates on-the-fly from the active block + maintenance
 *      generator, inserts, and returns
 *   3. Applies gating rules (FS, AFI growth, HRV, wellness) — substitute
 *      session-server side so two devices see the same answer
 *   4. Returns { prescription, block, gating } shape consumed by useSequencerToday
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  generateSessionsForBlock,
  evaluateGating,
} from './utils/sequencerBlockOps.js';
import { buildSequencerContext } from './utils/sequencerContext.js';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'user_id required' });
    }

    const today = todayUtc();
    const supabase = getSupabaseAdmin();

    // 1. Find the active block that covers today
    const { data: block, error: blockErr } = await supabase
      .from('block_instances')
      .select(
        'id, block_type, start_date, end_date, status, parent_event_id, parent_event_tier, coefficients_snapshot'
      )
      .eq('user_id', userId)
      .in('status', ['active', 'planned'])
      .lte('start_date', today)
      .gte('end_date', today)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (blockErr) throw blockErr;

    if (!block) {
      return res.status(404).json({
        error: 'no_active_block',
        message:
          'User has no active block. Call /api/sequencer-maintenance-init first.',
      });
    }

    // 2. Read the prescription row for today
    let { data: prescription } = await supabase
      .from('session_prescriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    // 3. Build context up-front (used for generation + gating). For
    //    event-anchored blocks we ensure the parent_event is the first
    //    upcoming_event so taper/race_specific generators see the right tier.
    const baseCtx = await buildSequencerContext(userId, today);
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

    // 4. Generate on-the-fly if missing — Phase 2 dispatches by block_type.
    if (!prescription) {
      // Generate using the block's own start so weekly cadence stays aligned,
      // then pick today's row.
      const allSessions = generateSessionsForBlock(
        block.block_type,
        block.start_date,
        block.end_date,
        ctx
      );
      const generated = allSessions.find((s) => s.date === today);
      if (!generated) {
        return res.status(500).json({
          error: 'generator_returned_no_row_for_today',
          block_type: block.block_type,
        });
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('session_prescriptions')
        .upsert(
          {
            user_id: userId,
            block_id: block.id,
            date: today,
            session_type: generated.session_type,
            target_rss: generated.target_rss,
            target_duration_min: generated.target_duration_min,
            prescribed_intervals: generated.prescribed_intervals,
            long_ride_flag: generated.long_ride_flag,
            notes: generated.notes,
          },
          { onConflict: 'user_id,date' }
        )
        .select('*')
        .single();

      if (insertErr) throw insertErr;
      prescription = inserted;
    }

    // 5. Apply gating
    const gating = evaluateGating(ctx, prescription);

    let final = prescription;
    if (gating.gated) {
      final = { ...prescription, ...gating.substitute, gating_reason: gating.reason };
      // Persist gating_reason so two devices see the same outcome
      await supabase
        .from('session_prescriptions')
        .update({
          session_type: final.session_type,
          target_rss: final.target_rss,
          target_duration_min: final.target_duration_min,
          prescribed_intervals: final.prescribed_intervals,
          notes: final.notes,
          gating_reason: gating.reason,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('date', today);
    }

    // Compute days_in for the strip
    const startDate = new Date(block.start_date + 'T00:00:00Z');
    const todayDate = new Date(today + 'T00:00:00Z');
    const days_in =
      Math.round(
        (todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
    const block_total_days =
      Math.round(
        (new Date(block.end_date + 'T00:00:00Z').getTime() -
          startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    return res.status(200).json({
      ok: true,
      prescription: final,
      block: {
        id: block.id,
        block_type: block.block_type,
        start_date: block.start_date,
        end_date: block.end_date,
        status: block.status,
        parent_event_tier: block.parent_event_tier,
        days_in,
        block_total_days,
      },
      gating: gating.gated
        ? { gated: true, reason: gating.reason }
        : { gated: false },
    });
  } catch (err) {
    console.error('[sequencer-today] error:', err);
    return res.status(500).json({
      error: 'Failed to load today prescription',
      detail: err?.message ?? String(err),
    });
  }
}
