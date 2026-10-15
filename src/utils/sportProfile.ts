/**
 * Which sports an athlete trains, and which one leads.
 *
 * `user_profiles.sports` (migration 132) is the set ({cycling}, {running} or
 * {cycling,running}); `user_profiles.primary_sport` (migration 042) says which
 * leads. `user_training_preferences.primary_sport` is kept as a mirror because
 * useUserAvailability reads it.
 *
 * Migrations are applied by hand, so this module reads and writes the sport
 * columns in their OWN queries, never alongside other profile fields: if 132
 * has not been applied, only the sport picker degrades — the rest of the
 * profile still loads and saves.
 */

import { supabase } from '../lib/supabase';

export type TrainedSport = 'cycling' | 'running';

export interface SportProfile {
  sports: TrainedSport[];
  primarySport: TrainedSport;
}

export const DEFAULT_SPORT_PROFILE: SportProfile = { sports: ['cycling'], primarySport: 'cycling' };

const SPORTS: readonly TrainedSport[] = ['cycling', 'running'];

const isSport = (v: unknown): v is TrainedSport => SPORTS.includes(v as TrainedSport);

/**
 * Coerce whatever the row or a form holds into a valid profile: known sports
 * only, in a stable order, at least one, and a primary that is one of them.
 */
export function normalizeSportProfile(
  sports: unknown,
  primarySport: unknown,
): SportProfile {
  const set = new Set(Array.isArray(sports) ? sports.filter(isSport) : []);
  if (isSport(primarySport)) set.add(primarySport);
  const list = SPORTS.filter((s) => set.has(s));
  if (list.length === 0) return { ...DEFAULT_SPORT_PROFILE, sports: [...DEFAULT_SPORT_PROFILE.sports] };
  const primary = isSport(primarySport) && list.includes(primarySport) ? primarySport : list[0];
  return { sports: list, primarySport: primary };
}

/** The three choices a picker offers. */
export type SportMix = 'cycling' | 'running' | 'both';

export function mixFromProfile(profile: SportProfile): SportMix {
  return profile.sports.length > 1 ? 'both' : profile.sports[0];
}

export function profileFromMix(mix: SportMix, primary: TrainedSport = 'cycling'): SportProfile {
  if (mix === 'both') return { sports: ['cycling', 'running'], primarySport: primary };
  return { sports: [mix], primarySport: mix };
}

export interface LoadSportProfileResult {
  profile: SportProfile;
  /** False when the read failed (e.g. migration 132 not applied); profile is the default then. */
  ok: boolean;
}

export async function loadSportProfile(userId: string): Promise<LoadSportProfileResult> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('sports, primary_sport')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[sportProfile] load failed — is migration 132 applied?', error.message);
    return { profile: normalizeSportProfile(null, null), ok: false };
  }
  return { profile: normalizeSportProfile(data?.sports, data?.primary_sport), ok: true };
}

export async function saveSportProfile(
  userId: string,
  input: SportProfile,
): Promise<{ ok: boolean; error: string | null; profile: SportProfile }> {
  const profile = normalizeSportProfile(input.sports, input.primarySport);

  const { error } = await supabase
    .from('user_profiles')
    .update({ sports: profile.sports, primary_sport: profile.primarySport })
    .eq('id', userId);
  if (error) {
    console.error('[sportProfile] save failed', error);
    return { ok: false, error: error.message, profile };
  }

  // Mirror for useUserAvailability. The profile row is the source of truth,
  // so a failed mirror is logged rather than reported as a failed save.
  const { error: mirrorError } = await supabase
    .from('user_training_preferences')
    .upsert({ user_id: userId, primary_sport: profile.primarySport }, { onConflict: 'user_id' });
  if (mirrorError) console.warn('[sportProfile] preferences mirror failed', mirrorError.message);

  return { ok: true, error: null, profile };
}
