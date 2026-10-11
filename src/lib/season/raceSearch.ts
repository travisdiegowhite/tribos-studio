/**
 * Race search, browser side (Season tab "Add race"). Calls api/race-search.js
 * and turns a result into a prefilled race for RaceGoalModal. Nothing is saved
 * until the athlete saves the form; then confirmFoundRace shares their saved
 * values with the race directory.
 */

import { supabase } from '../supabase';

/** A race other athletes already saved (race_directory). */
export interface DirectoryRace {
  id: string;
  name: string;
  race_date: string;
  race_type: string | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  location: string | null;
  url: string | null;
  confirmed_count: number;
}

/** A race found on the web, not yet confirmed by anyone. */
export interface WebRace {
  name: string;
  race_date: string;
  date_status: 'announced' | 'estimated_from_last_year';
  location: string;
  race_type: string;
  distance_km: number | null;
  elevation_gain_m: number | null;
  url: string;
  site: string;
  note: string;
}

export type FoundRace = { kind: 'directory'; race: DirectoryRace } | { kind: 'web'; race: WebRace };

/** What RaceGoalModal is opened with: a new race (no id), prefilled. */
export interface RacePrefill {
  name: string;
  race_date: string;
  race_type: string;
  distance_km: number | null;
  elevation_gain_m: number | null;
  location: string;
  priority: string;
  notes: string;
}

/** Where a saved race came from, so it can be shared with the directory. */
export interface FoundRaceSource {
  source: 'web' | 'athlete';
  url: string | null;
}

export function toPrefill(found: FoundRace): { prefill: RacePrefill; source: FoundRaceSource } {
  const r = found.race;
  const estimated = found.kind === 'web' && found.race.date_status === 'estimated_from_last_year';
  const notes = [
    r.url ? `Found on ${r.url}` : '',
    estimated ? "Date estimated from last year's edition: check it once it's announced." : '',
    found.kind === 'web' ? found.race.note : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    prefill: {
      name: r.name,
      race_date: r.race_date,
      race_type: r.race_type ?? 'other',
      distance_km: r.distance_km,
      elevation_gain_m: r.elevation_gain_m,
      location: r.location ?? '',
      priority: 'B',
      notes,
    },
    source: { source: found.kind === 'web' ? 'web' : 'athlete', url: r.url },
  };
}

interface SearchResponse<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

async function post<T>(body: Record<string, unknown>): Promise<SearchResponse<T>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch('/api/race-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (T & { success?: boolean; error?: string }) | null;
    if (!res.ok || !json?.success) {
      return { ok: false, data: null, error: json?.error ?? `Race search failed (${res.status}).` };
    }
    return { ok: true, data: json, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : 'Race search failed.' };
  }
}

export function searchDirectory(query: string, today: string) {
  return post<{ races: DirectoryRace[] }>({ action: 'directory', query, today });
}

export function searchWeb(query: string, near: string, today: string) {
  return post<{ candidates: WebRace[]; message: string | null }>({ action: 'web', query, near, today });
}

/** After the athlete saved a found race: share their saved values with the directory (best effort). */
export async function confirmFoundRace(raceGoalId: string, source: FoundRaceSource): Promise<void> {
  const res = await post<{ action: string }>({ action: 'confirm', raceGoalId, ...source });
  if (!res.ok) console.warn('[race-search] could not share the race:', res.error);
}
