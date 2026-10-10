import { describe, it, expect } from 'vitest';
import { computeSeason } from './engine';
import {
  DEFAULT_SEASON_WEEKS,
  defaultSeasonStart,
  layoutFlags,
  monthMarks,
  pickNotes,
  seasonEndDate,
  seasonHoursSeries,
  shortRaceName,
  smoothPath,
  toSeasonRaces,
  todayWeekIndex,
} from './view';

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

  it('defaults the season to 8 weeks before this Monday, 60 weeks long', () => {
    expect(defaultSeasonStart('2026-10-09')).toBe('2026-08-10');
    expect(DEFAULT_SEASON_WEEKS).toBe(60);
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

describe('season profile', () => {
  // 8 weeks back + 52 ahead around Fri 2026-10-09; today is week 8.
  const rows = [
    { id: 'rbx', name: 'Boulder Roubaix', race_date: '2027-04-25', priority: 'A', race_type: 'road_race', goal_time_minutes: 180 },
    { id: 'bwr', name: 'BWR San Diego', race_date: '2027-05-02', priority: 'A', race_type: 'gravel', distance_km: 113, elevation_gain_m: 762 },
    { id: 'bb', name: 'Bolder Boulder 10K', race_date: '2027-05-31', priority: 'B', race_type: 'run_10k' },
    { id: 'vibes', name: 'Summer Vibes', race_date: '2027-06-19', priority: 'A', race_type: 'gravel', distance_km: 56, goal_time_minutes: 100 },
    { id: 'vrun', name: 'Summer Vibe Run', race_date: '2027-06-19', priority: 'B', race_type: 'run_10k' },
    { id: 'rad', name: 'The Rad', race_date: '2027-09-25', priority: 'A', race_type: 'gravel', goal_time_minutes: 390 },
  ];
  const plan = computeSeason({
    startDate: defaultSeasonStart('2026-10-09'),
    weeks: DEFAULT_SEASON_WEEKS,
    races: toSeasonRaces(rows),
    typicalWeeklyHours: 8,
  });
  const today = todayWeekIndex(plan, '2026-10-09');

  it('puts today 8 weeks in', () => {
    expect(today).toBe(8);
  });

  it('uses ridden hours for finished weeks and the plan from this week on', () => {
    const ridden = { '2026-08-10': 9.5, '2026-09-28': 6, '2026-10-05': 99 };
    const series = seasonHoursSeries(plan, ridden, today);
    expect(series[0]).toBe(9.5);
    expect(series[7]).toBe(6);
    expect(series[8]).toBe(plan.schedule[8].targetHours); // this week: plan, not the partial week
    expect(series[1]).toBe(plan.schedule[1].targetHours); // missing ridden week falls back
    expect(series).toHaveLength(60);
  });

  it('draws a smooth path through every point', () => {
    expect(smoothPath([])).toBe('');
    const d = smoothPath([[0, 10], [10, 0], [20, 10]]);
    expect(d.startsWith('M0.0,10.0')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d.endsWith('20.0,10.0')).toBe(true);
  });

  it('groups same-week races on one flag led by the higher priority', () => {
    const flags = layoutFlags(plan, (w) => w * 20, 1200);
    const vibes = flags.find((f) => f.lead.id === 'vibes');
    expect(vibes?.races.map((r) => r.id)).toEqual(['vibes', 'vrun']);
    expect(vibes?.label).toBe('Summer Vibes +1');
  });

  it('staggers overlapping labels and flips them at the right edge', () => {
    const flags = layoutFlags(plan, (w) => w * 20, 1200);
    const rbx = flags.find((f) => f.lead.id === 'rbx')!;
    const bwr = flags.find((f) => f.lead.id === 'bwr')!;
    expect(rbx.level).not.toBe(bwr.level); // one week apart: labels would collide
    const rad = flags.find((f) => f.lead.id === 'rad')!;
    expect(rad.flip).toBe(true);
    expect(flags.find((f) => f.lead.id === 'bb')!.conflict).toBe(true);
  });

  it('picks at most three notes: the conflict, the springboard, the recovery valley', () => {
    const notes = pickNotes(plan, today);
    expect(notes.map((n) => n.kind)).toEqual(['conflict', 'springboard', 'recover']);
    expect(notes[0]).toMatchObject({ text: '10K lands in the taper!', raceId: 'bb' });
    expect(notes[1].raceId).toBe('rbx');
    // BWR (the block's last race) recovers 2 weeks: the note sits in the middle of that valley.
    const bwrWeek = plan.races.find((r) => r.id === 'bwr')!.week as number;
    expect(notes[2]).toMatchObject({ text: '2 wk easy', week: bwrWeek + 1.5 });
  });

  it('shortens race names for notes', () => {
    expect(shortRaceName('Bolder Boulder 10K')).toBe('10K');
    expect(shortRaceName('Tuesday Crit')).toBe('Tuesday Crit');
    expect(shortRaceName('Old Man Winter Rally')).toBe('Old Man');
  });
});
