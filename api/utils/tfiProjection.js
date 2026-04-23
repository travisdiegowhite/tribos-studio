/**
 * TFI Projection
 *
 * Projects Training Fitness Index (TFI) forward from today to a target date
 * using the exponentially-weighted average formula from the Tribos spec:
 *
 *   TFI_{d+1} = TFI_d × (41/42) + RSS_d / 42
 *
 * Days with no planned workout contribute RSS = 0 (natural decay).
 * Days with a planned workout contribute their target_rss.
 *
 * This is the same recurrence used by the fitness-snapshots system;
 * the tau = 42 value matches calculateTFI() in src/utils/trainingPlans.ts.
 */

const TFI_TAU = 42;

/**
 * Project TFI from a starting value over N calendar days.
 *
 * @param {number} startTfi          Current TFI (today's value)
 * @param {string} startDateStr      YYYY-MM-DD — the date startTfi was measured
 * @param {string} targetDateStr     YYYY-MM-DD — the goal event date to project to
 * @param {Array}  plannedWorkouts   planned_workouts rows: { scheduled_date, target_rss }
 *                                   Only workouts after startDateStr are used.
 * @returns {number}                 Projected TFI rounded to nearest integer
 */
export function projectTfi(startTfi, startDateStr, targetDateStr, plannedWorkouts = []) {
  if (!Number.isFinite(startTfi) || startTfi < 0) return 0;

  const startNoon = noonUTCFor(startDateStr);
  const targetNoon = noonUTCFor(targetDateStr);
  const totalDays = Math.round((targetNoon - startNoon) / MS_PER_DAY);

  if (totalDays <= 0) return Math.round(startTfi);

  // Build a date → RSS lookup for planned workouts
  const rssMap = new Map();
  for (const w of (plannedWorkouts || [])) {
    if (w.scheduled_date > startDateStr && w.scheduled_date <= targetDateStr) {
      const existing = rssMap.get(w.scheduled_date) || 0;
      rssMap.set(w.scheduled_date, existing + (w.target_rss || 0));
    }
  }

  let tfi = startTfi;
  for (let i = 1; i <= totalDays; i++) {
    const ms = startNoon.getTime() + i * MS_PER_DAY;
    const dateStr = new Date(ms).toISOString().split('T')[0]; // UTC date
    const rss = rssMap.get(dateStr) || 0;
    tfi = tfi * (1 - 1 / TFI_TAU) + rss / TFI_TAU;
  }

  return Math.round(tfi);
}

/**
 * Project TFI twice: once with the proposed modifications applied and once
 * without. Returns both values so the UI can show the delta.
 *
 * @param {number} startTfi
 * @param {string} startDateStr
 * @param {string} targetDateStr
 * @param {Array}  plannedWorkouts   Original planned workouts
 * @param {Array}  modifications     Enriched modifications (with planned_workout_id, scheduled_date, op, delta_minutes, new_rss)
 * @returns {{ without: number, with: number }}
 */
export function projectTfiWithAndWithout(startTfi, startDateStr, targetDateStr, plannedWorkouts, modifications) {
  const without = projectTfi(startTfi, startDateStr, targetDateStr, plannedWorkouts);

  // Apply modifications to a copy of the workouts
  const workoutMap = new Map(plannedWorkouts.map(w => [w.id, { ...w }]));
  for (const mod of (modifications || [])) {
    if (!mod.planned_workout_id) continue;
    const w = workoutMap.get(mod.planned_workout_id);
    if (!w) continue;

    if (mod.op === 'skip') {
      workoutMap.set(w.id, { ...w, target_rss: 0 });
    } else if (mod.new_rss != null) {
      workoutMap.set(w.id, { ...w, target_rss: mod.new_rss });
    } else if (mod.op === 'extend' && mod.delta_minutes) {
      // Approximate RSS increase: proportional to duration increase
      const originalDuration = w.target_duration || w.duration_minutes || 60;
      const rssIncrease = (mod.delta_minutes / originalDuration) * (w.target_rss || 0);
      workoutMap.set(w.id, { ...w, target_rss: Math.round((w.target_rss || 0) + rssIncrease) });
    } else if (mod.op === 'reduce' && mod.delta_minutes) {
      const originalDuration = w.target_duration || w.duration_minutes || 60;
      const rssDecrease = (Math.abs(mod.delta_minutes) / originalDuration) * (w.target_rss || 0);
      workoutMap.set(w.id, { ...w, target_rss: Math.max(0, Math.round((w.target_rss || 0) - rssDecrease)) });
    }
  }

  const modifiedWorkouts = [...workoutMap.values()];
  const withMods = projectTfi(startTfi, startDateStr, targetDateStr, modifiedWorkouts);

  return { without, with: withMods };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function noonUTCFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}
