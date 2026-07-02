import { describe, it, expect } from 'vitest';
import {
  xPast,
  xFuture,
  clamp,
  buildYScale,
  buildChart,
  selectionGeometry,
  sparklinePoints,
  ringDash,
  RING_CIRCUMFERENCE,
  SPINE_VIEW,
  svgXToIndex,
  xOfIndex,
  type DayGeom,
} from './spineGeometry';

describe('spineGeometry x mapping', () => {
  it('anchors the past axis at x=40 (6wk ago) and x=700 (today)', () => {
    expect(xPast(0, 42)).toBe(40);
    expect(xPast(42, 42)).toBe(700);
    expect(xPast(21, 42)).toBeCloseTo(370, 5); // midpoint
  });

  it('anchors the future axis from today (700) to the projection end (1090)', () => {
    expect(xFuture(21, 21)).toBeCloseTo(1090, 5);
    expect(xFuture(1, 21)).toBeGreaterThan(700);
  });
});

describe('buildYScale', () => {
  it('maps higher fitness to a smaller y and clamps into the frame', () => {
    const s = buildYScale([40, 50, 66]);
    expect(s.yOf(66)).toBeLessThan(s.yOf(40)); // higher on screen
    expect(s.yOf(s.domainMax)).toBeGreaterThanOrEqual(24);
    expect(s.yOf(s.domainMin)).toBeLessThanOrEqual(178);
  });

  it('pads the domain around the observed range', () => {
    const s = buildYScale([50, 50, 50]);
    expect(s.domainMin).toBeLessThan(50);
    expect(s.domainMax).toBeGreaterThan(50);
  });

  it('does not divide by zero on a flat series', () => {
    const s = buildYScale([]);
    expect(Number.isFinite(s.yOf(50))).toBe(true);
  });
});

function makeDays(): DayGeom[] {
  const days: DayGeom[] = [];
  for (let i = 0; i <= 42; i++) {
    const rss = i % 7 === 1 ? 0 : 60;
    days.push({ index: i, tfi: 44 + (i / 42) * 18, afi: 45, rss, isFuture: false, planned: rss > 0 });
  }
  for (let k = 0; k < 21; k++) {
    const rss = k < 11 ? 90 : 20;
    days.push({ index: 43 + k, tfi: 62 + k * 0.2, afi: 55, rss, isFuture: true, planned: true });
  }
  return days;
}

describe('buildChart', () => {
  const dates = makeDays().map((_, i) => {
    const d = new Date(Date.UTC(2026, 5, 30));
    d.setUTCDate(d.getUTCDate() + (i - 42));
    return d.toISOString().slice(0, 10);
  });

  it('builds a past line, closed area, and dashed future line', () => {
    const chart = buildChart(makeDays(), 42, null, dates);
    expect(chart.pastLine.startsWith('M40')).toBe(true);
    expect(chart.pastArea.endsWith('Z')).toBe(true);
    expect(chart.futureLine.startsWith('M700')).toBe(true);
  });

  it('emits solid past bars and hollow dashed future bars', () => {
    const chart = buildChart(makeDays(), 42, null, dates);
    expect(chart.bars.some((b) => b.fill === '#e9e6dd')).toBe(true);
    expect(chart.bars.some((b) => b.stroke === '#e0c9a3' && b.dash === '2 2')).toBe(true);
  });

  it('finds a peak inside the projection window', () => {
    const chart = buildChart(makeDays(), 42, null, dates);
    expect(chart.peak).not.toBeNull();
    expect(chart.peak!.x).toBeGreaterThan(700);
  });

  it('places the event flag on the future axis when the date is in range', () => {
    const eventDate = dates[42 + 7]; // 7 days out
    const chart = buildChart(makeDays(), 42, { date: eventDate }, dates);
    expect(chart.event).not.toBeNull();
    expect(chart.event!.beyond).toBe(false);
    expect(chart.event!.x).toBeGreaterThan(700);
    expect(chart.event!.x).toBeLessThan(1090);
  });

  it('marks an event past the projection window as beyond, pinned at the edge', () => {
    const d = new Date(Date.UTC(2026, 5, 30));
    d.setUTCDate(d.getUTCDate() + 40); // 40 days out, but only 21 future days here
    const chart = buildChart(makeDays(), 42, { date: d.toISOString().slice(0, 10) }, dates);
    expect(chart.event!.beyond).toBe(true);
    expect(chart.event!.daysOut).toBe(40);
  });

  it('suppresses the peak when the projection is flat or declining', () => {
    const flat = makeDays().map((d) => (d.isFuture ? { ...d, tfi: 60 } : d)); // below today (62)
    const chart = buildChart(flat, 42, null, dates);
    expect(chart.peak).toBeNull();
  });

  it('draws future bars only for planned sessions, not projection fill', () => {
    const noPlan = makeDays().map((d) => (d.isFuture ? { ...d, planned: false } : d));
    const chart = buildChart(noPlan, 42, null, dates);
    expect(chart.bars.some((b) => b.stroke === '#e0c9a3')).toBe(false); // no hollow bars
    expect(chart.futureLine.length).toBeGreaterThan(0); // dashed line still drawn
  });

  it('marks at most one key-session dot per planned week', () => {
    const chart = buildChart(makeDays(), 42, null, dates);
    // 21 future days = 3 week-chunks; weeks whose max RSS is only 20 get no dot.
    expect(chart.plannedDots.length).toBeLessThanOrEqual(3);
    expect(chart.plannedDots.length).toBeGreaterThan(0);
  });
});

describe('selectionGeometry', () => {
  it('positions the node over the selected past day and clamps the date flag', () => {
    const chart = buildChart(makeDays(), 42, null, []);
    const sel = selectionGeometry(0, { tfi: 44, rss: 60 }, 42, chart.scale);
    expect(sel.selX).toBe(40);
    expect(sel.labelX).toBeGreaterThanOrEqual(0);
    expect(sel.nodeLeftPct.endsWith('%')).toBe(true);
    expect(sel.barShow).toBe(true);
  });

  it('hides the highlight bar on a rest day', () => {
    const chart = buildChart(makeDays(), 42, null, []);
    const sel = selectionGeometry(1, { tfi: 45, rss: 0 }, 42, chart.scale);
    expect(sel.barShow).toBe(false);
  });

  it('keeps the date flag inside the viewBox at the right edge', () => {
    const chart = buildChart(makeDays(), 42, null, []);
    const sel = selectionGeometry(42, { tfi: 62, rss: 60 }, 42, chart.scale);
    expect(sel.labelX + 88).toBeLessThanOrEqual(SPINE_VIEW.w);
  });
});

describe('sparklinePoints', () => {
  it('returns one point per value scaled into the 130x32 box', () => {
    const pts = sparklinePoints([10, 20, 30]).split(' ');
    expect(pts).toHaveLength(3);
    expect(pts[0]).toBe('2.0,28.0'); // min → bottom
  });

  it('handles empty and single-value series', () => {
    expect(sparklinePoints([])).toBe('');
    expect(sparklinePoints([5])).toContain('2,16');
  });
});

describe('ringDash', () => {
  it('fills proportionally to readiness and never exceeds the circumference', () => {
    expect(ringDash(0).startsWith('0.0')).toBe(true);
    const full = ringDash(100);
    expect(parseFloat(full.split(' ')[0])).toBeCloseTo(RING_CIRCUMFERENCE, 1);
    expect(clamp(200, 0, 100)).toBe(100);
  });
});

describe('svgXToIndex (pointer → day index over the full domain)', () => {
  const TODAY = 42;
  const FUTURE = 21;

  it('round-trips xPast for every past index', () => {
    for (let i = 0; i <= TODAY; i++) {
      expect(svgXToIndex(xPast(i, TODAY), TODAY, FUTURE)).toBe(i);
    }
  });

  it('round-trips xFuture for every future step', () => {
    for (let k = 1; k <= FUTURE; k++) {
      expect(svgXToIndex(xFuture(k, FUTURE), TODAY, FUTURE)).toBe(TODAY + k);
    }
  });

  it('maps the boundary at today (x=700) to the today index', () => {
    expect(svgXToIndex(700, TODAY, FUTURE)).toBe(TODAY);
  });

  it('clamps outside the chart on both sides', () => {
    expect(svgXToIndex(-100, TODAY, FUTURE)).toBe(0);
    expect(svgXToIndex(4000, TODAY, FUTURE)).toBe(TODAY + FUTURE);
  });

  it('xOfIndex matches xPast/xFuture on each half', () => {
    expect(xOfIndex(10, TODAY, FUTURE)).toBe(xPast(10, TODAY));
    expect(xOfIndex(TODAY + 5, TODAY, FUTURE)).toBe(xFuture(5, FUTURE));
  });
});

describe('selectionGeometry future placement', () => {
  it('places a future index on the future axis, not extrapolated past x=700', () => {
    const scale = buildYScale([40, 66]);
    const sel = selectionGeometry(52, { tfi: 55, rss: 60 }, 42, scale, 21);
    expect(sel.selX).toBeCloseTo(xFuture(10, 21), 5);
    expect(sel.selX).toBeGreaterThan(700);
    expect(sel.selX).toBeLessThanOrEqual(1090);
  });
});
