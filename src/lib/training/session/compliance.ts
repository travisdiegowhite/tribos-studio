/**
 * compliance — how a completed (or missed) session compares with its plan.
 *
 * Bands follow TrainingPeaks and intervals.icu, which athletes coming from
 * those tools already read fluently:
 *
 *   on_target   actual within ±20% of plan
 *   partial     50–79% or 121–150% of plan
 *   off         beyond that
 *   missed      planned, in the past, nothing done
 *   skipped     the athlete marked it skipped (a decision, not a miss)
 *   unplanned   an activity with no plan
 *   upcoming    today or later, not done yet
 *
 * The basis is load (RSS) by default — it is the one number that captures
 * both duration and intensity — falling back to time, then distance, when the
 * plan carries no load. Those competitors colour these green / yellow /
 * orange / red / grey; tribos has no orange or red, so the bands map onto the
 * role colours instead (see COMPLIANCE_STYLE).
 */

import { isSkippedSession } from '../../../../api/utils/sessionSkipped.js';

export type ComplianceBand = 'on_target' | 'partial' | 'off' | 'missed' | 'skipped' | 'unplanned' | 'upcoming';
export type ComplianceBasis = 'load' | 'time' | 'distance';

export interface ComplianceInput {
  planned?: { load?: number | null; durationMin?: number | null; distanceKm?: number | null } | null;
  actual?: { load?: number | null; durationMin?: number | null; distanceKm?: number | null } | null;
  /** calendar_entries.status */
  status?: string | null;
  /** The session's date, YYYY-MM-DD. */
  date?: string | null;
  /** Today in the athlete's calendar, YYYY-MM-DD. */
  today: string;
}

export interface Compliance {
  band: ComplianceBand;
  /** actual / planned on the basis used; null when there is nothing to compare. */
  ratio: number | null;
  basis: ComplianceBasis | null;
}

function positive(v: number | null | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pick the comparison basis both sides have, in order of preference. */
function pickBasis(input: ComplianceInput): { basis: ComplianceBasis; planned: number; actual: number | null } | null {
  const p = input.planned ?? {};
  const a = input.actual ?? {};
  const pairs: Array<[ComplianceBasis, number | null, number | null]> = [
    ['load', positive(p.load), positive(a.load)],
    ['time', positive(p.durationMin), positive(a.durationMin)],
    ['distance', positive(p.distanceKm), positive(a.distanceKm)],
  ];
  // Prefer a basis where both sides have a number; else the first the plan has.
  const both = pairs.find(([, pl, ac]) => pl != null && ac != null);
  if (both) return { basis: both[0], planned: both[1] as number, actual: both[2] };
  const plannedOnly = pairs.find(([, pl]) => pl != null);
  return plannedOnly ? { basis: plannedOnly[0], planned: plannedOnly[1] as number, actual: null } : null;
}

export function bandForRatio(ratio: number): 'on_target' | 'partial' | 'off' {
  if (ratio >= 0.8 && ratio <= 1.2) return 'on_target';
  if (ratio >= 0.5 && ratio <= 1.5) return 'partial';
  return 'off';
}

export function complianceFor(input: ComplianceInput): Compliance {
  const status = input.status ?? 'planned';
  const hasActual = !!input.actual && Object.values(input.actual).some((v) => positive(v as number) != null);
  const hasPlan = !!input.planned && Object.values(input.planned).some((v) => positive(v as number) != null);

  if (status === 'skipped') return { band: 'skipped', ratio: null, basis: null };

  if (!hasPlan) {
    return hasActual ? { band: 'unplanned', ratio: null, basis: null } : { band: 'upcoming', ratio: null, basis: null };
  }

  const picked = pickBasis(input);
  if (hasActual && picked?.actual != null) {
    const ratio = picked.actual / picked.planned;
    return { band: bandForRatio(ratio), ratio: Math.round(ratio * 100) / 100, basis: picked.basis };
  }

  // Done with no comparable numbers (e.g. marked done by hand): count it as done.
  if (status === 'done' || hasActual) return { band: 'on_target', ratio: null, basis: null };

  const past = !!input.date && input.date < input.today;
  if (status === 'missed' || past) return { band: 'missed', ratio: null, basis: picked?.basis ?? null };
  return { band: 'upcoming', ratio: null, basis: picked?.basis ?? null };
}

/**
 * How each band is drawn, in role colours (CLAUDE.md design system): done
 * blue for on target, lime overprint for partly off, magenta signal for far
 * off and missed, a grey rule for unplanned. `strip` is the colour of the
 * card's left rule; `label` is what a badge or tooltip says.
 */
export const COMPLIANCE_STYLE: Record<ComplianceBand, { strip: string; label: string }> = {
  on_target: { strip: 'var(--color-done)', label: 'On target' },
  partial: { strip: 'var(--color-highlight)', label: 'Partly' },
  off: { strip: 'var(--color-signal)', label: 'Off plan' },
  missed: { strip: 'var(--color-signal)', label: 'Missed' },
  skipped: { strip: 'var(--color-border)', label: 'Skipped' },
  unplanned: { strip: 'var(--color-ink-border)', label: 'Unplanned' },
  upcoming: { strip: 'var(--color-easy)', label: 'Planned' },
};

export interface PlanCompliance {
  /** Done ÷ due so far, 0–100; null when nothing is due yet. */
  pct: number | null;
  done: number;
  /** Sessions of the plan dated before today (what could have been done). */
  due: number;
  /** All the plan's sessions. */
  total: number;
}

/**
 * A plan's compliance, from the calendar itself.
 *
 * `training_plans.compliance_percentage` is maintained by a trigger on the
 * retired planned_workouts table, so it stopped moving when the calendar moved
 * to calendar_entries — and the coach was still told it. A plan is provenance
 * on the calendar (`plan_id`), so its compliance is its sessions' status.
 * Rest days and skipped sessions (a decision, not a miss) are left out.
 */
export function planCompliance(
  rows: Array<{ plan_id?: string | null; scheduled_date?: string | null; workout_type?: string | null; status?: string | null; completed?: boolean | null; skipped_reason?: string | null }>,
  planId: string | null | undefined,
  today: string,
): PlanCompliance {
  if (!planId) return { pct: null, done: 0, due: 0, total: 0 };
  const sessions = rows.filter(
    (r) => r.plan_id === planId && r.workout_type !== 'rest' && !isSkippedSession(r),
  );
  const isDone = (r: (typeof sessions)[number]) => r.status === 'done' || r.completed === true;
  const due = sessions.filter((r) => (r.scheduled_date ?? '') < today || ((r.scheduled_date ?? '') === today && isDone(r)));
  const done = due.filter(isDone).length;
  return {
    pct: due.length > 0 ? Math.round((done / due.length) * 100) : null,
    done,
    due: due.length,
    total: sessions.length,
  };
}
