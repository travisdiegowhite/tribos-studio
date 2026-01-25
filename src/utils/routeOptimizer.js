/**
 * Route optimization utilities to fix common issues with AI-generated routes
 * Specifically addresses loop routes with unnecessary tangents and detours
 */

/**
 * Optimize a loop route to remove unnecessary tangents and detours
 * @param {Array} coordinates - Array of [lon, lat] coordinates
 * @param {Object} options - Optimization options
 * @returns {Array} Optimized coordinates
 */
export function optimizeLoopRoute(coordinates, options = {}) {
  if (!coordinates || coordinates.length < 4) {
    return coordinates;
  }

  const {
    maxDeviationPercent = 0.3, // Maximum allowed deviation from direct path (30%)
    minSegmentLength = 200, // Minimum segment length in meters
    smoothingFactor = 0.1, // How aggressive the smoothing is
    aggressiveMode = false, // More aggressive tangent removal
  } = options;

  console.log('🔧 Optimizing loop route with', coordinates.length, 'points');

  let optimized = coordinates;

  // Step 1: Remove peninsula/spur patterns (rectangular tangents that go out and return)
  // This is the most important step for the tangent issue
  const beforePeninsula = optimized.length;
  optimized = removePeninsulas(optimized, aggressiveMode);
  if (optimized.length !== beforePeninsula) {
    console.log(`🔧 Peninsula removal: ${beforePeninsula} → ${optimized.length} points`);
  }

  // Step 2: Remove unnecessary tangents (multiple passes for aggressive mode)
  const passes = aggressiveMode ? 3 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const before = optimized.length;
    optimized = removeTangents(optimized, maxDeviationPercent * (aggressiveMode ? 0.8 : 1));
    const after = optimized.length;
    if (before === after) break; // No more improvements
    console.log(`🔧 Tangent pass ${pass + 1}: ${before} → ${after} points`);
  }

  // Step 3: Remove obvious back-and-forth patterns
  optimized = removeBacktracking(optimized);

  // Step 4: Smooth sharp turns that create detours
  optimized = smoothDetours(optimized, minSegmentLength);

  // Step 5: Ensure proper loop closure
  optimized = ensureProperLoop(optimized);

  // Step 6: Remove redundant points
  optimized = removeRedundantPoints(optimized, minSegmentLength);

  console.log('✅ Route optimized:', coordinates.length, '→', optimized.length, 'points');
  return optimized;
}

/**
 * Detect and remove "peninsula" patterns - sections where route goes out and returns
 * These are the rectangular tangent spurs that the routing API creates
 * Example pattern: main route → goes out → turns → continues → turns back → returns to main route
 */
function removePeninsulas(coordinates, aggressive = false) {
  if (coordinates.length < 10) return coordinates;

  const result = [];
  let i = 0;
  const maxLookAhead = aggressive ? 25 : 15; // How far to look for return points
  const returnThreshold = aggressive ? 400 : 250; // meters - how close "return" point must be

  while (i < coordinates.length) {
    const current = coordinates[i];
    let peninsulaEnd = -1;

    // Look ahead for a point that returns close to where we are
    // This detects spurs that go out and come back
    for (let j = 4; j <= Math.min(maxLookAhead, coordinates.length - i - 1); j++) {
      const futurePoint = coordinates[i + j];
      const distToFuture = haversineDistance(
        current[1], current[0],
        futurePoint[1], futurePoint[0]
      );

      // Found a point that's close to current - potential peninsula detected
      if (distToFuture < returnThreshold) {
        // Verify this is actually a peninsula by checking the intermediate points go far away
        let maxDistFromCurrent = 0;
        let totalIntermediateLength = 0;

        for (let k = 1; k < j; k++) {
          const intermediatePoint = coordinates[i + k];
          const distFromCurrent = haversineDistance(
            current[1], current[0],
            intermediatePoint[1], intermediatePoint[0]
          );
          maxDistFromCurrent = Math.max(maxDistFromCurrent, distFromCurrent);

          // Also calculate the actual path length
          if (k > 1) {
            totalIntermediateLength += haversineDistance(
              coordinates[i + k - 1][1], coordinates[i + k - 1][0],
              intermediatePoint[1], intermediatePoint[0]
            );
          }
        }

        // It's a peninsula if:
        // 1. We went significantly far from the current point
        // 2. The return point is much closer than the max distance we traveled
        // 3. The path length is much longer than the direct distance (inefficient)
        const directDist = haversineDistance(
          current[1], current[0],
          futurePoint[1], futurePoint[0]
        );

        if (maxDistFromCurrent > 300 && // Went at least 300m out
            distToFuture < maxDistFromCurrent * 0.4 && // Return is < 40% of max distance
            totalIntermediateLength > directDist * 3) { // Path is 3x+ longer than direct

          console.log(`🚫 Peninsula detected: skipping ${j} points (went ${Math.round(maxDistFromCurrent)}m, returned to ${Math.round(distToFuture)}m)`);
          peninsulaEnd = i + j;
          break;
        }
      }
    }

    if (peninsulaEnd > 0) {
      // Skip the peninsula, but keep the current point
      result.push(current);
      i = peninsulaEnd;
    } else {
      result.push(current);
      i++;
    }
  }

  return result;
}

/**
 * Detect and remove unnecessary tangents that go off the main loop
 */
function removeTangents(coordinates, maxDeviationPercent) {
  const optimized = [];
  const totalDistance = calculateTotalDistance(coordinates);

  for (let i = 0; i < coordinates.length; i++) {
    const point = coordinates[i];

    // Always keep start and end points
    if (i === 0 || i === coordinates.length - 1) {
      optimized.push(point);
      continue;
    }

    // Check if this segment creates an unnecessary detour
    const isDetour = detectDetour(coordinates, i, maxDeviationPercent, totalDistance);

    if (!isDetour) {
      optimized.push(point);
    } else {
      console.log('🚫 Removing tangent at point', i);
    }
  }

  return optimized;
}

/**
 * Remove obvious backtracking patterns where route goes somewhere and immediately returns
 * Extended look-ahead to catch longer backtracking patterns
 */
function removeBacktracking(coordinates) {
  const cleaned = [];
  let i = 0;

  while (i < coordinates.length) {
    const current = coordinates[i];
    cleaned.push(current);

    // Look ahead for potential backtracking - extended range for rectangular patterns
    if (i < coordinates.length - 8) {
      const lookAhead = 12; // Extended: Check next 12 points to catch longer patterns
      let backtrackDetected = false;

      for (let j = 2; j <= lookAhead && i + j < coordinates.length; j++) {
        const futurePoint = coordinates[i + j];
        const distanceToFuture = haversineDistance(
          current[1], current[0],
          futurePoint[1], futurePoint[0]
        );

        // If we end up close to where we started after several points
        if (distanceToFuture < 300) { // Within 300m (increased from 200m)
          // Check if this is actually backtracking by verifying intermediate distance
          let maxIntermediate = 0;
          for (let k = 1; k < j; k++) {
            const intermediateDistance = haversineDistance(
              current[1], current[0],
              coordinates[i + k][1], coordinates[i + k][0]
            );
            maxIntermediate = Math.max(maxIntermediate, intermediateDistance);
          }

          // If we went far and came back, it's likely backtracking
          // More aggressive: only need 200m out (reduced from 300m)
          if (maxIntermediate > 200 && distanceToFuture < maxIntermediate * 0.5) {
            console.log(`🚫 Detected backtracking: went ${Math.round(maxIntermediate)}m and returned to ${Math.round(distanceToFuture)}m`);
            i += j; // Skip the backtracking section
            backtrackDetected = true;
            break;
          }
        }
      }

      if (!backtrackDetected) {
        i++;
      }
    } else {
      i++;
    }
  }

  return cleaned;
}

/**
 * Detect if a point creates an unnecessary detour
 */
function detectDetour(coordinates, pointIndex, maxDeviationPercent, totalDistance) {
  const windowSize = Math.min(5, Math.floor(coordinates.length / 4));
  const startWindow = Math.max(0, pointIndex - windowSize);
  const endWindow = Math.min(coordinates.length - 1, pointIndex + windowSize);

  if (endWindow - startWindow < 3) return false;

  const startPoint = coordinates[startWindow];
  const currentPoint = coordinates[pointIndex];
  const endPoint = coordinates[endWindow];

  // Calculate direct distance from start to end of window
  const directDistance = haversineDistance(
    startPoint[1], startPoint[0],
    endPoint[1], endPoint[0]
  );

  // Calculate actual distance through the current point
  const actualDistance =
    haversineDistance(startPoint[1], startPoint[0], currentPoint[1], currentPoint[0]) +
    haversineDistance(currentPoint[1], currentPoint[0], endPoint[1], endPoint[0]);

  // If the actual route is significantly longer than direct, it's likely a detour
  const deviationRatio = (actualDistance - directDistance) / directDistance;

  // More lenient for longer routes
  const adjustedMaxDeviation = maxDeviationPercent * (1 + totalDistance / 20000);

  return deviationRatio > adjustedMaxDeviation;
}

/**
 * Smooth out sharp detours by adjusting waypoints
 */
function smoothDetours(coordinates, minSegmentLength) {
  const smoothed = [...coordinates];

  for (let i = 1; i < smoothed.length - 2; i++) {
    const prev = smoothed[i - 1];
    const current = smoothed[i];
    const next = smoothed[i + 1];

    // Calculate the angle at this point
    const angle = calculateTurnAngle(prev, current, next);

    // If it's a sharp turn (> 120 degrees), check if it creates a detour
    if (Math.abs(angle) > 120) {
      const detourDistance = calculateDetourDistance(prev, current, next);

      if (detourDistance > minSegmentLength * 2) {
        console.log('🔧 Smoothing sharp detour at point', i, 'angle:', angle.toFixed(1), '°');

        // Create a smoother path by interpolating
        const smoothPoint = interpolatePoint(prev, next, 0.5);
        smoothed[i] = smoothPoint;
      }
    }
  }

  return smoothed;
}

/**
 * Ensure the loop properly closes without awkward approaches
 */
function ensureProperLoop(coordinates) {
  if (coordinates.length < 3) return coordinates;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];

  // Check if start and end are already close
  const closingDistance = haversineDistance(start[1], start[0], end[1], end[0]);

  if (closingDistance < 50) { // Within 50 meters
    return coordinates;
  }

  // Check the approach angle to the start point
  const secondToLast = coordinates[coordinates.length - 2];
  const thirdToLast = coordinates[coordinates.length - 3];

  if (secondToLast && thirdToLast) {
    const approachAngle = calculateBearing(secondToLast, start);
    const prevBearing = calculateBearing(thirdToLast, secondToLast);
    const turnAngle = Math.abs(approachAngle - prevBearing);

    // If the turn to close the loop is too sharp, smooth it
    if (turnAngle > 90) {
      console.log('🔧 Smoothing loop closure, turn angle:', turnAngle.toFixed(1), '°');

      // Create a gentler approach
      const smoothApproach = interpolatePoint(secondToLast, start, 0.7);
      const improved = [...coordinates];
      improved[improved.length - 1] = smoothApproach;
      improved.push(start); // Ensure it still closes

      return improved;
    }
  }

  return coordinates;
}

/**
 * Remove points that are too close together
 */
function removeRedundantPoints(coordinates, minDistance) {
  const filtered = [coordinates[0]]; // Always keep first point

  for (let i = 1; i < coordinates.length - 1; i++) {
    const lastKept = filtered[filtered.length - 1];
    const current = coordinates[i];

    const distance = haversineDistance(
      lastKept[1], lastKept[0],
      current[1], current[0]
    );

    if (distance >= minDistance) {
      filtered.push(current);
    }
  }

  // Always keep last point
  if (coordinates.length > 1) {
    filtered.push(coordinates[coordinates.length - 1]);
  }

  return filtered;
}

/**
 * Calculate the total distance of a route
 */
function calculateTotalDistance(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    total += haversineDistance(
      coordinates[i-1][1], coordinates[i-1][0],
      coordinates[i][1], coordinates[i][0]
    );
  }
  return total;
}

/**
 * Calculate turn angle at a point (in degrees)
 */
function calculateTurnAngle(prev, current, next) {
  const bearing1 = calculateBearing(prev, current);
  const bearing2 = calculateBearing(current, next);

  let angle = bearing2 - bearing1;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;

  return angle;
}

/**
 * Calculate bearing between two points
 */
function calculateBearing(point1, point2) {
  const lat1 = point1[1] * Math.PI / 180;
  const lat2 = point2[1] * Math.PI / 180;
  const deltaLon = (point2[0] - point1[0]) * Math.PI / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Calculate the extra distance created by going through a detour point
 */
function calculateDetourDistance(point1, detourPoint, point3) {
  const directDistance = haversineDistance(point1[1], point1[0], point3[1], point3[0]);
  const detourDistance =
    haversineDistance(point1[1], point1[0], detourPoint[1], detourPoint[0]) +
    haversineDistance(detourPoint[1], detourPoint[0], point3[1], point3[0]);

  return detourDistance - directDistance;
}

/**
 * Interpolate between two points
 */
function interpolatePoint(point1, point2, factor) {
  return [
    point1[0] + (point2[0] - point1[0]) * factor,
    point1[1] + (point2[1] - point1[1]) * factor
  ];
}

/**
 * Haversine distance calculation
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validate that a route is actually a reasonable loop
 */
export function validateLoopRoute(coordinates, options = {}) {
  const {
    maxClosingDistance = 500, // Maximum distance between start and end (meters)
    minEfficiency = 0.6, // Minimum route efficiency (direct distance / actual distance)
  } = options;

  if (!coordinates || coordinates.length < 4) {
    return { valid: false, reason: 'Route too short' };
  }

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];

  // Check if loop properly closes
  const closingDistance = haversineDistance(start[1], start[0], end[1], end[0]);
  if (closingDistance > maxClosingDistance) {
    return {
      valid: false,
      reason: `Loop doesn't close properly (${Math.round(closingDistance)}m gap)`,
      closingDistance
    };
  }

  // Check route efficiency (avoid overly convoluted routes)
  const totalDistance = calculateTotalDistance(coordinates);
  const directDistance = haversineDistance(start[1], start[0], end[1], end[0]);

  // For ACTUAL LOOPS (where start == end), directDistance will be ~0
  // So we can't use the standard efficiency calculation
  // Instead, just validate that the loop isn't absurdly long
  const isActualLoop = closingDistance < maxClosingDistance;

  if (isActualLoop) {
    // For loops, skip efficiency check - it will always be ~0
    return { valid: true, efficiency: 1.0, closingDistance, isLoop: true };
  }

  // For point-to-point routes, check efficiency
  const efficiency = directDistance / totalDistance;
  if (efficiency < minEfficiency && totalDistance > 2000) {
    return {
      valid: false,
      reason: `Route too convoluted (efficiency: ${(efficiency * 100).toFixed(1)}%)`,
      efficiency
    };
  }

  return { valid: true, efficiency, closingDistance, isLoop: false };
}