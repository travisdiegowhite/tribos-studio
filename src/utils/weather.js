// Weather service for route optimization
// Uses API proxy to avoid CORS issues

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
 */
export function getWeatherSeverity(weather) {
  if (!weather) return { level: 'unknown', color: 'gray' };

  const conditions = weather.conditions?.toLowerCase() || '';
  const temp = weather.temperature;
  const windSpeed = weather.windSpeed;

  // Check for dangerous conditions first
  if (conditions.includes('thunder') || conditions.includes('storm')) {
    return { level: 'dangerous', color: 'red', message: 'Thunderstorms - avoid riding' };
  }

  if (conditions.includes('snow') || conditions.includes('ice')) {
    return { level: 'dangerous', color: 'red', message: 'Snow/Ice - avoid riding' };
  }

  // Check temperature extremes
  if (temp < 0) {
    return { level: 'caution', color: 'orange', message: 'Freezing - dress warmly' };
  }
  if (temp > 35) {
    return { level: 'caution', color: 'orange', message: 'Extreme heat - stay hydrated' };
  }

  // Check wind
  if (windSpeed > 40) {
    return { level: 'caution', color: 'orange', message: 'High winds - challenging conditions' };
  }

  // Rain check
  if (conditions.includes('rain') || conditions.includes('drizzle')) {
    return { level: 'caution', color: 'yellow', message: 'Wet conditions - ride carefully' };
  }

  // Good conditions
  if (temp >= 15 && temp <= 25 && windSpeed < 20) {
    return { level: 'ideal', color: 'green', message: 'Perfect cycling weather!' };
  }

  return { level: 'good', color: 'lime', message: 'Good conditions for riding' };
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
