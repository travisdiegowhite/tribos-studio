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
  | 'gran_fondo';

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

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
  | 'racing';

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
  work: WorkoutSegment | WorkoutSegment[] | WorkoutInterval;
  rest: WorkoutSegment | { duration: number; zone: null };
}

export interface WorkoutWarmupCooldown {
  duration: number;
  zone: TrainingZone;
  powerPctFTP: number;
}

export interface WorkoutStructure {
  warmup: WorkoutWarmupCooldown | null;
  main: (WorkoutSegment | WorkoutInterval)[];
  cooldown: WorkoutWarmupCooldown | null;
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
  hoursPerWeek: Range;
  weeklyTSS: Range;
  phases: PlanPhase[];
  weekTemplates: Record<number, WeekTemplate>;
  expectedGains: ExpectedGains;
  targetAudience: string;
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
// EXPORTS
// ============================================================

export default {
  // This allows importing types as a namespace
};
