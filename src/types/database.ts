/**
 * Database Type Definitions
 * Types for Supabase tables and queries
 */

import type {
  TrainingPlanDB,
  PlannedWorkoutDB,
  TrainingMethodology,
  TrainingGoal,
  FitnessLevel,
  PlanStatus,
} from './training';

// ============================================================
// SUPABASE TABLE TYPES
// ============================================================

export interface Database {
  public: {
    Tables: {
      training_plans: {
        Row: TrainingPlanDB;
        Insert: TrainingPlanInsert;
        Update: TrainingPlanUpdate;
      };
      planned_workouts: {
        Row: PlannedWorkoutDB;
        Insert: PlannedWorkoutInsert;
        Update: PlannedWorkoutUpdate;
      };
      activities: {
        Row: ActivityDB;
        Insert: ActivityInsert;
        Update: ActivityUpdate;
      };
      user_profiles: {
        Row: UserProfileDB;
        Insert: UserProfileInsert;
        Update: UserProfileUpdate;
      };
    };
  };
}

// ============================================================
// TRAINING PLANS
// ============================================================

export interface TrainingPlanInsert {
  id?: string;
  user_id: string;
  template_id?: string | null;
  name: string;
  duration_weeks: number;
  methodology?: TrainingMethodology | null;
  goal?: TrainingGoal | null;
  fitness_level?: FitnessLevel | null;
  status?: PlanStatus;
  started_at: string;
  ended_at?: string | null;
  paused_at?: string | null;
  current_week?: number;
  workouts_completed?: number;
  workouts_total?: number;
  compliance_percentage?: number;
  custom_start_day?: number | null;
  auto_adjust_enabled?: boolean;
  notes?: string | null;
}

export interface TrainingPlanUpdate {
  template_id?: string | null;
  name?: string;
  duration_weeks?: number;
  methodology?: TrainingMethodology | null;
  goal?: TrainingGoal | null;
  fitness_level?: FitnessLevel | null;
  status?: PlanStatus;
  started_at?: string;
  ended_at?: string | null;
  paused_at?: string | null;
  current_week?: number;
  workouts_completed?: number;
  workouts_total?: number;
  compliance_percentage?: number;
  custom_start_day?: number | null;
  auto_adjust_enabled?: boolean;
  notes?: string | null;
  updated_at?: string;
}

// ============================================================
// PLANNED WORKOUTS
// ============================================================

export interface PlannedWorkoutInsert {
  id?: string;
  plan_id: string;
  week_number: number;
  day_of_week: number;
  scheduled_date: string;
  workout_type?: string | null;
  workout_id?: string | null;
  target_tss?: number | null;
  target_duration?: number | null;
  target_distance_km?: number | null;
  completed?: boolean;
  completed_at?: string | null;
  activity_id?: string | null;
  actual_tss?: number | null;
  actual_duration?: number | null;
  actual_distance_km?: number | null;
  difficulty_rating?: number | null;
  notes?: string | null;
  skipped_reason?: string | null;
}

export interface PlannedWorkoutUpdate {
  week_number?: number;
  day_of_week?: number;
  scheduled_date?: string;
  workout_type?: string | null;
  workout_id?: string | null;
  target_tss?: number | null;
  target_duration?: number | null;
  target_distance_km?: number | null;
  completed?: boolean;
  completed_at?: string | null;
  activity_id?: string | null;
  actual_tss?: number | null;
  actual_duration?: number | null;
  actual_distance_km?: number | null;
  difficulty_rating?: number | null;
  notes?: string | null;
  skipped_reason?: string | null;
  updated_at?: string;
}

// ============================================================
// ACTIVITIES
// ============================================================

export interface ActivityDB {
  id: string;
  user_id: string;
  name: string;
  activity_type: string;
  start_date: string;
  duration_seconds: number;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  average_speed_mps: number | null;
  max_speed_mps: number | null;
  average_power_watts: number | null;
  normalized_power_watts: number | null;
  max_power_watts: number | null;
  average_heart_rate: number | null;
  max_heart_rate: number | null;
  average_cadence: number | null;
  tss: number | null;
  intensity_factor: number | null;
  calories: number | null;
  source: string; // 'strava', 'garmin', 'wahoo', 'manual', 'fit_file'
  external_id: string | null;
  polyline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityInsert {
  id?: string;
  user_id: string;
  name: string;
  activity_type: string;
  start_date: string;
  duration_seconds: number;
  distance_meters?: number | null;
  elevation_gain_meters?: number | null;
  average_speed_mps?: number | null;
  max_speed_mps?: number | null;
  average_power_watts?: number | null;
  normalized_power_watts?: number | null;
  max_power_watts?: number | null;
  average_heart_rate?: number | null;
  max_heart_rate?: number | null;
  average_cadence?: number | null;
  tss?: number | null;
  intensity_factor?: number | null;
  calories?: number | null;
  source: string;
  external_id?: string | null;
  polyline?: string | null;
  notes?: string | null;
}

export interface ActivityUpdate {
  name?: string;
  activity_type?: string;
  start_date?: string;
  duration_seconds?: number;
  distance_meters?: number | null;
  elevation_gain_meters?: number | null;
  average_speed_mps?: number | null;
  max_speed_mps?: number | null;
  average_power_watts?: number | null;
  normalized_power_watts?: number | null;
  max_power_watts?: number | null;
  average_heart_rate?: number | null;
  max_heart_rate?: number | null;
  average_cadence?: number | null;
  tss?: number | null;
  intensity_factor?: number | null;
  calories?: number | null;
  source?: string;
  external_id?: string | null;
  polyline?: string | null;
  notes?: string | null;
  updated_at?: string;
}

// ============================================================
// USER PROFILES
// ============================================================

export interface UserProfileDB {
  id: string;
  user_id: string;
  display_name: string | null;
  ftp: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null;
  fitness_level: FitnessLevel | null;
  weekly_hours_available: number | null;
  preferred_units: 'metric' | 'imperial';
  strava_connected: boolean;
  garmin_connected: boolean;
  wahoo_connected: boolean;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfileInsert {
  id?: string;
  user_id: string;
  display_name?: string | null;
  ftp?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  date_of_birth?: string | null;
  fitness_level?: FitnessLevel | null;
  weekly_hours_available?: number | null;
  preferred_units?: 'metric' | 'imperial';
  strava_connected?: boolean;
  garmin_connected?: boolean;
  wahoo_connected?: boolean;
  timezone?: string | null;
}

export interface UserProfileUpdate {
  display_name?: string | null;
  ftp?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  date_of_birth?: string | null;
  fitness_level?: FitnessLevel | null;
  weekly_hours_available?: number | null;
  preferred_units?: 'metric' | 'imperial';
  strava_connected?: boolean;
  garmin_connected?: boolean;
  wahoo_connected?: boolean;
  timezone?: string | null;
  updated_at?: string;
}

// ============================================================
// QUERY HELPERS
// ============================================================

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

// ============================================================
// SUPABASE RESPONSE TYPES
// ============================================================

export interface SupabaseError {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
}

export interface SupabaseResponse<T> {
  data: T | null;
  error: SupabaseError | null;
}

export interface SupabaseListResponse<T> {
  data: T[] | null;
  error: SupabaseError | null;
  count: number | null;
}
