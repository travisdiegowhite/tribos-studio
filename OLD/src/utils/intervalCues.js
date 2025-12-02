/**
 * Generate interval workout cues for cycling routes
 * Provides location-based instructions for where to perform intervals
 */

/**
 * Calculate total distance from coordinates array
 */
function calculateTotalDistance(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    totalDistance += haversineDistance(lat1, lon1, lat2, lon2);
  }
  return totalDistance;
}

/**
 * Haversine distance formula (returns km)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Find coordinate at specific distance along route
 */
function findCoordinateAtDistance(coordinates, targetDistance) {
  let accumulatedDistance = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    const segmentDistance = haversineDistance(lat1, lon1, lat2, lon2);

    if (accumulatedDistance + segmentDistance >= targetDistance) {
      // Return the coordinate at this segment
      return {
        coordinate: coordinates[i],
        index: i,
        distance: targetDistance
      };
    }

    accumulatedDistance += segmentDistance;
  }

  // If we've gone past the end, return the last coordinate
  return {
    coordinate: coordinates[coordinates.length - 1],
    index: coordinates.length - 1,
    distance: accumulatedDistance
  };
}

/**
 * Generate interval cues from a workout library structure
 * Converts workout.structure into detailed cues mapped to route distance
 */
export function generateCuesFromWorkoutStructure(route, workout) {
  if (!route || !route.coordinates || route.coordinates.length < 2) {
    return null;
  }

  if (!workout || !workout.structure) {
    return null;
  }

  console.log('📚 Generating cues from workout library:', {
    workoutName: workout.name,
    duration: workout.duration,
    structure: workout.structure
  });

  const totalDistance = route.distance || calculateTotalDistance(route.coordinates);
  const cues = [];
  let currentDistance = 0;
  let currentTime = 0; // Track time in minutes

  // Helper to convert time-based segment to distance
  const timeToDistance = (minutes, zone) => {
    // Estimate speed based on zone
    const zoneSpeed = {
      1: 22,  // km/h - recovery
      2: 25,  // km/h - endurance
      3: 27,  // km/h - tempo
      4: 28,  // km/h - threshold
      5: 30,  // km/h - VO2max
    };
    const speed = zoneSpeed[zone] || 25;
    return (speed / 60) * minutes;
  };

  // Helper to process a segment
  const processSegment = (segment, segmentIndex, segmentType) => {
    const segmentDistance = timeToDistance(segment.duration, segment.zone);

    if (currentDistance + segmentDistance > totalDistance) {
      // Don't add segments beyond route distance
      return false;
    }

    cues.push({
      type: segmentType,
      zone: segment.zone,
      distance: segmentDistance,
      startDistance: currentDistance,
      endDistance: currentDistance + segmentDistance,
      coordinate: findCoordinateAtDistance(route.coordinates, currentDistance + segmentDistance).coordinate,
      instruction: `${segment.description || segmentType}: Zone ${segment.zone} for ${segment.duration}min (${segmentDistance.toFixed(1)}km)${segment.powerPctFTP ? ` @ ${segment.powerPctFTP}% FTP` : ''}${segment.cadence ? ` | ${segment.cadence} rpm` : ''}`,
      duration: segment.duration,
      powerPctFTP: segment.powerPctFTP,
      cadence: segment.cadence
    });

    currentDistance += segmentDistance;
    currentTime += segment.duration;
    return true;
  };

  // Helper to process repeating segments
  const processRepeatStructure = (repeatBlock, blockIndex) => {
    const { sets, work, rest } = repeatBlock;

    for (let setNum = 1; setNum <= sets; setNum++) {
      // Process work portion
      if (Array.isArray(work)) {
        work.forEach((workSegment, workIdx) => {
          if (workSegment.type === 'repeat') {
            // Nested repeats (like 30/30 intervals)
            processRepeatStructure(workSegment, `${blockIndex}-${setNum}-${workIdx}`);
          } else {
            processSegment(workSegment, `${blockIndex}-${setNum}-${workIdx}`, `interval-hard`);
          }
        });
      }

      // Process rest portion (between sets, not after last set)
      if (rest && rest.duration > 0 && setNum < sets) {
        processSegment(rest, `${blockIndex}-${setNum}-rest`, 'interval-recovery');
      }
    }
  };

  // 1. Process warmup
  if (workout.structure.warmup) {
    processSegment(workout.structure.warmup, 0, 'warmup');
  }

  // 2. Process main workout
  if (workout.structure.main && Array.isArray(workout.structure.main)) {
    workout.structure.main.forEach((segment, idx) => {
      if (segment.type === 'repeat') {
        // Handle repeating intervals
        processRepeatStructure(segment, idx);
      } else {
        // Simple steady segment
        processSegment(segment, idx, 'main');
      }
    });
  }

  // 3. Process cooldown
  if (workout.structure.cooldown) {
    processSegment(workout.structure.cooldown, 'cooldown', 'cooldown');
  }

  // If we haven't used all the route distance, add a steady segment
  if (currentDistance < totalDistance - 0.5) {
    const remainingDist = totalDistance - currentDistance;
    cues.push({
      type: 'steady',
      zone: 2,
      distance: remainingDist,
      startDistance: currentDistance,
      endDistance: totalDistance,
      coordinate: findCoordinateAtDistance(route.coordinates, totalDistance).coordinate,
      instruction: `Steady Zone 2 for ${remainingDist.toFixed(1)}km`
    });
  }

  console.log(`✅ Generated ${cues.length} cues from workout structure`);
  return cues;
}

/**
 * Generate interval workout structure based on training context
 * (Legacy function for generic workouts)
 */
export function generateIntervalCues(route, trainingContext) {
  if (!route || !route.coordinates || route.coordinates.length < 2) {
    return null;
  }

  if (!trainingContext || !trainingContext.workoutType) {
    return null;
  }

  const { workoutType, primaryZone, targetDuration, targetTSS } = trainingContext;
  const totalDistance = route.distance || calculateTotalDistance(route.coordinates);

  // Debug logging to see what training context we're receiving
  console.log('🎯 Generating interval cues with training context:', {
    workoutType,
    primaryZone,
    targetDuration,
    targetTSS,
    routeDistance: totalDistance
  });

  const cues = [];
  let currentDistance = 0;

  // Warm-up (always included)
  const warmupDistance = Math.min(2, totalDistance * 0.15); // 2km or 15% of route
  cues.push({
    type: 'warmup',
    zone: 2,
    distance: warmupDistance,
    startDistance: 0,
    endDistance: warmupDistance,
    coordinate: findCoordinateAtDistance(route.coordinates, warmupDistance).coordinate,
    instruction: `Warm-up: Easy pace in Zone 2 for ${warmupDistance.toFixed(1)}km`
  });
  currentDistance = warmupDistance;

  // Main workout based on type
  switch (workoutType) {
    case 'intervals':
    case 'vo2max':
      // High-intensity intervals (VO2 max or mixed intervals)
      cues.push(...generateIntervalSegments(route.coordinates, totalDistance, currentDistance, targetDuration, primaryZone, targetTSS));
      break;

    case 'threshold':
      // Threshold intervals: longer intervals at FTP
      cues.push(...generateThresholdSegments(route.coordinates, totalDistance, currentDistance, targetDuration, primaryZone, targetTSS));
      break;

    case 'sweet_spot':
      // Sweet spot intervals: sustained efforts below threshold
      cues.push(...generateSweetSpotSegments(route.coordinates, totalDistance, currentDistance, targetDuration, primaryZone, targetTSS));
      break;

    case 'hills':
    case 'hill_repeats':
      cues.push(...generateHillSegments(route.coordinates, totalDistance, currentDistance, route.elevationProfile, primaryZone, targetTSS));
      break;

    case 'endurance':
    case 'long_ride':
      cues.push(...generateEnduranceSegments(route.coordinates, totalDistance, currentDistance, primaryZone, targetTSS));
      break;

    case 'recovery':
      cues.push(...generateRecoverySegments(route.coordinates, totalDistance, currentDistance));
      break;

    case 'tempo':
      // Tempo ride: sustained Zone 3 effort
      cues.push(...generateTempoSegments(route.coordinates, totalDistance, currentDistance, targetDuration, primaryZone));
      break;

    default:
      // Generic steady effort
      const mainDistance = totalDistance - currentDistance - Math.min(1.5, totalDistance * 0.1);
      cues.push({
        type: 'main',
        zone: primaryZone || 3,
        distance: mainDistance,
        startDistance: currentDistance,
        endDistance: currentDistance + mainDistance,
        coordinate: findCoordinateAtDistance(route.coordinates, currentDistance + mainDistance).coordinate,
        instruction: `Steady effort in Zone ${primaryZone || 3} for ${mainDistance.toFixed(1)}km`
      });
      currentDistance += mainDistance;
  }

  // Cool-down (always included)
  const cooldownDistance = Math.min(1.5, totalDistance * 0.1); // 1.5km or 10% of route
  const cooldownStart = totalDistance - cooldownDistance;
  cues.push({
    type: 'cooldown',
    zone: 1,
    distance: cooldownDistance,
    startDistance: cooldownStart,
    endDistance: totalDistance,
    coordinate: findCoordinateAtDistance(route.coordinates, cooldownStart).coordinate,
    instruction: `Cool-down: Easy spin in Zone 1 for ${cooldownDistance.toFixed(1)}km`
  });

  return cues;
}

/**
 * Generate interval segments based on training context
 * Adapts interval duration and intensity based on targetDuration and targetTSS
 */
function generateIntervalSegments(coordinates, totalDistance, startDistance, targetDuration, primaryZone = 5, targetTSS = 75) {
  const segments = [];
  let currentDistance = startDistance;

  // Reserve space for cooldown (1.5km)
  const availableDistance = totalDistance - startDistance - 1.5;

  // Calculate interval characteristics based on TSS and duration
  // Higher TSS = longer or more intense intervals
  let hardIntervalMinutes, recoveryMinutes, hardZone;

  if (targetTSS > 100) {
    // High TSS: Longer intervals at threshold/VO2 max
    hardIntervalMinutes = 5;
    recoveryMinutes = 3;
    hardZone = Math.min(5, primaryZone || 5);
  } else if (targetTSS > 75) {
    // Medium-high TSS: Standard 3-2 intervals
    hardIntervalMinutes = 3;
    recoveryMinutes = 2;
    hardZone = Math.min(5, primaryZone || 5);
  } else {
    // Lower TSS: Shorter, less intense intervals
    hardIntervalMinutes = 2;
    recoveryMinutes = 2;
    hardZone = Math.min(4, primaryZone || 4); // Cap at threshold for lower TSS
  }

  // Calculate distances based on realistic speeds
  const hardSpeed = hardZone >= 5 ? 30 : (hardZone >= 4 ? 28 : 25); // km/h
  const recoverySpeed = 20; // km/h

  const hardSegmentDist = (hardSpeed / 60) * hardIntervalMinutes;
  const easySegmentDist = (recoverySpeed / 60) * recoveryMinutes;
  const intervalPairDist = hardSegmentDist + easySegmentDist;

  // Calculate number of intervals that fit in available distance
  const numIntervals = Math.min(8, Math.floor(availableDistance / intervalPairDist));

  for (let i = 0; i < numIntervals; i++) {
    // Hard interval
    segments.push({
      type: 'interval-hard',
      zone: hardZone,
      distance: hardSegmentDist,
      startDistance: currentDistance,
      endDistance: currentDistance + hardSegmentDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + hardSegmentDist).coordinate,
      instruction: `Interval ${i + 1}: HARD effort Zone ${hardZone} for ${hardSegmentDist.toFixed(1)}km (~${hardIntervalMinutes}min)`,
      intervalNumber: i + 1,
      targetMinutes: hardIntervalMinutes
    });
    currentDistance += hardSegmentDist;

    // Recovery interval
    segments.push({
      type: 'interval-recovery',
      zone: 2,
      distance: easySegmentDist,
      startDistance: currentDistance,
      endDistance: currentDistance + easySegmentDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + easySegmentDist).coordinate,
      instruction: `Recovery: Easy spin Zone 2 for ${easySegmentDist.toFixed(1)}km (~${recoveryMinutes}min)`,
      intervalNumber: i + 1,
      targetMinutes: recoveryMinutes
    });
    currentDistance += easySegmentDist;
  }

  // Fill remaining distance with steady Zone 3
  const remainingDist = totalDistance - currentDistance - 1.5;
  if (remainingDist > 0.5) {
    segments.push({
      type: 'steady',
      zone: 3,
      distance: remainingDist,
      startDistance: currentDistance,
      endDistance: currentDistance + remainingDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + remainingDist).coordinate,
      instruction: `Steady Zone 3 for ${remainingDist.toFixed(1)}km`
    });
  }

  return segments;
}

/**
 * Generate hill-specific segments based on training context
 */
function generateHillSegments(coordinates, totalDistance, startDistance, elevationProfile, primaryZone = 4, targetTSS = 75) {
  const segments = [];
  let currentDistance = startDistance;

  // Adapt hill training based on TSS and primary zone
  const availableDistance = totalDistance - startDistance - 1.5;

  // Higher TSS = longer or more hill repeats
  let hillDist, recoveryDist, numHillRepeats, climbZone;

  if (targetTSS > 100) {
    // High TSS: Longer climbs at higher intensity
    hillDist = 1.5;
    recoveryDist = 1.0;
    numHillRepeats = Math.min(5, Math.floor(availableDistance / (hillDist + recoveryDist)));
    climbZone = Math.max(4, primaryZone || 4);
  } else if (targetTSS > 75) {
    // Medium TSS: Standard hill repeats
    hillDist = 1.0;
    recoveryDist = 1.0;
    numHillRepeats = Math.min(4, Math.floor(availableDistance / (hillDist + recoveryDist)));
    climbZone = primaryZone || 4;
  } else {
    // Lower TSS: Shorter, easier hills
    hillDist = 0.75;
    recoveryDist = 1.0;
    numHillRepeats = Math.min(3, Math.floor(availableDistance / (hillDist + recoveryDist)));
    climbZone = Math.min(3, primaryZone || 3);
  }

  for (let i = 0; i < numHillRepeats; i++) {
    segments.push({
      type: 'hill-climb',
      zone: climbZone,
      distance: hillDist,
      startDistance: currentDistance,
      endDistance: currentDistance + hillDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + hillDist).coordinate,
      instruction: `Hill ${i + 1}: Climb at Zone ${climbZone} for ${hillDist.toFixed(1)}km`,
      hillNumber: i + 1
    });
    currentDistance += hillDist;

    segments.push({
      type: 'hill-recovery',
      zone: 2,
      distance: recoveryDist,
      startDistance: currentDistance,
      endDistance: currentDistance + recoveryDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + recoveryDist).coordinate,
      instruction: `Recovery: Easy spin Zone 2 for ${recoveryDist.toFixed(1)}km`,
      hillNumber: i + 1
    });
    currentDistance += recoveryDist;
  }

  return segments;
}

/**
 * Generate endurance segments based on training context
 */
function generateEnduranceSegments(coordinates, totalDistance, startDistance, primaryZone, targetTSS = 75) {
  const segments = [];
  const availableDistance = totalDistance - startDistance - 1.5;

  // Adapt endurance ride based on TSS
  let steadyZone, surgeZone, surgePercentage;

  if (targetTSS > 90) {
    // Higher TSS: More tempo/threshold work
    steadyZone = Math.max(2, primaryZone || 2);
    surgeZone = Math.min(4, (primaryZone || 2) + 2);
    surgePercentage = 0.3; // 30% at higher intensity
  } else if (targetTSS > 60) {
    // Medium TSS: Standard endurance with some surges
    steadyZone = primaryZone || 2;
    surgeZone = Math.min(4, (primaryZone || 2) + 1);
    surgePercentage = 0.2; // 20% at higher intensity
  } else {
    // Lower TSS: Pure steady endurance
    steadyZone = Math.min(2, primaryZone || 2);
    surgeZone = steadyZone;
    surgePercentage = 0; // No surges for recovery/easy endurance
  }

  const steadyDist = availableDistance * (1 - surgePercentage);
  const surgeDist = availableDistance * surgePercentage;

  segments.push({
    type: 'endurance-steady',
    zone: steadyZone,
    distance: steadyDist,
    startDistance: startDistance,
    endDistance: startDistance + steadyDist,
    coordinate: findCoordinateAtDistance(coordinates, startDistance + steadyDist).coordinate,
    instruction: `Steady endurance Zone ${steadyZone} for ${steadyDist.toFixed(1)}km`
  });

  if (surgeDist > 0.5) {
    segments.push({
      type: 'endurance-surge',
      zone: surgeZone,
      distance: surgeDist,
      startDistance: startDistance + steadyDist,
      endDistance: startDistance + steadyDist + surgeDist,
      coordinate: findCoordinateAtDistance(coordinates, startDistance + steadyDist + surgeDist).coordinate,
      instruction: `Tempo effort Zone ${surgeZone} for ${surgeDist.toFixed(1)}km`
    });
  }

  return segments;
}

/**
 * Generate recovery segments (all Zone 1-2)
 */
function generateRecoverySegments(coordinates, totalDistance, startDistance) {
  const segments = [];
  const availableDistance = totalDistance - startDistance - 1.5;

  segments.push({
    type: 'recovery-easy',
    zone: 1,
    distance: availableDistance,
    startDistance: startDistance,
    endDistance: startDistance + availableDistance,
    coordinate: findCoordinateAtDistance(coordinates, startDistance + availableDistance).coordinate,
    instruction: `Easy recovery ride Zone 1 for ${availableDistance.toFixed(1)}km`
  });

  return segments;
}

/**
 * Generate threshold interval segments (2-3x8-20min at FTP)
 */
function generateThresholdSegments(coordinates, totalDistance, startDistance, targetDuration, primaryZone = 4, targetTSS = 90) {
  const segments = [];
  let currentDistance = startDistance;
  const availableDistance = totalDistance - startDistance - 1.5;

  // Threshold intervals: longer sustained efforts
  const intervalMinutes = targetTSS > 100 ? 20 : (targetTSS > 85 ? 12 : 10);
  const recoveryMinutes = Math.ceil(intervalMinutes * 0.5); // Half the interval duration

  const thresholdSpeed = 28; // km/h at threshold
  const recoverySpeed = 20; // km/h

  const intervalDist = (thresholdSpeed / 60) * intervalMinutes;
  const recoveryDist = (recoverySpeed / 60) * recoveryMinutes;
  const setDistance = intervalDist + recoveryDist;

  const numSets = Math.min(4, Math.floor(availableDistance / setDistance));

  for (let i = 0; i < numSets; i++) {
    // Threshold interval
    segments.push({
      type: 'threshold-interval',
      zone: primaryZone,
      distance: intervalDist,
      startDistance: currentDistance,
      endDistance: currentDistance + intervalDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + intervalDist).coordinate,
      instruction: `Threshold ${i + 1}: Zone ${primaryZone} for ${intervalDist.toFixed(1)}km (~${intervalMinutes}min at FTP)`,
      intervalNumber: i + 1,
      targetMinutes: intervalMinutes
    });
    currentDistance += intervalDist;

    // Recovery
    segments.push({
      type: 'threshold-recovery',
      zone: 2,
      distance: recoveryDist,
      startDistance: currentDistance,
      endDistance: currentDistance + recoveryDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + recoveryDist).coordinate,
      instruction: `Recovery: Easy Zone 2 for ${recoveryDist.toFixed(1)}km (~${recoveryMinutes}min)`,
      intervalNumber: i + 1,
      targetMinutes: recoveryMinutes
    });
    currentDistance += recoveryDist;
  }

  // Fill remaining with steady Zone 3
  const remainingDist = totalDistance - currentDistance - 1.5;
  if (remainingDist > 0.5) {
    segments.push({
      type: 'steady',
      zone: 3,
      distance: remainingDist,
      startDistance: currentDistance,
      endDistance: currentDistance + remainingDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + remainingDist).coordinate,
      instruction: `Steady Zone 3 for ${remainingDist.toFixed(1)}km`
    });
  }

  return segments;
}

/**
 * Generate sweet spot interval segments (3-4x10-20min at 88-94% FTP)
 */
function generateSweetSpotSegments(coordinates, totalDistance, startDistance, targetDuration, primaryZone = 3.5, targetTSS = 85) {
  const segments = [];
  let currentDistance = startDistance;
  const availableDistance = totalDistance - startDistance - 1.5;

  // Sweet spot: sustained sub-threshold efforts
  const intervalMinutes = targetTSS > 90 ? 20 : 15;
  const recoveryMinutes = 5;

  const sweetSpotSpeed = 27; // km/h
  const recoverySpeed = 20; // km/h

  const intervalDist = (sweetSpotSpeed / 60) * intervalMinutes;
  const recoveryDist = (recoverySpeed / 60) * recoveryMinutes;
  const setDistance = intervalDist + recoveryDist;

  const numSets = Math.min(4, Math.floor(availableDistance / setDistance));
  const effectiveZone = Math.round(primaryZone); // Round 3.5 to 4 for display

  for (let i = 0; i < numSets; i++) {
    segments.push({
      type: 'sweetspot-interval',
      zone: effectiveZone,
      distance: intervalDist,
      startDistance: currentDistance,
      endDistance: currentDistance + intervalDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + intervalDist).coordinate,
      instruction: `Sweet Spot ${i + 1}: Zone ${effectiveZone} for ${intervalDist.toFixed(1)}km (~${intervalMinutes}min at 88-94% FTP)`,
      intervalNumber: i + 1,
      targetMinutes: intervalMinutes
    });
    currentDistance += intervalDist;

    segments.push({
      type: 'sweetspot-recovery',
      zone: 2,
      distance: recoveryDist,
      startDistance: currentDistance,
      endDistance: currentDistance + recoveryDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + recoveryDist).coordinate,
      instruction: `Recovery: Easy Zone 2 for ${recoveryDist.toFixed(1)}km (~${recoveryMinutes}min)`,
      intervalNumber: i + 1,
      targetMinutes: recoveryMinutes
    });
    currentDistance += recoveryDist;
  }

  // Fill remaining with steady
  const remainingDist = totalDistance - currentDistance - 1.5;
  if (remainingDist > 0.5) {
    segments.push({
      type: 'steady',
      zone: 3,
      distance: remainingDist,
      startDistance: currentDistance,
      endDistance: currentDistance + remainingDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + remainingDist).coordinate,
      instruction: `Steady Zone 3 for ${remainingDist.toFixed(1)}km`
    });
  }

  return segments;
}

/**
 * Generate tempo ride segments (sustained Zone 3 effort)
 */
function generateTempoSegments(coordinates, totalDistance, startDistance, targetDuration, primaryZone = 3) {
  const segments = [];
  const availableDistance = totalDistance - startDistance - 1.5;

  // Tempo: mostly sustained Zone 3 with brief recoveries
  const tempoBlockMinutes = 20;
  const recoveryMinutes = 5;

  const tempoSpeed = 26; // km/h
  const recoverySpeed = 20; // km/h

  const tempoBlockDist = (tempoSpeed / 60) * tempoBlockMinutes;
  const recoveryDist = (recoverySpeed / 60) * recoveryMinutes;
  const blockDistance = tempoBlockDist + recoveryDist;

  const numBlocks = Math.floor(availableDistance / blockDistance);

  let currentDistance = startDistance;

  for (let i = 0; i < numBlocks; i++) {
    segments.push({
      type: 'tempo-block',
      zone: Math.max(3, primaryZone),
      distance: tempoBlockDist,
      startDistance: currentDistance,
      endDistance: currentDistance + tempoBlockDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + tempoBlockDist).coordinate,
      instruction: `Tempo Block ${i + 1}: Zone ${Math.max(3, primaryZone)} for ${tempoBlockDist.toFixed(1)}km (~${tempoBlockMinutes}min)`,
      blockNumber: i + 1,
      targetMinutes: tempoBlockMinutes
    });
    currentDistance += tempoBlockDist;

    if (i < numBlocks - 1) { // No recovery after last block
      segments.push({
        type: 'tempo-recovery',
        zone: 2,
        distance: recoveryDist,
        startDistance: currentDistance,
        endDistance: currentDistance + recoveryDist,
        coordinate: findCoordinateAtDistance(coordinates, currentDistance + recoveryDist).coordinate,
        instruction: `Recovery: Zone 2 for ${recoveryDist.toFixed(1)}km (~${recoveryMinutes}min)`,
        blockNumber: i + 1,
        targetMinutes: recoveryMinutes
      });
      currentDistance += recoveryDist;
    }
  }

  // Fill remaining with steady Zone 3
  const remainingDist = totalDistance - currentDistance - 1.5;
  if (remainingDist > 0.5) {
    segments.push({
      type: 'steady',
      zone: 3,
      distance: remainingDist,
      startDistance: currentDistance,
      endDistance: currentDistance + remainingDist,
      coordinate: findCoordinateAtDistance(coordinates, currentDistance + remainingDist).coordinate,
      instruction: `Steady Zone 3 for ${remainingDist.toFixed(1)}km`
    });
  }

  return segments;
}

/**
 * Get zone color for display
 */
export function getZoneColor(zone) {
  const colors = {
    1: '#4ade80', // green - recovery
    2: '#60a5fa', // blue - endurance
    3: '#facc15', // yellow - tempo
    4: '#fb923c', // orange - threshold
    5: '#ef4444', // red - VO2 max
  };
  return colors[zone] || '#9ca3af';
}

/**
 * Get zone name
 */
export function getZoneName(zone) {
  const names = {
    1: 'Recovery',
    2: 'Endurance',
    3: 'Tempo',
    4: 'Threshold',
    5: 'VO2 Max',
  };
  return names[zone] || 'Unknown';
}

/**
 * Convert interval cues to colored route segments for map display
 * Returns an array of GeoJSON LineStrings with color properties
 */
export function createColoredRouteSegments(coordinates, cues) {
  if (!coordinates || coordinates.length < 2 || !cues || cues.length === 0) {
    return null;
  }

  const totalDistance = calculateTotalDistance(coordinates);
  const segments = [];

  // Build cumulative distance array for faster lookups
  const cumulativeDistances = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    const segmentDist = haversineDistance(lat1, lon1, lat2, lon2);
    cumulativeDistances.push(cumulativeDistances[i - 1] + segmentDist);
  }

  // Helper to find coordinate index at specific distance
  const findIndexAtDistance = (targetDistance) => {
    for (let i = 0; i < cumulativeDistances.length - 1; i++) {
      if (cumulativeDistances[i + 1] >= targetDistance) {
        return i;
      }
    }
    return coordinates.length - 1;
  };

  // Create a segment for each cue
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const startIdx = findIndexAtDistance(cue.startDistance);
    const endIdx = findIndexAtDistance(cue.endDistance);

    // Extract coordinates for this segment
    const segmentCoords = coordinates.slice(startIdx, endIdx + 1);

    if (segmentCoords.length > 1) {
      segments.push({
        type: 'Feature',
        properties: {
          zone: cue.zone,
          color: getZoneColor(cue.zone),
          type: cue.type,
          instruction: cue.instruction
        },
        geometry: {
          type: 'LineString',
          coordinates: segmentCoords
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features: segments
  };
}
