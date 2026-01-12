/**
 * Training Plan Constants and Utilities
 * Defines training zones, workout types, and TSS calculation methods
 */

import type {
  TrainingZonesMap,
  WorkoutTypesMap,
  TrainingPhasesMap,
  GoalTypesMap,
  FitnessLevelsMap,
  PowerZonesMap,
  TSBInterpretation,
  TSBStatus,
  FitnessLevel,
  TrainingZone,
  PlanCategoriesMap,
  PlanCategory,
  ResolvedAvailability,
  WorkoutRedistributionResult,
  PlanActivationPreview,
  DayAvailability,
} from '../types/training';

// Training Zones based on % of FTP
export const TRAINING_ZONES: TrainingZonesMap = {
  1: {
    name: 'Recovery',
    color: '#4ade80',
    ftp: { min: 0, max: 55 },
    description: 'Active recovery, easy spinning',
    icon: '😌'
  },
  2: {
    name: 'Endurance',
    color: '#60a5fa',
    ftp: { min: 56, max: 75 },
    description: 'Aerobic base building, long steady rides',
    icon: '🚴'
  },
  3: {
    name: 'Tempo',
    color: '#facc15',
    ftp: { min: 76, max: 90 },
    description: 'Moderate intensity, sustainable pace',
    icon: '💪'
  },
  3.5: {
    name: 'Sweet Spot',
    color: '#f59e0b',
    ftp: { min: 88, max: 94 },
    description: 'High aerobic load, time-efficient training',
    icon: '🍯'
  },
  4: {
    name: 'Threshold',
    color: '#f97316',
    ftp: { min: 95, max: 105 },
    description: 'Lactate threshold, hard sustained effort',
    icon: '🔥'
  },
  5: {
    name: 'VO2 Max',
    color: '#ef4444',
    ftp: { min: 106, max: 150 },
    description: 'Maximum aerobic capacity, very hard efforts',
    icon: '🚀'
  }
};

// Workout Types
export const WORKOUT_TYPES: WorkoutTypesMap = {
  rest: {
    name: 'Rest Day',
    description: 'Complete rest or very light activity',
    defaultTSS: 0,
    defaultDuration: 0,
    color: '#9ca3af',
    icon: '🛌'
  },
  recovery: {
    name: 'Recovery Ride',
    description: 'Easy spin in Zone 1-2 for active recovery',
    defaultTSS: 25,
    defaultDuration: 30,
    primaryZone: 1,
    color: '#4ade80',
    icon: '😌'
  },
  endurance: {
    name: 'Endurance Ride',
    description: 'Steady Zone 2 ride for aerobic base',
    defaultTSS: 75,
    defaultDuration: 90,
    primaryZone: 2,
    color: '#60a5fa',
    icon: '🚴'
  },
  tempo: {
    name: 'Tempo Ride',
    description: 'Sustained Zone 3 effort',
    defaultTSS: 65,
    defaultDuration: 60,
    primaryZone: 3,
    color: '#facc15',
    icon: '💪'
  },
  sweet_spot: {
    name: 'Sweet Spot Intervals',
    description: '3-4x10-20min at 88-94% FTP',
    defaultTSS: 85,
    defaultDuration: 70,
    primaryZone: 3.5,
    color: '#f59e0b',
    icon: '🍯'
  },
  threshold: {
    name: 'Threshold Intervals',
    description: '2-3x8-20min at 95-105% FTP',
    defaultTSS: 90,
    defaultDuration: 75,
    primaryZone: 4,
    color: '#f97316',
    icon: '🔥'
  },
  vo2max: {
    name: 'VO2 Max Intervals',
    description: '5-8x3-5min at 106%+ FTP',
    defaultTSS: 95,
    defaultDuration: 75,
    primaryZone: 5,
    color: '#ef4444',
    icon: '🚀'
  },
  hill_repeats: {
    name: 'Hill Repeats',
    description: '4-8 hard climbing intervals',
    defaultTSS: 80,
    defaultDuration: 70,
    primaryZone: 4,
    color: '#a855f7',
    icon: '⛰️'
  },
  intervals: {
    name: 'Mixed Intervals',
    description: 'Various interval work',
    defaultTSS: 85,
    defaultDuration: 75,
    primaryZone: 4,
    color: '#ec4899',
    icon: '⚡'
  },
  long_ride: {
    name: 'Long Ride',
    description: 'Extended Zone 2 endurance ride',
    defaultTSS: 140,
    defaultDuration: 180,
    primaryZone: 2,
    color: '#3b82f6',
    icon: '🏔️'
  }
};

// Training Phases
export const TRAINING_PHASES: TrainingPhasesMap = {
  base: {
    name: 'Base Building',
    description: 'Build aerobic foundation with Zone 2 endurance',
    focus: 'Volume and aerobic capacity',
    primaryZones: [2, 3],
    color: '#60a5fa'
  },
  build: {
    name: 'Build Phase',
    description: 'Add intensity with threshold and sweet spot work',
    focus: 'Functional threshold power and lactate clearance',
    primaryZones: [3, 3.5, 4],
    color: '#f59e0b'
  },
  peak: {
    name: 'Peak Phase',
    description: 'Race-specific high intensity work',
    focus: 'VO2max and race simulation',
    primaryZones: [4, 5],
    color: '#ef4444'
  },
  taper: {
    name: 'Taper',
    description: 'Reduce volume while maintaining intensity',
    focus: 'Recovery and freshness',
    primaryZones: [2, 4],
    color: '#4ade80'
  },
  recovery: {
    name: 'Recovery Week',
    description: 'Reduce load for adaptation',
    focus: 'Rest and regeneration',
    primaryZones: [1, 2],
    color: '#9ca3af'
  }
};

// Goal Types
export const GOAL_TYPES: GoalTypesMap = {
  endurance: {
    name: 'Endurance',
    description: 'Build aerobic base and distance capacity',
    icon: '🚴'
  },
  climbing: {
    name: 'Climbing',
    description: 'Improve power-to-weight and hill climbing',
    icon: '⛰️'
  },
  racing: {
    name: 'Racing',
    description: 'Prepare for competitive road racing',
    icon: '🏆'
  },
  criterium: {
    name: 'Criterium',
    description: 'Short circuit racing with repeated surges',
    icon: '🔄'
  },
  time_trial: {
    name: 'Time Trial',
    description: 'Individual time trial performance',
    icon: '⏱️'
  },
  general_fitness: {
    name: 'General Fitness',
    description: 'Overall cycling fitness and health',
    icon: '💪'
  },
  century: {
    name: 'Century Ride',
    description: '100-mile ride preparation',
    icon: '💯'
  },
  gran_fondo: {
    name: 'Gran Fondo',
    description: 'Long sportive event preparation',
    icon: '🏔️'
  },
  gravel: {
    name: 'Gravel Racing',
    description: 'Mixed terrain endurance events',
    icon: '🪨'
  }
};

/**
 * Plan Categories for grouping and filtering
 * Each category targets a specific audience or training focus
 */
export const PLAN_CATEGORIES: PlanCategoriesMap = {
  road_racing: {
    name: 'Road Racing',
    description: 'Criterium, road race, and time trial preparation for competitive cyclists',
    icon: '🏆',
    color: '#ef4444' // red
  },
  endurance_events: {
    name: 'Endurance Events',
    description: 'Century rides, gran fondos, and gravel racing preparation',
    icon: '🚴',
    color: '#3b82f6' // blue
  },
  masters: {
    name: 'Masters (35+)',
    description: 'Age-appropriate training with extended recovery and strength focus',
    icon: '👴',
    color: '#8b5cf6' // purple
  },
  time_crunched: {
    name: 'Time Crunched',
    description: 'Maximum results with ≤6 hours per week - research-backed HIIT focus',
    icon: '⏰',
    color: '#f59e0b' // amber
  },
  indoor_focused: {
    name: 'Indoor Training',
    description: 'Optimized for smart trainers with structured interval work',
    icon: '🏠',
    color: '#06b6d4' // cyan
  },
  strength_power: {
    name: 'Strength & Power',
    description: 'Integrated gym and bike training for power development',
    icon: '🏋️',
    color: '#ec4899' // pink
  },
  foundation: {
    name: 'Foundation',
    description: 'Beginner plans and aerobic base building for all levels',
    icon: '🌱',
    color: '#22c55e' // green
  }
};

// Fitness Levels
export const FITNESS_LEVELS: FitnessLevelsMap = {
  beginner: {
    name: 'Beginner',
    description: '0-2 years cycling, 3-5 hours/week',
    weeklyHours: { min: 3, max: 5 },
    weeklyTSS: { min: 200, max: 350 }
  },
  intermediate: {
    name: 'Intermediate',
    description: '2-5 years cycling, 5-8 hours/week',
    weeklyHours: { min: 5, max: 8 },
    weeklyTSS: { min: 350, max: 600 }
  },
  advanced: {
    name: 'Advanced',
    description: '5+ years cycling, 8+ hours/week',
    weeklyHours: { min: 8, max: 15 },
    weeklyTSS: { min: 600, max: 900 }
  }
};

/**
 * Calculate Training Stress Score (TSS) from power data
 */
export function calculateTSS(
  durationSeconds: number,
  normalizedPower: number,
  ftp: number
): number | null {
  if (!ftp || ftp === 0) return null;

  const intensityFactor = normalizedPower / ftp;
  const durationHours = durationSeconds / 3600;
  const tss = Math.round(durationHours * intensityFactor * intensityFactor * 100);

  return tss;
}

/**
 * Estimate TSS without power data (based on duration, elevation, and workout type)
 */
export function estimateTSS(
  durationMinutes: number,
  distanceKm: number,
  elevationGainM: number,
  workoutType: string = 'endurance'
): number {
  // Base TSS from duration (assuming endurance pace = ~50 TSS/hour)
  let baseTSS = (durationMinutes / 60) * 50;

  // Elevation adjustment (roughly 10 TSS per 300m of climbing)
  const elevationFactor = (elevationGainM / 300) * 10;

  // Intensity multiplier based on workout type
  const intensityMultipliers: Record<string, number> = {
    recovery: 0.5,
    endurance: 1.0,
    tempo: 1.3,
    sweet_spot: 1.5,
    threshold: 1.7,
    vo2max: 2.0,
    hill_repeats: 1.6,
    intervals: 1.6,
    long_ride: 1.0
  };

  const multiplier = intensityMultipliers[workoutType] || 1.0;

  return Math.round((baseTSS + elevationFactor) * multiplier);
}

/**
 * Calculate power zones from FTP
 */
export function calculatePowerZones(ftp: number): PowerZonesMap | null {
  if (!ftp) return null;

  const zones: PowerZonesMap = {};
  Object.keys(TRAINING_ZONES).forEach(zoneNum => {
    const zone = TRAINING_ZONES[zoneNum];
    zones[zoneNum] = {
      ...zone,
      power: {
        min: Math.round(ftp * (zone.ftp.min / 100)),
        max: Math.round(ftp * (zone.ftp.max / 100))
      }
    };
  });

  return zones;
}

/**
 * Calculate Chronic Training Load (CTL) - 42-day exponentially weighted average
 */
export function calculateCTL(dailyTSS: number[]): number {
  if (!dailyTSS || dailyTSS.length === 0) return 0;

  const decay = 1 / 42;
  let ctl = 0;

  dailyTSS.forEach((tss, index) => {
    const weight = Math.exp(-decay * (dailyTSS.length - index - 1));
    ctl += tss * weight;
  });

  return Math.round(ctl * decay);
}

/**
 * Calculate Acute Training Load (ATL) - 7-day exponentially weighted average
 */
export function calculateATL(dailyTSS: number[]): number {
  if (!dailyTSS || dailyTSS.length === 0) return 0;

  const decay = 1 / 7;
  let atl = 0;

  dailyTSS.forEach((tss, index) => {
    const weight = Math.exp(-decay * (dailyTSS.length - index - 1));
    atl += tss * weight;
  });

  return Math.round(atl * decay);
}

/**
 * Calculate Training Stress Balance (TSB) - Form/Readiness
 */
export function calculateTSB(ctl: number, atl: number): number {
  return Math.round(ctl - atl);
}

/**
 * Interpret TSB for user feedback
 */
export function interpretTSB(tsb: number): TSBInterpretation {
  if (tsb > 25) {
    return {
      status: 'fresh',
      color: '#4ade80',
      message: 'Very fresh - ready for hard training or racing',
      recommendation: 'Good time for a hard workout or event'
    };
  } else if (tsb > 5) {
    return {
      status: 'rested',
      color: '#60a5fa',
      message: 'Well rested - performing at peak',
      recommendation: 'Maintain current training load'
    };
  } else if (tsb > -10) {
    return {
      status: 'neutral',
      color: '#facc15',
      message: 'Balanced - normal training state',
      recommendation: 'Continue with planned training'
    };
  } else if (tsb > -30) {
    return {
      status: 'fatigued',
      color: '#f97316',
      message: 'Building fatigue - normal during hard training',
      recommendation: 'Consider a recovery day soon'
    };
  } else {
    return {
      status: 'very_fatigued',
      color: '#ef4444',
      message: 'High fatigue - risk of overtraining',
      recommendation: 'Take a recovery week immediately'
    };
  }
}

/**
 * Get recommended weekly TSS based on fitness level
 */
export function getRecommendedWeeklyTSS(fitnessLevel: FitnessLevel, hoursPerWeek: number): number {
  const level = FITNESS_LEVELS[fitnessLevel];
  if (!level) return 300;

  // Average of 50-60 TSS per hour for moderate intensity
  const tssPerHour = 55;
  const estimatedTSS = hoursPerWeek * tssPerHour;

  // Clamp to fitness level ranges
  return Math.max(level.weeklyTSS.min, Math.min(level.weeklyTSS.max, estimatedTSS));
}

/**
 * Determine which zone a power value falls into
 */
export function getPowerZone(power: number, ftp: number): TrainingZone | null {
  if (!ftp || !power) return null;

  const percentage = (power / ftp) * 100;

  for (const [zoneNum, zone] of Object.entries(TRAINING_ZONES)) {
    if (percentage >= zone.ftp.min && percentage <= zone.ftp.max) {
      return parseFloat(zoneNum) as TrainingZone;
    }
  }

  return percentage > 150 ? 6 as TrainingZone : 1;
}

/**
 * Get zone color for a given zone number
 */
export function getZoneColor(zone: number | string): string {
  const zoneData = TRAINING_ZONES[zone];
  return zoneData?.color || '#9ca3af';
}

/**
 * Get zone name for a given zone number
 */
export function getZoneName(zone: number | string): string {
  const zoneData = TRAINING_ZONES[zone];
  return zoneData?.name || 'Unknown';
}

/**
 * Calculate Intensity Factor (IF)
 */
export function calculateIntensityFactor(normalizedPower: number, ftp: number): number | null {
  if (!ftp || !normalizedPower) return null;
  return Math.round((normalizedPower / ftp) * 100) / 100;
}

/**
 * Calculate Variability Index (VI)
 */
export function calculateVariabilityIndex(
  normalizedPower: number,
  averagePower: number
): number | null {
  if (!averagePower || !normalizedPower) return null;
  return Math.round((normalizedPower / averagePower) * 100) / 100;
}

// ============================================================
// SMART SUPPLEMENT PLACEMENT LOGIC
// ============================================================

/**
 * Categories of workout intensity for placement logic
 * Based on research: heavy leg work needs 48-72h before hard bike sessions
 */
type WorkoutIntensityLevel = 'hard' | 'moderate' | 'easy' | 'rest';

/**
 * Map workout categories/types to intensity levels
 */
export function getWorkoutIntensityLevel(workoutType: string | null, workoutId: string | null): WorkoutIntensityLevel {
  if (!workoutType && !workoutId) return 'rest';
  if (workoutType === 'rest') return 'rest';

  // High intensity bike workouts
  const hardWorkouts = ['vo2max', 'threshold', 'anaerobic', 'racing', 'criterium'];
  // Moderate intensity bike workouts
  const moderateWorkouts = ['sweet_spot', 'tempo', 'climbing', 'intervals'];
  // Easy/Recovery workouts
  const easyWorkouts = ['recovery', 'endurance', 'rest'];

  if (hardWorkouts.includes(workoutType || '')) return 'hard';
  if (moderateWorkouts.includes(workoutType || '')) return 'moderate';
  if (easyWorkouts.includes(workoutType || '')) return 'easy';

  // Check workout ID patterns
  if (workoutId) {
    if (workoutId.includes('vo2') || workoutId.includes('threshold') || workoutId.includes('anaerobic')) return 'hard';
    if (workoutId.includes('sweet_spot') || workoutId.includes('tempo') || workoutId.includes('climbing')) return 'moderate';
  }

  return 'moderate'; // Default to moderate for unknown
}

/**
 * Supplement workout types and their placement rules
 */
export type SupplementType = 'heavy_strength' | 'light_strength' | 'core' | 'flexibility';

/**
 * Get the supplement type from a workout ID
 */
export function getSupplementType(workoutId: string): SupplementType | null {
  if (workoutId.startsWith('strength_max') || workoutId.startsWith('strength_explosive')) {
    return 'heavy_strength';
  }
  if (workoutId.startsWith('strength_')) {
    return 'light_strength';
  }
  if (workoutId.startsWith('core_')) {
    return 'core';
  }
  if (workoutId.startsWith('flexibility_')) {
    return 'flexibility';
  }
  return null;
}

/**
 * Placement rules for supplement workouts
 * Based on research: Rønnestad et al. (2014), Beattie et al. (2014), etc.
 */
interface PlacementRule {
  /** Can this supplement be placed on days with these intensity levels? */
  allowedDayIntensities: WorkoutIntensityLevel[];
  /** Days to avoid before these intensity workouts */
  avoidBeforeIntensities: WorkoutIntensityLevel[];
  /** How many hours before a hard bike session should we avoid this? */
  hoursBeforeHard: number;
  /** Maximum times per week recommended */
  maxPerWeek: number;
  /** Minimum days between same workout type */
  minDaysBetween: number;
  /** Priority (higher = prefer these days) */
  preferredDays: WorkoutIntensityLevel[];
}

const PLACEMENT_RULES: Record<SupplementType, PlacementRule> = {
  heavy_strength: {
    allowedDayIntensities: ['easy', 'rest', 'moderate'],
    avoidBeforeIntensities: ['hard'],
    hoursBeforeHard: 48, // 48-72h recovery needed
    maxPerWeek: 2,
    minDaysBetween: 2, // At least 48h between sessions
    preferredDays: ['easy', 'rest']
  },
  light_strength: {
    allowedDayIntensities: ['easy', 'rest', 'moderate'],
    avoidBeforeIntensities: ['hard'],
    hoursBeforeHard: 24,
    maxPerWeek: 3,
    minDaysBetween: 1,
    preferredDays: ['easy', 'moderate']
  },
  core: {
    allowedDayIntensities: ['easy', 'rest', 'moderate', 'hard'], // Can do core any day
    avoidBeforeIntensities: [], // No restrictions
    hoursBeforeHard: 0,
    maxPerWeek: 4,
    minDaysBetween: 1,
    preferredDays: ['easy', 'moderate']
  },
  flexibility: {
    allowedDayIntensities: ['easy', 'rest', 'moderate', 'hard'], // Can stretch any day
    avoidBeforeIntensities: [],
    hoursBeforeHard: 0,
    maxPerWeek: 7, // Can do daily
    minDaysBetween: 0,
    preferredDays: ['easy', 'rest'] // Best after hard days for recovery
  }
};

export interface PlannedWorkoutInfo {
  date: string; // ISO date string
  workoutType: string | null;
  workoutId: string | null;
}

export interface SuggestedPlacement {
  date: string;
  reason: string;
  score: number; // 0-100, higher is better
}

/**
 * Find optimal days to place a supplement workout
 * Returns suggested dates sorted by suitability score
 */
export function findOptimalSupplementDays(
  supplementWorkoutId: string,
  existingWorkouts: PlannedWorkoutInfo[],
  startDate: Date,
  weeksAhead: number = 4
): SuggestedPlacement[] {
  const supplementType = getSupplementType(supplementWorkoutId);
  if (!supplementType) return [];

  const rules = PLACEMENT_RULES[supplementType];
  const suggestions: SuggestedPlacement[] = [];

  // Create a map of dates to workouts for easy lookup
  const workoutsByDate = new Map<string, PlannedWorkoutInfo>();
  existingWorkouts.forEach(w => workoutsByDate.set(w.date, w));

  // Check each day in the range
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + weeksAhead * 7);

  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const existingWorkout = workoutsByDate.get(dateStr);
    const dayIntensity = existingWorkout
      ? getWorkoutIntensityLevel(existingWorkout.workoutType, existingWorkout.workoutId)
      : 'rest';

    // Check if this day is allowed
    if (!rules.allowedDayIntensities.includes(dayIntensity)) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    let score = 50; // Base score
    let reason = '';

    // Check day before (avoid placing before hard workouts if rule says so)
    if (rules.avoidBeforeIntensities.length > 0) {
      const nextDay = new Date(currentDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      const nextWorkout = workoutsByDate.get(nextDayStr);

      if (nextWorkout) {
        const nextIntensity = getWorkoutIntensityLevel(nextWorkout.workoutType, nextWorkout.workoutId);
        if (rules.avoidBeforeIntensities.includes(nextIntensity)) {
          // Penalize heavily if next day is a hard bike day
          score -= 40;
          reason = 'Day before hard workout - not ideal';
        }
      }

      // Check 2 days ahead for heavy strength
      if (supplementType === 'heavy_strength') {
        const twoDaysAhead = new Date(currentDate);
        twoDaysAhead.setDate(twoDaysAhead.getDate() + 2);
        const twoDaysStr = twoDaysAhead.toISOString().split('T')[0];
        const twoDaysWorkout = workoutsByDate.get(twoDaysStr);

        if (twoDaysWorkout) {
          const twoDaysIntensity = getWorkoutIntensityLevel(twoDaysWorkout.workoutType, twoDaysWorkout.workoutId);
          if (twoDaysIntensity === 'hard') {
            score -= 20;
            reason = 'Hard workout in 2 days - allow more recovery';
          }
        }
      }
    }

    // Bonus for preferred day types
    if (rules.preferredDays.includes(dayIntensity)) {
      score += 20;
      if (!reason) reason = `Good day for ${supplementType.replace('_', ' ')}`;
    }

    // Bonus for rest days (best for recovery-oriented supplements)
    if (dayIntensity === 'rest') {
      score += 10;
      if (!reason) reason = 'Rest day - great for supplementary work';
    }

    // Only suggest days with positive scores
    if (score > 30) {
      suggestions.push({
        date: dateStr,
        reason: reason || 'Available day',
        score: Math.min(100, Math.max(0, score))
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort by score (highest first), then by date
  return suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.date.localeCompare(b.date);
  });
}

/**
 * Get all supplement workouts from the library
 */
export function getSupplementWorkouts(): string[] {
  return [
    // Strength
    'strength_anatomical_adaptation',
    'strength_muscle_endurance',
    'strength_max_lower',
    'strength_maintenance',
    'strength_explosive_power',
    // Core
    'core_foundation',
    'core_stability',
    'core_power',
    // Flexibility
    'flexibility_post_ride',
    'flexibility_hip_mobility',
    'flexibility_yoga_cyclist',
    'flexibility_full_body_recovery',
    'flexibility_dynamic_warmup'
  ];
}

// ============================================================
// WORKOUT REDISTRIBUTION FOR BLOCKED DAYS
// ============================================================

/**
 * Candidate day for workout redistribution
 */
interface RedistributionCandidate {
  date: string;
  dayOfWeek: number;
  score: number;
  reasons: string[];
  availability: ResolvedAvailability;
}

/**
 * Workout info for redistribution planning
 */
export interface WorkoutForRedistribution {
  originalDate: string;
  dayOfWeek: number;
  weekNumber: number;
  workoutId: string | null;
  workoutType: string | null;
  targetTSS: number | null;
  targetDuration: number | null;
}

/**
 * Get availability for a date using weekly availability and date overrides
 */
export function getAvailabilityForDate(
  date: string,
  weeklyAvailability: DayAvailability[],
  dateOverrides: Map<string, { status: 'available' | 'blocked' | 'preferred' }>
): ResolvedAvailability {
  // Check override first
  const override = dateOverrides.get(date);
  if (override) {
    return {
      date,
      status: override.status,
      isOverride: true,
      maxDurationMinutes: null,
      notes: null,
    };
  }

  // Fall back to weekly availability
  const dateObj = new Date(date + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();
  const dayAvail = weeklyAvailability.find((d) => d.dayOfWeek === dayOfWeek);

  return {
    date,
    status: dayAvail?.status || 'available',
    isOverride: false,
    maxDurationMinutes: dayAvail?.maxDurationMinutes || null,
    notes: dayAvail?.notes || null,
  };
}

/**
 * Find the best alternative day for a workout that falls on a blocked day
 * Considers training principles, user preferences, and existing workouts
 */
export function findBestAlternativeDay(
  workout: WorkoutForRedistribution,
  weekWorkouts: WorkoutForRedistribution[],
  weeklyAvailability: DayAvailability[],
  dateOverrides: Map<string, { status: 'available' | 'blocked' | 'preferred' }>,
  preferences: {
    maxWorkoutsPerWeek: number | null;
    preferWeekendLongRides: boolean;
  }
): RedistributionCandidate | null {
  const candidates: RedistributionCandidate[] = [];
  const workoutIntensity = getWorkoutIntensityLevel(workout.workoutType, workout.workoutId);
  const isLongRide = workout.workoutType === 'long_ride' || workout.workoutType === 'endurance' && (workout.targetDuration || 0) > 120;
  const isKeyWorkout = workoutIntensity === 'hard' || isLongRide;

  // Get all dates in the same week
  const originalDate = new Date(workout.originalDate + 'T12:00:00');
  const weekStart = new Date(originalDate);
  weekStart.setDate(weekStart.getDate() - originalDate.getDay()); // Go to Sunday

  // Check each day of the week
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const candidateDate = new Date(weekStart);
    candidateDate.setDate(candidateDate.getDate() + dayOffset);
    const candidateDateStr = candidateDate.toISOString().split('T')[0];

    // Skip the original date
    if (candidateDateStr === workout.originalDate) continue;

    const availability = getAvailabilityForDate(candidateDateStr, weeklyAvailability, dateOverrides);

    // Skip blocked days
    if (availability.status === 'blocked') continue;

    // Check if there's already a workout on this day
    const existingWorkout = weekWorkouts.find(
      (w) => w.originalDate === candidateDateStr && w.workoutId
    );

    let score = 50; // Base score
    const reasons: string[] = [];

    // Preferred days get a bonus
    if (availability.status === 'preferred') {
      score += 15;
      reasons.push('Preferred day');
    }

    // Check for existing workout conflicts
    if (existingWorkout) {
      const existingIntensity = getWorkoutIntensityLevel(existingWorkout.workoutType, existingWorkout.workoutId);

      // Don't put two hard workouts on the same day
      if (workoutIntensity === 'hard' && existingIntensity === 'hard') {
        score -= 50;
        reasons.push('Would create double hard day');
      } else if (existingIntensity === 'rest') {
        // Can replace rest days more easily
        score += 10;
        reasons.push('Can replace rest day');
      } else {
        // Already has a workout, less ideal
        score -= 20;
        reasons.push('Day already has workout');
      }
    } else {
      score += 10;
      reasons.push('Empty day');
    }

    // Check adjacent days for back-to-back hard days
    if (workoutIntensity === 'hard') {
      const prevDate = new Date(candidateDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const nextDate = new Date(candidateDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const prevDateStr = prevDate.toISOString().split('T')[0];
      const nextDateStr = nextDate.toISOString().split('T')[0];

      const prevWorkout = weekWorkouts.find((w) => w.originalDate === prevDateStr);
      const nextWorkout = weekWorkouts.find((w) => w.originalDate === nextDateStr);

      if (prevWorkout) {
        const prevIntensity = getWorkoutIntensityLevel(prevWorkout.workoutType, prevWorkout.workoutId);
        if (prevIntensity === 'hard') {
          score -= 30;
          reasons.push('Would create back-to-back hard days');
        }
      }

      if (nextWorkout) {
        const nextIntensity = getWorkoutIntensityLevel(nextWorkout.workoutType, nextWorkout.workoutId);
        if (nextIntensity === 'hard') {
          score -= 30;
          reasons.push('Would create back-to-back hard days');
        }
      }
    }

    // Long rides prefer weekends
    if (isLongRide && preferences.preferWeekendLongRides) {
      const dayOfWeek = candidateDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        score += 20;
        reasons.push('Weekend - good for long ride');
      }
    }

    // Prefer days closer to original date
    const dayDiff = Math.abs(dayOffset - originalDate.getDay());
    score -= dayDiff * 2;
    if (dayDiff <= 1) {
      reasons.push('Close to original day');
    }

    // Check duration constraint
    if (availability.maxDurationMinutes && workout.targetDuration) {
      if (workout.targetDuration > availability.maxDurationMinutes) {
        score -= 40;
        reasons.push(`Exceeds max duration (${availability.maxDurationMinutes}min)`);
      }
    }

    candidates.push({
      date: candidateDateStr,
      dayOfWeek: candidateDate.getDay(),
      score,
      reasons,
      availability,
    });
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  // Return the best candidate with a positive score
  const bestCandidate = candidates.find((c) => c.score > 0);
  return bestCandidate || null;
}

/**
 * Redistribute workouts from blocked days to available days
 * Returns a list of workout movements
 */
export function redistributeWorkouts(
  workouts: WorkoutForRedistribution[],
  weeklyAvailability: DayAvailability[],
  dateOverrides: Map<string, { status: 'available' | 'blocked' | 'preferred' }>,
  preferences: {
    maxWorkoutsPerWeek: number | null;
    preferWeekendLongRides: boolean;
  }
): WorkoutRedistributionResult[] {
  const results: WorkoutRedistributionResult[] = [];
  const workoutsByWeek = new Map<number, WorkoutForRedistribution[]>();

  // Group workouts by week
  for (const workout of workouts) {
    const weekWorkouts = workoutsByWeek.get(workout.weekNumber) || [];
    weekWorkouts.push(workout);
    workoutsByWeek.set(workout.weekNumber, weekWorkouts);
  }

  // Process each week
  for (const [weekNumber, weekWorkouts] of workoutsByWeek) {
    // Create a mutable copy of week workouts to track changes
    const mutableWorkouts = [...weekWorkouts];

    for (const workout of weekWorkouts) {
      // Skip rest days
      if (!workout.workoutId || workout.workoutType === 'rest') continue;

      const availability = getAvailabilityForDate(
        workout.originalDate,
        weeklyAvailability,
        dateOverrides
      );

      // Check if this day is blocked
      if (availability.status === 'blocked') {
        const alternative = findBestAlternativeDay(
          workout,
          mutableWorkouts,
          weeklyAvailability,
          dateOverrides,
          preferences
        );

        if (alternative) {
          results.push({
            originalDate: workout.originalDate,
            newDate: alternative.date,
            workoutId: workout.workoutId,
            reason: alternative.reasons.join('; '),
          });

          // Update the mutable workouts to reflect the move
          const idx = mutableWorkouts.findIndex((w) => w.originalDate === workout.originalDate);
          if (idx !== -1) {
            mutableWorkouts[idx] = {
              ...workout,
              originalDate: alternative.date,
              dayOfWeek: alternative.dayOfWeek,
            };
          }
        } else {
          // No suitable alternative found
          results.push({
            originalDate: workout.originalDate,
            newDate: workout.originalDate, // Keep original
            workoutId: workout.workoutId,
            reason: 'No suitable alternative day found - workout may need manual adjustment',
          });
        }
      }
    }
  }

  return results;
}

/**
 * Preview plan activation with availability-aware scheduling
 */
export function previewPlanActivation(
  templateWorkouts: WorkoutForRedistribution[],
  weeklyAvailability: DayAvailability[],
  dateOverrides: Map<string, { status: 'available' | 'blocked' | 'preferred' }>,
  preferences: {
    maxWorkoutsPerWeek: number | null;
    preferWeekendLongRides: boolean;
  }
): PlanActivationPreview {
  // Find how many workouts land on blocked days
  let blockedDaysAffected = 0;
  for (const workout of templateWorkouts) {
    if (!workout.workoutId || workout.workoutType === 'rest') continue;

    const availability = getAvailabilityForDate(
      workout.originalDate,
      weeklyAvailability,
      dateOverrides
    );

    if (availability.status === 'blocked') {
      blockedDaysAffected++;
    }
  }

  // Redistribute workouts
  const redistributedWorkouts = redistributeWorkouts(
    templateWorkouts,
    weeklyAvailability,
    dateOverrides,
    preferences
  );

  // Check for warnings
  const warnings: string[] = [];

  // Workouts that couldn't be moved
  const unmovableWorkouts = redistributedWorkouts.filter(
    (r) => r.originalDate === r.newDate && r.reason.includes('No suitable')
  );
  if (unmovableWorkouts.length > 0) {
    warnings.push(
      `${unmovableWorkouts.length} workout(s) could not be automatically redistributed`
    );
  }

  // Check if max workouts per week is exceeded
  if (preferences.maxWorkoutsPerWeek) {
    const workoutCountByWeek = new Map<number, number>();
    for (const workout of templateWorkouts) {
      if (!workout.workoutId || workout.workoutType === 'rest') continue;
      const count = workoutCountByWeek.get(workout.weekNumber) || 0;
      workoutCountByWeek.set(workout.weekNumber, count + 1);
    }

    for (const [week, count] of workoutCountByWeek) {
      if (count > preferences.maxWorkoutsPerWeek) {
        warnings.push(
          `Week ${week} has ${count} workouts, exceeding your limit of ${preferences.maxWorkoutsPerWeek}`
        );
      }
    }
  }

  return {
    templateId: '', // Will be set by caller
    startDate: '', // Will be set by caller
    blockedDaysAffected,
    redistributedWorkouts: redistributedWorkouts.filter((r) => r.originalDate !== r.newDate),
    warnings,
    canActivate: unmovableWorkouts.length === 0,
  };
}

/**
 * Re-shuffle an existing plan based on updated availability
 * Returns workouts that need to be moved
 */
export function reshuffleActivePlan(
  plannedWorkouts: WorkoutForRedistribution[],
  weeklyAvailability: DayAvailability[],
  dateOverrides: Map<string, { status: 'available' | 'blocked' | 'preferred' }>,
  preferences: {
    maxWorkoutsPerWeek: number | null;
    preferWeekendLongRides: boolean;
  }
): WorkoutRedistributionResult[] {
  // Only consider future workouts
  const today = new Date().toISOString().split('T')[0];
  const futureWorkouts = plannedWorkouts.filter(
    (w) => w.originalDate >= today && w.workoutId && w.workoutType !== 'rest'
  );

  return redistributeWorkouts(
    futureWorkouts,
    weeklyAvailability,
    dateOverrides,
    preferences
  );
}

export default {
  TRAINING_ZONES,
  WORKOUT_TYPES,
  TRAINING_PHASES,
  GOAL_TYPES,
  FITNESS_LEVELS,
  PLAN_CATEGORIES,
  calculateTSS,
  estimateTSS,
  calculatePowerZones,
  calculateCTL,
  calculateATL,
  calculateTSB,
  interpretTSB,
  getRecommendedWeeklyTSS,
  getPowerZone,
  getZoneColor,
  getZoneName,
  calculateIntensityFactor,
  calculateVariabilityIndex,
  // Supplement placement
  getWorkoutIntensityLevel,
  getSupplementType,
  findOptimalSupplementDays,
  getSupplementWorkouts,
  // Workout redistribution
  getAvailabilityForDate,
  findBestAlternativeDay,
  redistributeWorkouts,
  previewPlanActivation,
  reshuffleActivePlan,
};
