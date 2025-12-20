// Weather service for route optimization
// Uses API proxy to avoid CORS issues

/**
 * Weather tolerance presets for different rider types
 * All temperatures in Celsius, wind speeds in km/h
 */
export const WEATHER_TOLERANCE_PRESETS = {
  iron_rider: {
    id: 'iron_rider',
    name: 'Iron Rider',
    description: "I'll ride in almost anything",
    thresholds: {
      wind: { caution: 45, warning: 55 },      // ~28 mph / ~34 mph
      coldTemp: { caution: -5, warning: -10 }, // 23°F / 14°F
      hotTemp: { caution: 38, warning: 42 },   // 100°F / 108°F
    },
    rainTolerance: 'any',  // none, light, any
    useWindChill: false,
  },
  hardy: {
    id: 'hardy',
    name: 'Hardy',
    description: "Weather doesn't stop me much",
    thresholds: {
      wind: { caution: 35, warning: 45 },      // ~22 mph / ~28 mph
      coldTemp: { caution: 0, warning: -5 },   // 32°F / 23°F
      hotTemp: { caution: 35, warning: 40 },   // 95°F / 104°F
    },
    rainTolerance: 'light',
    useWindChill: false,
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    description: 'Reasonable conditions preferred',
    thresholds: {
      wind: { caution: 25, warning: 35 },      // ~16 mph / ~22 mph
      coldTemp: { caution: 5, warning: 0 },    // 41°F / 32°F
      hotTemp: { caution: 32, warning: 37 },   // 90°F / 99°F
    },
    rainTolerance: 'light',
    useWindChill: true,
  },
  fair_weather: {
    id: 'fair_weather',
    name: 'Fair Weather',
    description: 'I prefer comfortable rides',
    thresholds: {
      wind: { caution: 18, warning: 25 },      // ~11 mph / ~16 mph
      coldTemp: { caution: 10, warning: 5 },   // 50°F / 41°F
      hotTemp: { caution: 30, warning: 33 },   // 86°F / 91°F
    },
    rainTolerance: 'none',
    useWindChill: true,
  },
  ideal_only: {
    id: 'ideal_only',
    name: 'Ideal Only',
    description: 'Only when conditions are perfect',
    thresholds: {
      wind: { caution: 12, warning: 18 },      // ~7 mph / ~11 mph
      coldTemp: { caution: 15, warning: 10 },  // 59°F / 50°F
      hotTemp: { caution: 27, warning: 30 },   // 81°F / 86°F
    },
    rainTolerance: 'none',
    useWindChill: true,
  },
};

// Default preset for new users
export const DEFAULT_WEATHER_PRESET = 'balanced';

/**
 * Calculate wind chill temperature (Celsius)
 * Uses the North American wind chill formula
 * Only applicable when temp <= 10°C and wind >= 4.8 km/h
 */
export function calculateWindChill(tempCelsius, windSpeedKmh) {
  // Wind chill formula only valid for temps <= 10°C and wind >= 4.8 km/h
  if (tempCelsius > 10 || windSpeedKmh < 4.8) {
    return tempCelsius;
  }

  // North American wind chill index formula (for Celsius and km/h)
  const windChill = 13.12 +
    (0.6215 * tempCelsius) -
    (11.37 * Math.pow(windSpeedKmh, 0.16)) +
    (0.3965 * tempCelsius * Math.pow(windSpeedKmh, 0.16));

  return Math.round(windChill * 10) / 10;
}

/**
 * Get user's weather preferences from localStorage
 */
export function getWeatherPreferences() {
  try {
    const savedPrefs = localStorage.getItem('routePreferences');
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs);
      if (prefs.weatherTolerance) {
        // If it's a preset ID, return the preset
        if (typeof prefs.weatherTolerance === 'string' && WEATHER_TOLERANCE_PRESETS[prefs.weatherTolerance]) {
          return {
            ...WEATHER_TOLERANCE_PRESETS[prefs.weatherTolerance],
            useWindChill: prefs.useWindChill ?? WEATHER_TOLERANCE_PRESETS[prefs.weatherTolerance].useWindChill,
            rainTolerance: prefs.rainTolerance ?? WEATHER_TOLERANCE_PRESETS[prefs.weatherTolerance].rainTolerance,
          };
        }
        // If it's a custom object, return it
        if (typeof prefs.weatherTolerance === 'object') {
          return prefs.weatherTolerance;
        }
      }
    }
  } catch (error) {
    console.error('Error loading weather preferences:', error);
  }
  // Return default preset
  return WEATHER_TOLERANCE_PRESETS[DEFAULT_WEATHER_PRESET];
}

/**
 * Get weather data for a location via our API proxy
 */
export async function getWeatherData(latitude, longitude) {
  try {
    const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      return result.data;
    }

    return null;
  } catch (error) {
    console.error('Weather fetch failed:', error);
    return null;
  }
}

/**
 * Convert wind degrees to cardinal direction
 */
export function getWindDirection(degrees) {
  if (degrees === undefined || degrees === null) return 'Unknown';

  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW'
  ];

  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Calculate bearing between two points (in degrees)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Calculate if wind is favorable for a given bearing
 * @returns 'tailwind' | 'headwind' | 'crosswind' | 'neutral'
 */
export function analyzeWindForBearing(routeBearing, windDegrees, windSpeed) {
  if (!windDegrees || !windSpeed || windSpeed < 5) {
    return { type: 'neutral', factor: 1.0, description: 'Light wind - minimal effect' };
  }

  // Wind direction is where wind comes FROM
  // Route bearing is where we're going TO
  // If wind is coming from behind us, it's a tailwind
  let angleDiff = Math.abs(routeBearing - windDegrees);
  if (angleDiff > 180) {
    angleDiff = 360 - angleDiff;
  }

  // Strong wind threshold
  const isStrong = windSpeed > 25;
  const strengthLabel = isStrong ? 'strong ' : '';

  if (angleDiff <= 30) {
    // Wind from same direction we're heading = headwind
    return {
      type: 'headwind',
      factor: 0.85 - (windSpeed / 100),
      description: `${strengthLabel}headwind (${windSpeed} km/h)`,
      impact: 'slower'
    };
  } else if (angleDiff >= 150) {
    // Wind from opposite direction = tailwind
    return {
      type: 'tailwind',
      factor: 1.1 + (windSpeed / 200),
      description: `${strengthLabel}tailwind (${windSpeed} km/h)`,
      impact: 'faster'
    };
  } else if (angleDiff >= 60 && angleDiff <= 120) {
    // Wind from side = crosswind
    return {
      type: 'crosswind',
      factor: 0.95,
      description: `${strengthLabel}crosswind (${windSpeed} km/h)`,
      impact: 'challenging'
    };
  } else {
    // Diagonal wind
    const isMoreHead = angleDiff < 90;
    return {
      type: isMoreHead ? 'quartering-head' : 'quartering-tail',
      factor: isMoreHead ? 0.9 : 1.05,
      description: `${strengthLabel}${isMoreHead ? 'quartering headwind' : 'quartering tailwind'} (${windSpeed} km/h)`,
      impact: isMoreHead ? 'slightly slower' : 'slightly faster'
    };
  }
}

/**
 * Analyze wind conditions for an entire route
 */
export function analyzeWindForRoute(coordinates, windDegrees, windSpeed) {
  if (!coordinates || coordinates.length < 2) {
    return { overall: 'neutral', segments: [] };
  }

  const segments = [];
  let totalHeadwind = 0;
  let totalTailwind = 0;
  let totalCrosswind = 0;
  let totalDistance = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];

    const bearing = calculateBearing(lat1, lon1, lat2, lon2);
    const analysis = analyzeWindForBearing(bearing, windDegrees, windSpeed);

    // Approximate segment distance (Haversine)
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    segments.push({ bearing, analysis, distance });
    totalDistance += distance;

    if (analysis.type === 'headwind' || analysis.type === 'quartering-head') {
      totalHeadwind += distance;
    } else if (analysis.type === 'tailwind' || analysis.type === 'quartering-tail') {
      totalTailwind += distance;
    } else if (analysis.type === 'crosswind') {
      totalCrosswind += distance;
    }
  }

  // Determine overall wind character
  let overall;
  const headPct = (totalHeadwind / totalDistance) * 100;
  const tailPct = (totalTailwind / totalDistance) * 100;
  const crossPct = (totalCrosswind / totalDistance) * 100;

  if (headPct > 40) {
    overall = { type: 'headwind-dominant', description: `${Math.round(headPct)}% headwind` };
  } else if (tailPct > 40) {
    overall = { type: 'tailwind-dominant', description: `${Math.round(tailPct)}% tailwind` };
  } else if (crossPct > 40) {
    overall = { type: 'crosswind-dominant', description: `${Math.round(crossPct)}% crosswind` };
  } else {
    overall = { type: 'mixed', description: 'Mixed wind conditions' };
  }

  return {
    overall,
    segments,
    percentages: {
      headwind: Math.round(headPct),
      tailwind: Math.round(tailPct),
      crosswind: Math.round(crossPct),
      neutral: Math.round(100 - headPct - tailPct - crossPct)
    }
  };
}

/**
 * Get weather condition severity for cycling
 * Now uses user preferences for personalized assessment
 * @param {Object} weather - Weather data object
 * @param {Object} preferences - Optional preferences override (uses stored prefs if not provided)
 */
export function getWeatherSeverity(weather, preferences = null) {
  if (!weather) return { level: 'unknown', color: 'gray', message: 'Weather data unavailable' };

  // Get user preferences or use provided/default
  const prefs = preferences || getWeatherPreferences();
  const thresholds = prefs.thresholds;

  const conditions = weather.conditions?.toLowerCase() || '';
  const temp = weather.temperature;
  const windSpeed = weather.windSpeed;

  // Calculate effective temperature (with wind chill if enabled)
  const effectiveTemp = prefs.useWindChill
    ? calculateWindChill(temp, windSpeed)
    : temp;

  // Track all issues for comprehensive messaging
  const issues = [];

  // UNIVERSAL DANGEROUS CONDITIONS - these override all preferences
  if (conditions.includes('thunder') || conditions.includes('storm')) {
    return {
      level: 'dangerous',
      color: 'red',
      message: 'Thunderstorms - avoid riding',
      universal: true,
    };
  }

  if (conditions.includes('ice') || (conditions.includes('freezing') && conditions.includes('rain'))) {
    return {
      level: 'dangerous',
      color: 'red',
      message: 'Ice/Freezing rain - avoid riding',
      universal: true,
    };
  }

  // Severe snow conditions
  if (conditions.includes('blizzard') || conditions.includes('heavy snow')) {
    return {
      level: 'dangerous',
      color: 'red',
      message: 'Severe winter weather - avoid riding',
      universal: true,
    };
  }

  // USER-PREFERENCE-BASED ASSESSMENT

  // Check cold temperature (using effective temp if wind chill enabled)
  const tempToCheck = prefs.useWindChill ? effectiveTemp : temp;
  if (tempToCheck <= thresholds.coldTemp.warning) {
    issues.push({
      severity: 'warning',
      type: 'cold',
      message: prefs.useWindChill && effectiveTemp < temp
        ? `Very cold (feels like ${Math.round(effectiveTemp)}°C)`
        : `Very cold (${Math.round(temp)}°C)`,
    });
  } else if (tempToCheck <= thresholds.coldTemp.caution) {
    issues.push({
      severity: 'caution',
      type: 'cold',
      message: prefs.useWindChill && effectiveTemp < temp
        ? `Cold (feels like ${Math.round(effectiveTemp)}°C)`
        : `Cold (${Math.round(temp)}°C)`,
    });
  }

  // Check hot temperature
  if (temp >= thresholds.hotTemp.warning) {
    issues.push({
      severity: 'warning',
      type: 'heat',
      message: `Extreme heat (${Math.round(temp)}°C)`,
    });
  } else if (temp >= thresholds.hotTemp.caution) {
    issues.push({
      severity: 'caution',
      type: 'heat',
      message: `Hot (${Math.round(temp)}°C)`,
    });
  }

  // Check wind
  if (windSpeed >= thresholds.wind.warning) {
    issues.push({
      severity: 'warning',
      type: 'wind',
      message: `High winds (${Math.round(windSpeed)} km/h)`,
    });
  } else if (windSpeed >= thresholds.wind.caution) {
    issues.push({
      severity: 'caution',
      type: 'wind',
      message: `Windy (${Math.round(windSpeed)} km/h)`,
    });
  }

  // Check rain based on tolerance
  const hasRain = conditions.includes('rain') || conditions.includes('drizzle');
  const hasHeavyRain = conditions.includes('heavy rain') || conditions.includes('downpour');
  const hasLightRain = conditions.includes('light rain') || conditions.includes('drizzle');

  if (hasRain) {
    if (prefs.rainTolerance === 'none') {
      issues.push({
        severity: hasHeavyRain ? 'warning' : 'caution',
        type: 'rain',
        message: hasHeavyRain ? 'Heavy rain' : 'Wet conditions',
      });
    } else if (prefs.rainTolerance === 'light' && !hasLightRain) {
      issues.push({
        severity: 'caution',
        type: 'rain',
        message: 'Rain',
      });
    }
    // If rainTolerance is 'any', no issue added
  }

  // Check snow (less severe than ice for preferences)
  if (conditions.includes('snow') && !conditions.includes('heavy')) {
    issues.push({
      severity: 'caution',
      type: 'snow',
      message: 'Light snow',
    });
  }

  // Determine overall severity based on issues
  const hasWarning = issues.some((i) => i.severity === 'warning');
  const hasCaution = issues.some((i) => i.severity === 'caution');

  if (hasWarning) {
    const warningIssues = issues.filter((i) => i.severity === 'warning');
    return {
      level: 'not_recommended',
      color: 'orange',
      message: warningIssues.map((i) => i.message).join(' • '),
      issues,
      effectiveTemp: prefs.useWindChill ? effectiveTemp : null,
    };
  }

  if (hasCaution) {
    const cautionIssues = issues.filter((i) => i.severity === 'caution');
    return {
      level: 'marginal',
      color: 'yellow',
      message: cautionIssues.map((i) => i.message).join(' • '),
      issues,
      effectiveTemp: prefs.useWindChill ? effectiveTemp : null,
    };
  }

  // Check for ideal conditions (within comfortable range)
  const idealTempMin = Math.max(15, thresholds.coldTemp.caution + 5);
  const idealTempMax = Math.min(25, thresholds.hotTemp.caution - 5);
  const idealWindMax = Math.min(15, thresholds.wind.caution - 5);

  if (temp >= idealTempMin && temp <= idealTempMax && windSpeed < idealWindMax && !hasRain) {
    return {
      level: 'ideal',
      color: 'green',
      message: 'Perfect cycling weather!',
      issues: [],
      effectiveTemp: prefs.useWindChill ? effectiveTemp : null,
    };
  }

  // Good conditions (within user's comfort zone but not ideal)
  return {
    level: 'good',
    color: 'lime',
    message: 'Good conditions for you',
    issues: [],
    effectiveTemp: prefs.useWindChill ? effectiveTemp : null,
  };
}

/**
 * Determine best time for different training types based on weather
 */
export function getOptimalTrainingConditions(weatherData, trainingGoal) {
  if (!weatherData) return null;

  const { windSpeed, temperature, conditions } = weatherData;

  let score = 0.5;
  let recommendations = [];

  // Temperature scoring (15-25°C is ideal)
  if (temperature >= 15 && temperature <= 25) {
    score += 0.2;
    recommendations.push('Perfect temperature for cycling');
  } else if (temperature < 10) {
    score -= 0.2;
    recommendations.push('Cold weather - dress warmly');
  } else if (temperature > 30) {
    score -= 0.1;
    recommendations.push('Hot weather - stay hydrated');
  }

  // Wind considerations by training type
  switch (trainingGoal) {
    case 'intervals':
      if (windSpeed < 10) {
        score += 0.2;
        recommendations.push('Low wind ideal for intervals');
      } else {
        score -= 0.1;
        recommendations.push('Windy conditions may affect interval quality');
      }
      break;

    case 'endurance':
      if (windSpeed < 20) {
        score += 0.1;
      }
      break;

    case 'recovery':
      if (windSpeed < 15) {
        score += 0.15;
        recommendations.push('Calm conditions perfect for recovery');
      }
      break;

    case 'climbing':
      // Wind matters less for climbing
      score += 0.1;
      recommendations.push('Wind has less impact on climbing');
      break;
  }

  // Weather conditions
  const conditionsLower = conditions?.toLowerCase() || '';
  if (conditionsLower.includes('clear') || conditionsLower.includes('sun')) {
    score += 0.1;
    recommendations.push('Clear skies for great visibility');
  } else if (conditionsLower.includes('rain') || conditionsLower.includes('thunder')) {
    score -= 0.3;
    recommendations.push('Consider indoor training due to weather');
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    recommendations,
    suitable: score > 0.6
  };
}

/**
 * Format temperature with unit
 */
export function formatTemperature(celsius, useImperial = true) {
  if (useImperial) {
    return `${Math.round(celsius * 9/5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

/**
 * Format wind speed with unit
 */
export function formatWindSpeed(kmh, useImperial = true) {
  if (useImperial) {
    return `${Math.round(kmh * 0.621371)} mph`;
  }
  return `${Math.round(kmh)} km/h`;
}

/**
 * Get wind factor for a given bearing and wind conditions
 * Used by aiRouteGenerator for route scoring
 */
export function getWindFactor(routeBearing, windDegrees, windSpeed) {
  const analysis = analyzeWindForBearing(routeBearing, windDegrees, windSpeed);
  return analysis.factor;
}
