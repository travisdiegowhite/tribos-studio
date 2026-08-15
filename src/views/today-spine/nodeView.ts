/**
 * nodeView — pure display logic for the fitness node (Zone 01), ported from the
 * prototype's renderVals(). Turns the selected `DayNode` (+ neighbours for the
 * deltas/sparklines) into ready-to-render strings and colors. No React.
 */

import { C } from './tokens';
import { sparklinePoints } from './spineGeometry';
import { formStateText, formPhrase } from '../../utils/todayVocabulary';
import { formBandForScore } from '../../utils/formBands';
import type { DayActivity, DayNode } from './types';

export interface NodeVM {
  headerLabel: string;
  headerDate: string;
  isToday: boolean;
  isFuture: boolean;
  activity: DayActivity;
  fs: number;
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

  // Copy comes from the shared vocabulary (src/utils/todayVocabulary.ts);
  // colors stay in the spine's locked token palette, keyed by the same
  // spec §5 band so text and color can never disagree. Future days read as a
  // conditional sentence, not a bare projected state — the rider never has to
  // decode that a number is hypothetical.
  const bandColors: Record<string, string> = {
    transition: C.orange,
    fresh: C.gold,
    grey: C.text3,
    optimal: C.teal,
    overreached: C.coral,
  };
  const band = formBandForScore(d.fs);
  const stateText = isFuture ? `On this path, you'd be ${formPhrase(d.fs)}` : formStateText(d.fs);
  const stateColor = band ? bandColors[band.key] : C.text3;

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

  const headerPrefix = isToday ? 'TODAY · ' : isFuture ? 'PLANNED · ' : '';
  return {
    headerLabel: `01 · ${headerPrefix}${d.dateLabel}`,
    headerDate: `${headerPrefix}${d.dateLabel}`,
    isToday,
    isFuture,
    activity: d.activity,
    fs: d.fs,
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
  };
}
