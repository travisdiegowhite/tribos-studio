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
    description: 'Prepare for competitive events',
    icon: '🏆'
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

export default {
  TRAINING_ZONES,
  WORKOUT_TYPES,
  TRAINING_PHASES,
  GOAL_TYPES,
  FITNESS_LEVELS,
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
  calculateVariabilityIndex
};
