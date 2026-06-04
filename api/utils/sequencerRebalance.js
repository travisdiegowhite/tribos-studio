/**
 * Sequencer — deviation rebalance (PROPOSAL only).
 *
 * When an athlete on an active event-anchored sequence deviates from a planned
 * session (much harder/easier ride, missed quality day), the deviation has
 * already shifted their fatigue (AFI/Form Score) in `training_load_daily`. This
 * helper re-runs the block generators + fitness gating across the next few days
 * and, for any day whose prescription would now differ, records a single
 * `block_modifications` row with `proposal_state='proposed'` and the candidate
 * `{ before, after }` changes.
 *
 * It writes NOTHING to `session_prescriptions` — the athlete confirms via the
 * Coach Intel strip (Apply), which is the only place that mutates prescriptions
 * and re-projects to the calendar. This keeps the suggest-and-confirm contract
 * and avoids the canonical→projection double-write trap.
 */

import {
  generateSessionsForBlock,
  evaluateGating,
} from './sequencerBlockOps.js';
import { buildSequencerContext } from './sequencerContext.js';

// Block-bounded look-ahead. Wide enough to redistribute a quality session,
// narrow enough that we don't churn the whole block on every ride.
export const REBALANCE_WINDOW_DAYS = 6;

function addDaysIso(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Build (but do not persist) a rebalance proposal for the athlete's active
 * sequence, starting at `fromDate`.
 *
 * @returns {Promise<{proposed: boolean, reason?: string, modification_id?: string,
 *   change_count?: number, changes?: object[]}>}
 */
export async function proposeBlockRebalance({ supabase, user_id, fromDate, reason }) {
  const today = fromDate;
  const windowEnd = addDaysIso(today, REBALANCE_WINDOW_DAYS - 1);

  // Active sequence?
  const { data: seq } = await supabase
    .from('sequences')
    .select('id')
    .eq('user_id', user_id)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!seq) return { proposed: false, reason: 'no_active_sequence' };

  // Blocks overlapping the look-ahead window.
  const { data: blocks } = await supabase
    .from('block_instances')
    .select('id, block_type, start_date, end_date, parent_event_id, parent_event_tier, coefficients_snapshot')
    .eq('sequence_id', seq.id)
    .in('status', ['active', 'planned'])
    .lte('start_date', windowEnd)
    .gte('end_date', today)
    .order('start_date', { ascending: true });
  if (!blocks || blocks.length === 0) return { proposed: false, reason: 'no_blocks_in_window' };

  // Existing prescriptions in the window (the "before").
  const { data: existingRows } = await supabase
    .from('session_prescriptions')
    .select('date, session_type, target_rss, target_duration_min')
    .eq('user_id', user_id)
    .gte('date', today)
    .lte('date', windowEnd);
  const existingByDate = new Map((existingRows ?? []).map((r) => [r.date, r]));

  // Context reflects the post-deviation fatigue (caller updates
  // training_load_daily before invoking this).
  const baseCtx = await buildSequencerContext(user_id, today);

  const changes = [];
  const seenDates = new Set();
  for (const block of blocks) {
    // Surface the anchor event to taper/race_specific generators (same as the
    // recompute endpoint), using the block's coefficient snapshot.
    let ctx = baseCtx;
    if (block.parent_event_id && block.parent_event_tier) {
      const anchor = baseCtx.upcoming_events.find((e) => e.id === block.parent_event_id);
      if (anchor) {
        ctx = {
          ...baseCtx,
          upcoming_events: [anchor, ...baseCtx.upcoming_events.filter((e) => e.id !== anchor.id)],
          coefficients: block.coefficients_snapshot ?? baseCtx.coefficients,
        };
      }
    }

    const sessions = generateSessionsForBlock(
      block.block_type,
      block.start_date,
      block.end_date,
      ctx
    );
    for (const s of sessions) {
      if (s.date < today || s.date > windowEnd) continue;
      if (seenDates.has(s.date)) continue; // blocks shouldn't overlap, but be safe
      seenDates.add(s.date);

      const gating = evaluateGating(ctx, s);
      const final = gating.gated ? { ...s, ...gating.substitute } : s;
      const before = existingByDate.get(s.date) ?? null;

      const changed =
        !before ||
        before.session_type !== final.session_type ||
        Number(before.target_rss) !== Number(final.target_rss);

      if (changed) {
        changes.push({
          date: s.date,
          block_id: block.id,
          before: before
            ? {
                session_type: before.session_type,
                target_rss: before.target_rss,
                target_duration_min: before.target_duration_min,
              }
            : null,
          after: {
            session_type: final.session_type,
            target_rss: final.target_rss,
            target_duration_min: final.target_duration_min,
            prescribed_intervals: final.prescribed_intervals ?? null,
            long_ride_flag: final.long_ride_flag ?? null,
            notes: final.notes ?? null,
          },
          gating_reason: gating.gated ? gating.reason : null,
        });
      }
    }
  }

  if (changes.length === 0) return { proposed: false, reason: 'no_changes' };

  const gatedReason = changes.map((c) => c.gating_reason).find(Boolean);
  const summary =
    reason ||
    gatedReason ||
    `Adjusted ${changes.length} upcoming session${changes.length > 1 ? 's' : ''} after your last ride.`;

  const { data: mod, error } = await supabase
    .from('block_modifications')
    .insert({
      user_id,
      block_id: blocks[0].id,
      modified_by: 'system',
      reason: summary,
      proposal_state: 'proposed',
      proposed_changes: changes,
      before: changes[0].before,
      after: changes[0].after,
    })
    .select('id')
    .single();
  if (error) throw error;

  return { proposed: true, modification_id: mod.id, change_count: changes.length, changes };
}
