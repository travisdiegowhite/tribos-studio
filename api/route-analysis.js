// Vercel API Route: Activity Route Analysis
// Analyzes imported activities for training suitability and workout matching

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase (server-side with service key for full access)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// OpenTopoData API for elevation
const ELEVATION_API_URL = 'https://api.opentopodata.org/v1/srtm30m';

/**
 * Extract and validate user from Authorization header
 */
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }

  return user;
}

/**
 * Decode Google-encoded polyline to coordinates
 */
function decodePolyline(encoded) {
  if (!encoded) return [];

  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push({ lng: lng / 1e5, lat: lat / 1e5 });
  }

  return coords;
}

/**
 * Haversine distance formula (returns km)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Add cumulative distances to coordinates
 */
function addCumulativeDistances(coords) {
  if (coords.length === 0) return coords;

  let cumulative = 0;
  coords[0].distance = 0;

  for (let i = 1; i < coords.length; i++) {
    const dist = haversineDistance(
      coords[i - 1].lat, coords[i - 1].lng,
      coords[i].lat, coords[i].lng
    );
    cumulative += dist;
    coords[i].distance = cumulative;
  }

  return coords;
}

/**
 * Downsample coordinates to reduce API calls
 */
function downsampleCoordinates(coords, maxPoints = 100) {
  if (coords.length <= maxPoints) {
    return coords.map((coord, i) => ({ ...coord, originalIndex: i }));
  }

  const result = [];
  const step = (coords.length - 1) / (maxPoints - 1);

  // Always include first point
  result.push({ ...coords[0], originalIndex: 0 });

  // Sample at regular intervals
  for (let i = 1; i < maxPoints - 1; i++) {
    const index = Math.round(i * step);
    result.push({ ...coords[index], originalIndex: index });
  }

  // Always include last point
  result.push({ ...coords[coords.length - 1], originalIndex: coords.length - 1 });

  return result;
}

/**
 * Fetch elevation data from OpenTopoData API
 */
async function fetchElevationData(coords) {
  try {
    // OpenTopoData accepts max 100 locations per request
    const maxBatchSize = 100;
    const results = [];

    for (let i = 0; i < coords.length; i += maxBatchSize) {
      const batch = coords.slice(i, i + maxBatchSize);
      const locations = batch.map(c => `${c.lat},${c.lng}`).join('|');

      const response = await fetch(`${ELEVATION_API_URL}?locations=${locations}`);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results) {
          results.push(...data.results.map((r, idx) => ({
            ...batch[idx],
            elevation: r.elevation
          })));
        }
      } else {
        console.error('Elevation API error:', response.status);
        // Return coords without elevation on error
        return null;
      }

      // Small delay between batches
      if (i + maxBatchSize < coords.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to fetch elevation:', error);
    return null;
  }
}

/**
 * Interpolate elevation for all points based on sampled points
 */
function interpolateElevations(sampledCoords, originalCoords) {
  const fullElevation = new Array(originalCoords.length);

  // Fill in sampled points
  for (const point of sampledCoords) {
    fullElevation[point.originalIndex] = point.elevation;
  }

  // Interpolate missing points
  let lastKnownIndex = 0;
  for (let i = 1; i < originalCoords.length; i++) {
    if (fullElevation[i] === undefined) {
      // Find next known point
      let nextKnownIndex = i + 1;
      while (nextKnownIndex < originalCoords.length && fullElevation[nextKnownIndex] === undefined) {
        nextKnownIndex++;
      }

      if (nextKnownIndex < originalCoords.length) {
        // Linear interpolation
        const startElev = fullElevation[lastKnownIndex];
        const endElev = fullElevation[nextKnownIndex];
        const range = nextKnownIndex - lastKnownIndex;
        const position = i - lastKnownIndex;
        fullElevation[i] = startElev + (endElev - startElev) * (position / range);
      } else {
        fullElevation[i] = fullElevation[lastKnownIndex];
      }
    } else {
      lastKnownIndex = i;
    }
  }

  // Add elevation to original coords
  return originalCoords.map((coord, i) => ({
    ...coord,
    elevation: fullElevation[i]
  }));
}

/**
 * Calculate grade between two points
 */
function calculateGrade(elev1, elev2, distance) {
  if (distance <= 0) return 0;
  const elevChange = elev2 - elev1;
  const distanceMeters = distance * 1000;
  return (elevChange / distanceMeters) * 100;
}

/**
 * Identify segments based on actual elevation data
 * This analyzes point-by-point to find real flat, climb, and rolling sections
 */
function identifySegmentsWithElevation(coords) {
  const flat = [];
  const climb = [];
  const descent = [];
  const rolling = [];

  if (coords.length < 10) {
    return { flat, climb, descent, rolling };
  }

  // Constants for classification
  const FLAT_THRESHOLD = 2;      // < 2% is flat
  const CLIMB_THRESHOLD = 4;     // > 4% is climbing
  const MIN_SEGMENT_LENGTH = 0.3; // 300m minimum segment
  const SMOOTHING_WINDOW = 5;    // Points to smooth grade over

  // Calculate smoothed grades
  const grades = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const dist = (coords[i + 1].distance || 0) - (coords[i].distance || 0);
    const grade = calculateGrade(coords[i].elevation, coords[i + 1].elevation, dist);
    grades.push(grade);
  }
  grades.push(grades[grades.length - 1]); // Pad last point

  // Smooth grades with rolling average
  const smoothedGrades = grades.map((_, i) => {
    const start = Math.max(0, i - Math.floor(SMOOTHING_WINDOW / 2));
    const end = Math.min(grades.length, i + Math.ceil(SMOOTHING_WINDOW / 2));
    const window = grades.slice(start, end);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });

  // Classify each point
  const pointTypes = smoothedGrades.map(grade => {
    if (grade > CLIMB_THRESHOLD) return 'climb';
    if (grade < -CLIMB_THRESHOLD) return 'descent';
    if (Math.abs(grade) <= FLAT_THRESHOLD) return 'flat';
    return 'rolling';
  });

  // Group consecutive points of same type into segments
  let segmentStart = 0;
  let currentType = pointTypes[0];

  for (let i = 1; i <= coords.length; i++) {
    const type = i < coords.length ? pointTypes[i] : null;

    // End of segment when type changes or end of route
    if (type !== currentType || i === coords.length) {
      const segmentLength = (coords[i - 1].distance || 0) - (coords[segmentStart].distance || 0);

      if (segmentLength >= MIN_SEGMENT_LENGTH) {
        const segmentCoords = coords.slice(segmentStart, i);
        const segmentGrades = smoothedGrades.slice(segmentStart, i);
        const avgGrade = segmentGrades.reduce((a, b) => a + b, 0) / segmentGrades.length;
        const maxGrade = Math.max(...segmentGrades);
        const minGrade = Math.min(...segmentGrades);

        const elevStart = coords[segmentStart].elevation || 0;
        const elevEnd = coords[i - 1].elevation || 0;
        const elevGain = Math.max(0, elevEnd - elevStart);
        const elevLoss = Math.max(0, elevStart - elevEnd);

        const segment = {
          startIdx: segmentStart,
          endIdx: i - 1,
          startDistance: coords[segmentStart].distance || 0,
          endDistance: coords[i - 1].distance || 0,
          length: segmentLength,
          avgGrade: Math.round(avgGrade * 10) / 10,
          maxGrade: Math.round(maxGrade * 10) / 10,
          minGrade: Math.round(minGrade * 10) / 10,
          elevationGain: Math.round(elevGain),
          elevationLoss: Math.round(elevLoss),
          coordinates: segmentCoords.map(c => [c.lng, c.lat]),
          quality: 80,
          type: currentType
        };

        switch (currentType) {
          case 'flat': flat.push(segment); break;
          case 'climb': climb.push(segment); break;
          case 'descent': descent.push(segment); break;
          case 'rolling': rolling.push(segment); break;
        }
      }

      segmentStart = i;
      currentType = type;
    }
  }

  // Merge adjacent segments of same type that are close together
  const mergeSegments = (segments) => {
    if (segments.length < 2) return segments;

    const merged = [segments[0]];
    for (let i = 1; i < segments.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = segments[i];
      const gap = curr.startDistance - prev.endDistance;

      // Merge if gap is less than 200m
      if (gap < 0.2) {
        prev.endIdx = curr.endIdx;
        prev.endDistance = curr.endDistance;
        prev.length = prev.endDistance - prev.startDistance;
        prev.coordinates = [...prev.coordinates, ...curr.coordinates];
        prev.elevationGain += curr.elevationGain;
        prev.elevationLoss += curr.elevationLoss;
      } else {
        merged.push(curr);
      }
    }
    return merged;
  };

  return {
    flat: mergeSegments(flat),
    climb: mergeSegments(climb),
    descent: mergeSegments(descent),
    rolling: mergeSegments(rolling)
  };
}

/**
 * Fallback: Identify segments without elevation data (original method)
 */
function identifySegmentsFallback(coords, totalElevationGain, totalDistance) {
  const flat = [];
  const climb = [];
  const descent = [];
  const rolling = [];

  if (coords.length < 10) {
    return { flat, climb, descent, rolling };
  }

  const avgElevPerKm = totalDistance > 0 ? (totalElevationGain / totalDistance) : 0;
  const isGenerallyFlat = avgElevPerKm < 15;
  const isGenerallyRolling = avgElevPerKm >= 15 && avgElevPerKm < 25;

  const segmentLength = Math.max(1, totalDistance / 10);
  let segmentStart = 0;

  for (let i = 1; i < coords.length; i++) {
    const currentDistance = coords[i].distance || 0;
    const segmentDistance = currentDistance - (coords[segmentStart].distance || 0);

    if (segmentDistance >= segmentLength || i === coords.length - 1) {
      const segment = {
        startIdx: segmentStart,
        endIdx: i,
        startDistance: coords[segmentStart].distance || 0,
        endDistance: currentDistance,
        length: segmentDistance,
        avgGrade: isGenerallyFlat ? 0 : (isGenerallyRolling ? 3 : 6),
        maxGrade: isGenerallyFlat ? 2 : (isGenerallyRolling ? 5 : 10),
        minGrade: 0,
        elevationGain: segmentDistance * avgElevPerKm,
        elevationLoss: 0,
        coordinates: coords.slice(segmentStart, i + 1).map(c => [c.lng, c.lat]),
        quality: 80,
        type: isGenerallyFlat ? 'flat' : (isGenerallyRolling ? 'rolling' : 'climb')
      };

      if (isGenerallyFlat) {
        flat.push(segment);
      } else if (isGenerallyRolling) {
        rolling.push(segment);
      } else {
        climb.push(segment);
      }

      segmentStart = i;
    }
  }

  return { flat, climb, descent, rolling };
}

/**
 * Identify interval-suitable segments
 * Enhanced to match specific workout requirements
 */
function identifyIntervalSegments(flatSegments, rollingSegments, climbSegments) {
  const intervalSegments = [];

  // Workout requirements: minLength (km), maxGrade (%), ideal terrain types
  const workoutRequirements = {
    vo2max: { minLength: 0.8, maxGrade: 3, idealTypes: ['flat', 'rolling'], note: 'Short hard efforts' },
    threshold: { minLength: 2.0, maxGrade: 2, idealTypes: ['flat'], note: '10-20min sustained efforts' },
    sweet_spot: { minLength: 1.5, maxGrade: 3, idealTypes: ['flat', 'rolling'], note: '10-15min moderate efforts' },
    tempo: { minLength: 3.0, maxGrade: 2, idealTypes: ['flat'], note: '20-30min steady efforts' },
    recovery: { minLength: 1.0, maxGrade: 1, idealTypes: ['flat'], note: 'Easy spinning' },
    endurance: { minLength: 2.0, maxGrade: 3, idealTypes: ['flat', 'rolling'], note: 'Steady aerobic' },
    climbing: { minLength: 1.0, minGrade: 4, maxGrade: 15, idealTypes: ['climb'], note: 'Hill efforts' },
    intervals: { minLength: 1.0, maxGrade: 3, idealTypes: ['flat', 'rolling'], note: 'Repeated efforts' }
  };

  // Process flat and rolling segments for most interval types
  const flatAndRolling = [...flatSegments, ...rollingSegments];

  for (const segment of flatAndRolling) {
    const suitableFor = [];
    const gradeAbs = Math.abs(segment.avgGrade);

    // Check each workout type
    for (const [workout, req] of Object.entries(workoutRequirements)) {
      if (workout === 'climbing') continue; // Handle separately

      if (
        segment.length >= req.minLength &&
        gradeAbs <= req.maxGrade &&
        req.idealTypes.includes(segment.type)
      ) {
        suitableFor.push(workout);
      }
    }

    if (suitableFor.length > 0 && segment.length >= 0.5) {
      // Calculate consistency score based on grade variance
      const gradeVariance = Math.abs(segment.maxGrade - segment.minGrade);
      const consistencyScore = Math.max(50, 100 - gradeVariance * 5);

      intervalSegments.push({
        ...segment,
        suitableFor,
        uninterruptedLength: segment.length,
        consistencyScore: Math.round(consistencyScore),
        description: `${segment.length.toFixed(1)}km ${segment.type} section (${segment.avgGrade > 0 ? '+' : ''}${segment.avgGrade.toFixed(1)}% avg)`
      });
    }
  }

  // Process climb segments for climbing workouts
  for (const segment of climbSegments) {
    if (segment.length >= 0.5 && segment.avgGrade >= 4 && segment.avgGrade <= 15) {
      const consistencyScore = Math.max(50, 100 - Math.abs(segment.maxGrade - segment.minGrade) * 3);

      intervalSegments.push({
        ...segment,
        suitableFor: ['climbing'],
        uninterruptedLength: segment.length,
        consistencyScore: Math.round(consistencyScore),
        description: `${segment.length.toFixed(1)}km climb at ${segment.avgGrade.toFixed(1)}% (${segment.elevationGain}m gain)`
      });
    }
  }

  // Sort by length (longer segments first)
  intervalSegments.sort((a, b) => b.length - a.length);
  return intervalSegments;
}

/**
 * Calculate training suitability scores
 * Uses interval segment suitability data for more accurate scoring
 */
function calculateSuitabilityScores(totalDistance, totalElevationGain, flatSegments, climbSegments, rollingSegments, intervalSegments) {
  const elevPerKm = totalDistance > 0 ? (totalElevationGain / totalDistance) : 0;
  const totalFlatKm = flatSegments.reduce((sum, s) => sum + s.length, 0);
  const totalClimbingKm = climbSegments.reduce((sum, s) => sum + s.length, 0);
  const flatRatio = totalDistance > 0 ? totalFlatKm / totalDistance : 0;
  const longestFlatSegment = flatSegments.length > 0 ? Math.max(...flatSegments.map(s => s.length)) : 0;

  // Count segments suitable for each workout type
  const countSuitableFor = (type) => intervalSegments.filter(s => s.suitableFor?.includes(type)).length;
  const totalLengthSuitableFor = (type) => intervalSegments
    .filter(s => s.suitableFor?.includes(type))
    .reduce((sum, s) => sum + s.length, 0);

  // Base scores on segment suitability
  const recoverySegments = countSuitableFor('recovery');
  const enduranceSegments = countSuitableFor('endurance');
  const tempoSegments = countSuitableFor('tempo');
  const sweetSpotSegments = countSuitableFor('sweet_spot');
  const thresholdSegments = countSuitableFor('threshold');
  const vo2maxSegments = countSuitableFor('vo2max');
  const climbingSegments = countSuitableFor('climbing');

  return {
    // Recovery: Lots of flat terrain, shorter route
    recovery: Math.min(100, Math.round(
      (recoverySegments >= 3 ? 40 : recoverySegments * 13) +
      (flatRatio * 30) +
      (totalDistance < 30 ? 30 : 15)
    )),

    // Endurance: Long route with sustained sections
    endurance: Math.min(100, Math.round(
      (enduranceSegments >= 3 ? 35 : enduranceSegments * 12) +
      (totalDistance >= 40 ? 35 : totalDistance * 0.9) +
      30
    )),

    // Tempo: Long flat sections (3km+)
    tempo: Math.min(100, Math.round(
      (tempoSegments >= 2 ? 50 : tempoSegments * 25) +
      (longestFlatSegment >= 5 ? 30 : longestFlatSegment * 6) +
      (flatRatio * 20)
    )),

    // Sweet Spot: Moderate length flat/rolling sections
    sweet_spot: Math.min(100, Math.round(
      (sweetSpotSegments >= 3 ? 45 : sweetSpotSegments * 15) +
      (longestFlatSegment >= 3 ? 30 : longestFlatSegment * 10) +
      (flatRatio * 25)
    )),

    // Threshold: Multiple 2km+ flat sections
    threshold: Math.min(100, Math.round(
      (thresholdSegments >= 3 ? 50 : thresholdSegments * 17) +
      (totalLengthSuitableFor('threshold') >= 8 ? 30 : totalLengthSuitableFor('threshold') * 4) +
      (flatRatio * 20)
    )),

    // VO2max: Multiple shorter flat sections
    vo2max: Math.min(100, Math.round(
      (vo2maxSegments >= 4 ? 50 : vo2maxSegments * 12.5) +
      (intervalSegments.length >= 5 ? 30 : intervalSegments.length * 6) +
      (flatRatio * 20)
    )),

    // Climbing: Actual climb segments
    climbing: Math.min(100, Math.round(
      (climbingSegments >= 3 ? 50 : climbingSegments * 17) +
      (totalClimbingKm >= 5 ? 30 : totalClimbingKm * 6) +
      (elevPerKm >= 20 ? 20 : elevPerKm)
    )),

    // Intervals: Overall variety of suitable sections
    intervals: Math.min(100, Math.round(
      (intervalSegments.length >= 5 ? 40 : intervalSegments.length * 8) +
      (longestFlatSegment >= 2 ? 30 : longestFlatSegment * 15) +
      (flatRatio * 30)
    ))
  };
}

/**
 * Determine terrain type
 */
function determineTerrainType(totalDistance, totalElevationGain) {
  if (totalDistance <= 0) return 'flat';
  const elevPerKm = totalElevationGain / totalDistance;
  if (elevPerKm < 10) return 'flat';
  if (elevPerKm < 20) return 'rolling';
  if (elevPerKm < 40) return 'hilly';
  return 'mountainous';
}

/**
 * Determine best workout categories
 */
function determineBestFor(suitability) {
  const scores = Object.entries(suitability);
  const best = scores
    .filter(([_, score]) => score >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  if (best.length === 0) {
    const highest = scores.sort((a, b) => b[1] - a[1])[0];
    return [highest[0]];
  }
  return best;
}

/**
 * Analyze a single activity (sync version - uses fallback without elevation)
 */
function analyzeActivitySync(activity) {
  const polyline = activity.map_summary_polyline || activity.summary_polyline;
  if (!polyline) {
    return null;
  }

  const totalDistance = (activity.distance || 0) / 1000;
  const totalElevationGain = activity.total_elevation_gain || 0;

  let coords = decodePolyline(polyline);
  coords = addCumulativeDistances(coords);

  const { flat, climb, descent, rolling } = identifySegmentsFallback(coords, totalElevationGain, totalDistance);
  const intervalSegments = identifyIntervalSegments(flat, rolling, climb);

  return buildAnalysisResult(activity, coords, flat, climb, descent, rolling, intervalSegments, totalDistance, totalElevationGain);
}

/**
 * Analyze a single activity with real elevation data (async)
 */
async function analyzeActivityWithElevation(activity) {
  const polyline = activity.map_summary_polyline || activity.summary_polyline;
  if (!polyline) {
    return null;
  }

  const totalDistance = (activity.distance || 0) / 1000;
  const totalElevationGain = activity.total_elevation_gain || 0;

  let coords = decodePolyline(polyline);
  coords = addCumulativeDistances(coords);

  // Try to fetch elevation data
  console.log(`🏔️ Fetching elevation for activity ${activity.id} (${coords.length} points)`);

  let flat, climb, descent, rolling;

  try {
    // Downsample for API efficiency
    const sampledCoords = downsampleCoordinates(coords, 100);
    const elevationData = await fetchElevationData(sampledCoords);

    if (elevationData && elevationData.length > 0) {
      // Interpolate elevation back to all points
      const coordsWithElevation = interpolateElevations(elevationData, coords);
      console.log(`✅ Got elevation data, identifying segments by actual terrain`);

      // Use elevation-aware segment identification
      const segments = identifySegmentsWithElevation(coordsWithElevation);
      flat = segments.flat;
      climb = segments.climb;
      descent = segments.descent;
      rolling = segments.rolling;
    } else {
      console.log(`⚠️ No elevation data, using fallback method`);
      const segments = identifySegmentsFallback(coords, totalElevationGain, totalDistance);
      flat = segments.flat;
      climb = segments.climb;
      descent = segments.descent;
      rolling = segments.rolling;
    }
  } catch (error) {
    console.error(`❌ Elevation fetch failed, using fallback:`, error.message);
    const segments = identifySegmentsFallback(coords, totalElevationGain, totalDistance);
    flat = segments.flat;
    climb = segments.climb;
    descent = segments.descent;
    rolling = segments.rolling;
  }

  const intervalSegments = identifyIntervalSegments(flat, rolling, climb);

  return buildAnalysisResult(activity, coords, flat, climb, descent, rolling, intervalSegments, totalDistance, totalElevationGain);
}

/**
 * Build the analysis result object
 */
function buildAnalysisResult(activity, coords, flat, climb, descent, rolling, intervalSegments, totalDistance, totalElevationGain) {
  const totalFlatKm = flat.reduce((sum, s) => sum + s.length, 0);
  const totalClimbingKm = climb.reduce((sum, s) => sum + s.length, 0);
  const longestUninterruptedKm = intervalSegments.length > 0
    ? Math.max(...intervalSegments.map(s => s.uninterruptedLength))
    : totalFlatKm;
  const segmentConsistency = flat.length > 0
    ? flat.reduce((sum, s) => sum + s.quality, 0) / flat.length / 100
    : 0.5;

  const suitability = calculateSuitabilityScores(
    totalDistance, totalElevationGain, flat, climb, rolling, intervalSegments
  );
  const bestFor = determineBestFor(suitability);
  const terrainType = determineTerrainType(totalDistance, totalElevationGain);

  const avgSpeed = 25;
  const idealDurationMin = Math.round((totalDistance / avgSpeed) * 60 * 0.8);
  const idealDurationMax = Math.round((totalDistance / avgSpeed) * 60 * 1.5);

  return {
    activity_id: activity.id,
    user_id: activity.user_id,
    flat_segments: flat,
    climb_segments: climb,
    descent_segments: descent,
    rolling_segments: rolling,
    interval_segments: intervalSegments,
    stop_frequency: 0,
    segment_consistency: segmentConsistency,
    longest_uninterrupted_km: longestUninterruptedKm,
    total_flat_km: totalFlatKm,
    total_climbing_km: totalClimbingKm,
    recovery_score: suitability.recovery,
    endurance_score: suitability.endurance,
    tempo_score: suitability.tempo,
    sweet_spot_score: suitability.sweet_spot,
    threshold_score: suitability.threshold,
    vo2max_score: suitability.vo2max,
    climbing_score: suitability.climbing,
    intervals_score: suitability.intervals,
    best_for: bestFor,
    terrain_type: terrainType,
    ideal_duration_min: idealDurationMin,
    ideal_duration_max: idealDurationMax
  };
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return;
  }

  // Validate authentication
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { action } = req.method === 'GET' ? req.query : req.body;

    switch (action) {
      case 'analyze_all':
        return await analyzeAllActivities(req, res, authUser);

      case 'analyze_one':
        return await analyzeOneActivity(req, res, authUser);

      case 'get_analysis':
        return await getAnalysis(req, res, authUser);

      case 'get_matches':
        return await getWorkoutMatches(req, res, authUser);

      default:
        return res.status(400).json({ error: 'Invalid action. Use: analyze_all, analyze_one, get_analysis, get_matches' });
    }

  } catch (error) {
    console.error('Route Analysis API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * Analyze all unanalyzed activities for a user
 * Supports date filtering and batch limits to avoid timeouts
 */
async function analyzeAllActivities(req, res, authUser) {
  const { months = 3, limit = 50 } = req.body || {};
  const batchLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 per batch

  console.log(`📊 Analyzing activities for user ${authUser.id} (last ${months} months, limit ${batchLimit})`);

  // Calculate date filter
  let dateFilter = null;
  if (months !== 'all' && months > 0) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));
    dateFilter = cutoffDate.toISOString();
  }

  // Build query for activities with polylines
  let query = supabase
    .from('activities')
    .select('id, user_id, name, distance, total_elevation_gain, map_summary_polyline, start_date')
    .eq('user_id', authUser.id)
    .not('map_summary_polyline', 'is', null)
    .order('start_date', { ascending: false });

  // Apply date filter if set
  if (dateFilter) {
    query = query.gte('start_date', dateFilter);
  }

  const { data: activities, error: fetchError } = await query;

  if (fetchError) {
    console.error('Error fetching activities:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }

  if (!activities || activities.length === 0) {
    return res.json({
      analyzed: 0,
      remaining: 0,
      total: 0,
      message: 'No activities with GPS data found in the selected time range'
    });
  }

  // Get existing analyses
  const { data: existing } = await supabase
    .from('activity_route_analysis')
    .select('activity_id')
    .eq('user_id', authUser.id);

  const existingIds = new Set((existing || []).map(e => e.activity_id));
  const toAnalyze = activities.filter(a => !existingIds.has(a.id));

  // Limit the batch size
  const batch = toAnalyze.slice(0, batchLimit);
  const remaining = toAnalyze.length - batch.length;

  console.log(`Found ${activities.length} activities in range, ${toAnalyze.length} need analysis, processing ${batch.length}`);

  // Analyze the batch with elevation data
  const results = [];
  const errors = [];

  for (const activity of batch) {
    try {
      // Use elevation-aware analysis
      const analysis = await analyzeActivityWithElevation(activity);
      if (analysis) {
        results.push(analysis);
      }
    } catch (err) {
      console.error(`Error analyzing activity ${activity.id}:`, err);
      errors.push({ activityId: activity.id, error: err.message });
    }
  }

  // Batch insert analyses
  if (results.length > 0) {
    const { error: insertError } = await supabase
      .from('activity_route_analysis')
      .upsert(results, { onConflict: 'activity_id' });

    if (insertError) {
      console.error('Error inserting analyses:', insertError);
      return res.status(500).json({ error: 'Failed to save analyses' });
    }
  }

  return res.json({
    analyzed: results.length,
    remaining: remaining,
    alreadyAnalyzed: existingIds.size,
    total: activities.length,
    errors: errors.length,
    message: remaining > 0
      ? `Analyzed ${results.length} activities. ${remaining} more remaining - click again to continue.`
      : `Analyzed ${results.length} activities. All done!`
  });
}

/**
 * Analyze a single activity
 */
async function analyzeOneActivity(req, res, authUser) {
  const { activityId } = req.body;

  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  // Fetch the activity
  const { data: activity, error: fetchError } = await supabase
    .from('activities')
    .select('id, user_id, name, distance, total_elevation_gain, map_summary_polyline, start_date')
    .eq('id', activityId)
    .eq('user_id', authUser.id)
    .single();

  if (fetchError || !activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  if (!activity.map_summary_polyline) {
    return res.status(400).json({ error: 'Activity has no GPS data' });
  }

  // Analyze with elevation data
  const analysis = await analyzeActivityWithElevation(activity);
  if (!analysis) {
    return res.status(500).json({ error: 'Analysis failed' });
  }

  // Save
  const { error: insertError } = await supabase
    .from('activity_route_analysis')
    .upsert(analysis, { onConflict: 'activity_id' });

  if (insertError) {
    console.error('Error saving analysis:', insertError);
    return res.status(500).json({ error: 'Failed to save analysis' });
  }

  return res.json({ success: true, analysis });
}

/**
 * Get analysis data for user's activities
 */
async function getAnalysis(req, res, authUser) {
  const { limit = 50, workoutType } = req.method === 'GET' ? req.query : req.body;

  let query = supabase
    .from('activity_route_analysis')
    .select(`
      *,
      activities (
        id,
        name,
        start_date,
        distance,
        total_elevation_gain,
        moving_time,
        map_summary_polyline,
        provider,
        provider_activity_id
      )
    `)
    .eq('user_id', authUser.id)
    .order('analyzed_at', { ascending: false })
    .limit(parseInt(limit));

  // If filtering by workout type, filter by best_for or high score
  if (workoutType) {
    query = query.or(`best_for.cs.{${workoutType}},${workoutType}_score.gte.60`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching analysis:', error);
    return res.status(500).json({ error: 'Failed to fetch analysis' });
  }

  return res.json({ analyses: data || [] });
}

/**
 * Get route matches for upcoming workouts
 */
async function getWorkoutMatches(req, res, authUser) {
  const { workouts } = req.body;

  if (!workouts || !Array.isArray(workouts) || workouts.length === 0) {
    return res.status(400).json({ error: 'workouts array required' });
  }

  // Get all analyzed activities
  const { data: analyses, error: fetchError } = await supabase
    .from('activity_route_analysis')
    .select(`
      *,
      activities (
        id,
        name,
        start_date,
        distance,
        total_elevation_gain,
        moving_time,
        map_summary_polyline,
        provider,
        provider_activity_id
      )
    `)
    .eq('user_id', authUser.id);

  if (fetchError) {
    console.error('Error fetching analyses:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch analyses' });
  }

  if (!analyses || analyses.length === 0) {
    return res.json({
      matches: {},
      message: 'No analyzed activities found. Run analyze_all first.'
    });
  }

  // Category requirements for scoring
  const categoryScoreKey = {
    recovery: 'recovery_score',
    endurance: 'endurance_score',
    tempo: 'tempo_score',
    sweet_spot: 'sweet_spot_score',
    threshold: 'threshold_score',
    vo2max: 'vo2max_score',
    climbing: 'climbing_score',
    intervals: 'intervals_score'
  };

  // Find matches for each workout
  const matches = {};

  for (const workout of workouts) {
    const scoreKey = categoryScoreKey[workout.category];
    if (!scoreKey) continue;

    // Score and rank activities for this workout
    const scored = analyses
      .filter(a => a.activities) // Has activity data
      .map(analysis => {
        const score = analysis[scoreKey] || 0;
        const reasons = [];
        const warnings = [];

        if (analysis.best_for?.includes(workout.category)) {
          reasons.push(`Optimal for ${workout.category} workouts`);
        }
        if (score >= 80) {
          reasons.push(`Excellent ${workout.category} terrain (${score}%)`);
        } else if (score >= 60) {
          reasons.push(`Good ${workout.category} terrain (${score}%)`);
        }
        if (analysis.longest_uninterrupted_km >= 3) {
          reasons.push(`${analysis.longest_uninterrupted_km.toFixed(1)}km uninterrupted segment`);
        }

        return {
          activity: analysis.activities,
          analysis: {
            ...analysis,
            activities: undefined // Remove nested to avoid duplication
          },
          matchScore: score,
          matchReasons: reasons,
          warnings: warnings.length > 0 ? warnings : undefined,
          intervalSegments: analysis.interval_segments || []
        };
      })
      .filter(m => m.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    matches[workout.id] = scored;
  }

  return res.json({ matches });
}
