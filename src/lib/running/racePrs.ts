/**
 * Browser reads and writes of running_race_prs (multisport phase 5).
 *
 * The server finds PRs in an athlete's races (api/utils/runRacePrs.js,
 * source 'auto'); the Running profile card lists them and saves the race the
 * athlete types into the estimator (source 'manual'). `source` is migration
 * 136 and goes through optionalColumn, so the card works before it is applied.
 * Fail-soft reads: an error lists no PRs.
 */

import { supabase } from '../supabase';
import { optionalColumn } from '../../../api/utils/optionalColumn.js';
import { RACE_DISTANCE_BANDS } from '../../../api/utils/runRacePrs.js';

export type RacePrDistance = '5k' | '10k' | 'half_marathon' | 'marathon';

export interface RacePr {
  distance: RacePrDistance;
  time_seconds: number;
  race_date: string | null;
  race_name: string | null;
  source: 'manual' | 'auto' | null;
}

const ORDER = RACE_DISTANCE_BANDS.map((b) => b.key);
export const RACE_PR_LABELS: Record<string, string> = Object.fromEntries(
  RACE_DISTANCE_BANDS.map((b) => [b.key, b.label]),
);

const prSource = optionalColumn('running_race_prs', 'source');

/** Test hook. */
export function resetRacePrsColumn(): void {
  prSource.reset();
}

export async function loadRacePrs(userId: string): Promise<RacePr[]> {
  try {
    const { data, error } = await prSource.select(
      'distance, time_seconds, race_date, race_name, source',
      (columns) =>
        supabase.from('running_race_prs').select(columns).eq('user_id', userId) as unknown as PromiseLike<{
          data: unknown;
          error: { message?: string } | null;
        }>,
    );
    if (error || !Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>)
      .filter((r) => ORDER.includes(String(r.distance)) && Number(r.time_seconds) > 0)
      .map((r) => ({
        distance: r.distance as RacePrDistance,
        time_seconds: Number(r.time_seconds),
        race_date: (r.race_date as string) ?? null,
        race_name: (r.race_name as string) ?? null,
        source: (r.source as RacePr['source']) ?? null,
      }))
      .sort((a, b) => ORDER.indexOf(a.distance) - ORDER.indexOf(b.distance));
  } catch {
    return [];
  }
}

/**
 * Save a race the athlete entered as their PR — only when it is faster than
 * the stored one (or there is none). Returns what happened.
 */
export async function saveManualPr(
  userId: string,
  pr: { distance: RacePrDistance; time_seconds: number; race_date?: string | null; race_name?: string | null },
  existing: RacePr[],
): Promise<{ ok: boolean; saved: boolean; error?: string }> {
  const stored = existing.find((p) => p.distance === pr.distance);
  if (stored && stored.time_seconds <= pr.time_seconds) return { ok: true, saved: false };
  const row = {
    user_id: userId,
    distance: pr.distance,
    time_seconds: Math.round(pr.time_seconds),
    race_date: pr.race_date ?? null,
    race_name: pr.race_name ?? null,
    activity_id: null,
    source: 'manual',
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await prSource.write(row, (payload) =>
      supabase.from('running_race_prs').upsert(payload, { onConflict: 'user_id,distance' }) as unknown as PromiseLike<{
        error: { message?: string } | null;
      }>,
    );
    if (error) return { ok: false, saved: false, error: error.message };
    return { ok: true, saved: true };
  } catch (err) {
    return { ok: false, saved: false, error: (err as Error)?.message };
  }
}
