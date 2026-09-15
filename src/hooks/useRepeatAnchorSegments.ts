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
 *
 * `patch` lets the picker update a row in place (a rename, a rebuilt road
 * name) without a refetch.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isGenericSegmentName } from '../utils/segmentApiClient';

export interface RepeatAnchorSegment {
  id: string;
  display_name: string;
  auto_name: string | null;
  custom_name: string | null;
  /** True while the name is still the detector's "Rolling 14.7km" form. */
  generic: boolean;
  distance_meters: number | null;
  avg_gradient: number | null;
  elevation_gain_meters: number | null;
  ride_count: number;
  terrain_type: string | null;
  last_ridden_at: string | null;
  geojson: { type?: string; coordinates?: unknown } | null;
}

export type SegmentPatch = Partial<Pick<RepeatAnchorSegment, 'auto_name' | 'custom_name'>>;

interface State {
  segments: RepeatAnchorSegment[];
  loading: boolean;
  error: string | null;
}

export interface RepeatAnchorSegmentsResult extends State {
  patch: (id: string, patch: SegmentPatch) => void;
}

const LIMIT = 300;

type Row = Record<string, unknown> & { id: string };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The name the athlete sees: theirs first, then the detector's. */
function withNames(
  base: Omit<RepeatAnchorSegment, 'display_name' | 'generic'>,
): RepeatAnchorSegment {
  const display_name = base.custom_name || base.auto_name || 'Segment';
  return { ...base, display_name, generic: !base.custom_name && isGenericSegmentName(base.auto_name) };
}

function toSegment(row: Row): RepeatAnchorSegment {
  return withNames({
    id: row.id,
    auto_name: (row.auto_name as string | null) ?? (row.display_name as string | null) ?? null,
    custom_name: (row.custom_name as string | null) ?? null,
    distance_meters: num(row.distance_meters),
    avg_gradient: num(row.avg_gradient),
    elevation_gain_meters: num(row.elevation_gain_meters),
    ride_count: Number(row.ride_count) || 0,
    terrain_type: (row.terrain_type as string | null) ?? null,
    last_ridden_at: (row.last_ridden_at as string | null) ?? null,
    geojson: (row.geojson as RepeatAnchorSegment['geojson']) ?? null,
  });
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

/** Apply a name patch to one segment, recomputing the derived name fields. */
export function patchSegment(segment: RepeatAnchorSegment, patch: SegmentPatch): RepeatAnchorSegment {
  const { display_name: _d, generic: _g, ...base } = segment;
  void _d;
  void _g;
  return withNames({ ...base, ...patch });
}

export function useRepeatAnchorSegments(userId: string | undefined, enabled: boolean): RepeatAnchorSegmentsResult {
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

  const patch = useCallback((id: string, p: SegmentPatch) => {
    setState((s) => ({ ...s, segments: s.segments.map((seg) => (seg.id === id ? patchSegment(seg, p) : seg)) }));
  }, []);

  return { ...state, patch };
}
