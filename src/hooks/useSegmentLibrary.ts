/**
 * useSegmentLibrary Hook
 *
 * Provides segment data and operations for the Segment Library UI.
 * Reads use direct Supabase queries (anon key + RLS).
 * Compute operations POST to /api/segment-analysis with auth token.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface SegmentProfile {
  mean_avg_power: number | null;
  std_dev_power: number | null;
  typical_power_zone: string | null;
  zone_distribution: Record<string, number> | null;
  consistency_score: number;
  mean_avg_hr: number | null;
  typical_hr_zone: string | null;
  mean_cadence: number | null;
  suitable_for_steady_state: boolean;
  suitable_for_short_intervals: boolean;
  suitable_for_sprints: boolean;
  suitable_for_recovery: boolean;
  rides_last_30_days: number;
  rides_last_90_days: number;
  avg_rides_per_month: number;
  frequency_tier: string;
  typical_days: string[] | null;
  relevance_score: number;
}

export interface SegmentSummary {
  id: string;
  display_name: string;
  auto_name: string | null;
  custom_name: string | null;
  description: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_meters: number;
  avg_gradient: number;
  max_gradient: number;
  gradient_variability: number;
  elevation_gain_meters: number;
  terrain_type: 'flat' | 'climb' | 'descent' | 'rolling';
  obstruction_score: number;
  stop_count: number;
  stops_per_km: number;
  sharp_turn_count: number;
  max_uninterrupted_seconds: number;
  topology: string;
  is_repeatable: boolean;
  ride_count: number;
  first_ridden_at: string | null;
  last_ridden_at: string | null;
  confidence_score: number;
  data_quality_tier: 'measured' | 'geometry_only';
  geojson: { type: string; coordinates: [number, number][] } | null;
  training_segment_profiles: SegmentProfile | null;
}

export interface SegmentRide {
  id: string;
  activity_id: string;
  ridden_at: string;
  avg_power: number | null;
  normalized_power: number | null;
  max_power: number | null;
  power_zone: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  hr_zone: string | null;
  duration_seconds: number;
  avg_speed: number | null;
  avg_cadence: number | null;
  stop_count: number;
}

export interface SegmentDetail extends SegmentSummary {
  geojson: { type: string; coordinates: [number, number][] } | null;
  training_segment_profiles: SegmentProfile;
  training_segment_rides: SegmentRide[];
}

export interface WorkoutMatch {
  id: string;
  workout_type: string;
  segment_id: string;
  match_score: number;
  power_match: number;
  duration_match: number;
  obstruction_match: number;
  repeatability_match: number;
  relevance_match: number;
  recommended_power_target: string | null;
  recommended_ftp_range: string | null;
  match_reasoning: string | null;
  training_segments?: Partial<SegmentSummary> & { geojson?: unknown };
}

export interface SegmentFilters {
  terrainType?: string;
  frequencyTier?: string;
  sortBy?: string;
  limit?: number;
}

// ============================================================================
// API HELPER
// ============================================================================

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && (import.meta as any).env?.PROD) return '';
  return 'http://localhost:3000';
};

async function segmentApi(action: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${getApiBaseUrl()}/api/segment-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API request failed');
  return data;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSegmentLibrary(userId?: string) {
  const [segments, setSegments] = useState<SegmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch segments — direct Supabase query (read via RLS)
  const fetchSegments = useCallback(async (filters?: SegmentFilters) => {
    if (!userId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('training_segments')
        .select(`
          id, display_name, auto_name, custom_name, description,
          start_lat, start_lng, end_lat, end_lng, distance_meters,
          avg_gradient, max_gradient, gradient_variability,
          elevation_gain_meters, terrain_type, obstruction_score,
          stop_count, stops_per_km, sharp_turn_count,
          max_uninterrupted_seconds, topology, is_repeatable,
          ride_count, first_ridden_at, last_ridden_at, confidence_score, data_quality_tier, geojson,
          training_segment_profiles (
            mean_avg_power, std_dev_power, typical_power_zone,
            zone_distribution, consistency_score, mean_avg_hr,
            typical_hr_zone, mean_cadence, suitable_for_steady_state,
            suitable_for_short_intervals, suitable_for_sprints,
            suitable_for_recovery, rides_last_30_days, rides_last_90_days,
            avg_rides_per_month, frequency_tier, typical_days,
            relevance_score
          )
        `)
        .eq('user_id', userId);

      if (filters?.terrainType) {
        query = query.eq('terrain_type', filters.terrainType);
      }

      const sortBy = filters?.sortBy || 'relevance';
      switch (sortBy) {
        case 'ride_count':
          query = query.order('ride_count', { ascending: false });
          break;
        case 'distance':
          query = query.order('distance_meters', { ascending: false });
          break;
        case 'obstruction':
          query = query.order('obstruction_score', { ascending: false });
          break;
        case 'confidence':
          query = query.order('confidence_score', { ascending: false });
          break;
        default:
          query = query.order('last_ridden_at', { ascending: false });
      }

      query = query.limit(filters?.limit || 50);

      const { data, error: fetchError } = await query;
      if (fetchError) throw new Error(fetchError.message);
      // Supabase returns profiles as array from join; normalize to single object
      const normalized = (data || []).map((s: any) => ({
        ...s,
        training_segment_profiles: Array.isArray(s.training_segment_profiles)
          ? s.training_segment_profiles[0] || null
          : s.training_segment_profiles,
      }));
      setSegments(normalized as SegmentSummary[]);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch segments';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Analyze unprocessed activities — POST to API
  const analyzeUnprocessed = useCallback(async (limit = 20) => {
    return segmentApi('analyze_all', { limit });
  }, []);

  // Get segment detail — direct Supabase query (read via RLS)
  const getSegmentDetail = useCallback(async (segmentId: string): Promise<SegmentDetail | null> => {
    if (!userId) return null;
    const { data, error: fetchError } = await supabase
      .from('training_segments')
      .select(`
        *,
        training_segment_profiles (*),
        training_segment_rides (
          id, activity_id, ridden_at, avg_power, normalized_power,
          max_power, power_zone, avg_hr, max_hr, hr_zone,
          duration_seconds, avg_speed, avg_cadence, stop_count
        )
      `)
      .eq('id', segmentId)
      .eq('user_id', userId)
      .single();

    if (fetchError) return null;

    // Sort rides by date (most recent first)
    if (data.training_segment_rides) {
      data.training_segment_rides.sort(
        (a: SegmentRide, b: SegmentRide) =>
          new Date(b.ridden_at).getTime() - new Date(a.ridden_at).getTime()
      );
    }

    return data as SegmentDetail;
  }, [userId]);

  // Update segment name — POST to API
  const updateSegmentName = useCallback(async (segmentId: string, name: string | null) => {
    await segmentApi('update_segment_name', { segmentId, customName: name });
    await fetchSegments();
  }, [fetchSegments]);

  // Get workout matches — direct Supabase query (read via RLS)
  const getWorkoutMatches = useCallback(async (workoutType?: string, limit = 10): Promise<WorkoutMatch[]> => {
    if (!userId) return [];
    let query = supabase
      .from('workout_segment_matches')
      .select(`
        *,
        training_segments (
          id, display_name, description, distance_meters, avg_gradient,
          terrain_type, obstruction_score, topology, is_repeatable,
          ride_count, confidence_score, geojson
        )
      `)
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('match_score', { ascending: false })
      .limit(limit);

    if (workoutType) {
      query = query.eq('workout_type', workoutType);
    }

    const { data, error: fetchError } = await query;
    if (fetchError) return [];
    return (data || []) as WorkoutMatch[];
  }, [userId]);

  // Compute matches — POST to API
  const computeMatches = useCallback(async (
    workoutId: string,
    workoutDef: Record<string, unknown>
  ) => {
    return segmentApi('compute_matches', { workoutId, workoutDef });
  }, []);

  // Initial load
  useEffect(() => {
    if (userId) {
      fetchSegments();
    } else {
      setLoading(false);
    }
  }, [userId, fetchSegments]);

  return {
    segments,
    loading,
    error,
    fetchSegments,
    analyzeUnprocessed,
    getSegmentDetail,
    updateSegmentName,
    getWorkoutMatches,
    computeMatches,
  };
}
