// Vercel API Route: Fuel Plan Generation
// Generates fueling recommendations for rides with optional AI summary

import Anthropic from '@anthropic-ai/sdk';
import { setupCors } from './utils/cors.js';

// Fueling calculation logic (mirrored from frontend utils)
// Keeping it server-side for AI integration

const CARBS_PER_HOUR = {
  recovery: { min: 0, max: 30 },
  easy: { min: 30, max: 40 },
  moderate: { min: 45, max: 60 },
  tempo: { min: 60, max: 80 },
  threshold: { min: 60, max: 90 },
  race: { min: 80, max: 120 },
};

const HYDRATION_BY_TEMP = [
  { maxTemp: 10, mlPerHour: 400, electrolytes: false },
  { maxTemp: 18, mlPerHour: 500, electrolytes: false },
  { maxTemp: 27, mlPerHour: 650, electrolytes: true },
  { maxTemp: 32, mlPerHour: 800, electrolytes: true },
  { maxTemp: 38, mlPerHour: 950, electrolytes: true },
  { maxTemp: Infinity, mlPerHour: 1100, electrolytes: true },
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

function mlToOz(ml) {
  return Math.round(ml * 0.033814);
}

function calculateFuelPlan(input) {
  const {
    durationMinutes,
    intensity = 'moderate',
    weather = {},
    elevationGainMeters,
    userWeightKg,
    isRaceDay = false,
  } = input;

  const warnings = [];
  const durationHours = durationMinutes / 60;

  // Carbohydrates
  const carbRates = CARBS_PER_HOUR[intensity] || CARBS_PER_HOUR.moderate;
  let carbMultiplier = 1;
  if (durationMinutes < 60) {
    carbMultiplier = 0;
  } else if (durationMinutes < 90 && intensity !== 'race') {
    carbMultiplier = 0.5;
  }

  const fuelingDurationHours = Math.max(0, (durationMinutes - 45) / 60);

  const carbs = {
    gramsPerHourMin: carbRates.min,
    gramsPerHourMax: carbRates.max,
    totalGramsMin: Math.round(carbRates.min * fuelingDurationHours * carbMultiplier),
    totalGramsMax: Math.round(carbRates.max * fuelingDurationHours * carbMultiplier),
  };

  if (intensity === 'race' && carbRates.max > 80) {
    warnings.push('High carb intake (80g+/hour) requires gut training.');
  }

  // Hydration
  const tempC = weather?.temperatureCelsius ?? 20;
  const hydrationTier = HYDRATION_BY_TEMP.find(tier => tempC <= tier.maxTemp) || HYDRATION_BY_TEMP[5];

  let adjustedMl = hydrationTier.mlPerHour;
  let altitudeAdjusted = false;

  if (weather?.humidity && weather.humidity > 70) {
    adjustedMl *= 1.2;
  }

  if (weather?.altitudeMeters && weather.altitudeMeters > 1800) {
    adjustedMl *= weather.altitudeMeters > 3000 ? 1.2 : 1.1;
    altitudeAdjusted = true;
  }

  adjustedMl = Math.round(adjustedMl);

  const hydration = {
    mlPerHour: adjustedMl,
    ozPerHour: mlToOz(adjustedMl),
    totalMl: Math.round(adjustedMl * durationHours),
    totalOz: mlToOz(Math.round(adjustedMl * durationHours)),
    includeElectrolytes: hydrationTier.electrolytes,
    heatAdjusted: tempC > 27,
    altitudeAdjusted,
  };

  if (tempC > 32) {
    warnings.push('Extreme heat - pre-hydrate and plan refill stops.');
  } else if (tempC > 27) {
    warnings.push('Hot conditions - prioritize electrolytes.');
  }

  // Pre-ride
  const preRideTable = isRaceDay ? RACE_DAY_PRE_RIDE : PRE_RIDE_FUELING;
  const preRideTier = preRideTable.find(tier => durationMinutes <= tier.maxDurationMin) || preRideTable[preRideTable.length - 1];

  const preRide = {
    carbsGramsMin: preRideTier.carbsMin,
    carbsGramsMax: preRideTier.carbsMax,
    timingHours: preRideTier.timingHours,
    required: preRideTier.required ?? true,
  };

  // Frequency
  const frequency = {
    startEatingMinutes: 45,
    intervalMinutes: intensity === 'race' ? { min: 15, max: 20 } : { min: 20, max: 30 },
  };

  // Energy
  const basePowerByIntensity = {
    recovery: 100, easy: 150, moderate: 200,
    tempo: 225, threshold: 250, race: 275,
  };
  let estimatedPower = basePowerByIntensity[intensity] || 200;
  if (userWeightKg) {
    estimatedPower *= Math.sqrt(userWeightKg / 75);
  }
  const elevationKj = elevationGainMeters ? elevationGainMeters / 10 : 0;
  const estimatedKilojoules = Math.round((estimatedPower * durationMinutes * 60) / 1000 + elevationKj);

  // Practical equivalents
  const gelsEquivalent = {
    min: Math.ceil(carbs.totalGramsMin / 25),
    max: Math.ceil(carbs.totalGramsMax / 25),
  };
  const bottlesNeeded = Math.ceil(hydration.totalMl / 750);

  if (durationMinutes > 180 && bottlesNeeded > 2) {
    warnings.push(`Plan a refill - you'll need ${bottlesNeeded} bottles.`);
  }

  // Altitude carb adjustment
  if (weather?.altitudeMeters && weather.altitudeMeters > 1800) {
    carbs.totalGramsMin = Math.round(carbs.totalGramsMin * 1.12);
    carbs.totalGramsMax = Math.round(carbs.totalGramsMax * 1.12);
    warnings.push('Altitude increases carb burn - fuel more than hunger suggests.');
  }

  return {
    carbs,
    hydration,
    preRide,
    frequency,
    estimatedKilojoules,
    estimatedCalories: Math.round(estimatedKilojoules * 0.239),
    durationMinutes,
    intensity,
    isRaceDay,
    gelsEquivalent,
    bottlesNeeded,
    warnings,
    disclaimer: 'General guidelines based on exercise science research. Not personalized medical or nutritional advice.',
  };
}

async function generatePlainEnglishSummary(plan, context = {}) {
  const anthropic = new Anthropic();

  const prompt = `You are a cycling nutrition expert. Generate a brief, friendly "plain English" summary for this fueling plan.

FUEL PLAN DATA:
- Duration: ${plan.durationMinutes} minutes
- Intensity: ${plan.intensity}
- Carbs: ${plan.carbs.totalGramsMin}-${plan.carbs.totalGramsMax}g total (${plan.carbs.gramsPerHourMin}-${plan.carbs.gramsPerHourMax}g/hr)
- Hydration: ${plan.hydration.ozPerHour} oz/hr (${plan.bottlesNeeded} bottles)
- Gels equivalent: ${plan.gelsEquivalent.min}-${plan.gelsEquivalent.max}
- Pre-ride: ${plan.preRide.carbsGramsMin}-${plan.preRide.carbsGramsMax}g, ${plan.preRide.timingHours}h before
- Heat adjusted: ${plan.hydration.heatAdjusted}
- Altitude adjusted: ${plan.hydration.altitudeAdjusted}
${plan.isRaceDay ? '- RACE DAY' : ''}
${context.rideName ? `- Ride: ${context.rideName}` : ''}
${context.weather?.temperatureCelsius ? `- Temperature: ${Math.round(context.weather.temperatureCelsius * 9/5 + 32)}°F` : ''}

WARNINGS: ${plan.warnings.length > 0 ? plan.warnings.join('; ') : 'None'}

Write 2-3 sentences that:
1. Tell them exactly what to pack (gels, bottles, etc.)
2. Give any important timing/refill reminders
3. Keep it conversational and actionable

Example: "Pack 4-5 gels or equivalent energy. Two bottles minimum with electrolytes. Plan a refill if no support."

Your summary:`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.text || null;
  } catch (error) {
    console.error('[fuel-plan] AI summary error:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return;
  }

  // Allow GET for simple queries, POST for complex ones
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let input;

    if (req.method === 'GET') {
      // Parse from query params
      const { duration, intensity, temp, humidity, altitude, weight, raceDay, aiSummary } = req.query;

      if (!duration) {
        return res.status(400).json({ error: 'Missing required parameter: duration' });
      }

      input = {
        durationMinutes: parseInt(duration, 10),
        intensity: intensity || 'moderate',
        weather: {
          temperatureCelsius: temp ? parseFloat(temp) : undefined,
          humidity: humidity ? parseFloat(humidity) : undefined,
          altitudeMeters: altitude ? parseFloat(altitude) : undefined,
        },
        userWeightKg: weight ? parseFloat(weight) : undefined,
        isRaceDay: raceDay === 'true',
        includeAiSummary: aiSummary === 'true',
      };
    } else {
      // Parse from body
      input = req.body;
    }

    const {
      durationMinutes,
      intensity,
      weather,
      elevationGainMeters,
      userWeightKg,
      isRaceDay,
      includeAiSummary,
      context,
    } = input;

    if (!durationMinutes || durationMinutes < 0) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    // Calculate fuel plan
    const plan = calculateFuelPlan({
      durationMinutes,
      intensity,
      weather,
      elevationGainMeters,
      userWeightKg,
      isRaceDay,
    });

    // Generate AI summary if requested
    let plainEnglishSummary = null;
    if (includeAiSummary) {
      plainEnglishSummary = await generatePlainEnglishSummary(plan, { ...context, weather });
    }

    return res.status(200).json({
      success: true,
      plan,
      plainEnglishSummary,
    });

  } catch (error) {
    console.error('[fuel-plan] Error:', error);
    return res.status(500).json({
      error: 'Failed to generate fuel plan',
      message: error.message,
    });
  }
}
