/**
 * useSegmentEffortComparison
 *
 * Loads this activity's matched training-segment traversals plus the rider's
 * past traversals of the same segments (direct Supabase reads via RLS), then
 * runs the pure comparison engine from src/utils/segmentEffortComparison.ts.
 *
 * Self-heals for activities that predate the on-sync segment analysis hook:
 * if the activity has streams but no traversal rows and hasn't been analyzed
 * yet, it triggers `analyze_activity` on /api/segment-analysis once, then
 * refetches.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  compareActivitySegments,
  type CompareInput,
  type ComparisonSegmentInfo,
  type RideEffortSummary,
  type SegmentComparison,
  type SegmentTraversal,
} from '../utils/segmentEffortComparison';

const TRAVERSAL_COLUMNS =
  'id, segment_id, activity_id, ridden_at, avg_power, normalized_power, max_power, avg_hr, max_hr, duration_seconds, avg_speed, avg_cadence, stop_count';

/** Cap on history rows fetched across all matched segments. */
const HISTORY_LIMIT = 300;

export type ComparisonStatus = 'idle' | 'loading' | 'analyzing' | 'ready' | 'empty' | 'error';

export interface SegmentEffortComparisonState {
  status: ComparisonStatus;
  comparisons: SegmentComparison[];
  summary: RideEffortSummary | null;
  error: string | null;
}

interface RideLike {
  id: string;
  user_id?: string;
  activity_streams?: unknown;
  training_segments_analyzed_at?: string | null;
}

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) return '';
  return 'http://localhost:3000';
};

async function triggerActivityAnalysis(activityId: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/segment-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'analyze_activity', activityId }),
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data?.success === true;
}

async function fetchTraversalsForActivity(activityId: string): Promise<SegmentTraversal[]> {
  const { data, error } = await supabase
    .from('training_segment_rides')
    .select(TRAVERSAL_COLUMNS)
    .eq('activity_id', activityId);
  if (error) throw new Error(error.message);
  return (data || []) as SegmentTraversal[];
}

export function useSegmentEffortComparison(
  ride: RideLike | null | undefined,
  enabled: boolean
): SegmentEffortComparisonState {
  const [state, setState] = useState<SegmentEffortComparisonState>({
    status: 'idle',
    comparisons: [],
    summary: null,
    error: null,
  });

  const activityId = ride?.id ?? null;

  useEffect(() => {
    if (!enabled || !activityId) {
      setState({ status: 'idle', comparisons: [], summary: null, error: null });
      return;
    }

    let cancelled = false;

    const load = async () => {
      setState({ status: 'loading', comparisons: [], summary: null, error: null });
      try {
        let currentRows = await fetchTraversalsForActivity(activityId);

        // Self-heal: older rides with streams may never have been analyzed.
        const hasStreams = !!(ride as RideLike & { activity_streams?: { coords?: unknown[] } })
          ?.activity_streams?.coords?.length;
        if (
          currentRows.length === 0 &&
          hasStreams &&
          !ride?.training_segments_analyzed_at
        ) {
          if (cancelled) return;
          setState({ status: 'analyzing', comparisons: [], summary: null, error: null });
          const analyzed = await triggerActivityAnalysis(activityId).catch(() => false);
          if (cancelled) return;
          if (analyzed) {
            currentRows = await fetchTraversalsForActivity(activityId);
          }
        }

        if (currentRows.length === 0) {
          if (!cancelled) setState({ status: 'empty', comparisons: [], summary: null, error: null });
          return;
        }

        const segmentIds = [...new Set(currentRows.map((r) => r.segment_id))];

        const [segmentsRes, historyRes] = await Promise.all([
          supabase
            .from('training_segments')
            .select('id, display_name, terrain_type, distance_meters, avg_gradient, ride_count')
            .in('id', segmentIds),
          supabase
            .from('training_segment_rides')
            .select(TRAVERSAL_COLUMNS)
            .in('segment_id', segmentIds)
            .neq('activity_id', activityId)
            .order('ridden_at', { ascending: false })
            .limit(HISTORY_LIMIT),
        ]);

        if (segmentsRes.error) throw new Error(segmentsRes.error.message);
        if (historyRes.error) throw new Error(historyRes.error.message);
        if (cancelled) return;

        const segmentById = new Map<string, ComparisonSegmentInfo>(
          ((segmentsRes.data || []) as ComparisonSegmentInfo[]).map((s) => [s.id, s])
        );
        const historyBySegment = new Map<string, SegmentTraversal[]>();
        for (const row of (historyRes.data || []) as SegmentTraversal[]) {
          const list = historyBySegment.get(row.segment_id) || [];
          list.push(row);
          historyBySegment.set(row.segment_id, list);
        }

        const inputs: CompareInput[] = [];
        let newSegmentCount = 0;
        for (const current of currentRows) {
          const segment = segmentById.get(current.segment_id);
          if (!segment) continue;
          const history = historyBySegment.get(current.segment_id) || [];
          if (history.length === 0) {
            newSegmentCount += 1;
            continue;
          }
          inputs.push({ segment, current, history });
        }

        const { comparisons, summary } = compareActivitySegments(inputs, newSegmentCount);
        if (cancelled) return;
        setState({
          status: comparisons.length > 0 ? 'ready' : 'empty',
          comparisons,
          summary,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            comparisons: [],
            summary: null,
            error: err instanceof Error ? err.message : 'Failed to compare segment efforts',
          });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // ride object identity changes on every dashboard refresh; key off the id
    // and the analyzed flag instead to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activityId, ride?.training_segments_analyzed_at]);

  return state;
}
