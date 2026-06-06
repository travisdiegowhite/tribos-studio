/**
 * Sequencer — intended fitness trajectory (Phase 3).
 *
 * At anchor time we forward-simulate TFI/AFI/Form Score across the whole plan's
 * daily prescriptions and persist one `sequence_projections` row per day. Later,
 * the daily rollover compares the athlete's ACTUAL TFI to the projected TFI for
 * the same date: beating the curve = "ahead of plan", a signal that feeds the
 * upward progression engine.
 *
 * stepDay mirrors src/lib/training/tsb-projection.ts exactly (fixed 42/7 time
 * constants — the same dynamics process-deviation uses to step actual load), so
 * projected and actual are apples-to-apples.
 */

import { generateSessionsForBlock } from './sequencerBlockOps.js';

const TFI_TAU = 42;
const AFI_TAU = 7;

function stepDay(state, rss) {
  const tfi = state.tfi + (rss - state.tfi) / TFI_TAU;
  const afi = state.afi + (rss - state.afi) / AFI_TAU;
  return { tfi, afi, formScore: tfi - afi };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Build per-day projection rows for a plan's blocks over [today, raceDate).
 * Pure (no DB). `blocks` = [{ block_type, start_date, end_date }]; `ctx` is the
 * anchored sequencer context (for the generators + initial TFI/AFI).
 */
export function buildProjectionRows({ sequenceId, userId, blocks, ctx, today, raceDate }) {
  // Daily RSS across the whole plan (race day excluded).
  const rssByDate = new Map();
  for (const block of blocks) {
    const sessions = generateSessionsForBlock(block.block_type, block.start_date, block.end_date, ctx);
    for (const s of sessions) {
      if (s.date >= today && s.date < raceDate) {
        rssByDate.set(s.date, s.target_rss || 0);
      }
    }
  }

  const snap = ctx?.daily_stats?.[0];
  let state = {
    tfi: Number.isFinite(snap?.tfi) ? Number(snap.tfi) : 42,
    afi: Number.isFinite(snap?.afi) ? Number(snap.afi) : 42,
  };

  const dates = [...rssByDate.keys()].sort();
  const rows = [];
  for (const date of dates) {
    state = stepDay(state, rssByDate.get(date));
    rows.push({
      sequence_id: sequenceId,
      user_id: userId,
      date,
      projected_tfi: round2(state.tfi),
      projected_afi: round2(state.afi),
      projected_fs: round2(state.formScore),
    });
  }
  return rows;
}

/** Compute + persist the projection for a freshly anchored sequence. */
export async function computeAndStoreProjection(supabase, { sequenceId, userId, blocks, ctx, today, raceDate }) {
  const rows = buildProjectionRows({ sequenceId, userId, blocks, ctx, today, raceDate });
  if (rows.length === 0) return { inserted: 0 };
  const { error } = await supabase
    .from('sequence_projections')
    .upsert(rows, { onConflict: 'sequence_id,date' });
  if (error) throw error;
  return { inserted: rows.length };
}

/** Latest projected TFI for a given date on the active sequence (or null). */
export async function getProjectedTfi(supabase, sequenceId, date) {
  if (!sequenceId) return null;
  const { data } = await supabase
    .from('sequence_projections')
    .select('projected_tfi')
    .eq('sequence_id', sequenceId)
    .eq('date', date)
    .maybeSingle();
  return data?.projected_tfi ?? null;
}
