/**
 * Fitness Language Layer — Type Definitions
 *
 * Shared types for the static translation layer, context assembly,
 * and AI summary generation.
 */

export interface FitnessContext {
  snapshot: {
    ctl: number;
    atl: number;
    tsb: number;
    last_ride_tss: number | null;
  };
  trends: {
    ctl_delta_28d: number;
    ctl_direction: 'building' | 'holding' | 'declining';
    atl_ctl_ratio: number;
    tsb_range_28d: { min: number; max: number; avg: number };
  };
  data_quality: {
    rides_completed_this_week: number;
    rides_planned_this_week: number;
    week_complete: boolean;
    missed_rides_flag: boolean;
    days_since_last_ride: number;
  };
  coach_context: {
    summary: string;
    upcoming_key_workout: string | null;
    upcoming_key_workout_date: string | null;
  };
  athlete: {
    ftp: number;
    weight_kg: number;
    wkg: number;
    experience_level: 'beginner' | 'intermediate' | 'advanced' | 'racer';
  };
}

export type MetricColor = 'teal' | 'orange' | 'gold' | 'coral' | 'muted';

export interface MetricTranslation {
  label: string;
  color: MetricColor;
}

export interface FitnessSummaryResponse {
  summary: string;
  cached: boolean;
  generated_at: string;
}
