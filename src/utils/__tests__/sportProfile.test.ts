import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: unknown; error: { message: string } | null };
const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
const results: Record<string, Result> = {};

vi.mock('../../lib/supabase', () => {
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    const settle = (op: string) => results[`${table}.${op}`] ?? { data: null, error: null };
    q.select = () => { calls.push({ table, op: 'select' }); return q; };
    q.eq = () => q;
    q.maybeSingle = async () => settle('select');
    q.update = (payload: unknown) => {
      calls.push({ table, op: 'update', payload });
      return { eq: async () => settle('update') };
    };
    q.upsert = async (payload: unknown) => {
      calls.push({ table, op: 'upsert', payload });
      return settle('upsert');
    };
    return q;
  };
  return { supabase: { from: (t: string) => query(t) } };
});

import {
  loadSportProfile,
  mixFromProfile,
  normalizeSportProfile,
  profileFromMix,
  saveSportProfile,
} from '../sportProfile';

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
});

describe('normalizeSportProfile', () => {
  it('keeps known sports in a stable order with a valid primary', () => {
    expect(normalizeSportProfile(['running', 'cycling'], 'running')).toEqual({
      sports: ['cycling', 'running'],
      primarySport: 'running',
    });
  });

  it('adds the primary to the set and drops junk', () => {
    expect(normalizeSportProfile(['swimming'], 'running')).toEqual({ sports: ['running'], primarySport: 'running' });
  });

  it('defaults to cycling when nothing usable is given', () => {
    expect(normalizeSportProfile(undefined, null)).toEqual({ sports: ['cycling'], primarySport: 'cycling' });
  });

  it('round-trips through the picker choices', () => {
    expect(mixFromProfile(profileFromMix('both', 'running'))).toBe('both');
    expect(profileFromMix('running')).toEqual({ sports: ['running'], primarySport: 'running' });
    expect(profileFromMix('both').primarySport).toBe('cycling');
  });
});

describe('loadSportProfile', () => {
  it('reads the row', async () => {
    results['user_profiles.select'] = { data: { sports: ['cycling', 'running'], primary_sport: 'cycling' }, error: null };
    const r = await loadSportProfile('u1');
    expect(r).toEqual({ ok: true, profile: { sports: ['cycling', 'running'], primarySport: 'cycling' } });
  });

  it('falls back to cycling, flagged not-ok, when the column is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    results['user_profiles.select'] = { error: { message: 'column user_profiles.sports does not exist' } };
    const r = await loadSportProfile('u1');
    expect(r.ok).toBe(false);
    expect(r.profile).toEqual({ sports: ['cycling'], primarySport: 'cycling' });
  });
});

describe('saveSportProfile', () => {
  it('writes the profile and mirrors primary_sport to training preferences', async () => {
    const r = await saveSportProfile('u1', { sports: ['running', 'cycling'], primarySport: 'running' });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([
      { table: 'user_profiles', op: 'update', payload: { sports: ['cycling', 'running'], primary_sport: 'running' } },
      { table: 'user_training_preferences', op: 'upsert', payload: { user_id: 'u1', primary_sport: 'running' } },
    ]);
  });

  it('reports a failed profile write and skips the mirror', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    results['user_profiles.update'] = { error: { message: 'boom' } };
    const r = await saveSportProfile('u1', { sports: ['cycling'], primarySport: 'cycling' });
    expect(r).toMatchObject({ ok: false, error: 'boom' });
    expect(calls.some((c) => c.table === 'user_training_preferences')).toBe(false);
  });

  it('still succeeds when only the mirror fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    results['user_training_preferences.upsert'] = { error: { message: 'rls' } };
    const r = await saveSportProfile('u1', { sports: ['cycling'], primarySport: 'cycling' });
    expect(r.ok).toBe(true);
  });
});
