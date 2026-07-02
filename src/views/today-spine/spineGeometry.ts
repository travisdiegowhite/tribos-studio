/**
 * spineGeometry — pure SVG chart math for the Training-Arc spine.
 *
 * Ported from the design prototype (docs/today-view/Today Spine.dc.html), kept
 * free of React/DOM so it can be unit-tested and so `SpinePanel` stays a thin
 * renderer. The coordinate system is the prototype's exactly — `viewBox
 * "0 0 1144 216"`, past edge at x=40, today at x=700, future end at x=1090 —
 * so the design stays pixel-accurate.
 *
 * The one deliberate generalization: the Y scale is derived from the actual
 * TFI/AFI range rather than the prototype's hard-coded 40→66 CTL window, so a
 * rider whose fitness sits at 20 or 95 still gets a sensibly-framed curve. When
 * the data happens to span ~40→66 the output matches the prototype.
 */

export const SPINE_VIEW = { w: 1144, h: 216 } as const;

// X anchors (SVG units).
const X_LEFT = 40; // 6 weeks ago
const X_TODAY = 700; // today
const X_FUTURE_SPAN = 390; // today → projection end (x=1090)
const PAST_SPAN = 660; // X_TODAY − X_LEFT
const BASELINE_Y = 188;
const Y_TOP = 24;
const Y_BOTTOM = 178;

const EVENT_FLAG_X = 1080;

/** Past-day index (0..pastDays) → x. */
export function xPast(i: number, pastDays: number): number {
  return X_LEFT + PAST_SPAN * (i / pastDays);
}

/** Future step k (1..futureDays) → x. */
export function xFuture(k: number, futureDays: number): number {
  return X_TODAY + X_FUTURE_SPAN * (k / futureDays);
}

/** Day index (past or future) → x. The single source for marker/node placement. */
export function xOfIndex(index: number, todayIndex: number, futureLen: number): number {
  return index <= todayIndex
    ? xPast(index, todayIndex)
    : xFuture(index - todayIndex, Math.max(1, futureLen));
}

/**
 * Inverse of xPast/xFuture over the full domain — maps a pointer's SVG x to the
 * nearest day index (0..todayIndex+futureLen). The past and future halves have
 * different day-widths, so the branch point is X_TODAY, not a single ratio.
 */
export function svgXToIndex(svgX: number, todayIndex: number, futureLen: number): number {
  let idx: number;
  if (svgX <= X_TODAY) {
    idx = Math.round(((svgX - X_LEFT) / PAST_SPAN) * todayIndex);
  } else {
    idx = todayIndex + Math.round(((svgX - X_TODAY) / X_FUTURE_SPAN) * Math.max(1, futureLen));
  }
  return clamp(idx, 0, todayIndex + futureLen);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface YScale {
  yOf: (value: number) => number;
  domainMin: number;
  domainMax: number;
}

/**
 * Build the fitness→y mapping from the observed value range (with a little
 * padding so the curve doesn't touch the frame). Higher fitness → smaller y
 * (higher on screen). Values are clamped to [Y_TOP, Y_BOTTOM].
 */
export function buildYScale(values: number[]): YScale {
  const finite = values.filter((v) => Number.isFinite(v));
  let min = finite.length ? Math.min(...finite) : 40;
  let max = finite.length ? Math.max(...finite) : 66;
  const pad = Math.max(4, (max - min) * 0.15);
  min = Math.floor(min - pad);
  max = Math.ceil(max + pad);
  if (max - min < 1) max = min + 1; // guard flat/degenerate ranges
  const span = max - min;
  const yOf = (value: number) =>
    clamp(Y_BOTTOM - ((value - min) / span) * (Y_BOTTOM - Y_TOP), Y_TOP, Y_BOTTOM);
  return { yOf, domainMin: min, domainMax: max };
}

// ── Bars ─────────────────────────────────────────────────────────────────────

export interface Bar {
  x: number;
  y: number;
  h: number;
  fill: string;
  stroke: string;
  dash: string;
}

const BAR_MAX_H = 72;
const BAR_RSS_FULL = 95; // RSS that maps to the tallest bar

function barHeight(rss: number): number {
  return Math.min(BAR_MAX_H, (rss / BAR_RSS_FULL) * BAR_MAX_H);
}

// ── Chart geometry (static per data set) ─────────────────────────────────────

export interface DayGeom {
  index: number;
  tfi: number;
  afi: number;
  rss: number;
  isFuture: boolean;
  /** Real session (ride done / plan-row workout) vs projection-only fill. */
  planned: boolean;
}

export interface SpineChart {
  scale: YScale;
  pastLine: string;
  pastArea: string;
  futureLine: string;
  bars: Bar[];
  /** Solid dots on hard past efforts. */
  pastDots: Array<{ x: number; y: number }>;
  /** Hollow dots on key planned future sessions. */
  plannedDots: Array<{ x: number; y: number }>;
  peak: { x: number; y: number; labelX: number } | null;
  /** `beyond` = the event falls past the projection window; pinned at the edge. */
  event: { x: number; labelX: number; beyond: boolean; daysOut: number } | null;
}

const HARD_RSS = 72; // past ride gets a solid dot at/above this
const PLANNED_DOT_RSS = 50; // floor for a week's key session to earn a hollow dot

/**
 * Build all static chart geometry. `days` is ascending; `todayIndex` is the
 * last observed day (past span = todayIndex, i.e. 42 for a 43-day history).
 */
export function buildChart(
  days: DayGeom[],
  todayIndex: number,
  event: { date: string } | null,
  dayDates: string[],
): SpineChart {
  const past = days.filter((d) => !d.isFuture);
  const future = days.filter((d) => d.isFuture);
  const pastDays = todayIndex; // span in "day steps"

  const scale = buildYScale(days.map((d) => d.tfi));
  const { yOf } = scale;

  // CTL past line + area.
  const pastLine = past
    .map((d, i) => `${i ? 'L' : 'M'}${xPast(i, pastDays).toFixed(1)},${yOf(d.tfi).toFixed(1)}`)
    .join(' ');
  const pastArea = `${pastLine} L${X_TODAY},${BASELINE_Y} L${X_LEFT},${BASELINE_Y} Z`;

  // CTL future projection (dashed), anchored at today's point.
  const todayTfi = past.length ? past[past.length - 1].tfi : 50;
  const futureLine =
    `M${X_TODAY},${yOf(todayTfi).toFixed(1)} ` +
    future
      .map((d, k) => `L${xFuture(k + 1, future.length || 1).toFixed(1)},${yOf(d.tfi).toFixed(1)}`)
      .join(' ');

  // TSS bars — solid for past, hollow dashed for planned future.
  const bars: Bar[] = [];
  past.forEach((d, i) => {
    if (d.rss > 0) {
      const h = barHeight(d.rss);
      bars.push({
        x: xPast(i, pastDays) - 4,
        y: BASELINE_Y - h,
        h,
        fill: '#e9e6dd',
        stroke: 'none',
        dash: '',
      });
    }
  });
  // Hollow planned bars only for real plan sessions — the no-plan maintenance
  // fill shapes the dashed line but must not masquerade as scheduled workouts.
  future.forEach((d, k) => {
    if (d.planned && d.rss > 0) {
      const h = barHeight(d.rss);
      bars.push({
        x: xFuture(k + 1, future.length || 1) - 4,
        y: BASELINE_Y - h,
        h,
        fill: 'none',
        stroke: '#e0c9a3',
        dash: '2 2',
      });
    }
  });

  const pastDots = past
    .map((d, i) => ({ d, i }))
    .filter((o) => o.d.rss >= HARD_RSS)
    .map((o) => ({ x: xPast(o.i, pastDays), y: yOf(o.d.tfi) }));

  // Hollow dots mark the key session of each planned week (the max-RSS plan-row
  // day per 7-day chunk) — a handful of markers, not one per hard day.
  const plannedDots: Array<{ x: number; y: number }> = [];
  for (let start = 0; start < future.length; start += 7) {
    let bestK = -1;
    let bestRss = 0;
    for (let k = start; k < Math.min(start + 7, future.length); k++) {
      const d = future[k];
      if (d.planned && d.rss > bestRss) {
        bestRss = d.rss;
        bestK = k;
      }
    }
    if (bestK >= 0 && bestRss >= PLANNED_DOT_RSS) {
      plannedDots.push({ x: xFuture(bestK + 1, future.length), y: yOf(future[bestK].tfi) });
    }
  }

  // Peak = highest projected TFI — but only marked when it's a genuine future
  // build (climbing ≥2 TFI and ≥3 days out). A flat/declining rest-week
  // projection would otherwise plant a "PEAK" flag right next to today.
  let peak: SpineChart['peak'] = null;
  if (future.length) {
    let best = future[0];
    let bestK = 1;
    future.forEach((d, k) => {
      if (d.tfi > best.tfi) {
        best = d;
        bestK = k + 1;
      }
    });
    const todayTfi = past.length ? past[past.length - 1].tfi : best.tfi;
    if (best.tfi >= todayTfi + 2 && bestK >= 3) {
      const px = xFuture(bestK, future.length);
      peak = { x: px, y: yOf(best.tfi), labelX: px + 8 };
    }
  }

  // Event flag — map the goal date onto the future axis when it falls inside
  // the projection window; otherwise pin it at the far-right flag position.
  let eventGeom: SpineChart['event'] = null;
  const todayDate = dayDates[todayIndex];
  if (event?.date && todayDate) {
    const evMs = new Date(`${event.date}T00:00:00`).getTime();
    const todayMs = new Date(`${todayDate}T00:00:00`).getTime();
    const daysOut = Math.round((evMs - todayMs) / 86_400_000);
    const inWindow = future.length > 0 && daysOut > 0 && daysOut <= future.length;
    const ex = inWindow ? xFuture(daysOut, future.length) : EVENT_FLAG_X;
    eventGeom = { x: ex, labelX: ex + 4, beyond: !inWindow, daysOut };
  }

  return { scale, pastLine, pastArea, futureLine, bars, pastDots, plannedDots, peak, event: eventGeom };
}

// ── Per-selection geometry ───────────────────────────────────────────────────

export interface SelectionGeom {
  selX: number;
  selY: number;
  bandX: number;
  labelX: number;
  labelTX: number;
  barShow: boolean;
  barX: number;
  barY: number;
  barH: number;
  nodeLeftPct: string;
}

const LABEL_W = 88;

/** Geometry for the selected-day marker, band, date flag and node position. */
export function selectionGeometry(
  selectedIndex: number,
  day: { tfi: number; rss: number },
  todayIndex: number,
  scale: YScale,
  futureLen = 0,
): SelectionGeom {
  const selX = xOfIndex(selectedIndex, todayIndex, futureLen);
  const selY = scale.yOf(day.tfi);
  const labelX = clamp(selX - LABEL_W / 2, X_LEFT / 2 + 12, SPINE_VIEW.w - LABEL_W - 4);
  const barH = barHeight(day.rss);
  return {
    selX,
    selY,
    bandX: selX - 7,
    labelX,
    labelTX: labelX + LABEL_W / 2,
    barShow: day.rss > 0,
    barX: selX - 4,
    barY: BASELINE_Y - barH,
    barH,
    nodeLeftPct: `${((selX / SPINE_VIEW.w) * 100).toFixed(2)}%`,
  };
}

// ── Sparklines (node BACK) ───────────────────────────────────────────────────

/**
 * Point string for a mini sparkline in a 130×32 viewBox, auto-scaled to the
 * series' own min/max so direction and magnitude read even over a tiny range.
 */
export function sparklinePoints(values: number[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `2,16 128,16`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const topPad = 4;
  const bottom = 28;
  return values
    .map((v, k) => {
      const x = 2 + (k / (values.length - 1)) * 126;
      const y = bottom - ((v - min) / span) * (bottom - topPad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Readiness ring stroke-dasharray for the 54px donut (r=25 → C≈157.08). */
export const RING_CIRCUMFERENCE = 2 * Math.PI * 25;
export function ringDash(readiness: number): string {
  const filled = (clamp(readiness, 0, 100) / 100) * RING_CIRCUMFERENCE;
  return `${filled.toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`;
}
