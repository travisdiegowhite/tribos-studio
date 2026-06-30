/**
 * Adaptive arc refill (Increment B2, tight slice) — readiness-gated easing.
 *
 * Pure core for api/arc-refill.js. Given an active arc's blocks + the athlete's
 * current fitness state, it recomputes the next N days of the arc and eases the
 * upcoming quality sessions when the athlete is carrying fatigue, using the
 * existing gating rules (evaluateGating). It is STATELESS: every run regenerates
 * the canonical sessions and re-gates against fresh stats, so easing
 * auto-REVERTS when Form Score recovers — there is no stored "is-eased" latch.
 *
 * Only the two gating rules that run on data we already have fire here:
 *   - Form Score <= -15  -> swap quality session to Z2
 *   - AFI 4-day growth > ceiling -> trim quality target 25%
 * The HRV / wellness rules stay inert (we pass subjective: []); upward
 * progression is deferred. See docs plan Part XVII.
 *
 * No I/O, no LLM — unit-testable.
 */

import {
  generateArcWorkouts,
  applyAvailabilityToArcWorkouts,
  SESSION_TYPE_TO_WORKOUT_TYPE,
  SESSION_TYPE_TO_NAME,
} from './arcBuilder.js';
import { evaluateGating } from './sequencerBlockOps.js';
import { estimateTSSWithSource } from './fitnessSnapshots.js';

const TFI_TAU = 42;
const AFI_TAU = 7;
const DEFAULT_FTP = 200;
const STATS_WINDOW_DAYS = 90;

function isoUTC(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the gating `daily_stats` series (most-recent first) from activities — the
 * SAME activity-derived EWMA the client TodayGlance shows (src/views/today/
 * athleteMetrics.ts buildAthleteMetrics): a 90-day, zero-filled daily-RSS walk
 * with TFI τ=42 / AFI τ=7, Form Score = TFI_yesterday − AFI_yesterday. We must
 * compute this rather than read training_load_daily, which is unpopulated
 * (no server writer exists). `serverHistory` (training_load_daily rows) is an
 * optional overlay, preferred per-day if/when that table is ever written.
 *
 * @param {Array} activities  rows with start_date, rss/tss, distance, etc.
 * @param {number} ftp
 * @param {string} todayStr   user-local "today" (YYYY-MM-DD) — series ends here
 * @param {Array} [serverHistory] training_load_daily rows {date,tfi,afi,form_score}
 * @returns {Array<{date,tfi,afi,form_score}>} index 0 = today, descending
 */
export function computeDailyStatsFromActivities(activities, ftp, todayStr, serverHistory = []) {
  const list = Array.isArray(activities) ? activities : [];
  if (list.length === 0 && serverHistory.length === 0) return [];
  const effFtp = ftp || DEFAULT_FTP;

  const today = new Date(todayStr + 'T00:00:00Z');
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - STATS_WINDOW_DAYS);

  const dailyRSS = {};
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) dailyRSS[isoUTC(d)] = 0;
  for (const a of list) {
    const date = (a.start_date || '').split('T')[0];
    if (date && dailyRSS[date] !== undefined) {
      const tss = estimateTSSWithSource(a, effFtp)?.tss ?? 0;
      dailyRSS[date] += Math.min(tss, 500);
    }
  }

  const serverByDate = new Map();
  for (const r of serverHistory) serverByDate.set(r.date, r);

  const sortedDays = Object.keys(dailyRSS).sort();
  const series = [];
  let tfi = 0;
  let afi = 0;
  for (const day of sortedDays) {
    const tfiBefore = tfi;
    const afiBefore = afi;
    const server = serverByDate.get(day);
    if (server && Number.isFinite(Number(server.tfi)) && Number.isFinite(Number(server.afi))) {
      tfi = Number(server.tfi);
      afi = Number(server.afi);
    } else {
      const rss = dailyRSS[day];
      tfi = tfi + (rss - tfi) / TFI_TAU;
      afi = afi + (rss - afi) / AFI_TAU;
    }
    const fs = server && Number.isFinite(Number(server.form_score))
      ? Number(server.form_score)
      : tfiBefore - afiBefore;
    series.push({ date: day, tfi, afi, form_score: Math.round(fs) });
  }

  series.reverse(); // most recent first — gating reads index 0 as "today"
  return series;
}

// Columns we actually persist to planned_workouts (the row also carries transient
// session_type / prescribed_intervals that are NOT columns — stripped here).
const PERSISTABLE_FIELDS = [
  'scheduled_date',
  'day_of_week',
  'week_number',
  'workout_type',
  'workout_id',
  'name',
  'target_rss',
  'target_tss',
  'target_duration',
  'duration_minutes',
  'notes',
  'phase',
  'source',
  'completed',
  'adjustment_reason',
];

// Content fields whose change means we need to write the row.
const DIFF_FIELDS = [
  'workout_type',
  'name',
  'target_rss',
  'target_duration',
  'duration_minutes',
  'notes',
  'adjustment_reason',
];

function addDaysIso(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function persistable(row) {
  const out = {};
  for (const f of PERSISTABLE_FIELDS) out[f] = row[f] ?? null;
  return out;
}

// Apply a gating substitute back onto an arc row (in place).
function applyGateToRow(row, gate) {
  const sub = gate.substitute || {};
  if (sub.session_type) {
    row.workout_type = SESSION_TYPE_TO_WORKOUT_TYPE[sub.session_type] || row.workout_type;
    row.name = SESSION_TYPE_TO_NAME[sub.session_type] || row.name;
    row.session_type = sub.session_type;
  }
  if (sub.target_rss !== undefined) {
    row.target_rss = sub.target_rss;
    row.target_tss = sub.target_rss; // dual-write per metrics freeze
  }
  if (sub.target_duration_min !== undefined) {
    row.target_duration = sub.target_duration_min ?? null;
    row.duration_minutes = sub.target_duration_min ?? 0;
  }
  if (sub.prescribed_intervals !== undefined) row.prescribed_intervals = sub.prescribed_intervals;
  if (sub.notes !== undefined) row.notes = sub.notes;
  row.adjustment_reason = gate.reason || null;
}

/**
 * Compute the readiness-gated refill for the active arc.
 *
 * @param {object} params
 * @param {Array} params.blocks            training_plans.blocks (phase bands)
 * @param {string} params.planStartDate    arc start (training_plans.start_date) — for week_number parity
 * @param {string} params.windowStart      first day to refill (YYYY-MM-DD, user-local "today")
 * @param {number} [params.windowDays=7]   window length in days
 * @param {object} params.gatingCtx        { daily_stats:[{form_score,tfi,afi}], coefficients } — index 0 is today
 * @param {object} [params.genCtx]         generation ctx for byte-parity with activation
 *                                         (defaults to { coefficients: undefined, upcoming_events: [] })
 * @param {object} [params.availability]   { weeklyAvailability, preferences } — re-applied like activation
 * @param {Array}  [params.existingRows]   current planned_workouts rows in the window (need id, scheduled_date,
 *                                         source, completed + content fields)
 * @returns {{ upserts: Array<object>, changes: Array<object> }}
 *   upserts: persistable planned_workouts partials (no plan_id/user_id — the writer adds them),
 *            each carrying `id` when the existing row had one (for targeted update).
 *   changes: human-readable [{ scheduled_date, from, to, reason }] for surfacing/logging.
 */
export function computeArcRefill({
  blocks,
  planStartDate,
  windowStart,
  windowDays = 7,
  gatingCtx,
  genCtx,
  availability,
  existingRows = [],
}) {
  const bands = Array.isArray(blocks) ? blocks : [];
  if (bands.length === 0 || !windowStart) return { upserts: [], changes: [] };

  const windowEnd = addDaysIso(windowStart, windowDays - 1);

  // 1. Regenerate the FULL arc exactly as activation did (byte-parity), then
  //    re-apply availability over full weeks — only after that do we slice the
  //    window, so per-week availability swaps reproduce faithfully.
  const generationCtx = genCtx || { coefficients: undefined, upcoming_events: [] };
  const allRows = generateArcWorkouts(bands, { ctx: generationCtx, arcStart: planStartDate });
  applyAvailabilityToArcWorkouts(allRows, availability);

  // 2. Slice to the window.
  const windowRows = allRows.filter(
    (r) => r.scheduled_date >= windowStart && r.scheduled_date <= windowEnd,
  );

  // 3. Gate each windowed row against current fitness state.
  for (const row of windowRows) {
    const prescription = {
      date: row.scheduled_date,
      session_type: row.session_type,
      target_rss: row.target_rss,
      target_duration_min: row.target_duration ?? row.duration_minutes ?? 0,
      prescribed_intervals: row.prescribed_intervals ?? null,
      notes: row.notes || '',
    };
    const gate = evaluateGating(gatingCtx, prescription);
    if (gate?.gated) {
      applyGateToRow(row, gate);
    } else {
      row.adjustment_reason = null; // canonical → clears any prior easing on write
    }
  }

  // 4. Diff against existing rows; only touch arc-sourced, incomplete rows that changed.
  const existingByDate = new Map();
  for (const e of existingRows) existingByDate.set(e.scheduled_date, e);

  const upserts = [];
  const changes = [];
  for (const row of windowRows) {
    const existing = existingByDate.get(row.scheduled_date);
    if (!existing) continue; // never INSERT new arc days here — only adapt existing ones
    if (existing.source !== 'arc') continue; // respect manual / coach edits
    if (existing.completed) continue; // never rewrite a logged session

    const changed = DIFF_FIELDS.some((f) => (existing[f] ?? null) !== (row[f] ?? null));
    if (!changed) continue;

    const out = persistable(row);
    if (existing.id) out.id = existing.id;
    upserts.push(out);
    changes.push({
      scheduled_date: row.scheduled_date,
      from: { workout_type: existing.workout_type, target_rss: existing.target_rss ?? null },
      to: { workout_type: row.workout_type, target_rss: row.target_rss ?? null },
      reason: row.adjustment_reason || null,
    });
  }

  return { upserts, changes };
}
