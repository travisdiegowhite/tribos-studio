/**
 * forecast — where fitness, fatigue and form are headed on the current plan.
 *
 * Steps the same EWMA the server and the fitness chart use (stepDay, with the
 * athlete's own taus) forward from today's state, one day at a time, with each
 * future day's planned load (the calendar's target_load, now derived from each
 * session's structure). Days with nothing planned are rest days in the
 * projection — which is what they are unless the athlete adds something.
 *
 * TrainingPeaks and intervals.icu both draw this as the PMC's future segment;
 * athletes use it to see a build land, and form come up for a race.
 */

import { stepDay } from '../tsb-projection';

export interface ForecastPoint {
  date: string;
  /** Fitness (TFI) */
  ctl: number;
  /** Fatigue (AFI) */
  atl: number;
  /** Form (FS): yesterday's fitness − yesterday's fatigue, the chart's own convention. */
  tsb: number;
  /** The day's planned load that drove it. */
  load: number;
}

export interface ForecastInput {
  /** Today's state, YYYY-MM-DD plus TFI/AFI at end of today. */
  from: { date: string; ctl: number; atl: number };
  /** Planned sessions (legacy calendar shape is fine). */
  planned: Array<{ scheduled_date?: string | null; date?: string | null; target_rss?: number | null; target_tss?: number | null; target_load?: number | null; status?: string | null; completed?: boolean | null; skipped_reason?: string | null }>;
  taus?: { tfi: number; afi: number };
  days?: number;
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function forecastFitness({ from, planned, taus = { tfi: 42, afi: 7 }, days = 42 }: ForecastInput): ForecastPoint[] {
  if (!from?.date || !Number.isFinite(from.ctl) || !Number.isFinite(from.atl)) return [];
  const loadByDate = new Map<string, number>();
  for (const p of planned ?? []) {
    const date = p.scheduled_date ?? p.date;
    if (!date || date <= from.date) continue;
    if (p.status === 'skipped' || p.skipped_reason) continue;
    const load = Number(p.target_rss ?? p.target_tss ?? p.target_load) || 0;
    if (load > 0) loadByDate.set(date, (loadByDate.get(date) ?? 0) + load);
  }

  const out: ForecastPoint[] = [];
  let state = { tfi: from.ctl, afi: from.atl, formScore: 0 };
  for (let i = 1; i <= days; i++) {
    const date = addDays(from.date, i);
    const load = loadByDate.get(date) ?? 0;
    const prev = state;
    state = stepDay(state, load, taus.tfi, taus.afi);
    out.push({ date, ctl: state.tfi, atl: state.afi, tsb: prev.tfi - prev.afi, load });
  }
  return out;
}
