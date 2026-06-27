import { describe, it, expect } from 'vitest';
import { generateTrainingPlan, applyInterimRaceWaypoints } from './planGenerator.js';

describe('generateTrainingPlan — race-aware sizing', () => {
  it('derives duration_weeks from start → target_event_date (not the input guess)', () => {
    const plan = generateTrainingPlan({
      name: 'Test',
      duration_weeks: 4, // deliberately wrong; should be overridden by the date
      methodology: 'sweet_spot',
      goal: 'racing',
      start_date: '2026-01-05', // Monday
      target_event_date: '2026-03-30', // ~12.1 weeks out
    });
    // ~13 whole weeks inclusive of race week.
    expect(plan.duration_weeks).toBeGreaterThanOrEqual(12);
    expect(plan.duration_weeks).toBeLessThanOrEqual(14);
    // The plan must run up to (at least) the race date.
    expect(plan.end_date >= '2026-03-30').toBe(true);
  });

  it('clamps to 24 weeks for a far event and 4 weeks for a near one', () => {
    const far = generateTrainingPlan({
      name: 'Far', duration_weeks: 8, methodology: 'polarized', goal: 'racing',
      start_date: '2026-01-05', target_event_date: '2027-01-05',
    });
    expect(far.duration_weeks).toBe(24);

    const near = generateTrainingPlan({
      name: 'Near', duration_weeks: 8, methodology: 'polarized', goal: 'racing',
      start_date: '2026-01-05', target_event_date: '2026-01-12',
    });
    expect(near.duration_weeks).toBe(4);
  });

  it('lands a taper on the final week and does not let a recovery week clobber peak', () => {
    const plan = generateTrainingPlan({
      name: 'Periodized', duration_weeks: 99, methodology: 'sweet_spot', goal: 'racing',
      start_date: '2026-01-05', target_event_date: '2026-03-30', // 13 weeks
    });
    const lastWeek = plan.duration_weeks;
    const lastWeekWorkouts = plan.workouts.filter((w) => w.week_number === lastWeek);
    expect(lastWeekWorkouts.every((w) => w.phase === 'taper')).toBe(true);

    // Week 8 of 13 is in the peak band (0.6–0.85) AND is a 4th week (8 % 4 === 0):
    // before the fix the recovery injector overwrote it. It must stay 'peak'.
    const week8 = plan.workouts.filter((w) => w.week_number === 8);
    expect(week8.length).toBeGreaterThan(0);
    expect(week8.every((w) => w.phase === 'peak')).toBe(true);
  });

  it('falls back to the requested duration when there is no target event', () => {
    const plan = generateTrainingPlan({
      name: 'NoRace', duration_weeks: 6, methodology: 'endurance', goal: 'general_fitness',
      start_date: '2026-01-05',
    });
    expect(plan.duration_weeks).toBe(6);
  });
});

describe('applyInterimRaceWaypoints', () => {
  function fakeWeek(startDate) {
    // 7 consecutive endurance days for easy assertions.
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${startDate}T00:00:00`);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return {
        scheduled_date: iso,
        workout_type: 'endurance',
        workout_id: 'foundation_miles',
        name: 'Foundation Miles',
        duration_minutes: 60,
        target_tss: 55,
      };
    });
  }

  it('sharpens before, rests on, and recovers after an interim race', () => {
    const workouts = fakeWeek('2026-02-09'); // Mon 2026-02-09 .. Sun 2026-02-15
    const race = '2026-02-13'; // Friday inside the week
    applyInterimRaceWaypoints(workouts, [race]);

    const byDate = Object.fromEntries(workouts.map((w) => [w.scheduled_date, w]));
    expect(byDate['2026-02-11'].workout_type).toBe('recovery'); // 2 days before
    expect(byDate['2026-02-12'].workout_type).toBe('recovery'); // 1 day before
    expect(byDate['2026-02-13'].workout_type).toBe('rest');     // race day
    expect(byDate['2026-02-13'].name).toBe('Race Day');
    expect(byDate['2026-02-14'].workout_type).toBe('recovery'); // day after
    // Untouched build day earlier in the week.
    expect(byDate['2026-02-09'].workout_type).toBe('endurance');
  });

  it('is a no-op when the race date is outside the plan window', () => {
    const workouts = fakeWeek('2026-02-09');
    const before = JSON.stringify(workouts);
    applyInterimRaceWaypoints(workouts, ['2026-06-01']);
    expect(JSON.stringify(workouts)).toBe(before);
  });

  it('does not convert a planned rest day before the race into recovery', () => {
    const workouts = fakeWeek('2026-02-09');
    workouts.find((w) => w.scheduled_date === '2026-02-12').workout_type = 'rest';
    workouts.find((w) => w.scheduled_date === '2026-02-12').workout_id = null;
    applyInterimRaceWaypoints(workouts, ['2026-02-13']);
    const day = workouts.find((w) => w.scheduled_date === '2026-02-12');
    expect(day.workout_type).toBe('rest'); // left alone
  });
});
