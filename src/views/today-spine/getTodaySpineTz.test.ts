/**
 * Timezone regression for the spine day nodes: an evening ride whose UTC
 * timestamp crosses midnight must land on its LOCAL day's node, not the next.
 * TZ pinned to America/Denver — in a UTC runner the bug would be invisible.
 */
process.env.TZ = 'America/Denver';

import { describe, it, expect, afterAll } from 'vitest';
import { assembleSpine, type AssembleInput } from './getTodaySpine';

afterAll(() => {
  delete process.env.TZ;
});

const NOW = new Date(2026, 5, 30, 9, 0, 0); // Tue 30 Jun 2026, 09:00 Denver

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    now: NOW,
    serverLoad: [],
    activities: [],
    ftp: 250,
    planned: [],
    todaysWorkout: null,
    event: null,
    persona: { id: 'pragmatist', name: 'The Pragmatist' },
    recentRides: [],
    weekRollup: { distanceKm: 0, distanceMi: 0, elevationM: 0, elevationFt: 0, rideCount: 0 },
    ...overrides,
  };
}

describe('assembleSpine — local-day bucketing', () => {
  it("puts last night's ride on yesterday's node, not today's", () => {
    // Mon Jun 29, 19:00 Denver (MDT, -06:00) = Tue Jun 30 01:00 UTC.
    const data = assembleSpine(
      baseInput({
        activities: [{ start_date: '2026-06-30T01:00:00Z', name: 'Night Crit', rss: 90, moving_time: 3600 }],
      }),
    );
    const yesterday = data.days[data.todayIndex - 1]; // 2026-06-29
    const today = data.days[data.todayIndex]; // 2026-06-30
    expect(yesterday.rss).toBe(90);
    expect(yesterday.activity.name).toBe('Night Crit');
    expect(today.rss).toBe(0);
  });

  it("counts tonight's ride on today's node (UTC date is tomorrow)", () => {
    // Tue Jun 30, 20:00 Denver = Wed Jul 1 02:00 UTC.
    const data = assembleSpine(
      baseInput({
        activities: [{ start_date: '2026-07-01T02:00:00Z', name: 'Evening Spin', rss: 60, moving_time: 3600 }],
      }),
    );
    const today = data.days[data.todayIndex]; // 2026-06-30
    expect(today.rss).toBe(60);
  });
});
