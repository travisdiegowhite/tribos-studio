import { describe, it, expect } from 'vitest';
import {
  handleShowVisual,
  normalizeDateRange,
  normalizeRangeKm,
  MAX_VISUALS_PER_REPLY,
} from './showVisualTool.js';

/**
 * Minimal chainable stand-in for the service-role client. Each table holds
 * rows; eq/gte/lte/ilike/not filter them, so a wrong user_id really returns
 * nothing — which is the behaviour under test.
 */
function fakeSupabase(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const q = {
        select: () => q,
        eq: (col, val) => ((rows = rows.filter((r) => r[col] === val)), q),
        gte: (col, val) => ((rows = rows.filter((r) => String(r[col]) >= String(val))), q),
        lte: (col, val) => ((rows = rows.filter((r) => String(r[col]) <= String(val))), q),
        ilike: (col, pat) => {
          const needle = pat.replaceAll('%', '').toLowerCase();
          rows = rows.filter((r) => String(r[col] || '').toLowerCase().includes(needle));
          return q;
        },
        not: (col) => ((rows = rows.filter((r) => r[col] != null)), q),
        or: () => q,
        is: () => q,
        order: () => q,
        limit: (n) => ((rows = rows.slice(0, n)), q),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return q;
    },
  };
}

// ~0.111 km per 0.001° of latitude: a straight 10-point track north, ~1 km.
const coords = Array.from({ length: 11 }, (_, i) => [-105, 40 + i * 0.001]);
const ride = {
  id: 'act-1',
  user_id: 'u1',
  name: 'Saturday loop',
  start_date: '2026-11-15T09:00:00Z',
  distance: 1112,
  power_curve_summary: { '5s': 900, '60s': 450, '300s': 320, '1200s': 280 },
  activity_streams: {
    coords,
    power: [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300],
    heartRate: Array(11).fill(150),
    speed: Array(11).fill(8),
    elevation: [1600, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610],
  },
};

const db = () =>
  fakeSupabase({
    activities: [ride, { ...ride, id: 'act-2', user_id: 'someone-else' }],
    routes: [{ id: 'r1', user_id: 'u1', name: 'Lefthand Canyon', distance_km: 42 }],
    training_load_daily: [
      { user_id: 'u1', date: '2026-10-01', tfi: 60, afi: 55, form_score: 5 },
      { user_id: 'u1', date: '2026-11-01', tfi: 70, afi: 80, form_score: -10 },
    ],
  });

const freshState = () => ({ visuals: [], todayStr: '2026-11-19' });

describe('normalizeDateRange', () => {
  it('rejects malformed dates', () => {
    expect(normalizeDateRange('Nov 1', '2026-11-10', '2026-11-19')).toMatch(/YYYY-MM-DD/);
  });
  it('swaps a reversed range and clamps the end to today', () => {
    expect(normalizeDateRange('2026-12-31', '2026-11-01', '2026-11-19')).toEqual({ from: '2026-11-01', to: '2026-11-19' });
  });
  it('refuses a range entirely in the future', () => {
    expect(normalizeDateRange('2026-12-01', '2026-12-10', '2026-11-19')).toMatch(/future/);
  });
  it('caps very long ranges', () => {
    const r = normalizeDateRange('2020-01-01', '2026-11-19', '2026-11-19');
    expect(r.to).toBe('2026-11-19');
    expect(r.from > '2025-01-01').toBe(true);
  });
});

describe('normalizeRangeKm', () => {
  it('passes null through (no range)', () => {
    expect(normalizeRangeKm(null, 10)).toBeNull();
  });
  it('orders, clamps to the total and rounds', () => {
    expect(normalizeRangeKm([12.34, 3.21], 10)).toEqual([3.2, 10]);
  });
  it('rejects a range that starts past the end', () => {
    expect(normalizeRangeKm([11, 12], 10)).toMatch(/past the end/);
  });
  it('rejects a degenerate range', () => {
    expect(normalizeRangeKm([2, 2.05], 10)).toMatch(/at least/);
  });
});

describe('handleShowVisual', () => {
  it('rejects an unknown kind', async () => {
    const r = await handleShowVisual(db(), 'u1', { kind: 'pie_chart' }, freshState());
    expect(r.success).toBe(false);
  });

  it("refuses another athlete's activity", async () => {
    const state = freshState();
    const r = await handleShowVisual(db(), 'u1', { kind: 'ride_streams', activity_id: 'act-2' }, state);
    expect(r.success).toBe(false);
    expect(state.visuals).toHaveLength(0);
  });

  it('accepts a ride with a marked stretch and summarises that stretch', async () => {
    const state = freshState();
    const r = await handleShowVisual(
      db(),
      'u1',
      { kind: 'ride_streams', activity_id: 'act-1', range_km: [0.3, 0.8], caption: 'the drag' },
      state,
    );
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/marked 0.3–0.8 km/);
    expect(r.summary).toMatch(/avg \d+ W/);
    expect(state.visuals).toEqual([
      { kind: 'ride_streams', activity_id: 'act-1', range_km: [0.3, 0.8], caption: 'the drag' },
    ]);
  });

  it('builds a period power curve from the best of each duration', async () => {
    const state = freshState();
    const r = await handleShowVisual(db(), 'u1', { kind: 'power_curve', from: '2026-11-01', to: '2026-11-19' }, state);
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/20 min 280 W/);
    expect(state.visuals[0]).toMatchObject({ kind: 'power_curve', from: '2026-11-01', to: '2026-11-19' });
  });

  it('summarises a fitness range', async () => {
    const state = freshState();
    const r = await handleShowVisual(db(), 'u1', { kind: 'fitness_load', from: '2026-09-01', to: '2026-11-19' }, state);
    expect(r.summary).toMatch(/TFI 60 → 70/);
  });

  it('finds a saved route by name', async () => {
    const state = freshState();
    const r = await handleShowVisual(db(), 'u1', { kind: 'route_preview', route_name: 'lefthand' }, state);
    expect(r.success).toBe(true);
    expect(state.visuals[0]).toMatchObject({ kind: 'route_preview', route_id: 'r1' });
  });

  it('stops at the per-reply limit', async () => {
    const state = freshState();
    for (let i = 0; i < MAX_VISUALS_PER_REPLY; i += 1) {
      await handleShowVisual(db(), 'u1', { kind: 'power_curve', activity_id: 'act-1' }, state);
    }
    const r = await handleShowVisual(db(), 'u1', { kind: 'power_curve', activity_id: 'act-1' }, state);
    expect(r.success).toBe(false);
    expect(state.visuals).toHaveLength(MAX_VISUALS_PER_REPLY);
  });
});
