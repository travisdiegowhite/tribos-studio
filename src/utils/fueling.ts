/**
 * Fueling Calculation Utilities
 * Provides deterministic calculations for on-bike fueling recommendations
 * based on exercise science research and cycling-specific guidelines.
 *
 * DISCLAIMER: These are general guidelines based on exercise science research.
 * Not personalized medical or nutritional advice. Consult a sports dietitian
 * for individual needs.
 */

import type { WorkoutCategory } from '../types/training';

// ============================================================
// TYPES
// ============================================================

export type IntensityLevel = 'recovery' | 'easy' | 'moderate' | 'tempo' | 'threshold' | 'race';

export interface WeatherConditions {
  temperatureCelsius: number;
  humidity?: number;  // percentage 0-100
  altitudeMeters?: number;
}

export interface FuelPlanInput {
  durationMinutes: number;
  intensity: IntensityLevel;
  weather?: WeatherConditions;
  elevationGainMeters?: number;
  userWeightKg?: number;
  isRaceDay?: boolean;
}

export interface CarbTarget {
  totalGramsMin: number;
  totalGramsMax: number;
  gramsPerHourMin: number;
  gramsPerHourMax: number;
}

export interface HydrationTarget {
  mlPerHour: number;
  ozPerHour: number;
  totalMl: number;
  totalOz: number;
  includeElectrolytes: boolean;
  heatAdjusted: boolean;
  altitudeAdjusted: boolean;
}

export interface PreRideFueling {
  carbsGramsMin: number;
  carbsGramsMax: number;
  timingHours: number;
  required: boolean;
  notes: string;
}

export interface FuelingFrequency {
  startEatingMinutes: number;
  intervalMinutes: { min: number; max: number };
}

export interface FuelPlan {
  // Core recommendations
  carbs: CarbTarget;
  hydration: HydrationTarget;
  preRide: PreRideFueling;
  frequency: FuelingFrequency;

  // Estimated energy expenditure
  estimatedKilojoules: number;
  estimatedCalories: number;

  // Context
  durationMinutes: number;
  intensity: IntensityLevel;
  isRaceDay: boolean;

  // Practical guidance (for AI to elaborate on)
  gelsEquivalent: { min: number; max: number };  // ~25g carbs per gel
  bottlesNeeded: number;  // ~750ml bottles

  // Warnings/notes
  warnings: string[];

  // Disclaimer
  disclaimer: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const DISCLAIMER = 'These are general guidelines based on exercise science research. Not personalized medical or nutritional advice. Consult a sports dietitian for individual needs.';

/**
 * Carbohydrate targets by intensity level (grams per hour)
 * Based on current sports nutrition research
 */
const CARBS_PER_HOUR: Record<IntensityLevel, { min: number; max: number }> = {
  recovery: { min: 0, max: 30 },      // Can skip for <90 min
  easy: { min: 30, max: 40 },         // Light fueling
  moderate: { min: 45, max: 60 },     // Standard long ride fueling
  tempo: { min: 60, max: 80 },        // Higher burn rate
  threshold: { min: 60, max: 90 },    // Hard sustained effort
  race: { min: 80, max: 120 },        // Maximum absorption (gut training required)
};

/**
 * Base hydration rates by temperature (ml per hour)
 * Celsius temperature ranges
 */
const HYDRATION_BY_TEMP: Array<{ maxTemp: number; mlPerHour: number; electrolytes: boolean }> = [
  { maxTemp: 10, mlPerHour: 400, electrolytes: false },   // Cold (<50°F)
  { maxTemp: 18, mlPerHour: 500, electrolytes: false },   // Cool (50-65°F)
  { maxTemp: 27, mlPerHour: 650, electrolytes: true },    // Moderate (65-80°F)
  { maxTemp: 32, mlPerHour: 800, electrolytes: true },    // Hot (80-90°F)
  { maxTemp: 38, mlPerHour: 950, electrolytes: true },    // Very hot (90-100°F)
  { maxTemp: Infinity, mlPerHour: 1100, electrolytes: true }, // Extreme (>100°F)
];

/**
 * Pre-ride fueling by duration
 */
const PRE_RIDE_FUELING: Array<{ maxDurationMin: number; carbsMin: number; carbsMax: number; timingHours: number; required: boolean }> = [
  { maxDurationMin: 60, carbsMin: 0, carbsMax: 50, timingHours: 1, required: false },
  { maxDurationMin: 90, carbsMin: 50, carbsMax: 100, timingHours: 2, required: false },
  { maxDurationMin: 180, carbsMin: 100, carbsMax: 150, timingHours: 3, required: true },
  { maxDurationMin: Infinity, carbsMin: 150, carbsMax: 200, timingHours: 4, required: true },
];

/**
 * Race day pre-ride fueling (higher carb targets)
 */
const RACE_DAY_PRE_RIDE: Array<{ maxDurationMin: number; carbsMin: number; carbsMax: number; timingHours: number }> = [
  { maxDurationMin: 90, carbsMin: 100, carbsMax: 150, timingHours: 2 },
  { maxDurationMin: 180, carbsMin: 150, carbsMax: 200, timingHours: 3 },
  { maxDurationMin: 360, carbsMin: 200, carbsMax: 300, timingHours: 4 },
  { maxDurationMin: Infinity, carbsMin: 250, carbsMax: 350, timingHours: 4 },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Convert ml to oz
 */
function mlToOz(ml: number): number {
  return Math.round(ml * 0.033814);
}

/**
 * Map workout category to intensity level
 */
export function workoutCategoryToIntensity(category: WorkoutCategory): IntensityLevel {
  const mapping: Record<WorkoutCategory, IntensityLevel> = {
    recovery: 'recovery',
    endurance: 'easy',
    tempo: 'tempo',
    sweet_spot: 'tempo',
    threshold: 'threshold',
    vo2max: 'threshold',
    climbing: 'moderate',
    anaerobic: 'threshold',
    racing: 'race',
    strength: 'easy',
    core: 'recovery',
    flexibility: 'recovery',
    rest: 'recovery',
  };
  return mapping[category] || 'moderate';
}

/**
 * Estimate intensity from TSS and duration
 * IF (Intensity Factor) = sqrt(TSS / duration_hours / 100)
 */
export function estimateIntensityFromTSS(tss: number, durationMinutes: number): IntensityLevel {
  const hours = durationMinutes / 60;
  if (hours === 0) return 'recovery';

  // IF = sqrt(TSS / hours / 100)
  const intensityFactor = Math.sqrt(tss / hours / 100);

  if (intensityFactor < 0.55) return 'recovery';
  if (intensityFactor < 0.70) return 'easy';
  if (intensityFactor < 0.80) return 'moderate';
  if (intensityFactor < 0.90) return 'tempo';
  if (intensityFactor < 1.00) return 'threshold';
  return 'race';
}

/**
 * Estimate energy expenditure in kilojoules
 * Based on duration, intensity, and optional weight
 * Uses rough estimates based on typical power outputs
 */
function estimateEnergyExpenditure(
  durationMinutes: number,
  intensity: IntensityLevel,
  weightKg?: number,
  elevationGainMeters?: number
): number {
  // Approximate power output as % of a typical 250W FTP
  const basePowerByIntensity: Record<IntensityLevel, number> = {
    recovery: 100,   // ~40% FTP
    easy: 150,       // ~60% FTP
    moderate: 200,   // ~80% FTP
    tempo: 225,      // ~90% FTP
    threshold: 250,  // ~100% FTP
    race: 275,       // ~110% FTP (bursts)
  };

  let estimatedPower = basePowerByIntensity[intensity];

  // Adjust for weight if available (heavier riders typically output more power)
  if (weightKg) {
    const weightFactor = weightKg / 75;  // 75kg as reference
    estimatedPower *= Math.sqrt(weightFactor);  // Square root to dampen effect
  }

  // Add extra for elevation (roughly 1kJ per 10m of gain)
  const elevationKj = elevationGainMeters ? elevationGainMeters / 10 : 0;

  // kJ = Power (watts) × time (seconds) / 1000
  const baseKj = (estimatedPower * durationMinutes * 60) / 1000;

  return Math.round(baseKj + elevationKj);
}

/**
 * Calculate hydration adjustments for humidity and altitude
 */
function getHydrationAdjustments(
  baseMlPerHour: number,
  humidity?: number,
  altitudeMeters?: number
): { adjustedMl: number; altitudeAdjusted: boolean } {
  let adjusted = baseMlPerHour;
  let altitudeAdjusted = false;

  // High humidity adjustment (+20% if >70% humidity)
  if (humidity && humidity > 70) {
    adjusted *= 1.2;
  }

  // Altitude adjustment (+10-20% above 1800m/6000ft)
  if (altitudeMeters && altitudeMeters > 1800) {
    const altitudeFactor = altitudeMeters > 3000 ? 1.2 : 1.1;
    adjusted *= altitudeFactor;
    altitudeAdjusted = true;
  }

  return { adjustedMl: Math.round(adjusted), altitudeAdjusted };
}

// ============================================================
// MAIN CALCULATION FUNCTION
// ============================================================

/**
 * Generate a complete fuel plan for a ride
 */
export function calculateFuelPlan(input: FuelPlanInput): FuelPlan {
  const {
    durationMinutes,
    intensity,
    weather,
    elevationGainMeters,
    userWeightKg,
    isRaceDay = false,
  } = input;

  const warnings: string[] = [];
  const durationHours = durationMinutes / 60;

  // =========== CARBOHYDRATES ===========
  const carbRates = CARBS_PER_HOUR[intensity];

  // For very short rides, reduce or eliminate carb needs
  let carbMultiplier = 1;
  if (durationMinutes < 60) {
    carbMultiplier = 0;  // No on-bike carbs needed for <1 hour
  } else if (durationMinutes < 90 && intensity !== 'race') {
    carbMultiplier = 0.5;  // Reduced for 60-90 min non-race
  }

  // Calculate effective duration for fueling (start eating at 45min mark)
  const fuelingDurationHours = Math.max(0, (durationMinutes - 45) / 60);

  const carbs: CarbTarget = {
    gramsPerHourMin: carbRates.min,
    gramsPerHourMax: carbRates.max,
    totalGramsMin: Math.round(carbRates.min * fuelingDurationHours * carbMultiplier),
    totalGramsMax: Math.round(carbRates.max * fuelingDurationHours * carbMultiplier),
  };

  // High carb warning for race intensity
  if (intensity === 'race' && carbRates.max > 80) {
    warnings.push('High carb intake (80g+/hour) requires gut training. Practice in training rides first.');
  }

  // =========== HYDRATION ===========
  const tempC = weather?.temperatureCelsius ?? 20;  // Default to 20°C

  // Find base hydration rate
  const hydrationTier = HYDRATION_BY_TEMP.find(tier => tempC <= tier.maxTemp) || HYDRATION_BY_TEMP[HYDRATION_BY_TEMP.length - 1];

  // Apply adjustments
  const { adjustedMl, altitudeAdjusted } = getHydrationAdjustments(
    hydrationTier.mlPerHour,
    weather?.humidity,
    weather?.altitudeMeters
  );

  const hydration: HydrationTarget = {
    mlPerHour: adjustedMl,
    ozPerHour: mlToOz(adjustedMl),
    totalMl: Math.round(adjustedMl * durationHours),
    totalOz: mlToOz(Math.round(adjustedMl * durationHours)),
    includeElectrolytes: hydrationTier.electrolytes,
    heatAdjusted: tempC > 27,
    altitudeAdjusted,
  };

  // Heat warnings
  if (tempC > 32) {
    warnings.push('Extreme heat conditions. Consider pre-hydrating and plan for refill stops.');
  } else if (tempC > 27) {
    warnings.push('Hot conditions. Prioritize electrolyte intake and listen to your body.');
  }

  // =========== PRE-RIDE FUELING ===========
  const preRideTable = isRaceDay ? RACE_DAY_PRE_RIDE : PRE_RIDE_FUELING;
  const preRideTier = preRideTable.find(tier => durationMinutes <= tier.maxDurationMin) || preRideTable[preRideTable.length - 1];

  let preRideNotes = '';
  if (durationMinutes < 60) {
    preRideNotes = 'Short ride - light snack optional';
  } else if (durationMinutes < 90) {
    preRideNotes = 'A light meal 1-2 hours before is sufficient';
  } else if (isRaceDay) {
    preRideNotes = 'Race day - familiar foods, easily digestible carbs, moderate protein, low fat/fiber';
  } else {
    preRideNotes = 'Eat a balanced meal 2-3 hours before with carbs as the focus';
  }

  const preRide: PreRideFueling = {
    carbsGramsMin: preRideTier.carbsMin,
    carbsGramsMax: preRideTier.carbsMax,
    timingHours: preRideTier.timingHours,
    required: 'required' in preRideTier ? preRideTier.required : true,
    notes: preRideNotes,
  };

  // =========== FUELING FREQUENCY ===========
  const frequency: FuelingFrequency = {
    startEatingMinutes: 45,
    intervalMinutes: intensity === 'race' ? { min: 15, max: 20 } : { min: 20, max: 30 },
  };

  // =========== ENERGY EXPENDITURE ===========
  const estimatedKilojoules = estimateEnergyExpenditure(
    durationMinutes,
    intensity,
    userWeightKg,
    elevationGainMeters
  );

  // =========== PRACTICAL EQUIVALENTS ===========
  const avgCarbsTotal = (carbs.totalGramsMin + carbs.totalGramsMax) / 2;
  const gelsEquivalent = {
    min: Math.ceil(carbs.totalGramsMin / 25),
    max: Math.ceil(carbs.totalGramsMax / 25),
  };

  // Bottles needed (750ml standard bottle)
  const bottlesNeeded = Math.ceil(hydration.totalMl / 750);

  // Long ride warnings
  if (durationMinutes > 180 && bottlesNeeded > 2) {
    warnings.push(`Plan for a refill stop - you\'ll need ${bottlesNeeded} bottles but may only carry 2.`);
  }

  // =========== ALTITUDE CARB ADJUSTMENT ===========
  if (weather?.altitudeMeters && weather.altitudeMeters > 1800) {
    // At altitude, carb burning increases 10-15%
    carbs.totalGramsMin = Math.round(carbs.totalGramsMin * 1.12);
    carbs.totalGramsMax = Math.round(carbs.totalGramsMax * 1.12);
    warnings.push('Altitude increases carb burn rate - fuel more than hunger suggests.');
  }

  return {
    carbs,
    hydration,
    preRide,
    frequency,
    estimatedKilojoules,
    estimatedCalories: Math.round(estimatedKilojoules * 0.239),  // kJ to kcal approximation
    durationMinutes,
    intensity,
    isRaceDay,
    gelsEquivalent,
    bottlesNeeded,
    warnings,
    disclaimer: DISCLAIMER,
  };
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Calculate fuel plan from workout data
 */
export function calculateFuelPlanFromWorkout(workout: {
  duration: number;  // minutes
  targetTSS?: number;
  category?: WorkoutCategory;
  weather?: WeatherConditions;
  elevationGain?: number;
  userWeightKg?: number;
}): FuelPlan {
  // Determine intensity from category or TSS
  let intensity: IntensityLevel;
  if (workout.category) {
    intensity = workoutCategoryToIntensity(workout.category);
  } else if (workout.targetTSS) {
    intensity = estimateIntensityFromTSS(workout.targetTSS, workout.duration);
  } else {
    intensity = 'moderate';
  }

  return calculateFuelPlan({
    durationMinutes: workout.duration,
    intensity,
    weather: workout.weather,
    elevationGainMeters: workout.elevationGain,
    userWeightKg: workout.userWeightKg,
  });
}

/**
 * Calculate fuel plan from route data
 */
export function calculateFuelPlanFromRoute(route: {
  estimatedDurationMinutes: number;
  elevationGainMeters: number;
  intensity?: IntensityLevel;
  weather?: WeatherConditions;
  userWeightKg?: number;
}): FuelPlan {
  // Routes default to moderate/endurance intensity unless specified
  const intensity = route.intensity || 'moderate';

  return calculateFuelPlan({
    durationMinutes: route.estimatedDurationMinutes,
    intensity,
    weather: route.weather,
    elevationGainMeters: route.elevationGainMeters,
    userWeightKg: route.userWeightKg,
  });
}

/**
 * Calculate fuel plan for a past activity (retrospective analysis)
 */
export function calculateRetrospectiveFuelPlan(activity: {
  movingTimeSeconds: number;
  averageWatts?: number;
  kilojoules?: number;
  totalElevationGain?: number;
  weather?: WeatherConditions;
}): FuelPlan & { retrospective: true; actualKilojoules?: number } {
  const durationMinutes = activity.movingTimeSeconds / 60;

  // Estimate intensity from power if available
  let intensity: IntensityLevel = 'moderate';
  if (activity.averageWatts) {
    // Rough mapping based on typical FTP ratios
    if (activity.averageWatts < 140) intensity = 'recovery';
    else if (activity.averageWatts < 180) intensity = 'easy';
    else if (activity.averageWatts < 210) intensity = 'moderate';
    else if (activity.averageWatts < 240) intensity = 'tempo';
    else if (activity.averageWatts < 270) intensity = 'threshold';
    else intensity = 'race';
  }

  const plan = calculateFuelPlan({
    durationMinutes,
    intensity,
    weather: activity.weather,
    elevationGainMeters: activity.totalElevationGain,
  });

  return {
    ...plan,
    retrospective: true,
    actualKilojoules: activity.kilojoules,
  };
}

/**
 * Generate race day fuel plan with enhanced recommendations
 */
export function calculateRaceDayFuelPlan(race: {
  estimatedDurationMinutes: number;
  elevationGainMeters?: number;
  weather?: WeatherConditions;
  userWeightKg?: number;
  raceType?: 'criterium' | 'road_race' | 'time_trial' | 'gran_fondo' | 'gravel' | 'ultra';
}): FuelPlan {
  const plan = calculateFuelPlan({
    durationMinutes: race.estimatedDurationMinutes,
    intensity: 'race',
    weather: race.weather,
    elevationGainMeters: race.elevationGainMeters,
    userWeightKg: race.userWeightKg,
    isRaceDay: true,
  });

  // Add race-specific warnings
  if (race.raceType === 'ultra' || race.estimatedDurationMinutes > 360) {
    plan.warnings.push('Ultra-distance event - include solid foods and plan aid station strategy.');
  }

  if (race.raceType === 'criterium') {
    plan.warnings.push('Criterium - pre-race fueling critical as opportunities to eat during are limited.');
  }

  return plan;
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

/**
 * Format carb target for display
 */
export function formatCarbTarget(carbs: CarbTarget): string {
  if (carbs.totalGramsMax === 0) {
    return 'Not required for this duration';
  }
  return `${carbs.totalGramsMin}-${carbs.totalGramsMax}g total (${carbs.gramsPerHourMin}-${carbs.gramsPerHourMax}g/hour)`;
}

/**
 * Format hydration target for display
 */
export function formatHydrationTarget(hydration: HydrationTarget, useImperial = true): string {
  if (useImperial) {
    return `${hydration.ozPerHour} oz/hour${hydration.heatAdjusted ? ' (heat adjusted)' : ''}`;
  }
  return `${hydration.mlPerHour} ml/hour${hydration.heatAdjusted ? ' (heat adjusted)' : ''}`;
}

/**
 * Format pre-ride fueling for display
 */
export function formatPreRideFueling(preRide: PreRideFueling): string {
  if (!preRide.required && preRide.carbsGramsMax <= 50) {
    return 'Optional light snack';
  }
  return `${preRide.carbsGramsMin}-${preRide.carbsGramsMax}g carbs, ${preRide.timingHours} hours before`;
}

/**
 * Get intensity level display name
 */
export function getIntensityDisplayName(intensity: IntensityLevel): string {
  const names: Record<IntensityLevel, string> = {
    recovery: 'Recovery',
    easy: 'Easy/Endurance',
    moderate: 'Moderate',
    tempo: 'Tempo/Threshold',
    threshold: 'Threshold/VO2',
    race: 'Race Pace',
  };
  return names[intensity];
}

/**
 * Convert temperature between Celsius and Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round(celsius * 9 / 5 + 32);
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return Math.round((fahrenheit - 32) * 5 / 9);
}
