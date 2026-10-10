import { describe, it, expect } from 'vitest';
import { computeSeason } from './engine';
import { defaultSeasonStart, monthMarks, seasonEndDate, toSeasonRaces, todayWeekIndex } from './view';

describe('toSeasonRaces', () => {
  it('maps race_goals rows to engine input with a profile and focus', () => {
    const [r] = toSeasonRaces([
      { id: 'x', name: ' Marathon ', race_date: '2027-04-18', priority: 'A', race_type: 'marathon', is_focus: true },
    ]);
    expect(r).toMatchObject({ id: 'x', name: 'Marathon', date: '2027-04-18', sport: 'run', focus: true });
    expect(r.profile?.band).toBe('ultra');
  });

  it('drops cancelled and DNS races, keeps the rest', () => {
    const rows = ['upcoming', 'completed', 'cancelled', 'dns', null].map((status, i) => ({
      id: String(i),
      name: 'R',
      race_date: '2027-01-01',
      priority: 'B',
      status,
    }));
    expect(toSeasonRaces(rows).map((r) => r.id)).toEqual(['0', '1', '4']);
  });

  it('names an unnamed race', () => {
    expect(toSeasonRaces([{ id: 'x', name: null, race_date: '2027-01-01', priority: 'C' }])[0].name).toBe('Race');
  });
});

describe('season layout', () => {
  const plan = computeSeason({ startDate: '2026-10-05', races: [], typicalWeeklyHours: 6 });

  it('defaults the season to start this Monday', () => {
    expect(defaultSeasonStart('2026-10-09')).toBe('2026-10-05');
  });

  it('computes the last day of the season', () => {
    expect(seasonEndDate('2026-10-05', 52)).toBe('2027-10-03');
  });

  it('finds the today week, or null outside the season', () => {
    expect(todayWeekIndex(plan, '2026-10-09')).toBe(0);
    expect(todayWeekIndex(plan, '2026-12-25')).toBe(11);
    expect(todayWeekIndex(plan, '2026-10-04')).toBeNull();
    expect(todayWeekIndex(plan, '2027-10-04')).toBeNull();
  });

  it('labels each month once, at its first Monday', () => {
    const marks = monthMarks(plan);
    expect(marks[0]).toEqual({ week: 0, label: 'Oct' });
    expect(marks[1]).toEqual({ week: 4, label: 'Nov' }); // Mon Nov 2
    expect(marks.map((m) => m.label)).toEqual([
      'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
    ]);
  });
});
