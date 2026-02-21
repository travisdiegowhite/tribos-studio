/**
 * Training System Type Definitions
 * Comprehensive types for training plans, workouts, and related utilities
 */

// ============================================================
// CORE ENUMS & LITERAL TYPES
// ============================================================

/**
 * Primary sport type for multi-sport support
 */
export type SportType = 'cycling' | 'running';

export type TrainingMethodology =
  | 'polarized'
  | 'sweet_spot'
  | 'threshold'
  | 'pyramidal'
  | 'endurance';

/**
 * Cycling-specific training goals
 */
export type CyclingTrainingGoal =
  | 'general_fitness'
  | 'century'
  | 'climbing'
  | 'racing'
  | 'endurance'
  | 'gran_fondo'
  | 'gravel'
  | 'criterium'
  | 'time_trial';

/**
 * Running-specific training goals
 */
export type RunningTrainingGoal =
  | 'general_fitness'
  | '5k'
  | '10k'
  | 'half_marathon'
  | 'marathon'
  | 'ultra'
  | 'trail'
  | 'speed'
  | 'base_building';

export type TrainingGoal = CyclingTrainingGoal | RunningTrainingGoal;

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Cycling-specific plan categories
 */
export type CyclingPlanCategory =
  | 'road_racing'      // Criterium, Road Race, TT - Cat 1-5 competitive
  | 'endurance_events' // Century, Gran Fondo, Gravel - long distance
  | 'masters'          // Age 35+ specific adaptations
  | 'time_crunched'    // Limited training hours (≤6 hrs/week)
  | 'indoor_focused'   // Trainer-optimized plans
  | 'strength_power'   // Gym + bike integration
  | 'foundation';      // Beginners and base building

/**
 * Running-specific plan categories
 */
export type RunningPlanCategory =
  | 'race_distance'      // 5K, 10K, Half, Marathon specific
  | 'trail_ultra'        // Trail running and ultra-distance
  | 'speed_development'  // Track/speed-focused plans
  | 'base_building'      // Mileage building for beginners/returning runners
  | 'masters'            // Age 35+ specific adaptations
  | 'foundation';        // Beginners and base building

/**
 * Plan categories for grouping and filtering
 * Based on target audience and training focus
 */
export type PlanCategory = CyclingPlanCategory | RunningPlanCategory;

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
  | 'strength'      // Off-bike/off-run strength training
  | 'core'          // Core stability workouts
  | 'flexibility'   // Stretching and yoga
  | 'rest';         // Complete rest day

export type TerrainType = 'flat' | 'rolling' | 'hilly';

/**
 * Running-specific terrain types
 */
export type RunningTerrainType = 'road' | 'trail' | 'track' | 'treadmill' | 'mixed';

/**
 * Strava/Garmin activity types we recognize
 */
export type CyclingActivityType = 'Ride' | 'VirtualRide' | 'EBikeRide' | 'GravelRide' | 'MountainBikeRide';
export type RunningActivityType = 'Run' | 'VirtualRun' | 'TrailRun';
export type SupportedActivityType = CyclingActivityType | RunningActivityType;

// Zone can be 1, 2, 3, 3.5, 4, 5, 6, 7 (7 = neuromuscular/sprint)
export type TrainingZone = 1 | 2 | 3 | 3.5 | 4 | 5 | 6 | 7;

/**
 * Running pace zones (based on threshold/lactate threshold pace)
 * Zone 1: Recovery (slower than 129% of threshold pace)
 * Zone 2: Easy/Aerobic (114-129% of threshold pace)
 * Zone 3: Tempo (106-113% of threshold pace)
 * Zone 4: Threshold (99-105% of threshold pace)
 * Zone 5: VO2max (97-103% of vVO2max)
 * Zone 6: Anaerobic/Speed (faster than VO2max pace)
 */
export type RunningPaceZone = 1 | 2 | 3 | 4 | 5 | 6;

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
// RUNNING PACE ZONE DEFINITIONS
// ============================================================

/**
 * Pace zone definition for running (based on threshold pace)
 * Pace values are in seconds per km
 */
export interface PaceZoneDefinition {
  name: string;
  color: string;
  paceRange: Range; // seconds per km (min = faster, max = slower)
  hrRange?: Range; // percentage of max HR
  description: string;
  icon: string;
}

export type PaceZonesMap = Record<string, PaceZoneDefinition>;

/**
 * Running-specific workout segment (pace-based instead of power-based)
 */
export interface RunningWorkoutSegment {
  duration?: number; // in minutes (for time-based segments)
  distance?: number; // in meters (for distance-based segments, e.g. 400m repeats)
  paceZone: RunningPaceZone | null;
  pacePctThreshold?: number; // percentage of threshold pace (100 = threshold)
  targetPace?: string; // descriptive pace target, e.g. "5:00-5:15/km"
  heartRateZone?: number; // 1-5 HR zone
  cadence?: string; // steps per minute, e.g. "170-180"
  description: string;
}

/**
 * Running interval structure
 */
export interface RunningWorkoutInterval {
  type: 'repeat';
  sets: number;
  work: RunningWorkoutSegment;
  rest: RunningWorkoutSegment | { duration: number; paceZone: null };
}

/**
 * Complete running workout structure
 */
export interface RunningWorkoutStructure {
  warmup: RunningWorkoutSegment | null;
  main: (RunningWorkoutSegment | RunningWorkoutInterval)[];
  cooldown: RunningWorkoutSegment | null;
  /** Total planned distance in km (for mileage tracking) */
  totalDistance?: number;
  /** Running terrain */
  terrain?: RunningTerrainType;
  /** Strides at the end (common in easy runs) */
  strides?: number;
}

/**
 * Running threshold / fitness profile
 * Used to calculate pace zones and rTSS
 */
export interface RunningProfile {
  /** Threshold pace in seconds per km (lactate threshold / tempo pace) */
  thresholdPaceSec: number;
  /** VDOT score (Jack Daniels' running fitness metric) */
  vdot?: number;
  /** Max heart rate in bpm */
  maxHR?: number;
  /** Resting heart rate in bpm */
  restingHR?: number;
  /** Lactate threshold HR in bpm */
  lthr?: number;
  /** Race PRs for VDOT estimation */
  racePRs?: {
    distance: '5k' | '10k' | 'half_marathon' | 'marathon';
    timeSec: number;
    date?: string;
  }[];
}

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
  /** Sport type - defaults to 'cycling' for backward compatibility */
  sportType?: SportType;
  category: WorkoutCategory;
  difficulty: FitnessLevel;
  duration: number; // in minutes
  targetTSS: number;
  intensityFactor: number;
  description: string;
  focusArea: string;
  tags: string[];
  terrainType: TerrainType;
  /** Running terrain type (only for running workouts) */
  runningTerrainType?: RunningTerrainType;
  structure: WorkoutStructure;
  /** Running-specific workout structure (only for running workouts) */
  runningStructure?: RunningWorkoutStructure;
  coachNotes: string;
  /** Target distance in km (primarily for running workouts) */
  targetDistance?: number;
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
  /** Sport type - defaults to 'cycling' for backward compatibility */
  sportType?: SportType;
  description: string;
  duration: number; // in weeks
  methodology: TrainingMethodology;
  goal: TrainingGoal;
  fitnessLevel: FitnessLevel;
  category: PlanCategory; // For grouping in UI
  hoursPerWeek: Range;
  weeklyTSS: Range;
  /** Weekly distance target in km (primarily for running plans) */
  weeklyDistance?: Range;
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
  /** Sport type - 'cycling' or 'running' */
  sport_type: SportType | null;
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
  /** Activity type (e.g. 'Ride', 'Run', 'TrailRun') */
  type?: string;
  /** Resolved sport type */
  sportType?: SportType;
  date: string;
  duration: number; // minutes
  distance: number; // km
  tss: number | null;
  elevationGain: number;
  averagePower: number | null;
  normalizedPower: number | null;
  /** Average pace in seconds per km (running) */
  averagePace?: number | null;
  /** Average heart rate in bpm */
  averageHeartrate?: number | null;
  /** Average cadence (RPM for cycling, steps/min for running) */
  averageCadence?: number | null;
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
// SPORT TYPE HELPERS
// ============================================================

const CYCLING_ACTIVITY_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
const RUNNING_ACTIVITY_TYPES = ['Run', 'VirtualRun', 'TrailRun'];

/**
 * Determine the sport type from a Strava/Garmin activity type string
 */
export function getSportTypeFromActivityType(activityType: string): SportType | null {
  if (CYCLING_ACTIVITY_TYPES.includes(activityType)) return 'cycling';
  if (RUNNING_ACTIVITY_TYPES.includes(activityType)) return 'running';
  return null;
}

/**
 * Check if an activity type is a cycling activity
 */
export function isCyclingActivity(activityType: string): boolean {
  return CYCLING_ACTIVITY_TYPES.includes(activityType);
}

/**
 * Check if an activity type is a running activity
 */
export function isRunningActivity(activityType: string): boolean {
  return RUNNING_ACTIVITY_TYPES.includes(activityType);
}

/**
 * Check if a running workout interval
 */
export function isRunningWorkoutInterval(
  segment: RunningWorkoutSegment | RunningWorkoutInterval
): segment is RunningWorkoutInterval {
  return 'type' in segment && segment.type === 'repeat';
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
  /** Prefer weekend long runs (running equivalent of long rides) */
  prefer_weekend_long_runs: boolean;
  min_rest_days_per_week: number;
  /** User's primary sport type */
  primary_sport: SportType | null;
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
    preferWeekendLongRuns: boolean;
    minRestDaysPerWeek: number;
    primarySport: SportType | null;
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
  preferWeekendLongRuns?: boolean;
  minRestDaysPerWeek?: number;
  primarySport?: SportType | null;
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
// WORKOUT ADAPTATION TYPES
// ============================================================

/**
 * Types of adaptations that can occur when a workout is completed
 */
export type AdaptationType =
  | 'completed_as_planned' // Workout done as intended
  | 'time_truncated'       // Same type, shorter duration
  | 'time_extended'        // Same type, longer duration
  | 'intensity_swap'       // Different workout type, similar TSS
  | 'downgraded'           // Lower intensity than planned
  | 'upgraded'             // Higher intensity than planned
  | 'skipped'              // Workout not completed
  | 'unplanned';           // Activity without a planned workout

/**
 * Reasons why a user might adapt their workout
 */
export type AdaptationReason =
  | 'time_constraint'
  | 'felt_tired'
  | 'felt_good'
  | 'weather'
  | 'equipment'
  | 'coach_adjustment'
  | 'illness_injury'
  | 'life_event'
  | 'other';

/**
 * AI assessment of how significant/concerning an adaptation is
 */
export type AdaptationAssessment =
  | 'beneficial'      // Adaptation was actually better for training
  | 'acceptable'      // Minor deviation, no real impact
  | 'minor_concern'   // Worth noting but not problematic
  | 'concerning';     // May negatively impact training goals

/**
 * Stimulus breakdown for missing or gained training
 */
export interface StimulusBreakdown {
  /** Minutes of specific workout types (e.g., sweet_spot: 20, threshold: 10) */
  [workoutType: string]: number;
}

/**
 * Stimulus analysis breakdown
 */
export interface StimulusAnalysis {
  /** Training stimulus that was missed compared to plan */
  missing: StimulusBreakdown;
  /** Training stimulus that was gained (different from plan or extra) */
  gained: StimulusBreakdown;
  /** Overall assessment of the stimulus change */
  net_assessment: AdaptationAssessment;
}

/**
 * Database model for workout adaptations
 */
export interface WorkoutAdaptationDB {
  id: string;
  user_id: string;
  planned_workout_id: string | null;
  activity_id: string | null;

  adaptation_type: AdaptationType;

  // Planned metrics
  planned_workout_type: string | null;
  planned_tss: number | null;
  planned_duration: number | null;
  planned_intensity_factor: number | null;

  // Actual metrics
  actual_workout_type: string | null;
  actual_tss: number | null;
  actual_duration: number | null;
  actual_intensity_factor: number | null;
  actual_normalized_power: number | null;

  // Deltas
  tss_delta: number | null;
  duration_delta: number | null;
  stimulus_achieved_pct: number | null;
  stimulus_analysis: StimulusAnalysis | null;

  // User feedback
  user_reason: AdaptationReason | null;
  user_notes: string | null;

  // AI assessment
  ai_assessment: AdaptationAssessment | null;
  ai_explanation: string | null;
  ai_recommendations: SuggestedAction[] | null;

  // Context
  week_number: number | null;
  training_phase: TrainingPhase | null;
  ctg_at_time: number | null;
  atl_at_time: number | null;
  tsb_at_time: number | null;

  detected_at: string;
  created_at: string;
}

/**
 * Frontend-friendly workout adaptation
 */
export interface WorkoutAdaptation {
  id: string;
  plannedWorkoutId: string | null;
  activityId: string | null;

  adaptationType: AdaptationType;

  planned: {
    workoutType: string | null;
    tss: number | null;
    duration: number | null;
    intensityFactor: number | null;
  };

  actual: {
    workoutType: string | null;
    tss: number | null;
    duration: number | null;
    intensityFactor: number | null;
    normalizedPower: number | null;
  };

  analysis: {
    tssDelta: number | null;
    durationDelta: number | null;
    stimulusAchievedPct: number | null;
    stimulusAnalysis: StimulusAnalysis | null;
  };

  userFeedback: {
    reason: AdaptationReason | null;
    notes: string | null;
  };

  aiAssessment: {
    assessment: AdaptationAssessment | null;
    explanation: string | null;
    recommendations: SuggestedAction[] | null;
  };

  context: {
    weekNumber: number | null;
    trainingPhase: TrainingPhase | null;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
  };

  detectedAt: string;
}

// ============================================================
// TRAINING INSIGHTS TYPES
// ============================================================

/**
 * Scope of an insight
 */
export type InsightScope = 'workout' | 'day' | 'week' | 'block' | 'trend';

/**
 * Types of insights the system can generate
 */
export type InsightType =
  | 'suggestion'          // Actionable recommendation
  | 'warning'             // Something that needs attention
  | 'praise'              // Positive reinforcement
  | 'adaptation_needed'   // Plan needs adjustment
  | 'pattern_detected'    // Noticed a user behavior pattern
  | 'goal_at_risk'        // Current trajectory won't meet goal
  | 'recovery_needed';    // User may be overreaching

/**
 * Priority levels for insights
 */
export type InsightPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Status of an insight
 */
export type InsightStatus = 'active' | 'dismissed' | 'applied' | 'expired' | 'superseded';

/**
 * Types of suggested actions
 */
export type SuggestedActionType =
  | 'add_workout'
  | 'swap_workout'
  | 'remove_workout'
  | 'extend_phase'
  | 'add_recovery'
  | 'adjust_targets'
  | 'reschedule'
  | 'reduce_volume'
  | 'increase_volume';

/**
 * Suggested action attached to an insight
 */
export interface SuggestedAction {
  type: SuggestedActionType;
  details: {
    workoutId?: string;
    targetDate?: string;
    fromDate?: string;
    toDate?: string;
    fromWorkoutId?: string;
    toWorkoutId?: string;
    adjustmentPct?: number;
    days?: number;
    reason?: string;
    [key: string]: unknown;
  };
}

/**
 * Database model for training insights
 */
export interface TrainingInsightDB {
  id: string;
  user_id: string;

  insight_scope: InsightScope;
  plan_id: string | null;
  week_start: string | null;
  week_number: number | null;

  insight_type: InsightType;
  priority: InsightPriority;
  title: string;
  message: string;

  suggested_action: SuggestedAction | null;

  related_workout_ids: string[] | null;
  related_adaptation_ids: string[] | null;

  status: InsightStatus;
  applied_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  expires_at: string | null;

  outcome_rating: number | null;
  outcome_notes: string | null;

  source: string;
  ai_model_version: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Frontend-friendly training insight
 */
export interface TrainingInsight {
  id: string;

  scope: InsightScope;
  planId: string | null;
  weekStart: string | null;
  weekNumber: number | null;

  type: InsightType;
  priority: InsightPriority;
  title: string;
  message: string;

  suggestedAction: SuggestedAction | null;

  relatedWorkoutIds: string[];
  relatedAdaptationIds: string[];

  status: InsightStatus;
  appliedAt: string | null;
  dismissedAt: string | null;

  outcomeRating: number | null;

  createdAt: string;
}

// ============================================================
// USER TRAINING PATTERNS TYPES
// ============================================================

/**
 * Compliance trend direction
 */
export type ComplianceTrend = 'improving' | 'stable' | 'declining';

/**
 * Adaptation pattern entry
 */
export interface AdaptationPattern {
  type: AdaptationType;
  frequency: number;       // 0-1, how often this happens
  avgDelta: number;        // Average deviation (e.g., -20 minutes for time_truncated)
}

/**
 * Database model for user training patterns
 */
export interface UserTrainingPatternsDB {
  user_id: string;

  avg_weekly_compliance: number | null;
  compliance_trend: ComplianceTrend | null;
  total_workouts_tracked: number;
  total_adaptations_tracked: number;

  compliance_by_day: Record<string, number> | null;
  preferred_workout_days: number[] | null;
  problematic_days: number[] | null;

  common_adaptations: AdaptationPattern[] | null;
  adaptation_reasons: Record<AdaptationReason, number> | null;

  avg_workout_time_preference: string | null;
  avg_available_duration_by_day: Record<string, number> | null;

  workout_type_compliance: Record<string, number> | null;
  preferred_workout_types: string[] | null;
  avoided_workout_types: string[] | null;

  insights_shown: number;
  insights_applied: number;
  insights_dismissed: number;
  insights_applied_rate: number | null;
  successful_suggestion_types: string[] | null;

  tends_to_overreach: boolean;
  tends_to_undertrain: boolean;
  avg_tss_achievement_pct: number | null;

  seasonal_patterns: unknown | null;

  first_tracked_at: string | null;
  last_updated_at: string;
  pattern_confidence: number;
  min_data_for_predictions: number;
}

/**
 * Frontend-friendly user training patterns
 */
export interface UserTrainingPatterns {
  avgWeeklyCompliance: number | null;
  complianceTrend: ComplianceTrend | null;
  totalWorkoutsTracked: number;

  complianceByDay: Record<string, number>;
  preferredWorkoutDays: number[];
  problematicDays: number[];

  commonAdaptations: AdaptationPattern[];
  adaptationReasons: Record<string, number>;

  workoutTypeCompliance: Record<string, number>;
  preferredWorkoutTypes: string[];
  avoidedWorkoutTypes: string[];

  insightsAppliedRate: number | null;

  tendsToOverreach: boolean;
  tendsToUndertrain: boolean;
  avgTssAchievementPct: number | null;

  patternConfidence: number;
  hasEnoughData: boolean;
}

// ============================================================
// WEEK SUMMARY TYPES
// ============================================================

/**
 * Summary of adaptations for a week
 */
export interface WeekAdaptationsSummary {
  weekStart: string;
  totalPlanned: number;
  totalCompleted: number;
  totalAdapted: number;
  totalSkipped: number;
  avgStimulusAchieved: number | null;
  adaptationTypes: Record<AdaptationType, number>;
  tssPlanned: number;
  tssActual: number;
  tssAchievementPct: number;
}

/**
 * Input for detecting an adaptation
 */
export interface DetectAdaptationInput {
  plannedWorkout: PlannedWorkoutDB;
  activity: ActivitySummary & {
    intensityFactor?: number | null;
    normalizedPower?: number | null;
  };
  userFtp?: number;
  trainingContext?: {
    weekNumber?: number;
    trainingPhase?: TrainingPhase;
    ctl?: number;
    atl?: number;
    tsb?: number;
  };
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  // This allows importing types as a namespace
};
