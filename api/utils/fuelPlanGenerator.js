/**
 * Fuel Plan Generator
 * Generates fueling recommendations for AI Coach tool calls
 */

const CARBS_PER_HOUR = {
  recovery: { min: 0, max: 30 },
  easy: { min: 30, max: 40 },
  moderate: { min: 45, max: 60 },
  tempo: { min: 60, max: 80 },
  threshold: { min: 60, max: 90 },
  race: { min: 80, max: 120 },
};

const HYDRATION_BY_TEMP = [
  { maxTempF: 50, ozPerHour: 14, electrolytes: false },
  { maxTempF: 65, ozPerHour: 18, electrolytes: false },
  { maxTempF: 80, ozPerHour: 24, electrolytes: true },
  { maxTempF: 90, ozPerHour: 28, electrolytes: true },
  { maxTempF: 100, ozPerHour: 34, electrolytes: true },
  { maxTempF: Infinity, ozPerHour: 40, electrolytes: true },
];

const PRE_RIDE_FUELING = [
  { maxDurationMin: 60, carbsMin: 0, carbsMax: 50, timingHours: 1, required: false },
  { maxDurationMin: 90, carbsMin: 50, carbsMax: 100, timingHours: 2, required: false },
  { maxDurationMin: 180, carbsMin: 100, carbsMax: 150, timingHours: 3, required: true },
  { maxDurationMin: Infinity, carbsMin: 150, carbsMax: 200, timingHours: 4, required: true },
];

const RACE_DAY_PRE_RIDE = [
  { maxDurationMin: 90, carbsMin: 100, carbsMax: 150, timingHours: 2 },
  { maxDurationMin: 180, carbsMin: 150, carbsMax: 200, timingHours: 3 },
  { maxDurationMin: 360, carbsMin: 200, carbsMax: 300, timingHours: 4 },
  { maxDurationMin: Infinity, carbsMin: 250, carbsMax: 350, timingHours: 4 },
];

/**
 * Generate a fuel plan from tool input
 */
export function generateFuelPlan(input) {
  const {
    duration_minutes,
    intensity = 'moderate',
    temperature_fahrenheit,
    elevation_gain_feet,
    is_race_day = false,
    ride_name = 'Ride',
  } = input;

  const durationHours = duration_minutes / 60;
  const warnings = [];

  // Calculate carbs
  const carbRates = CARBS_PER_HOUR[intensity] || CARBS_PER_HOUR.moderate;
  let carbMultiplier = 1;
  if (duration_minutes < 60) {
    carbMultiplier = 0;
  } else if (duration_minutes < 90 && intensity !== 'race') {
    carbMultiplier = 0.5;
  }

  const fuelingDurationHours = Math.max(0, (duration_minutes - 45) / 60);
  const carbsMin = Math.round(carbRates.min * fuelingDurationHours * carbMultiplier);
  const carbsMax = Math.round(carbRates.max * fuelingDurationHours * carbMultiplier);

  if (intensity === 'race' && carbRates.max > 80) {
    warnings.push('High carb intake (80g+/hour) requires gut training.');
  }

  // Calculate hydration
  const tempF = temperature_fahrenheit || 70;
  const hydrationTier = HYDRATION_BY_TEMP.find(tier => tempF <= tier.maxTempF) || HYDRATION_BY_TEMP[5];

  let ozPerHour = hydrationTier.ozPerHour;

  // Altitude adjustment (convert feet to meters for calculation)
  const altitudeMeters = elevation_gain_feet ? elevation_gain_feet * 0.3048 : 0;
  if (altitudeMeters > 1800) {
    ozPerHour = Math.round(ozPerHour * 1.15);
    warnings.push('Altitude increases fluid needs.');
  }

  // Heat warnings
  if (tempF > 90) {
    warnings.push('Extreme heat - pre-hydrate and plan water stops.');
  } else if (tempF > 80) {
    warnings.push('Hot conditions - prioritize electrolytes.');
  }

  // Pre-ride fueling
  const preRideTable = is_race_day ? RACE_DAY_PRE_RIDE : PRE_RIDE_FUELING;
  const preRideTier = preRideTable.find(tier => duration_minutes <= tier.maxDurationMin) || preRideTable[preRideTable.length - 1];

  // Calculate practical equivalents
  const gelsMin = Math.ceil(carbsMin / 25);
  const gelsMax = Math.ceil(carbsMax / 25);
  const bottlesNeeded = Math.ceil((ozPerHour * durationHours) / 24);

  if (duration_minutes > 180 && bottlesNeeded > 2) {
    warnings.push(`You'll need ${bottlesNeeded} bottles - plan a refill stop.`);
  }

  // Format duration
  const hours = Math.floor(duration_minutes / 60);
  const mins = duration_minutes % 60;
  const durationStr = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`;

  return {
    ride_name,
    duration: durationStr,
    intensity: intensity.charAt(0).toUpperCase() + intensity.slice(1),
    is_race_day,

    on_bike_carbs: {
      total_grams_min: carbsMin,
      total_grams_max: carbsMax,
      per_hour_min: carbRates.min,
      per_hour_max: carbRates.max,
      gels_equivalent_min: gelsMin,
      gels_equivalent_max: gelsMax,
    },

    hydration: {
      oz_per_hour: ozPerHour,
      total_oz: Math.round(ozPerHour * durationHours),
      bottles_needed: bottlesNeeded,
      include_electrolytes: hydrationTier.electrolytes,
      heat_adjusted: tempF > 80,
    },

    fueling_timing: {
      start_eating_minutes: 45,
      frequency_minutes_min: intensity === 'race' ? 15 : 20,
      frequency_minutes_max: intensity === 'race' ? 20 : 30,
    },

    pre_ride: {
      carbs_min: preRideTier.carbsMin,
      carbs_max: preRideTier.carbsMax,
      hours_before: preRideTier.timingHours,
      required: preRideTier.required ?? true,
    },

    plain_english: generatePlainEnglishSummary({
      duration_minutes,
      intensity,
      carbsMin,
      carbsMax,
      gelsMin,
      gelsMax,
      ozPerHour,
      bottlesNeeded,
      electrolytes: hydrationTier.electrolytes,
      preRideTier,
      is_race_day,
    }),

    warnings,

    disclaimer: 'General guidelines based on exercise science research. Not personalized medical or nutritional advice.',
  };
}

function generatePlainEnglishSummary(data) {
  const {
    duration_minutes,
    intensity,
    carbsMin,
    carbsMax,
    gelsMin,
    gelsMax,
    ozPerHour,
    bottlesNeeded,
    electrolytes,
    preRideTier,
    is_race_day,
  } = data;

  const parts = [];

  // Short ride
  if (duration_minutes < 60) {
    return 'Short ride - just stay hydrated. Fueling is optional.';
  }

  // On-bike fueling
  if (carbsMax > 0) {
    if (gelsMax <= 2) {
      parts.push(`Pack ${gelsMax} gel${gelsMax > 1 ? 's' : ''} or equivalent.`);
    } else {
      parts.push(`Pack ${gelsMin}-${gelsMax} gels or equivalent (${carbsMin}-${carbsMax}g carbs).`);
    }
  }

  // Hydration
  if (bottlesNeeded === 1) {
    parts.push(`One bottle${electrolytes ? ' with electrolytes' : ''}.`);
  } else {
    parts.push(`${bottlesNeeded} bottles${electrolytes ? ' with electrolytes' : ''}.`);
  }

  // Refill warning
  if (bottlesNeeded > 2) {
    parts.push('Plan a water stop for refills.');
  }

  // Pre-ride for longer rides
  if (preRideTier.required) {
    parts.push(`Eat ${preRideTier.carbsMin}-${preRideTier.carbsMax}g carbs ${preRideTier.timingHours} hours before.`);
  }

  // Race day emphasis
  if (is_race_day) {
    parts.push('Race day - stick to familiar foods and fuel early.');
  }

  return parts.join(' ');
}

export default generateFuelPlan;
