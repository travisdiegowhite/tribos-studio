/**
 * Sequencer — upward progression (PROPOSAL only).
 *
 * The proactive counterpart to sequencerRebalance.js. When the athlete is fresh
 * (Form Score > +20) or their estimated FTP has risen >5%, this re-runs the
 * block generators across the next ~10 days and, for any day that
 * `evaluateProgression` would step UP, records a single 'proposed'
 * `block_modifications` row the athlete can Apply/Dismiss on the Coach Intel
 * strip. It writes nothing to `session_prescriptions` — Apply does that.
 *
 * Safety: `evaluateGating` runs first on each day; any day it would ease is
 * never proposed for a push. Deduped so it never stacks on an open proposal.
 */

import {
  generateSessionsForBlock,
  evaluateGating,
  evaluateProgression,
} from './sequencerBlockOps.js';
import { buildSequencerContext } from './sequencerContext.js';
import { getProjectedTfi } from './sequencerProjection.js';

export const PROGRESSION_WINDOW_DAYS = 10;
const FRESH_FS_THRESHOLD = 20;
const FTP_RISE_THRESHOLD = 0.05;
const AHEAD_TFI_THRESHOLD = 0.03;
const LOW_RPE_MAX = 4;          // avg RPE ≤ 4/10 on completed planned sessions
const LOW_RPE_MIN_COUNT = 2;    // need at least this many rated, completed sessions
const RPE_LOOKBACK_DAYS = 14;

// "High-compliance + low-RPE": recent planned sessions the athlete actually
// completed (matched_planned_workout_id set) that they rated easy (avg ≤ 4).
async function computeLowRpeSignal(supabase, user_id, today) {
  const since = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - RPE_LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  })();
  const { data } = await supabase
    .from('activities')
    .select('rpe_score')
    .eq('user_id', user_id)
    .not('rpe_score', 'is', null)
    .not('matched_planned_workout_id', 'is', null)
    .gte('start_date', since);
  const scores = (data ?? []).map((a) => Number(a.rpe_score)).filter((n) => Number.isFinite(n));
  if (scores.length < LOW_RPE_MIN_COUNT) return false;
  const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
  return avg <= LOW_RPE_MAX;
}

function addDaysIso(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Latest estimated FTP (weekly snapshot) vs the athlete's stored FTP.
async function computeFtpRisePct(supabase, user_id) {
  const { data: snap } = await supabase
    .from('fitness_snapshots')
    .select('estimated_ftp')
    .eq('user_id', user_id)
    .order('snapshot_week', { ascending: false })
    .limit(1)
    .maybeSingle();
  const estimated = snap?.estimated_ftp;
  if (!estimated) return 0;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('ftp')
    .eq('id', user_id)
    .maybeSingle();
  const current = profile?.ftp;
  if (!current || current <= 0) return 0;
  return (estimated - current) / current;
}

/**
 * @returns {Promise<{proposed: boolean, reason?: string, modification_id?: string,
 *   change_count?: number, changes?: object[]}>}
 */
export async function proposeProgression({ supabase, user_id, fromDate, ctx: passedCtx }) {
  const today = fromDate;
  const windowEnd = addDaysIso(today, PROGRESSION_WINDOW_DAYS - 1);

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

  // Don't stack on an unresolved proposal (rebalance or progression).
  const { data: openProps } = await supabase
    .from('block_modifications')
    .select('id')
    .eq('user_id', user_id)
    .eq('acknowledged', false)
    .eq('proposal_state', 'proposed')
    .limit(1);
  if (openProps && openProps.length > 0) {
    return { proposed: false, reason: 'open_proposal_exists' };
  }

  const baseCtx = passedCtx ?? (await buildSequencerContext(user_id, today));
  const ftpRisePct = await computeFtpRisePct(supabase, user_id);

  // "Ahead of plan": actual TFI today vs the trajectory we projected at anchor.
  const todaySnap = baseCtx?.daily_stats?.[0];
  let tfiAheadPct = 0;
  const actualTfi = todaySnap?.tfi;
  if (Number.isFinite(actualTfi)) {
    const projectedTfi = await getProjectedTfi(supabase, seq.id, today);
    if (projectedTfi && projectedTfi > 0) {
      tfiAheadPct = (actualTfi - projectedTfi) / projectedTfi;
    }
  }

  const lowRpe = await computeLowRpeSignal(supabase, user_id, today);

  // Cheap early-out: no signal at all → nothing to propose.
  const fresh = !!todaySnap && todaySnap.form_score > FRESH_FS_THRESHOLD;
  if (!fresh && !(ftpRisePct > FTP_RISE_THRESHOLD) && !(tfiAheadPct > AHEAD_TFI_THRESHOLD) && !lowRpe) {
    return { proposed: false, reason: 'no_signal' };
  }

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

  const changes = [];
  const seenDates = new Set();
  let firstReason = null;

  for (const block of blocks) {
    // Per-block ctx: the progression guard reads current_block.block_type, and
    // taper/race_specific generators read upcoming_events[0].
    const ctx = {
      ...baseCtx,
      progression: { ftp_rise_pct: ftpRisePct, tfi_ahead_pct: tfiAheadPct, low_rpe: lowRpe },
      current_block: { block_type: block.block_type },
    };
    if (block.parent_event_id && block.parent_event_tier) {
      const anchor = baseCtx.upcoming_events?.find((e) => e.id === block.parent_event_id);
      if (anchor) {
        ctx.upcoming_events = [anchor, ...baseCtx.upcoming_events.filter((e) => e.id !== anchor.id)];
      }
      ctx.coefficients = block.coefficients_snapshot ?? baseCtx.coefficients;
    }

    const sessions = generateSessionsForBlock(block.block_type, block.start_date, block.end_date, ctx);
    for (const s of sessions) {
      if (s.date < today || s.date > windowEnd) continue;
      if (seenDates.has(s.date)) continue;
      seenDates.add(s.date);

      // Safety always wins: never push a day gating would ease.
      if (evaluateGating(ctx, s).gated) continue;

      const prog = evaluateProgression(ctx, s);
      if (!prog.upgraded) continue;
      const final = prog.substitute;
      const before = existingByDate.get(s.date) ?? null;

      const changed =
        !before ||
        before.session_type !== final.session_type ||
        Number(before.target_rss) !== Number(final.target_rss);
      if (!changed) continue;

      if (!firstReason) firstReason = prog.reason;
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
        gating_reason: null,
      });
    }
  }

  if (changes.length === 0) return { proposed: false, reason: 'no_changes' };

  const summary =
    firstReason || `You're ahead of plan — suggested a harder session for ${changes.length} day${changes.length > 1 ? 's' : ''}.`;

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
