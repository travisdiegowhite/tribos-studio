import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isMissingSportColumnError,
  selectWithSportFallback,
  writeWithSportFallback,
  stripSportColumn,
  resetSportColumnFallback,
  sportColumnAvailable,
} from './calendarSportColumn.js';

const MISSING = { message: 'column calendar_entries.sport does not exist' };

beforeEach(() => {
  resetSportColumnFallback();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('calendar_entries.sport fallback (migration 134 unapplied)', () => {
  it('recognises the PostgREST missing-column errors, and nothing else', () => {
    expect(isMissingSportColumnError(MISSING)).toBe(true);
    expect(isMissingSportColumnError({ message: "Could not find the 'sport' column of 'calendar_entries' in the schema cache" })).toBe(true);
    expect(isMissingSportColumnError({ message: 'permission denied for table calendar_entries' })).toBe(false);
    expect(isMissingSportColumnError({ message: 'column user_profiles.sports does not exist' })).toBe(false);
  });

  it('retries a read without the column, then stops asking for it', async () => {
    const seen = [];
    const run = async (cols) => {
      seen.push(cols);
      return cols.includes('sport') ? { data: null, error: MISSING } : { data: [{ id: 1 }], error: null };
    };
    expect(await selectWithSportFallback('id, date, sport', run)).toEqual({ data: [{ id: 1 }], error: null });
    expect(seen).toEqual(['id, date, sport', 'id, date']);
    expect(sportColumnAvailable()).toBe(false);
    await selectWithSportFallback('id, sport', run);
    expect(seen.at(-1)).toBe('id');
  });

  it('retries a write without the field, for a row or a batch', async () => {
    const payloads = [];
    const run = async (p) => {
      payloads.push(p);
      const has = Array.isArray(p) ? p.some((r) => 'sport' in r) : 'sport' in p;
      return has ? { error: MISSING } : { error: null };
    };
    expect((await writeWithSportFallback([{ a: 1, sport: 'running' }], run)).error).toBeNull();
    expect(payloads.at(-1)).toEqual([{ a: 1 }]);
  });

  it('passes other errors through untouched', async () => {
    const run = async () => ({ data: null, error: { message: 'boom' } });
    expect((await selectWithSportFallback('id, sport', run)).error.message).toBe('boom');
    expect(sportColumnAvailable()).toBe(true);
  });

  it('strips only the sport column', () => {
    expect(stripSportColumn('id, sport, sports_note')).toBe('id, sports_note');
  });
});
