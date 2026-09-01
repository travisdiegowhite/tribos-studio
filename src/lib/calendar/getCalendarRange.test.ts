import { describe, it, expect } from 'vitest';
import {
  assembleCalendarRange,
  eachDateKey,
  type CalendarActivityRow,
  type CalendarEntryRow,
} from './getCalendarRange';

function entry(over: Partial<CalendarEntryRow> & { id: string; date: string }): CalendarEntryRow {
  return {
    user_id: 'u1', slot: 0, type: 'workout', title: 'Endurance Ride',
    workout_id: null, workout_type: 'endurance',
    target_load: 70, target_duration_min: 84, target_distance_km: null,
    actual_load: null, actual_duration_min: null, actual_distance_km: null,
    status: 'planned', completed_at: null, skipped_reason: null, activity_id: null,
    notes: null, coach_rationale: null, details: null, provenance: null,
    source: 'arc', plan_id: 'p1', generation_id: null, pinned: false,
    ...over,
  } as CalendarEntryRow;
}

const ride = (over: Partial<CalendarActivityRow> & { id: string }): CalendarActivityRow => ({
  start_date: '2026-08-19T22:51:48Z', name: 'Erie Road Cycling', rss: 71, ...over,
});

describe('eachDateKey', () => {
  it('is inclusive at both ends', () => {
    expect(eachDateKey('2026-08-17', '2026-08-23')).toHaveLength(7);
    expect(eachDateKey('2026-08-17', '2026-08-17')).toEqual(['2026-08-17']);
  });

  it('does not gain or lose a day across a DST transition', () => {
    // US DST ends 2026-11-01. Local-time day stepping drops or repeats an hour
    // here and can yield 6 or 8 keys.
    expect(eachDateKey('2026-10-26', '2026-11-01')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
      '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(eachDateKey('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ]);
  });

  it('returns nothing for an inverted or junk range', () => {
    expect(eachDateKey('2026-08-23', '2026-08-17')).toEqual([]);
    expect(eachDateKey('', '2026-08-17')).toEqual([]);
    expect(eachDateKey('nope', 'also-nope')).toEqual([]);
  });
});

describe('assembleCalendarRange', () => {
  it('buckets entries by day and includes empty days', () => {
    const r = assembleCalendarRange('2026-08-17', '2026-08-23', [
      entry({ id: 'a', date: '2026-08-19' }),
      entry({ id: 'b', date: '2026-08-21' }),
    ], []);

    expect(r.days).toHaveLength(7);
    expect(r.byDate.get('2026-08-19')!.entries.map((e) => e.id)).toEqual(['a']);
    expect(r.byDate.get('2026-08-18')!.entries).toEqual([]);
  });

  it('orders by date then slot, so a race leads its day', () => {
    const r = assembleCalendarRange('2026-09-26', '2026-09-26', [
      entry({ id: 'shakeout', date: '2026-09-26', slot: 1 }),
      entry({ id: 'the-rad', date: '2026-09-26', slot: 0, type: 'race', title: 'The Rad' }),
    ], []);

    expect(r.entries.map((e) => e.id)).toEqual(['the-rad', 'shakeout']);
    expect(r.byDate.get('2026-09-26')!.entries[0].type).toBe('race');
  });

  it('interleaves races and workouts across days in date order', () => {
    const r = assembleCalendarRange('2026-08-17', '2026-08-20', [
      entry({ id: 'w2', date: '2026-08-20' }),
      entry({ id: 'race', date: '2026-08-18', type: 'race', title: 'Local Crit' }),
      entry({ id: 'w1', date: '2026-08-17' }),
    ], []);
    expect(r.entries.map((e) => e.id)).toEqual(['w1', 'race', 'w2']);
  });

  it('attaches the linked activity to its entry', () => {
    const r = assembleCalendarRange('2026-08-19', '2026-08-19', [
      entry({ id: 'a', date: '2026-08-19', activity_id: 'act1', status: 'done' }),
    ], [ride({ id: 'act1' })]);

    expect(r.entries[0].activity?.id).toBe('act1');
    expect(r.byDate.get('2026-08-19')!.unplannedActivities).toEqual([]);
  });

  it('reports an unclaimed ride as unplanned on its LOCAL day', () => {
    // 02:30Z on the 20th is 20:30 local on the 19th. It must land on the 19th,
    // the same day its scheduled_date would have used.
    const r = assembleCalendarRange('2026-08-17', '2026-08-23', [], [
      ride({ id: 'act9', start_date: '2026-08-20T02:30:00Z', start_date_local: '2026-08-19T20:30:00Z' }),
    ]);

    expect(r.byDate.get('2026-08-19')!.unplannedActivities.map((a) => a.id)).toEqual(['act9']);
    expect(r.byDate.get('2026-08-20')!.unplannedActivities).toEqual([]);
  });

  it('never double-counts a ride as both linked and unplanned', () => {
    const r = assembleCalendarRange('2026-08-19', '2026-08-19', [
      entry({ id: 'a', date: '2026-08-19', activity_id: 'act1' }),
    ], [ride({ id: 'act1', start_date_local: '2026-08-19T08:00:00Z' })]);

    const unplanned = r.days.flatMap((d) => d.unplannedActivities);
    expect(unplanned).toEqual([]);
    expect(r.entries[0].activity?.id).toBe('act1');
  });

  it('drops rows outside the requested range rather than inventing days', () => {
    const r = assembleCalendarRange('2026-08-17', '2026-08-19', [
      entry({ id: 'inside', date: '2026-08-18' }),
      entry({ id: 'outside', date: '2026-09-01' }),
    ], []);

    expect(r.days).toHaveLength(3);
    expect(r.days.flatMap((d) => d.entries).map((e) => e.id)).toEqual(['inside']);
    // still reported in the flat list — the caller asked for the rows it got
    expect(r.entries).toHaveLength(2);
  });

  it('survives an entry whose activity_id points at nothing', () => {
    const r = assembleCalendarRange('2026-08-19', '2026-08-19', [
      entry({ id: 'a', date: '2026-08-19', activity_id: 'missing' }),
    ], []);
    expect(r.entries[0].activity).toBeNull();
  });

  it('handles empty input', () => {
    const r = assembleCalendarRange('2026-08-17', '2026-08-23', [], []);
    expect(r.entries).toEqual([]);
    expect(r.days).toHaveLength(7);
    expect(r.days.every((d) => d.entries.length === 0)).toBe(true);
  });
});
