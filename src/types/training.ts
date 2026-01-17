/**
 * Training System Type Definitions
 * Comprehensive types for training plans, workouts, and related utilities
 */

// ============================================================
// CORE ENUMS & LITERAL TYPES
// ============================================================

export type TrainingMethodology =
  | 'polarized'
  | 'sweet_spot'
  | 'threshold'
  | 'pyramidal'
  | 'endurance';

export type TrainingGoal =
  | 'general_fitness'
  | 'century'
  | 'climbing'
  | 'racing'
  | 'endurance'
  | 'gran_fondo'
  | 'gravel'
  | 'criterium'
  | 'time_trial';

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Plan categories for grouping and filtering
 * Based on target audience and training focus
 */
export type PlanCategory =
  | 'road_racing'      // Criterium, Road Race, TT - Cat 1-5 competitive
  | 'endurance_events' // Century, Gran Fondo, Gravel - long distance
  | 'masters'          // Age 35+ specific adaptations
  | 'time_crunched'    // Limited training hours (≤6 hrs/week)
  | 'indoor_focused'   // Trainer-optimized plans
  | 'strength_power'   // Gym + bike integration
  | 'foundation';      // Beginners and base building

export type TrainingPhase = 'base' | 'build' | 'peak' | 'taper' | 'recovery';

export type PlanStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export type WorkoutCategory =
  | 'recovery'
  | 'endurance'
  | 'tempo'
  | 'sweet_spot'
  | 'threshold'
  | 'vo2max'
  | 'climbing'
  | 'anaerobic'
  | 'racing'
  | 'strength'      // Off-bike strength training
  | 'core'          // Core stability workouts
  | 'flexibility'   // Stretching and yoga
  | 'rest';         // Complete rest day

export type TerrainType = 'flat' | 'rolling' | 'hilly';

// Zone can be 1, 2, 3, 3.5, 4, 5, 6, 7 (7 = neuromuscular/sprint)
export type TrainingZone = 1 | 2 | 3 | 3.5 | 4 | 5 | 6 | 7;

// ============================================================
// VALUE RANGES
// ============================================================

export interface Range {
  min: number;
  max: number;
}

// ============================================================
// TRAINING ZONES
// ============================================================

export interface TrainingZoneDefinition {
  name: string;
  color: string;
  ftp: Range;
  description: string;
  icon: string;
}

export type TrainingZonesMap = Record<string, TrainingZoneDefinition>;

export interface PowerZone extends TrainingZoneDefinition {
  power: Range;
}

export type PowerZonesMap = Record<string, PowerZone>;

// ============================================================
// WORKOUT TYPES
// ============================================================

export interface WorkoutTypeDefinition {
  name: string;
  description: string;
  defaultTSS: number;
  defaultDuration: number;
  primaryZone?: TrainingZone;
  color: string;
  icon: string;
}

export type WorkoutTypesMap = Record<string, WorkoutTypeDefinition>;

// ============================================================
// TRAINING PHASES
// ============================================================

export interface TrainingPhaseDefinition {
  name: string;
  description: string;
  focus: string;
  primaryZones: TrainingZone[];
  color: string;
}

export type TrainingPhasesMap = Record<TrainingPhase, TrainingPhaseDefinition>;

// ============================================================
// GOAL TYPES
// ============================================================

export interface GoalTypeDefinition {
  name: string;
  description: string;
  icon: string;
}

export type GoalTypesMap = Record<string, GoalTypeDefinition>;

// ============================================================
// FITNESS LEVELS
// ============================================================

export interface FitnessLevelDefinition {
  name: string;
  description: string;
  weeklyHours: Range;
  weeklyTSS: Range;
}

export type FitnessLevelsMap = Record<FitnessLevel, FitnessLevelDefinition>;

// ============================================================
// PLAN CATEGORIES
// ============================================================

export interface PlanCategoryDefinition {
  name: string;
  description: string;
  icon: string;
  color: string;
}

export type PlanCategoriesMap = Record<PlanCategory, PlanCategoryDefinition>;

// ============================================================
// WORKOUT STRUCTURE
// ============================================================

export interface WorkoutSegment {
  duration: number; // in minutes
  zone: TrainingZone | null;
  powerPctFTP?: number;
  cadence?: string;
  description: string;
}

export interface WorkoutInterval {
  type: 'repeat';
  sets: number;
  work: WorkoutSegment | (WorkoutSegment | WorkoutInterval)[] | WorkoutInterval;
  rest: WorkoutSegment | { duration: number; zone: null };
}

export interface WorkoutWarmupCooldown {
  duration: number;
  zone: TrainingZone | null;
  powerPctFTP?: number;
  description?: string;
}

export interface WorkoutStructure {
  warmup: WorkoutWarmupCooldown | null;
  main: (WorkoutSegment | WorkoutInterval)[];
  cooldown: WorkoutWarmupCooldown | null;
}

// ============================================================
// DETAILED EXERCISE TYPES (for strength/core/flexibility)
// ============================================================

/**
 * Equipment that may be needed for exercises
 */
export type ExerciseEquipment =
  | 'none'
  | 'barbell'
  | 'dumbbells'
  | 'kettlebell'
  | 'resistance_band'
  | 'stability_ball'
  | 'foam_roller'
  | 'yoga_mat'
  | 'pull_up_bar'
  | 'medicine_ball'
  | 'bench'
  | 'cable_machine'
  | 'squat_rack';

/**
 * Muscle groups targeted by exercises
 */
export type MuscleGroup =
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'hip_flexors'
  | 'core'
  | 'lower_back'
  | 'upper_back'
  | 'chest'
  | 'shoulders'
  | 'arms'
  | 'full_body';

/**
 * Individual exercise in a strength/core workout
 */
export interface StrengthExercise {
  name: string;
  sets: number;
  reps: number | string; // number or "8-12" or "to failure"
  weight?: string; // e.g., "bodyweight", "60-70% 1RM", "moderate"
  restSeconds: number; // rest between sets
  tempo?: string; // e.g., "3-1-1" (eccentric-pause-concentric)
  equipment: ExerciseEquipment[];
  muscleGroups: MuscleGroup[];
  instructions: string; // Form cues and how to perform
  alternatives?: string[]; // Alternative exercises if equipment unavailable
  videoUrl?: string; // Link to demonstration video
}

/**
 * Individual stretch in a flexibility workout
 */
export interface StretchExercise {
  name: string;
  duration: number; // seconds to hold
  sides?: 'both' | 'left_then_right' | 'single'; // for unilateral stretches
  reps?: number; // if doing multiple rounds
  equipment: ExerciseEquipment[];
  muscleGroups: MuscleGroup[];
  instructions: string;
  breathingCue?: string; // e.g., "exhale deeper into stretch"
  modifications?: string; // easier/harder versions
  videoUrl?: string;
}

/**
 * Core exercise with time or rep-based
 */
export interface CoreExercise {
  name: string;
  sets: number;
  reps?: number | string; // for rep-based exercises
  duration?: number; // seconds, for time-based exercises (planks, etc.)
  restSeconds: number;
  equipment: ExerciseEquipment[];
  muscleGroups: MuscleGroup[];
  instructions: string;
  progression?: string; // how to make harder
  regression?: string; // how to make easier
  videoUrl?: string;
}

/**
 * Detailed structure for off-bike workouts
 */
export interface OffBikeWorkoutStructure {
  warmup: {
    duration: number; // minutes
    description: string;
    exercises?: (StrengthExercise | CoreExercise | StretchExercise)[];
  };
  main: (StrengthExercise | CoreExercise | StretchExercise)[];
  cooldown?: {
    duration: number;
    description: string;
    exercises?: StretchExercise[];
  };
}

// ============================================================
// CYCLING INTERVAL TYPES (for bike computer export)
// ============================================================

/**
 * Power target can be absolute watts, % FTP, or a range
 */
export interface PowerTarget {
  type: 'percent_ftp' | 'absolute_watts' | 'range';
  value: number; // for percent_ftp or absolute_watts
  min?: number; // for range type
  max?: number; // for range type
}

/**
 * Cadence target for interval
 */
export interface CadenceTarget {
  min: number;
  max: number;
  preferred?: number;
}

/**
 * Single interval step for bike computer export
 */
export interface CyclingIntervalStep {
  name: string;
  type: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'rest';
  duration: number; // seconds
  power: PowerTarget;
  cadence?: CadenceTarget;
  heartRateZone?: number; // 1-5
  instructions?: string; // cues shown on device
}

/**
 * Repeat block for structured workouts
 */
export interface CyclingRepeatBlock {
  type: 'repeat';
  name: string;
  iterations: number;
  steps: CyclingIntervalStep[];
}

/**
 * Complete cycling workout structure for export
 */
export interface CyclingWorkoutStructure {
  /** Total planned duration in minutes */
  totalDuration: number;
  /** Steps that make up the workout */
  steps: (CyclingIntervalStep | CyclingRepeatBlock)[];
  /** FTP used when workout was created (for scaling) */
  baseFTP?: number;
  /** Target terrain if outdoor */
  terrain?: {
    type: 'flat' | 'rolling' | 'hilly' | 'climb';
    elevationGain?: number; // meters
    suggestedRoute?: string; // text description
  };
}

/**
 * Export format for bike computers
 */
export type WorkoutExportFormat = 'fit' | 'zwo' | 'mrc' | 'erg' | 'tcx' | 'json';

// ============================================================
// ENHANCED WORKOUT DEFINITION
// ============================================================

/**
 * Extended workout definition with detailed exercise/interval data
 */
export interface WorkoutDefinitionExtended extends Omit<WorkoutDefinition, 'structure'> {
  /** Original structure for backward compatibility */
  structure: WorkoutStructure;
  /** Detailed cycling intervals for export */
  cyclingStructure?: CyclingWorkoutStructure;
  /** Detailed exercises for strength/core/flexibility */
  exercises?: OffBikeWorkoutStructure;
  /** Whether this workout can be exported to bike computers */
  exportable?: boolean;
  /** Supported export formats */
  exportFormats?: WorkoutExportFormat[];
}

// ============================================================
// WORKOUT DEFINITION (from workoutLibrary)
// ============================================================

export interface WorkoutDefinition {
  id: string;
  name: string;
  category: WorkoutCategory;
  difficulty: FitnessLevel;
  duration: number; // in minutes
  targetTSS: number;
  intensityFactor: number;
  description: string;
  focusArea: string;
  tags: string[];
  terrainType: TerrainType;
  structure: WorkoutStructure;
  coachNotes: string;
  /** Whether this workout can be exported to bike computers */
  exportable?: boolean;
  /** Supported export formats */
  exportFormats?: WorkoutExportFormat[];
  /** Detailed cycling intervals for export */
  cyclingStructure?: CyclingWorkoutStructure;
  /** Detailed exercises for strength/core/flexibility workouts */
  exercises?: OffBikeWorkoutStructure;
}

export type WorkoutLibrary = Record<string, WorkoutDefinition>;

// ============================================================
// TRAINING PLAN TEMPLATE
// ============================================================

export interface PlanPhase {
  weeks: number[];
  phase: TrainingPhase;
  focus: string;
}

export interface DayWorkout {
  workout: string | null; // workout ID from library, null = rest day
  notes: string;
}

export type WeekTemplate = Record<DayOfWeek, DayWorkout>;

export interface ExpectedGains {
  [key: string]: string;
}

export interface TrainingPlanTemplate {
  id: string;
  name: string;
  description: string;
  duration: number; // in weeks
  methodology: TrainingMethodology;
  goal: TrainingGoal;
  fitnessLevel: FitnessLevel;
  category: PlanCategory; // For grouping in UI
  hoursPerWeek: Range;
  weeklyTSS: Range;
  phases: PlanPhase[];
  weekTemplates: Record<number, WeekTemplate>;
  expectedGains: ExpectedGains;
  targetAudience: string;
  /** Research citations supporting this plan's methodology */
  researchBasis?: string[];
}

export type TrainingPlanTemplatesMap = Record<string, TrainingPlanTemplate>;

// ============================================================
// TRAINING METHODOLOGIES
// ============================================================

export interface WeeklyDistribution {
  zone1_2: number;
  zone3_4?: number;
  zone3_sst?: number;
  zone4_plus?: number;
  zone5_plus?: number;
}

export interface SampleWeekDay {
  day: string;
  workout: string | null;
}

export interface TrainingMethodologyDefinition {
  name: string;
  description: string;
  weeklyDistribution: WeeklyDistribution;
  bestFor: string[];
  researchBasis: string;
  sampleWeek: SampleWeekDay[];
}

export type TrainingMethodologiesMap = Record<string, TrainingMethodologyDefinition>;

// ============================================================
// DATABASE MODELS (matches Supabase schema)
// ============================================================

export interface TrainingPlanDB {
  id: string;
  user_id: string;
  template_id: string | null;
  name: string;
  duration_weeks: number;
  methodology: TrainingMethodology | null;
  goal: TrainingGoal | null;
  fitness_level: FitnessLevel | null;
  status: PlanStatus;
  started_at: string; // ISO date string
  ended_at: string | null;
  paused_at: string | null;
  current_week: number;
  workouts_completed: number;
  workouts_total: number;
  compliance_percentage: number;
  custom_start_day: number | null;
  auto_adjust_enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannedWorkoutDB {
  id: string;
  plan_id: string;
  week_number: number;
  day_of_week: number; // 0-6 (Sunday = 0)
  scheduled_date: string; // ISO date string
  workout_type: string | null;
  workout_id: string | null;
  target_tss: number | null;
  target_duration: number | null;
  target_distance_km: number | null;
  completed: boolean;
  completed_at: string | null;
  activity_id: string | null;
  actual_tss: number | null;
  actual_duration: number | null;
  actual_distance_km: number | null;
  difficulty_rating: number | null;
  notes: string | null;
  skipped_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// UI STATE TYPES
// ============================================================

export interface ActivePlan extends TrainingPlanDB {
  template?: TrainingPlanTemplate;
}

export interface PlannedWorkoutWithDetails extends PlannedWorkoutDB {
  workout?: WorkoutDefinition;
}

export interface WeeklyStats {
  weekNumber: number;
  plannedTSS: number;
  actualTSS: number;
  plannedDuration: number;
  actualDuration: number;
  workoutsPlanned: number;
  workoutsCompleted: number;
  compliancePercent: number;
}

export interface PlanProgress {
  currentWeek: number;
  totalWeeks: number;
  currentPhase: TrainingPhase;
  overallCompliance: number;
  weeklyStats: WeeklyStats[];
  daysRemaining: number;
  nextWorkout: PlannedWorkoutWithDetails | null;
}

// ============================================================
// TSB / TRAINING LOAD TYPES
// ============================================================

export type TSBStatus = 'fresh' | 'rested' | 'neutral' | 'fatigued' | 'very_fatigued';

export interface TSBInterpretation {
  status: TSBStatus;
  color: string;
  message: string;
  recommendation: string;
}

export interface TrainingLoadMetrics {
  ctl: number; // Chronic Training Load (fitness)
  atl: number; // Acute Training Load (fatigue)
  tsb: number; // Training Stress Balance (form)
  interpretation: TSBInterpretation;
}

// ============================================================
// FILTER & SEARCH TYPES
// ============================================================

export interface PlanFilters {
  fitnessLevel?: FitnessLevel;
  goal?: TrainingGoal;
  methodology?: TrainingMethodology;
  minDuration?: number;
  maxDuration?: number;
  minHoursPerWeek?: number;
  maxHoursPerWeek?: number;
}

export interface WorkoutFilters {
  category?: WorkoutCategory;
  difficulty?: FitnessLevel;
  minTSS?: number;
  maxTSS?: number;
  minDuration?: number;
  maxDuration?: number;
  tags?: string[];
}

// ============================================================
// PLAN CUSTOMIZATION
// ============================================================

export interface PlanCustomization {
  startDate: Date;
  restDays: DayOfWeek[]; // Which days should be rest
  weeklyHoursTarget?: number;
  weeklyTSSTarget?: number;
  skipPhases?: TrainingPhase[];
  customNotes?: string;
}

// ============================================================
// ACTIVITY LINKING
// ============================================================

export interface ActivityMatch {
  activityId: string;
  plannedWorkoutId: string;
  matchScore: number; // 0-100, how well the activity matches the planned workout
  matchReasons: string[];
}

export interface ActivitySummary {
  id: string;
  name: string;
  date: string;
  duration: number; // minutes
  distance: number; // km
  tss: number | null;
  elevationGain: number;
  averagePower: number | null;
  normalizedPower: number | null;
}

// ============================================================
// HELPER TYPE GUARDS
// ============================================================

export function isWorkoutInterval(
  segment: WorkoutSegment | WorkoutInterval
): segment is WorkoutInterval {
  return 'type' in segment && segment.type === 'repeat';
}

export function isPlanActive(plan: TrainingPlanDB): boolean {
  return plan.status === 'active';
}

export function isPlanCompleted(plan: TrainingPlanDB): boolean {
  return plan.status === 'completed';
}

// ============================================================
// USER AVAILABILITY TYPES
// ============================================================

/**
 * Availability status for a given day
 */
export type AvailabilityStatus = 'available' | 'blocked' | 'preferred';

/**
 * Database model for user's weekly day availability (global settings)
 */
export interface UserDayAvailabilityDB {
  id: string;
  user_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  is_blocked: boolean;
  is_preferred: boolean;
  max_duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database model for date-specific overrides
 */
export interface UserDateOverrideDB {
  id: string;
  user_id: string;
  specific_date: string; // ISO date string (YYYY-MM-DD)
  is_blocked: boolean | null;
  is_preferred: boolean | null;
  max_duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database model for user training preferences
 */
export interface UserTrainingPreferencesDB {
  id: string;
  user_id: string;
  max_workouts_per_week: number | null;
  max_hours_per_week: number | null;
  max_hard_days_per_week: number | null;
  prefer_morning_workouts: boolean | null;
  prefer_weekend_long_rides: boolean;
  min_rest_days_per_week: number;
  created_at: string;
  updated_at: string;
}

/**
 * Frontend-friendly day availability config
 */
export interface DayAvailability {
  dayOfWeek: number;
  dayName: DayOfWeek;
  status: AvailabilityStatus;
  maxDurationMinutes: number | null;
  notes: string | null;
}

/**
 * Frontend-friendly date override
 */
export interface DateOverride {
  date: string; // ISO date string
  status: AvailabilityStatus;
  isOverride: true;
  maxDurationMinutes: number | null;
  notes: string | null;
}

/**
 * Resolved availability for a specific date (combines global + override)
 */
export interface ResolvedAvailability {
  date: string;
  status: AvailabilityStatus;
  isOverride: boolean;
  maxDurationMinutes: number | null;
  notes: string | null;
}

/**
 * Full user availability configuration
 */
export interface UserAvailabilityConfig {
  weeklyAvailability: DayAvailability[];
  dateOverrides: DateOverride[];
  preferences: {
    maxWorkoutsPerWeek: number | null;
    maxHoursPerWeek: number | null;
    maxHardDaysPerWeek: number | null;
    preferMorningWorkouts: boolean | null;
    preferWeekendLongRides: boolean;
    minRestDaysPerWeek: number;
  };
}

/**
 * Input for setting day availability
 */
export interface SetDayAvailabilityInput {
  dayOfWeek: number;
  status: AvailabilityStatus;
  maxDurationMinutes?: number | null;
  notes?: string | null;
}

/**
 * Input for setting date override
 */
export interface SetDateOverrideInput {
  date: string;
  status: AvailabilityStatus;
  maxDurationMinutes?: number | null;
  notes?: string | null;
}

/**
 * Input for updating training preferences
 */
export interface UpdateTrainingPreferencesInput {
  maxWorkoutsPerWeek?: number | null;
  maxHoursPerWeek?: number | null;
  maxHardDaysPerWeek?: number | null;
  preferMorningWorkouts?: boolean | null;
  preferWeekendLongRides?: boolean;
  minRestDaysPerWeek?: number;
}

/**
 * Result of workout redistribution algorithm
 */
export interface WorkoutRedistributionResult {
  originalDate: string;
  newDate: string;
  workoutId: string;
  reason: string;
}

/**
 * Plan activation with availability-aware scheduling
 */
export interface PlanActivationPreview {
  templateId: string;
  startDate: string;
  blockedDaysAffected: number;
  redistributedWorkouts: WorkoutRedistributionResult[];
  warnings: string[];
  canActivate: boolean;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  // This allows importing types as a namespace
};
