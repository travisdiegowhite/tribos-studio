/**
 * useRepeatAnchorSegments — the athlete's training segments, as anchors for
 * the REPEATS tab.
 *
 * Deliberately thinner than useSegmentLibrary: it selects every base column
 * the row happens to have and filters in JS, so it reads on the schema that
 * is actually live. The library hook names migration-110 columns
 * (`measured_ride_count`, `retired_at`) in its SELECT, and on a database
 * where that migration has not been applied PostgREST rejects the whole
 * query and the picker shows nothing — which is exactly how the segment
 * picker shipped empty.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface RepeatAnchorSegment {
  id: string;
  display_name: string;
  distance_meters: number | null;
  ride_count: number;
  terrain_type: string | null;
  last_ridden_at: string | null;
  geojson: { type?: string; coordinates?: unknown } | null;
}

interface State {
  segments: RepeatAnchorSegment[];
  loading: boolean;
  error: string | null;
}

const LIMIT = 300;

type Row = Record<string, unknown> & { id: string };

function toSegment(row: Row): RepeatAnchorSegment {
  return {
    id: row.id,
    display_name:
      (row.display_name as string | null) ||
      (row.custom_name as string | null) ||
      (row.auto_name as string | null) ||
      'Segment',
    distance_meters: row.distance_meters == null ? null : Number(row.distance_meters),
    ride_count: Number(row.ride_count) || 0,
    terrain_type: (row.terrain_type as string | null) ?? null,
    last_ridden_at: (row.last_ridden_at as string | null) ?? null,
    geojson: (row.geojson as RepeatAnchorSegment['geojson']) ?? null,
  };
}

/** Segments with drawable geometry, most-ridden first. Retired ones are dropped when the column exists. */
export function orderAnchorSegments(rows: Row[]): RepeatAnchorSegment[] {
  return rows
    .filter((r) => r && !r.retired_at && Array.isArray((r.geojson as { coordinates?: unknown } | null)?.coordinates))
    .map(toSegment)
    .filter((s) => (s.geojson?.coordinates as unknown[]).length > 1)
    .sort(
      (a, b) =>
        b.ride_count - a.ride_count ||
        (b.last_ridden_at ?? '').localeCompare(a.last_ridden_at ?? ''),
    );
}

export function useRepeatAnchorSegments(userId: string | undefined, enabled: boolean): State {
  const [state, setState] = useState<State>({ segments: [], loading: false, error: null });

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const { data, error } = await supabase
        .from('training_segments')
        .select('*')
        .eq('user_id', userId)
        .order('ride_count', { ascending: false })
        .limit(LIMIT);
      if (cancelled) return;
      if (error) {
        setState({ segments: [], loading: false, error: error.message });
        return;
      }
      setState({ segments: orderAnchorSegments((data ?? []) as Row[]), loading: false, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return state;
}
