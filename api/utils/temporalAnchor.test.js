import { describe, it, expect } from 'vitest';
import { buildTemporalAnchor } from './temporalAnchor.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDate(isoStr) {
  return new Date(isoStr);
}

function makeWorkout(id, scheduled_date, opts = {}) {
  return {
    id,
    scheduled_date,
    workout_type: opts.workout_type || 'endurance',
    name: opts.name || 'Z2 ride',
    target_duration: opts.target_duration ?? 120,
    target_rss: opts.target_rss ?? 60,
  };
}

function makeGoal(id, name, race_date) {
  return { id, name, race_date, race_type: 'road_race', priority: 'A' };
}

// Parse the CALENDAR_ANCHOR section out of an anchor block for assertion.
function parseAnchor(block) {
  const map = {};
  const section = block.split('CALENDAR_ANCHOR:')[1]?.split('\n\n')[0] || '';
  for (const line of section.split('\n')) {
    const m = line.match(/\s+(\S+)\s+→\s+(\w+ \w+ \d+)/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function parseDaysUntil(block) {
  const map = {};
  const section = block.split('DAYS_UNTIL:')[1]?.split('\n\n')[0] || '';
  for (const line of section.split('\n')) {
    const m = line.match(/\s+(\S+):\s+(\d+)/);
    if (m) map[m[1]] = parseInt(m[2], 10);
  }
  return map;
}

function parseSessionIds(block) {
  const ids = [];
  const section = block.split('SESSIONS')[1] || '';
  for (const line of section.split('\n')) {
    const m = line.match(/\s+(sess_\w+)/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildTemporalAnchor', () => {

  describe('basic structure', () => {
    it('always includes today and tomorrow', () => {
      // Wednesday 2026-04-22 07:42 America/Denver (MDT = UTC-6)
      // UTC equivalent: 2026-04-22T13:42:00Z
      const now = makeDate('2026-04-22T13:42:00Z');
      const block = buildTemporalAnchor('America/Denver', [], [], now);

      expect(block).toContain('USER_TZ: America/Denver');
      expect(block).toContain('(Wednesday)');
      expect(block).toContain('CALENDAR_ANCHOR:');
      expect(block).toContain('CONSTRAINT:');

      const anchor = parseAnchor(block);
      expect(anchor['today']).toBeTruthy();
      expect(anchor['tomorrow']).toBeTruthy();
    });

    it('labels this-week days correctly from Wednesday', () => {
      // Wed Apr 22 in Denver (UTC-6 during MDT): UTC 2026-04-22T13:00:00Z
      // Anchor only emits entries for today, tomorrow, + days with sessions/goals.
      // Add sessions to ensure this-week labels appear.
      const now = makeDate('2026-04-22T13:00:00Z');
      const sessions = [
        makeWorkout('fri0-aaaa-bbbb-cccc', '2026-04-24'), // Fri → this_fri
        makeWorkout('sat0-aaaa-bbbb-cccc', '2026-04-25'), // Sat → this_sat
        makeWorkout('sun0-aaaa-bbbb-cccc', '2026-04-26'), // Sun → this_sun
      ];
      const anchor = parseAnchor(buildTemporalAnchor('America/Denver', sessions, [], now));

      expect(anchor['today']).toMatch(/^Wed/);
      expect(anchor['tomorrow']).toMatch(/^Thu/);
      expect(anchor['this_fri']).toMatch(/^Fri/);
      expect(anchor['this_sat']).toMatch(/^Sat/);
      expect(anchor['this_sun']).toMatch(/^Sun/);
    });

    it('labels next-week days with next_ prefix', () => {
      const now = makeDate('2026-04-22T13:00:00Z'); // Wednesday Denver
      // Add a session 8 days out to force "next_thu" into the anchor
      const session = makeWorkout('aaaa-bbbb-cccc-dddd', '2026-04-30');
      const anchor = parseAnchor(buildTemporalAnchor('America/Denver', [session], [], now));
      expect(anchor['next_thu']).toMatch(/^Thu/);
    });

    it('emits the CONSTRAINT line', () => {
      const now = makeDate('2026-04-22T13:00:00Z');
      const block = buildTemporalAnchor('America/Denver', [], [], now);
      expect(block).toContain('Do not compute new dates.');
    });
  });

  describe('session rendering', () => {
    it('includes sessions that fall within the 14-day window', () => {
      const now = makeDate('2026-04-22T13:00:00Z'); // Wed Apr 22 Denver
      const sessions = [
        makeWorkout('1111-2222-3333-4444', '2026-04-22', { name: 'Z2 endurance', target_duration: 120 }),
        makeWorkout('5555-6666-7777-8888', '2026-04-24', { name: 'Openers', target_duration: 60 }),
      ];
      const block = buildTemporalAnchor('America/Denver', sessions, [], now);
      const ids = parseSessionIds(block);
      expect(ids).toContain('sess_11112222');
      expect(ids).toContain('sess_55556666');
    });

    it('omits sessions outside the 14-day window', () => {
      const now = makeDate('2026-04-22T13:00:00Z');
      const farFuture = makeWorkout('9999-aaaa-bbbb-cccc', '2026-05-10');
      const block = buildTemporalAnchor('America/Denver', [farFuture], [], now);
      expect(block).not.toContain('sess_9999aaaa');
    });

    it('assigns session to the correct day label', () => {
      const now = makeDate('2026-04-22T13:00:00Z'); // Wed, Denver
      const session = makeWorkout('abcd-1234-efgh-5678', '2026-04-24'); // Friday
      const block = buildTemporalAnchor('America/Denver', [session], [], now);
      expect(block).toContain('this_fri');
      expect(block).toContain('sess_abcd1234');
    });

    it('marks race-day sessions', () => {
      const now = makeDate('2026-04-22T13:00:00Z');
      const session = makeWorkout('race-aaaa-bbbb-cccc', '2026-04-26', {
        workout_type: 'race',
        name: 'Race — Boulder Roubaix',
      });
      const goal = makeGoal('goal-1111', 'Boulder Roubaix', '2026-04-26');
      const block = buildTemporalAnchor('America/Denver', [session], [goal], now);
      expect(block).toContain('RACE');
    });
  });

  describe('race goals', () => {
    it('shows DAYS_UNTIL for upcoming race goals', () => {
      const now = makeDate('2026-04-22T13:00:00Z'); // Wed Apr 22
      const goal = makeGoal('g1', 'Boulder Roubaix', '2026-04-26'); // 4 days out
      const block = buildTemporalAnchor('America/Denver', [], [goal], now);
      const du = parseDaysUntil(block);
      expect(du['boulder_roubaix']).toBe(4);
    });

    it('annotates goal-event dates in CALENDAR_ANCHOR', () => {
      const now = makeDate('2026-04-22T13:00:00Z');
      const goal = makeGoal('g1', 'Boulder Roubaix', '2026-04-26');
      const block = buildTemporalAnchor('America/Denver', [], [goal], now);
      expect(block).toContain('(goal_event: boulder_roubaix)');
    });

    it('omits goals beyond 90 days from DAYS_UNTIL', () => {
      const now = makeDate('2026-04-22T13:00:00Z');
      const farGoal = makeGoal('g2', 'Big Race', '2026-08-01'); // ~100 days out
      const block = buildTemporalAnchor('America/Denver', [], [farGoal], now);
      const du = parseDaysUntil(block);
      expect(du['big_race']).toBeUndefined();
    });

    it('shows DAYS_UNTIL = 0 for a goal happening today', () => {
      const now = makeDate('2026-04-22T13:00:00Z');
      const goal = makeGoal('g1', 'Today Race', '2026-04-22');
      const block = buildTemporalAnchor('America/Denver', [], [goal], now);
      const du = parseDaysUntil(block);
      expect(du['today_race']).toBe(0);
    });
  });

  describe('timezone correctness', () => {
    it('resolves today correctly for Eastern time', () => {
      // 2026-04-22T02:00:00Z = Apr 21 at 22:00 ET (UTC-4 in spring)
      // So "today" in Eastern should be Apr 21 (Tuesday)
      const now = makeDate('2026-04-22T02:00:00Z');
      const block = buildTemporalAnchor('America/New_York', [], [], now);
      expect(block).toContain('(Tuesday)');
    });

    it('resolves today correctly for Pacific time', () => {
      // 2026-04-22T07:00:00Z = Apr 21 at 23:00 PT (UTC-8 in winter)
      // But April → PDT (UTC-7), so 2026-04-22T07:00:00Z = Apr 22 00:00 PDT
      // Let's use a clear daytime test: 2026-04-22T16:00:00Z = 09:00 PDT
      const now = makeDate('2026-04-22T16:00:00Z');
      const block = buildTemporalAnchor('America/Los_Angeles', [], [], now);
      expect(block).toContain('(Wednesday)');
    });

    it('resolves today correctly for European time (Paris)', () => {
      // 2026-04-22T09:00:00Z = 11:00 CEST (UTC+2 in summer)
      const now = makeDate('2026-04-22T09:00:00Z');
      const block = buildTemporalAnchor('Europe/Paris', [], [], now);
      expect(block).toContain('(Wednesday)');
    });

    it('resolves today correctly for AEST (Sydney)', () => {
      // 2026-04-22T01:00:00Z = 11:00 AEST (UTC+10, no DST in April)
      const now = makeDate('2026-04-22T01:00:00Z');
      const block = buildTemporalAnchor('Australia/Sydney', [], [], now);
      expect(block).toContain('(Wednesday)');
    });

    it('handles UTC timezone', () => {
      const now = makeDate('2026-04-22T12:00:00Z');
      const block = buildTemporalAnchor('UTC', [], [], now);
      expect(block).toContain('USER_TZ: UTC');
      expect(block).toContain('(Wednesday)');
    });

    it('falls back gracefully on null timezone', () => {
      const now = makeDate('2026-04-22T12:00:00Z');
      const block = buildTemporalAnchor(null, [], [], now);
      expect(block).toContain('USER_TZ: UTC');
    });
  });

  describe('DST transitions', () => {
    it('correctly crosses the US fall-back boundary (Nov 1 2026, America/Denver)', () => {
      // DST ends 2026-11-01 at 02:00 → clocks fall back to 01:00
      // Test that "tomorrow" lands on Nov 2, not Nov 1 duplicated

      // "Today" = Oct 31 in Denver; UTC midnight of Nov 1 = Oct 31 18:00 MT
      // Use Oct 31 09:00 MDT = Oct 31 15:00 UTC
      const now = makeDate('2026-10-31T15:00:00Z'); // Oct 31 in MDT
      const session = makeWorkout('dst1-aaaa-bbbb-cccc', '2026-11-02', { name: 'Post-DST ride' });
      const block = buildTemporalAnchor('America/Denver', [session], [], now);

      // tomorrow should be Nov 1 (the DST day itself)
      const anchor = parseAnchor(block);
      expect(anchor['tomorrow']).toMatch(/Nov 1/);
      // The session on Nov 2 should appear with the correct "this_mon" or "next_mon" label
      expect(block).toContain('sess_dst1aaaa');
    });

    it('correctly crosses the US spring-forward boundary (Mar 8 2026, America/Denver)', () => {
      // DST begins 2026-03-08 at 02:00 → clocks spring forward to 03:00
      // "Today" = Mar 7, tomorrow should be Mar 8

      // Mar 7 12:00 MST = Mar 7 19:00 UTC
      const now = makeDate('2026-03-07T19:00:00Z');
      const anchor = parseAnchor(buildTemporalAnchor('America/Denver', [], [], now));
      expect(anchor['today']).toMatch(/Mar 7/);
      expect(anchor['tomorrow']).toMatch(/Mar 8/);
    });

    it('handles late-night "today" correctly (23:58 local)', () => {
      // 23:58 local should still be "today", not roll over to tomorrow
      // Denver MST (UTC-7 in March): 23:58 MST = next day 06:58 UTC
      // Use a winter date to avoid DST ambiguity: Jan 15 23:58 MST = Jan 16 06:58 UTC
      const now = makeDate('2026-01-16T06:58:00Z'); // still Jan 15 at 23:58 MST
      const block = buildTemporalAnchor('America/Denver', [], [], now);
      expect(block).toContain('(Thursday)'); // Jan 15 2026 is a Thursday
    });

    it('correctly labels days across week boundary', () => {
      // Today = Saturday (last day of week in practical terms)
      // Apr 25 2026 is a Saturday in Denver
      // UTC noon = Apr 25 18:00 UTC
      const now = makeDate('2026-04-25T18:00:00Z'); // Sat Apr 25 noon MDT
      const anchor = parseAnchor(buildTemporalAnchor('America/Denver', [], [], now));
      expect(anchor['today']).toMatch(/Apr 25/);
      expect(anchor['tomorrow']).toMatch(/Apr 26/); // Sunday
    });

    it('uses "next_" prefix for Monday when today is Saturday', () => {
      // When today is Saturday, Sunday=tomorrow, Monday(+2)=start of next week
      const now = makeDate('2026-04-25T18:00:00Z'); // Sat Apr 25 Denver
      const mondaySession = makeWorkout('mon0-aaaa-bbbb-cccc', '2026-04-27'); // Monday
      const block = buildTemporalAnchor('America/Denver', [mondaySession], [], now);
      expect(block).toContain('next_mon');
    });

    it('correctly handles Sunday as today', () => {
      // Apr 26 2026 is a Sunday in Denver
      const now = makeDate('2026-04-26T18:00:00Z'); // Sun Apr 26 noon MDT
      const anchor = parseAnchor(buildTemporalAnchor('America/Denver', [], [], now));
      expect(anchor['today']).toMatch(/Apr 26/);
      expect(anchor['tomorrow']).toMatch(/Apr 27/); // Monday starts next week
    });
  });

  describe('label collision avoidance', () => {
    it('falls back to ISO date label on second use of same day name', () => {
      // If we have sessions on next_tue and the tue 7 days later (both "next_tue"),
      // the second one should get an ISO date label, not "next_tue" again.
      // Today = Monday 2026-04-20, next tue = Apr 21 (+1=tomorrow), then Apr 28 (+8)
      // Actually: today=Mon, next_tue would be Apr 28 (offset+8)
      // Let's engineer: today=Wed Apr 22, next_tue = Apr 28 (offset+6), then Apr 28+7=May 5 (offset+13)
      // Both would nominally get "next_tue". The second should get "2026-05-05".
      const now = makeDate('2026-04-22T13:00:00Z'); // Wed Apr 22 Denver
      const session1 = makeWorkout('1234-aaaa-bbbb-cccc', '2026-04-28'); // next_tue
      const session2 = makeWorkout('5678-aaaa-bbbb-cccc', '2026-05-05'); // 13 days out, also a tue
      const anchor = parseAnchor(
        buildTemporalAnchor('America/Denver', [session1, session2], [], now)
      );
      expect(anchor['next_tue']).toMatch(/Apr 28/);
      // May 5 should appear but under the ISO date key, not next_tue
      expect(anchor['next_tue']).not.toMatch(/May 5/);
      expect(anchor['2026-05-05']).toMatch(/May 5/);
    });
  });
});
