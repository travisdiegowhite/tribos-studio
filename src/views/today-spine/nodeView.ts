/**
 * nodeView — pure display logic for the fitness node (Zone 01), ported from the
 * prototype's renderVals(). Turns the selected `DayNode` (+ neighbours for the
 * deltas/sparklines) into ready-to-render strings and colors. No React.
 *
 * Readiness reasoning is trimmed to the two rows we can actually source (see the
 * plan): Yesterday's load and the 7-day fitness ramp. Sleep/HRV are omitted
 * until a wearable feed exists.
 */

import { C } from './tokens';
import { sparklinePoints } from './spineGeometry';
import type { DayActivity, DayNode } from './types';

const TEAL_LIFTED = '#3BA89D';
const CORAL_LIFTED = '#D45035';

export interface ReasonRow {
  k: string;
  v: string;
  c: string;
}

export interface NodeVM {
  headerLabel: string;
  headerDate: string;
  isToday: boolean;
  isFuture: boolean;
  activity: DayActivity;
  fs: number;
  readiness: number;
  ringColor: string;
  arrowChar: string;
  arrowColor: string;
  stateText: string;
  stateColor: string;
  ctl: number;
  atl: number;
  volLabel: string;
  ctlDelta: string;
  ctlDeltaColor: string;
  atlDelta: string;
  atlDeltaColor: string;
  ctlSpark: string;
  atlSpark: string;
  reasons: ReasonRow[];
}

/**
 * % TFI change over the trailing 28 days (vs 27 days back) — the same window
 * the glance's getAthleteState feeds to /api/fitness-summary as ctlDeltaPct.
 */
export function ctlDeltaPctFromDays(days: Array<{ tfi: number }>, todayIndex: number): number {
  const today = days[todayIndex]?.tfi;
  const base = days[Math.max(0, todayIndex - 27)]?.tfi;
  if (!Number.isFinite(today) || !Number.isFinite(base) || base <= 0) return 0;
  return ((today - base) / base) * 100;
}

export function buildNodeVM(days: DayNode[], i: number, todayIndex: number): NodeVM {
  const d = days[i];
  const isToday = i === todayIndex;
  const isFuture = i > todayIndex;

  const arrowChar = d.fs > 3 ? '▲' : d.fs < -3 ? '▼' : '—';
  const arrowColor = d.fs > 3 ? C.teal : d.fs < -3 ? C.coral : C.gold;

  // Spec §5 form bands — keep cuts in lockstep with src/utils/formBands.js.
  let stateText: string;
  let stateColor: string;
  if (d.fs > 20) {
    stateText = 'TOO FRESH · transition';
    stateColor = C.orange;
  } else if (d.fs >= 10) {
    stateText = 'FRESH';
    stateColor = C.gold;
  } else if (d.fs >= -5) {
    stateText = 'NEUTRAL · grey zone';
    stateColor = C.text3;
  } else if (d.fs >= -30) {
    stateText = 'LOADING · optimal';
    stateColor = C.teal;
  } else {
    stateText = 'OVERREACHED';
    stateColor = C.coral;
  }
  if (isFuture) stateText = `PROJECTED · ${stateText}`;

  // Ring color follows the same band as the state text — deriving it from the
  // readiness number instead (old ≥70/≥45 cuts) could show an alarm-red ring
  // next to a teal "LOADING · optimal" label. The ring FILL stays
  // readiness-driven; only the color is band-driven.
  const ringColor = stateColor;

  const ctl7 = days[Math.max(0, i - 7)].tfi;
  const atlY = days[Math.max(0, i - 1)].afi;
  const ctlDeltaN = d.tfi - ctl7;
  const atlDeltaN = d.afi - atlY;
  const ctlDelta = (ctlDeltaN >= 0 ? '+' : '') + ctlDeltaN;
  const atlDelta = (atlDeltaN >= 0 ? '+' : '') + atlDeltaN;
  const ctlDeltaColor = ctlDeltaN > 8 ? C.coral : ctlDeltaN >= 0 ? C.teal : C.text3;
  const atlDeltaColor = atlDeltaN > 0 ? C.coral : C.teal;

  // Sparklines: fitness history up to the selected day; fatigue over the last 7.
  const upTo = days.slice(0, i + 1);
  const ctlSpark = sparklinePoints(upTo.map((x) => x.tfi));
  const last7 = days.slice(Math.max(0, i - 6), i + 1);
  const atlSpark = sparklinePoints(last7.map((x) => x.afi));

  // Trimmed readiness reasoning.
  const prevRss = i > 0 ? days[i - 1].rss : 0;
  const prevLabel = prevRss === 0 ? 'Rest day' : prevRss < 45 ? 'Easy' : prevRss < 75 ? 'Moderate' : 'Hard';
  const prevColor = prevRss < 45 ? TEAL_LIFTED : prevRss < 75 ? C.gold : CORAL_LIFTED;
  const rampColor = ctlDeltaN > 8 ? CORAL_LIFTED : ctlDeltaN >= 0 ? TEAL_LIFTED : C.text3;
  const reasons: ReasonRow[] = [
    { k: 'Yesterday', v: prevLabel, c: prevColor },
    { k: '7-day ramp', v: `${ctlDelta} TFI`, c: rampColor },
  ];

  const headerPrefix = isToday ? 'TODAY · ' : isFuture ? 'PLANNED · ' : '';
  return {
    headerLabel: `01 · ${headerPrefix}${d.dateLabel}`,
    headerDate: `${headerPrefix}${d.dateLabel}`,
    isToday,
    isFuture,
    activity: d.activity,
    fs: d.fs,
    readiness: d.readiness,
    ringColor,
    arrowChar,
    arrowColor,
    stateText,
    stateColor,
    ctl: d.tfi,
    atl: d.afi,
    volLabel: `${d.volHours.toFixed(1)}h`,
    ctlDelta,
    ctlDeltaColor,
    atlDelta,
    atlDeltaColor,
    ctlSpark,
    atlSpark,
    reasons,
  };
}
