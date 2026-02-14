/**
 * Activity Route Analyzer
 * Analyzes imported activities to determine their suitability for different workout types
 * Identifies segments suitable for intervals, climbs, tempo, etc.
 */

import type { WorkoutCategory } from '../types/training';

// Types for route analysis
export interface Coordinate {
  lng: number;
  lat: number;
  elevation?: number;
  distance?: number; // cumulative distance in km
}

export interface RouteSegment {
  startIdx: number;
  endIdx: number;
  startDistance: number; // km
  endDistance: number;   // km
  length: number;        // km
  avgGrade: number;      // percentage
  maxGrade: number;
  minGrade: number;
  elevationGain: number; // meters
  elevationLoss: number;
  coordinates: [number, number][]; // [lng, lat] pairs for map display
  quality: number;       // 0-100 segment quality score
  type: 'flat' | 'climb' | 'descent' | 'rolling';
}

export interface IntervalSegment extends RouteSegment {
  suitableFor: WorkoutCategory[];
  uninterruptedLength: number; // km without major turns/stops
  consistencyScore: number;    // 0-100 how consistent the gradient is
}

export interface RouteTrainingProfile {
  activityId: string;
  userId: string;

  // Identified segments
  flatSegments: RouteSegment[];
  climbSegments: RouteSegment[];
  descentSegments: RouteSegment[];
  rollingSegments: RouteSegment[];

  // Interval-suitable segments (flat or consistent grade, long enough for efforts)
  intervalSegments: IntervalSegment[];

  // Quality metrics
  stopFrequency: number;           // Estimated stops per km
  segmentConsistency: number;      // 0-1 how consistent the terrain is
  longestUninterruptedKm: number;
  totalFlatKm: number;
  totalClimbingKm: number;

  // Training suitability scores (0-100)
  suitability: {
    recovery: number;
    endurance: number;
    tempo: number;
    sweet_spot: number;
    threshold: number;
    vo2max: number;
    climbing: number;
    intervals: number;
  };

  // Best uses for this route
  bestFor: WorkoutCategory[];

  // Route characteristics
  terrainType: 'flat' | 'rolling' | 'hilly' | 'mountainous';
  idealDurationMin: number;
  idealDurationMax: number;
}

// Constants for analysis
const FLAT_GRADE_THRESHOLD = 2;        // % grade considered flat
const CLIMB_GRADE_THRESHOLD = 4;       // % grade considered a climb
const MIN_SEGMENT_LENGTH = 0.5;        // km minimum for a segment
const MIN_INTERVAL_LENGTH = 1.0;       // km minimum for interval work
const IDEAL_INTERVAL_LENGTH = 3.0;     // km ideal for threshold intervals

/**
 * Decode a Google-encoded polyline string to coordinates
 */
export function decodePolyline(encoded: string): Coordinate[] {
  if (!encoded) return [];

  const coords: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    // Decode latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    // Decode longitude
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
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate cumulative distances for coordinates
 */
function addCumulativeDistances(coords: Coordinate[]): Coordinate[] {
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
 * Estimate elevation profile from coordinates using SRTM-like approximation
 * In production, this would use actual elevation data from the activity
 */
function estimateElevation(coords: Coordinate[], totalElevationGain?: number): Coordinate[] {
  // If we have actual elevation data, use it
  if (coords.some(c => c.elevation !== undefined)) {
    return coords;
  }

  // Without actual elevation, we can't accurately determine climbs
  // Return with elevation = 0 (will rely on activity metadata for elevation info)
  return coords.map(c => ({ ...c, elevation: 0 }));
}

/**
 * Identify segments of consistent terrain type
 */
function identifySegments(
  coords: Coordinate[],
  totalElevationGain: number = 0,
  totalDistance: number = 0
): {
  flat: RouteSegment[];
  climb: RouteSegment[];
  descent: RouteSegment[];
  rolling: RouteSegment[];
} {
  const flat: RouteSegment[] = [];
  const climb: RouteSegment[] = [];
  const descent: RouteSegment[] = [];
  const rolling: RouteSegment[] = [];

  if (coords.length < 10) {
    return { flat, climb, descent, rolling };
  }

  // Calculate average gradient for the whole route
  const avgElevPerKm = totalDistance > 0 ? (totalElevationGain / totalDistance) : 0;

  // Determine route character based on elevation gain per km
  // < 10m/km = flat, 10-20m/km = rolling, 20-40m/km = hilly, > 40m/km = mountainous
  const isGenerallyFlat = avgElevPerKm < 15;
  const isGenerallyRolling = avgElevPerKm >= 15 && avgElevPerKm < 25;
  const isGenerallyHilly = avgElevPerKm >= 25;

  // Since we may not have point-by-point elevation, we'll create segments based on
  // the overall route character and identify good interval sections
  const segmentLength = Math.max(1, totalDistance / 10); // Divide route into ~10 segments

  let currentDistance = 0;
  let segmentStart = 0;

  for (let i = 1; i < coords.length; i++) {
    currentDistance = coords[i].distance || 0;
    const segmentDistance = currentDistance - (coords[segmentStart].distance || 0);

    if (segmentDistance >= segmentLength || i === coords.length - 1) {
      const segment: RouteSegment = {
        startIdx: segmentStart,
        endIdx: i,
        startDistance: coords[segmentStart].distance || 0,
        endDistance: currentDistance,
        length: segmentDistance,
        avgGrade: isGenerallyFlat ? 0 : (isGenerallyRolling ? 3 : 6),
        maxGrade: isGenerallyFlat ? 2 : (isGenerallyRolling ? 5 : 10),
        minGrade: 0,
        elevationGain: (segmentDistance * avgElevPerKm),
        elevationLoss: 0,
        coordinates: coords.slice(segmentStart, i + 1).map(c => [c.lng, c.lat] as [number, number]),
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
 * Identify segments suitable for interval training
 * These need to be:
 * - Flat or consistent gradient
 * - Long enough for the interval duration
 * - Relatively straight (no sharp turns that would require braking)
 */
function identifyIntervalSegments(
  coords: Coordinate[],
  flatSegments: RouteSegment[],
  rollingSegments: RouteSegment[]
): IntervalSegment[] {
  const intervalSegments: IntervalSegment[] = [];

  // Combine flat and gentle rolling segments as candidates
  const candidates = [...flatSegments, ...rollingSegments.filter(s => s.avgGrade < 3)];

  for (const segment of candidates) {
    if (segment.length < MIN_INTERVAL_LENGTH) continue;

    // Calculate consistency score based on how uniform the segment is
    const consistencyScore = segment.type === 'flat' ? 95 : 75;

    // Determine what workouts this segment is suitable for
    const suitableFor: WorkoutCategory[] = [];

    if (segment.length >= 1) {
      suitableFor.push('vo2max'); // Good for short VO2 efforts
    }
    if (segment.length >= 2) {
      suitableFor.push('threshold'); // Good for threshold intervals
      suitableFor.push('sweet_spot');
    }
    if (segment.length >= 3) {
      suitableFor.push('tempo'); // Good for tempo blocks
    }
    if (segment.type === 'flat') {
      suitableFor.push('recovery'); // Flat is good for recovery
      suitableFor.push('endurance');
    }

    const intervalSegment: IntervalSegment = {
      ...segment,
      suitableFor,
      uninterruptedLength: segment.length,
      consistencyScore
    };

    intervalSegments.push(intervalSegment);
  }

  // Sort by length (longer segments first)
  intervalSegments.sort((a, b) => b.length - a.length);

  return intervalSegments;
}

/**
 * Calculate training suitability scores for the route
 */
function calculateSuitabilityScores(
  totalDistance: number,
  totalElevationGain: number,
  flatSegments: RouteSegment[],
  climbSegments: RouteSegment[],
  rollingSegments: RouteSegment[],
  intervalSegments: IntervalSegment[]
): RouteTrainingProfile['suitability'] {
  const elevPerKm = totalDistance > 0 ? (totalElevationGain / totalDistance) : 0;
  const totalFlatKm = flatSegments.reduce((sum, s) => sum + s.length, 0);
  const totalClimbingKm = climbSegments.reduce((sum, s) => sum + s.length, 0);
  const flatRatio = totalDistance > 0 ? totalFlatKm / totalDistance : 0;

  // Calculate longest uninterrupted flat section
  const longestFlatSegment = flatSegments.length > 0
    ? Math.max(...flatSegments.map(s => s.length))
    : 0;

  // Count interval-suitable segments
  const goodIntervalSegments = intervalSegments.filter(s => s.length >= 2).length;

  return {
    // Recovery: Prefer flat, shorter routes
    recovery: Math.min(100, Math.round(
      (flatRatio * 50) +
      (totalDistance < 20 ? 30 : 10) +
      (elevPerKm < 10 ? 20 : 0)
    )),

    // Endurance: Any terrain works, prefer longer routes
    endurance: Math.min(100, Math.round(
      (totalDistance >= 30 ? 40 : totalDistance * 1.3) +
      (flatRatio * 30) +
      30
    )),

    // Tempo: Prefer rolling or flat, needs consistent sections
    tempo: Math.min(100, Math.round(
      ((flatRatio + (rollingSegments.length > 0 ? 0.3 : 0)) * 40) +
      (longestFlatSegment >= 5 ? 30 : longestFlatSegment * 6) +
      (goodIntervalSegments >= 2 ? 30 : goodIntervalSegments * 15)
    )),

    // Sweet Spot: Similar to tempo, works on rolling terrain
    sweet_spot: Math.min(100, Math.round(
      ((flatRatio * 0.7 + 0.3) * 40) +
      (longestFlatSegment >= 3 ? 30 : longestFlatSegment * 10) +
      (goodIntervalSegments >= 2 ? 30 : goodIntervalSegments * 15)
    )),

    // Threshold: Need flat sections for sustained efforts
    threshold: Math.min(100, Math.round(
      (flatRatio * 50) +
      (longestFlatSegment >= 4 ? 30 : longestFlatSegment * 7.5) +
      (goodIntervalSegments >= 3 ? 20 : goodIntervalSegments * 7)
    )),

    // VO2max: Need flat sections for short hard efforts
    vo2max: Math.min(100, Math.round(
      (flatRatio * 40) +
      (longestFlatSegment >= 2 ? 30 : longestFlatSegment * 15) +
      (intervalSegments.length >= 4 ? 30 : intervalSegments.length * 7.5)
    )),

    // Climbing: Need significant elevation
    climbing: Math.min(100, Math.round(
      (elevPerKm >= 25 ? 50 : elevPerKm * 2) +
      (totalClimbingKm >= 5 ? 30 : totalClimbingKm * 6) +
      (climbSegments.length >= 3 ? 20 : climbSegments.length * 7)
    )),

    // Intervals: Need multiple good flat/consistent sections
    intervals: Math.min(100, Math.round(
      (goodIntervalSegments >= 4 ? 40 : goodIntervalSegments * 10) +
      (longestFlatSegment >= 3 ? 30 : longestFlatSegment * 10) +
      (flatRatio * 30)
    ))
  };
}

/**
 * Determine terrain type from elevation data
 */
function determineTerrainType(
  totalDistance: number,
  totalElevationGain: number
): 'flat' | 'rolling' | 'hilly' | 'mountainous' {
  if (totalDistance <= 0) return 'flat';

  const elevPerKm = totalElevationGain / totalDistance;

  if (elevPerKm < 10) return 'flat';
  if (elevPerKm < 20) return 'rolling';
  if (elevPerKm < 40) return 'hilly';
  return 'mountainous';
}

/**
 * Determine best workout categories for this route
 */
function determineBestFor(
  suitability: RouteTrainingProfile['suitability']
): WorkoutCategory[] {
  const scores = Object.entries(suitability) as [WorkoutCategory, number][];

  // Sort by score and take top 3 with score >= 60
  const best = scores
    .filter(([_, score]) => score >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  // Always include at least one category
  if (best.length === 0) {
    const highest = scores.sort((a, b) => b[1] - a[1])[0];
    return [highest[0]];
  }

  return best;
}

/**
 * Main analysis function - analyzes an activity for training suitability
 */
export function analyzeActivityRoute(
  activityId: string,
  userId: string,
  polyline: string,
  totalDistance: number,      // km
  totalElevationGain: number, // meters
  movingTime?: number         // seconds
): RouteTrainingProfile {
  // Decode polyline to coordinates
  let coords = decodePolyline(polyline);

  // Add cumulative distances
  coords = addCumulativeDistances(coords);

  // Estimate elevation if not present
  coords = estimateElevation(coords, totalElevationGain);

  // Identify terrain segments
  const { flat, climb, descent, rolling } = identifySegments(
    coords,
    totalElevationGain,
    totalDistance
  );

  // Identify interval-suitable segments
  const intervalSegments = identifyIntervalSegments(coords, flat, rolling);

  // Calculate total flat and climbing distance
  const totalFlatKm = flat.reduce((sum, s) => sum + s.length, 0);
  const totalClimbingKm = climb.reduce((sum, s) => sum + s.length, 0);

  // Find longest uninterrupted segment
  const longestUninterruptedKm = intervalSegments.length > 0
    ? Math.max(...intervalSegments.map(s => s.uninterruptedLength))
    : totalFlatKm;

  // Calculate segment consistency
  const segmentConsistency = flat.length > 0
    ? flat.reduce((sum, s) => sum + s.quality, 0) / flat.length / 100
    : 0.5;

  // Calculate suitability scores
  const suitability = calculateSuitabilityScores(
    totalDistance,
    totalElevationGain,
    flat,
    climb,
    rolling,
    intervalSegments
  );

  // Determine best uses
  const bestFor = determineBestFor(suitability);

  // Determine terrain type
  const terrainType = determineTerrainType(totalDistance, totalElevationGain);

  // Calculate ideal duration range based on distance
  const avgSpeed = 25; // km/h assumed average
  const idealDurationMin = Math.round((totalDistance / avgSpeed) * 60 * 0.8);
  const idealDurationMax = Math.round((totalDistance / avgSpeed) * 60 * 1.5);

  return {
    activityId,
    userId,
    flatSegments: flat,
    climbSegments: climb,
    descentSegments: descent,
    rollingSegments: rolling,
    intervalSegments,
    stopFrequency: 0, // Would need more data to calculate
    segmentConsistency,
    longestUninterruptedKm,
    totalFlatKm,
    totalClimbingKm,
    suitability,
    bestFor,
    terrainType,
    idealDurationMin,
    idealDurationMax
  };
}

/**
 * Convert analysis result to database format
 */
export function analysisToDbFormat(analysis: RouteTrainingProfile): Record<string, unknown> {
  return {
    activity_id: analysis.activityId,
    user_id: analysis.userId,
    flat_segments: JSON.stringify(analysis.flatSegments),
    climb_segments: JSON.stringify(analysis.climbSegments),
    descent_segments: JSON.stringify(analysis.descentSegments),
    rolling_segments: JSON.stringify(analysis.rollingSegments),
    interval_segments: JSON.stringify(analysis.intervalSegments),
    stop_frequency: analysis.stopFrequency,
    segment_consistency: analysis.segmentConsistency,
    longest_uninterrupted_km: analysis.longestUninterruptedKm,
    total_flat_km: analysis.totalFlatKm,
    total_climbing_km: analysis.totalClimbingKm,
    recovery_score: analysis.suitability.recovery,
    endurance_score: analysis.suitability.endurance,
    tempo_score: analysis.suitability.tempo,
    sweet_spot_score: analysis.suitability.sweet_spot,
    threshold_score: analysis.suitability.threshold,
    vo2max_score: analysis.suitability.vo2max,
    climbing_score: analysis.suitability.climbing,
    intervals_score: analysis.suitability.intervals,
    best_for: analysis.bestFor,
    terrain_type: analysis.terrainType,
    ideal_duration_min: analysis.idealDurationMin,
    ideal_duration_max: analysis.idealDurationMax
  };
}

/**
 * Parse database format back to RouteTrainingProfile
 */
export function dbFormatToAnalysis(dbRow: Record<string, unknown>): RouteTrainingProfile {
  return {
    activityId: dbRow.activity_id as string,
    userId: dbRow.user_id as string,
    flatSegments: typeof dbRow.flat_segments === 'string'
      ? JSON.parse(dbRow.flat_segments)
      : (dbRow.flat_segments as RouteSegment[]) || [],
    climbSegments: typeof dbRow.climb_segments === 'string'
      ? JSON.parse(dbRow.climb_segments)
      : (dbRow.climb_segments as RouteSegment[]) || [],
    descentSegments: typeof dbRow.descent_segments === 'string'
      ? JSON.parse(dbRow.descent_segments)
      : (dbRow.descent_segments as RouteSegment[]) || [],
    rollingSegments: typeof dbRow.rolling_segments === 'string'
      ? JSON.parse(dbRow.rolling_segments)
      : (dbRow.rolling_segments as RouteSegment[]) || [],
    intervalSegments: typeof dbRow.interval_segments === 'string'
      ? JSON.parse(dbRow.interval_segments)
      : (dbRow.interval_segments as IntervalSegment[]) || [],
    stopFrequency: dbRow.stop_frequency as number || 0,
    segmentConsistency: dbRow.segment_consistency as number || 0,
    longestUninterruptedKm: dbRow.longest_uninterrupted_km as number || 0,
    totalFlatKm: dbRow.total_flat_km as number || 0,
    totalClimbingKm: dbRow.total_climbing_km as number || 0,
    suitability: {
      recovery: dbRow.recovery_score as number || 0,
      endurance: dbRow.endurance_score as number || 0,
      tempo: dbRow.tempo_score as number || 0,
      sweet_spot: dbRow.sweet_spot_score as number || 0,
      threshold: dbRow.threshold_score as number || 0,
      vo2max: dbRow.vo2max_score as number || 0,
      climbing: dbRow.climbing_score as number || 0,
      intervals: dbRow.intervals_score as number || 0
    },
    bestFor: dbRow.best_for as WorkoutCategory[] || [],
    terrainType: dbRow.terrain_type as 'flat' | 'rolling' | 'hilly' | 'mountainous' || 'flat',
    idealDurationMin: dbRow.ideal_duration_min as number || 30,
    idealDurationMax: dbRow.ideal_duration_max as number || 120
  };
}

/**
 * Create colored GeoJSON segments for map visualization
 * Shows where different workout zones would be performed
 */
export function createAnalysisMapSegments(
  analysis: RouteTrainingProfile,
  workoutType?: WorkoutCategory
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  // Color scheme for segment types
  const segmentColors = {
    flat: '#5C7A5E',      // Teal - good for intervals
    climb: '#9E5A3C',     // Terracotta - climbing
    descent: '#6B8C72',   // Sage - descending
    rolling: '#B89040',   // Gold - rolling
    interval: '#6B7F94'   // Mauve - interval zones
  };

  // Add flat segments
  for (const segment of analysis.flatSegments) {
    features.push({
      type: 'Feature',
      properties: {
        type: 'flat',
        color: segmentColors.flat,
        length: segment.length,
        label: `Flat: ${segment.length.toFixed(1)}km`
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates
      }
    });
  }

  // Add climb segments
  for (const segment of analysis.climbSegments) {
    features.push({
      type: 'Feature',
      properties: {
        type: 'climb',
        color: segmentColors.climb,
        length: segment.length,
        avgGrade: segment.avgGrade,
        label: `Climb: ${segment.length.toFixed(1)}km @ ${segment.avgGrade.toFixed(1)}%`
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates
      }
    });
  }

  // Add rolling segments
  for (const segment of analysis.rollingSegments) {
    features.push({
      type: 'Feature',
      properties: {
        type: 'rolling',
        color: segmentColors.rolling,
        length: segment.length,
        label: `Rolling: ${segment.length.toFixed(1)}km`
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates
      }
    });
  }

  // If a specific workout type is selected, highlight suitable interval segments
  if (workoutType && analysis.intervalSegments.length > 0) {
    const suitableSegments = analysis.intervalSegments.filter(
      s => s.suitableFor.includes(workoutType)
    );

    for (const segment of suitableSegments) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'interval',
          color: segmentColors.interval,
          length: segment.length,
          suitableFor: segment.suitableFor,
          label: `Interval Zone: ${segment.length.toFixed(1)}km`
        },
        geometry: {
          type: 'LineString',
          coordinates: segment.coordinates
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
}
