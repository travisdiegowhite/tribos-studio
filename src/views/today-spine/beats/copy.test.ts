/**
 * Guard tests for the beats copy.
 *
 * The temporal-language rule (spec D7) is the kind that erodes one innocent
 * commit at a time — "yesterday" reads so naturally that nobody notices it
 * re-introducing a whole class of timezone bugs. So it fails the build here
 * instead of failing quietly in production.
 */

import { describe, it, expect } from 'vitest';
import { OPENERS, gapClause, pickOpener, renderBeat1, renderBeat3, renderBeat4Prompt } from './copy';
import type { Beat1State, Beat3DayType, EffortTier, Feel } from './types';

/**
 * Banned outside a verified date slot. "today" is deliberately absent — it is
 * the page's own frame of reference, not a claim about a calendar day the
 * server might disagree with.
 */
const DAY_WORDS =
  /\b(yesterday|tomorrow|tonight|last night|this morning|this afternoon|this evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

/** Slot values chosen so a leak from a slot can't be mistaken for a template. */
const B1_STATES: Beat1State[] = ['ridden-today', 'recent', 'gap', 'long-gap', 'no-history'];
const B3_TYPES: Beat3DayType[] = [
  'no-history',
  'ridden-today',
  'rest',
  'planned-easy',
  'planned-moderate',
  'planned-hard',
  'no-plan',
];
const FEELS: Array<Feel | null> = [null, 'flat', 'normal', 'strong'];

function everyBeat1Line(): string[] {
  const lines: string[] = [];
  for (const state of B1_STATES) {
    for (const daysAgo of [0, 1, 2, 3, 6, 7, 20, 21]) {
      for (const stat of ['40.0 km', null]) {
        lines.push(renderBeat1({ state, opener: 'Solid work', duration: '1h 30m', stat, daysAgo }));
        lines.push(renderBeat1({ state, opener: 'Solid work', duration: null, stat, daysAgo }));
      }
    }
  }
  return lines;
}

function everyBeat3Line(): string[] {
  const lines: string[] = [];
  for (const dayType of B3_TYPES) {
    for (const feel of FEELS) {
      lines.push(
        renderBeat3({
          dayType,
          feel,
          plainName: 'steady riding',
          plannedPlain: 'hard, steady effort',
          easierPlain: 'steady riding',
          why: "you're carrying productive load",
          restOfDay: 'Nothing else needed.',
        }),
      );
    }
  }
  return lines;
}

describe('temporal language', () => {
  it('never puts a day-word in a Beat 1 line', () => {
    for (const line of everyBeat1Line()) expect(line).not.toMatch(DAY_WORDS);
  });

  it('never puts a day-word in a Beat 3 line', () => {
    for (const line of everyBeat3Line()) expect(line).not.toMatch(DAY_WORDS);
  });

  it('never puts a day-word in a Beat 4 prompt or an opener', () => {
    expect(renderBeat4Prompt('route', true)).not.toMatch(DAY_WORDS);
    expect(renderBeat4Prompt('route', false)).not.toMatch(DAY_WORDS);
    expect(renderBeat4Prompt('browse', false)).not.toMatch(DAY_WORDS);
    for (const pool of Object.values(OPENERS)) {
      for (const opener of pool) expect(opener).not.toMatch(DAY_WORDS);
    }
  });

  it('counts quiet days in numbers, which are code-computed, not day-words', () => {
    expect(gapClause(0)).toBe('');
    expect(gapClause(1)).toBe('');
    expect(gapClause(2)).toMatch(/A couple of quiet days/);
    expect(gapClause(4)).toMatch(/^ 4 quiet days/);
  });
});

describe('register', () => {
  it('never blames the rider, in any line', () => {
    const blame = /should have|you failed|missed your|slacking|behind schedule|no excuse/i;
    for (const line of [...everyBeat1Line(), ...everyBeat3Line()]) {
      expect(line).not.toMatch(blame);
    }
  });

  it('keeps every line to one or two sentences', () => {
    for (const line of [...everyBeat1Line(), ...everyBeat3Line()]) {
      const sentences = line.split(/[.!?]+\s/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });

  it('never speaks in the app\'s internal metric vocabulary', () => {
    const jargon = /\b(TSS|CTL|ATL|TSB|RSS|TFI|AFI|form score|normalized power|intensity factor)\b/i;
    for (const line of [...everyBeat1Line(), ...everyBeat3Line()]) {
      expect(line).not.toMatch(jargon);
    }
  });
});

describe('pickOpener', () => {
  it('is stable for a given date and always in the tier\'s pool', () => {
    const tiers: EffortTier[] = ['easy', 'steady', 'brisk', 'hard'];
    for (const tier of tiers) {
      for (const date of ['2026-06-30', '2026-01-01', '2025-12-24']) {
        const first = pickOpener(tier, date);
        expect(pickOpener(tier, date)).toBe(first);
        expect(OPENERS[tier]).toContain(first);
      }
    }
  });

  it('spreads across the pool rather than collapsing onto one opener', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`);
    const picked = new Set(dates.map((d) => pickOpener('steady', d)));
    expect(picked.size).toBeGreaterThan(1);
  });
});
