// arcBuilder — the living arc (Increment B1)
//
// Builds a deterministic, phase-banded plan toward a race and fills it with real
// `planned_workouts` rows. It harvests the (retired-System-B but kept) pure
// periodization math:
//   - buildEventAnchoredSequence: race + tier → block chain (the phase bands)
//   - generateSessionsForBlock:   block → one session per day
//   - coefficientsForMode:        recovery-mode presets (masters factor)
//
// There is NO LLM call and NO fatigue gating here — the fill is deterministic
// and stable at set-time (future fatigue is unknown). Fatigue-aware re-fill is
// deferred to B2. The output rows attach to a real `training_plans` row, so
// everything downstream (calendar header, compliance trigger, dashboard) works
// unchanged; `source`/`phase` are the new intent tags (migration 101).

import { buildEventAnchoredSequence } from './sequencerPlanner.js';
import {
  generateSessionsForBlock,
  coefficientsForMode,
} from './sequencerBlockOps.js';

// session_type (sequencer) → workout_type (planned_workouts). Same mapping the
// deleted eventAnchoredCalendarBridge used. workout_type has no DB CHECK, but we
// keep it aligned with the values the calendar/library understand.
const SESSION_TYPE_TO_WORKOUT_TYPE = {
  rest: 'rest',
  z1: 'recovery',
  z2: 'endurance',
  tempo: 'tempo',
  threshold: 'threshold',
  vo2: 'vo2max',
  race_sim: 'intervals',
  opener: 'recovery',
};

// session_type → human-friendly calendar name (planned_workouts.name is NOT NULL).
const SESSION_TYPE_TO_NAME = {
  rest: 'Rest Day',
  z1: 'Recovery Spin',
  z2: 'Endurance Ride',
  tempo: 'Tempo Ride',
  threshold: 'Threshold Intervals',
  vo2: 'VO2 Max Intervals',
  race_sim: 'Race Simulation',
  opener: 'Pre-Race Opener',
};

function daysBetween(startStr, endStr) {
  const a = new Date(startStr + 'T00:00:00Z');
  const b = new Date(endStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/**
 * Build the deterministic arc shape (phase bands) toward a race. Pure: no I/O.
 *
 * @param {object} params
 * @param {string} params.today        YYYY-MM-DD (arc start, inclusive)
 * @param {string} params.raceDate     YYYY-MM-DD (the A/target race)
 * @param {'A'|'B'|'C'} params.tier    race priority tier → chain
 * @param {string} [params.recoveryMode] 'standard'|'conservative'|'adaptive'
 * @returns {{ blocks: Array, chain_used: string[], validation_status: string,
 *             validation_messages: Array, horizon_days: number }}
 */
export function buildArc({ today, raceDate, tier, recoveryMode }) {
  const coefficients = coefficientsForMode(recoveryMode || 'standard');
  return buildEventAnchoredSequence({
    today,
    race_date: raceDate,
    tier: tier || 'A',
    coefficients,
  });
}

/**
 * Expand the arc's phase bands into one `planned_workouts` row per day.
 * Pure + unit-testable.
 *
 * @param {Array<{block_type:string,start_date:string,end_date:string}>} blocks
 * @param {object} [options]
 * @param {object} [options.ctx]   optional sequencer ctx (coefficients, upcoming_events,...)
 * @param {string} [options.arcStart] arc start date for week_number (defaults to first block start)
 * @returns {Array<object>} planned_workouts-shaped rows (no plan_id/user_id — set by the writer)
 */
export function generateArcWorkouts(blocks, options = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) return [];
  const ctx = options.ctx || undefined;
  const arcStart = options.arcStart || list[0].start_date;

  const rows = [];
  for (const block of list) {
    const sessions = generateSessionsForBlock(
      block.block_type,
      block.start_date,
      block.end_date,
      ctx,
    );
    for (const s of sessions) {
      const workoutType = SESSION_TYPE_TO_WORKOUT_TYPE[s.session_type] || 'endurance';
      const name = SESSION_TYPE_TO_NAME[s.session_type] || 'Workout';
      const load = s.target_rss ?? null;
      const duration = s.target_duration_min ?? 0;
      const dow = new Date(s.date + 'T12:00:00').getDay();
      const weekNumber = Math.floor(daysBetween(arcStart, s.date) / 7) + 1;

      rows.push({
        scheduled_date: s.date,
        day_of_week: dow,
        week_number: weekNumber,
        workout_type: workoutType,
        workout_id: null,
        name,
        // dual-write canonical + legacy load per CLAUDE.md metrics freeze
        target_rss: load,
        target_tss: load,
        target_duration: duration || null,
        duration_minutes: duration || 0,
        long_ride_flag: !!s.long_ride_flag,
        notes: s.notes || '',
        phase: block.block_type,
        source: 'arc',
        completed: false,
      });
    }
  }
  return rows;
}

export { SESSION_TYPE_TO_WORKOUT_TYPE, SESSION_TYPE_TO_NAME };
