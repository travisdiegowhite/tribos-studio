/**
 * Static Translation Layer
 *
 * Pure functions mapping metric values to plain-language status labels and colors.
 * Runs client-side synchronously on every render. No API calls, no side effects.
 */
import type { MetricTranslation } from './types';

/** CTL (Fitness) — long-term training load */
export function translateCTL(ctl: number): MetricTranslation {
  if (ctl >= 86) return { label: 'High performance', color: 'gold' };
  if (ctl >= 66) return { label: 'Strong & consistent', color: 'teal' };
  if (ctl >= 46) return { label: 'Solid fitness', color: 'teal' };
  if (ctl >= 26) return { label: 'Building your base', color: 'orange' };
  return { label: 'Just getting started', color: 'muted' };
}

/** ATL (Fatigue) — short-term training load, relative to CTL */
export function translateATL(atl: number, ctl: number): MetricTranslation {
  const ratio = ctl > 0 ? atl / ctl : 1;
  if (ratio > 1.20) return { label: 'Deep fatigue — watch it', color: 'coral' };
  if (ratio > 1.05) return { label: 'Feeling the work', color: 'orange' };
  if (ratio >= 0.85) return { label: 'Good training load', color: 'teal' };
  return { label: 'Legs are fresh', color: 'teal' };
}

/** TSB (Form) — fitness minus fatigue */
export function translateTSB(tsb: number): MetricTranslation {
  if (tsb > 15) return { label: 'Tapered — ready to go', color: 'gold' };
  if (tsb > 2) return { label: 'Primed to perform', color: 'gold' };
  if (tsb > -10) return { label: 'Training sweet spot', color: 'teal' };
  if (tsb > -20) return { label: 'Digging in', color: 'orange' };
  return { label: 'In the hole', color: 'coral' };
}

/** Trend direction — CTL trajectory over 4 weeks */
export interface TrendTranslation extends MetricTranslation {
  direction: 'building' | 'peaking' | 'maintaining' | 'recovering';
  subtitle: string;
}

export function translateTrend(ctlDeltaPct: number, ctl: number): TrendTranslation {
  const absDelta = Math.abs(ctlDeltaPct);
  const deltaStr = `${absDelta < 1 ? '<1' : Math.round(absDelta)}%`;

  if (ctlDeltaPct > 8) {
    return {
      direction: 'building',
      label: 'Building',
      color: 'teal',
      subtitle: `Fitness up ${deltaStr} over 4 weeks`,
    };
  }
  if (ctlDeltaPct > 2) {
    return {
      direction: 'maintaining',
      label: 'Maintaining',
      color: 'gold',
      subtitle: `Fitness steady — up ${deltaStr}`,
    };
  }
  if (ctlDeltaPct >= -2) {
    return {
      direction: 'maintaining',
      label: 'Maintaining',
      color: 'gold',
      subtitle: 'Fitness holding steady',
    };
  }
  return {
    direction: 'recovering',
    label: 'Recovering',
    color: 'orange',
    subtitle: `Fitness down ${deltaStr} — absorbing load`,
  };
}

/** TSS (Last Ride) — single ride training stress */
export function translateTSS(tss: number): MetricTranslation {
  if (tss > 200) return { label: 'Epic — rest incoming', color: 'coral' };
  if (tss > 150) return { label: 'Big day', color: 'orange' };
  if (tss > 100) return { label: 'Solid effort', color: 'orange' };
  if (tss > 50) return { label: 'Productive ride', color: 'teal' };
  return { label: 'Easy spin', color: 'teal' };
}

/** Map translation color tokens to CSS variable names */
export function colorToVar(color: MetricTranslation['color']): string {
  const map: Record<string, string> = {
    teal: 'var(--color-teal)',
    orange: 'var(--color-orange)',
    gold: 'var(--color-gold)',
    coral: 'var(--color-coral)',
    muted: 'var(--color-text-muted)',
  };
  return map[color] || 'var(--color-text-muted)';
}
