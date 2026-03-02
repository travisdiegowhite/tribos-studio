/**
 * Segment Detection Engine
 *
 * Identifies discrete, trainable road segments from activity stream data.
 * A "segment" is a contiguous stretch with consistent training character —
 * similar gradient, minimal interruptions, and natural start/end points.
 *
 * Input: activity_streams JSONB (coords, elevation, speed, power, heartRate, cadence)
 * Output: DetectedSegment[] with terrain, stop, and quality metadata
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StreamPoint {
  lat: number;
  lng: number;
  elevation: number;
  speed: number;       // m/s
  power: number;       // watts (0 if unavailable)
  heartRate: number;   // bpm (0 if unavailable)
  cadence: number;     // rpm (0 if unavailable)
  distance: number;    // cumulative meters from start
  timestamp: number;   // seconds from ride start (estimated from speed/distance)
}

export interface DetectedStop {
  pointIndex: number;
  lat: number;
  lng: number;
  distance: number;        // meters from start
  durationSeconds: number;
  type: 'unknown';         // classified later via cross-ride analysis
}

export interface DetectedSegment {
  // Geography
  startIdx: number;
  endIdx: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  coordinates: [number, number][];  // [lng, lat] GeoJSON convention
  distanceMeters: number;

  // Terrain
  avgGradient: number;
  maxGradient: number;
  minGradient: number;
  gradientVariability: number;      // std dev of gradient samples
  elevationGain: number;            // meters
  elevationLoss: number;
  terrainType: 'flat' | 'climb' | 'descent' | 'rolling';

  // Speed/time
  durationSeconds: number;
  avgSpeedKmh: number;

  // Power (if available)
  avgPower: number;
  maxPower: number;
  normalizedPower: number;

  // Heart rate (if available)
  avgHR: number;
  maxHR: number;

  // Cadence (if available)
  avgCadence: number;

  // Stops within this segment
  stops: DetectedStop[];
  stopCount: number;
  stopsPerKm: number;

  // Sharp turns
  sharpTurnCount: number;

  // Quality indicators
  qualityScore: number;  // 0-100 overall segment quality
}

export interface SegmentDetectionResult {
  segments: DetectedSegment[];
  stops: DetectedStop[];
  totalPoints: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

export interface ActivityStreams {
  coords: [number, number][];    // [lng, lat]
  elevation?: number[];
  speed?: number[];
  power?: number[];
  heartRate?: number[];
  cadence?: number[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Gradient classification thresholds (%)
  FLAT_THRESHOLD: 2,
  CLIMB_THRESHOLD: 4,
  DESCENT_THRESHOLD: -2,

  // Gradient change that triggers a segment boundary (%)
  GRADIENT_CHANGE_THRESHOLD: 3,
  // Minimum distance for gradient change to be sustained (meters)
  GRADIENT_SUSTAIN_DISTANCE: 200,

  // Minimum segment dimensions
  MIN_SEGMENT_DISTANCE: 500,    // meters
  MIN_SEGMENT_DURATION: 120,    // seconds (2 min)
  // Maximum segment duration before flagging
  MAX_SEGMENT_DURATION: 1800,   // seconds (30 min)

  // Stop detection
  STOP_SPEED_THRESHOLD: 0.6,    // m/s (~2 km/h)
  STOP_MIN_DURATION: 3,         // seconds
  EXTENDED_STOP_DURATION: 30,   // seconds — splits segments

  // Turn detection
  SHARP_TURN_ANGLE: 45,         // degrees heading change per point pair

  // Elevation smoothing
  ELEVATION_SMOOTH_WINDOW: 5,   // points for rolling average
  ELEVATION_NOISE_THRESHOLD: 1, // meters — ignore changes smaller than this

  // Gradient calculation
  GRADIENT_WINDOW: 100,         // meters — distance window for gradient calc
};

// ============================================================================
// CORE DETECTION
// ============================================================================

/**
 * Main entry point: detect trainable segments from activity stream data.
 */
export function detectSegments(
  streams: ActivityStreams,
  totalDistance?: number,
  totalElevationGain?: number
): SegmentDetectionResult {
  // Step 1: Build enriched point array
  const points = buildStreamPoints(streams);

  if (points.length < 10) {
    return {
      segments: [],
      stops: [],
      totalPoints: points.length,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
    };
  }

  // Step 2: Smooth elevation to remove GPS noise
  smoothElevation(points);

  // Step 3: Detect stops (speed drops to ~0)
  const stops = detectStops(points);

  // Step 4: Calculate gradient at each point
  const gradients = calculateGradients(points);

  // Step 5: Find gradient change points (segment boundaries)
  const boundaries = findGradientBoundaries(points, gradients, stops);

  // Step 6: Build candidate segments from boundaries
  const candidates = buildCandidateSegments(points, gradients, boundaries, stops);

  // Step 7: Merge tiny adjacent segments with similar character
  const merged = mergeSmallSegments(candidates);

  // Step 8: Characterize each segment (terrain, stops, turns, quality)
  const segments = merged.map(seg => characterizeSegment(seg, points, stops));

  const totalDist = points.length > 0 ? points[points.length - 1].distance : 0;
  const totalDur = points.length > 0 ? points[points.length - 1].timestamp : 0;

  return {
    segments,
    stops,
    totalPoints: points.length,
    totalDistanceMeters: totalDist,
    totalDurationSeconds: totalDur,
  };
}

// ============================================================================
// STEP 1: BUILD STREAM POINTS
// ============================================================================

function buildStreamPoints(streams: ActivityStreams): StreamPoint[] {
  const { coords, elevation, speed, power, heartRate, cadence } = streams;
  if (!coords || coords.length === 0) return [];

  const points: StreamPoint[] = [];
  let cumulativeDistance = 0;
  let cumulativeTime = 0;

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];

    // Calculate distance from previous point
    if (i > 0) {
      const dist = haversineMeters(
        points[i - 1].lat, points[i - 1].lng,
        lat, lng
      );
      cumulativeDistance += dist;

      // Estimate timestamp from speed or distance
      const spd = speed?.[i] ?? speed?.[i - 1] ?? 5; // default 5 m/s (~18 km/h)
      if (spd > 0.1) {
        cumulativeTime += dist / spd;
      } else {
        // Stopped — estimate time from distance at walking pace
        cumulativeTime += dist / 1.4;
      }
    }

    points.push({
      lat,
      lng,
      elevation: elevation?.[i] ?? 0,
      speed: speed?.[i] ?? 0,
      power: power?.[i] ?? 0,
      heartRate: heartRate?.[i] ?? 0,
      cadence: cadence?.[i] ?? 0,
      distance: cumulativeDistance,
      timestamp: cumulativeTime,
    });
  }

  return points;
}

// ============================================================================
// STEP 2: SMOOTH ELEVATION
// ============================================================================

function smoothElevation(points: StreamPoint[]): void {
  if (points.length < CONFIG.ELEVATION_SMOOTH_WINDOW) return;

  const window = CONFIG.ELEVATION_SMOOTH_WINDOW;
  const halfWindow = Math.floor(window / 2);
  const smoothed: number[] = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(points.length - 1, i + halfWindow);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += points[j].elevation;
      count++;
    }
    smoothed[i] = sum / count;
  }

  for (let i = 0; i < points.length; i++) {
    points[i].elevation = smoothed[i];
  }
}

// ============================================================================
// STEP 3: DETECT STOPS
// ============================================================================

function detectStops(points: StreamPoint[]): DetectedStop[] {
  const stops: DetectedStop[] = [];
  let stopStart = -1;

  for (let i = 0; i < points.length; i++) {
    const isStopped = points[i].speed < CONFIG.STOP_SPEED_THRESHOLD;

    if (isStopped && stopStart === -1) {
      stopStart = i;
    } else if (!isStopped && stopStart !== -1) {
      const duration = points[i].timestamp - points[stopStart].timestamp;
      if (duration >= CONFIG.STOP_MIN_DURATION) {
        stops.push({
          pointIndex: stopStart,
          lat: points[stopStart].lat,
          lng: points[stopStart].lng,
          distance: points[stopStart].distance,
          durationSeconds: Math.round(duration),
          type: 'unknown',
        });
      }
      stopStart = -1;
    }
  }

  // Handle stop that extends to end of ride
  if (stopStart !== -1) {
    const last = points[points.length - 1];
    const duration = last.timestamp - points[stopStart].timestamp;
    if (duration >= CONFIG.STOP_MIN_DURATION) {
      stops.push({
        pointIndex: stopStart,
        lat: points[stopStart].lat,
        lng: points[stopStart].lng,
        distance: points[stopStart].distance,
        durationSeconds: Math.round(duration),
        type: 'unknown',
      });
    }
  }

  return stops;
}

// ============================================================================
// STEP 4: CALCULATE GRADIENTS
// ============================================================================

/**
 * Calculate gradient at each point using a distance window.
 * Returns array of gradients (%) aligned with points array.
 */
function calculateGradients(points: StreamPoint[]): number[] {
  const gradients: number[] = new Array(points.length).fill(0);
  const window = CONFIG.GRADIENT_WINDOW; // meters

  for (let i = 0; i < points.length; i++) {
    // Find points within window distance ahead and behind
    let lookBack = i;
    let lookForward = i;

    while (lookBack > 0 && points[i].distance - points[lookBack].distance < window / 2) {
      lookBack--;
    }
    while (lookForward < points.length - 1 && points[lookForward].distance - points[i].distance < window / 2) {
      lookForward++;
    }

    const distDiff = points[lookForward].distance - points[lookBack].distance;
    const elevDiff = points[lookForward].elevation - points[lookBack].elevation;

    if (distDiff > 10) { // need at least 10m for meaningful gradient
      gradients[i] = (elevDiff / distDiff) * 100;
    }
  }

  return gradients;
}

// ============================================================================
// STEP 5: FIND GRADIENT BOUNDARIES
// ============================================================================

interface BoundaryPoint {
  index: number;
  distance: number;
  reason: 'gradient_change' | 'extended_stop' | 'start' | 'end';
}

function findGradientBoundaries(
  points: StreamPoint[],
  gradients: number[],
  stops: DetectedStop[]
): BoundaryPoint[] {
  const boundaries: BoundaryPoint[] = [];

  // Always include start
  boundaries.push({
    index: 0,
    distance: 0,
    reason: 'start',
  });

  // Find gradient change points
  let prevAvgGradient = averageGradient(gradients, 0, Math.min(10, gradients.length));
  let sustainedDistance = 0;

  for (let i = 1; i < points.length; i++) {
    const currentGradient = gradients[i];
    const distStep = points[i].distance - points[i - 1].distance;

    // Check if gradient has changed significantly
    const gradientDiff = Math.abs(currentGradient - prevAvgGradient);

    if (gradientDiff >= CONFIG.GRADIENT_CHANGE_THRESHOLD) {
      sustainedDistance += distStep;

      // Only register boundary if change is sustained
      if (sustainedDistance >= CONFIG.GRADIENT_SUSTAIN_DISTANCE) {
        // The boundary is at the point where the change started
        const boundaryIdx = Math.max(0, i - Math.ceil(sustainedDistance / Math.max(distStep, 1)));
        boundaries.push({
          index: boundaryIdx,
          distance: points[boundaryIdx].distance,
          reason: 'gradient_change',
        });

        prevAvgGradient = currentGradient;
        sustainedDistance = 0;
      }
    } else {
      // Update rolling average when gradient is stable
      prevAvgGradient = prevAvgGradient * 0.9 + currentGradient * 0.1;
      sustainedDistance = 0;
    }
  }

  // Add extended stops as boundaries
  for (const stop of stops) {
    if (stop.durationSeconds >= CONFIG.EXTENDED_STOP_DURATION) {
      boundaries.push({
        index: stop.pointIndex,
        distance: stop.distance,
        reason: 'extended_stop',
      });
    }
  }

  // Always include end
  boundaries.push({
    index: points.length - 1,
    distance: points[points.length - 1].distance,
    reason: 'end',
  });

  // Sort by distance and deduplicate (merge boundaries within 50m)
  boundaries.sort((a, b) => a.distance - b.distance);
  return deduplicateBoundaries(boundaries);
}

function deduplicateBoundaries(boundaries: BoundaryPoint[]): BoundaryPoint[] {
  if (boundaries.length <= 2) return boundaries;

  const result: BoundaryPoint[] = [boundaries[0]];

  for (let i = 1; i < boundaries.length; i++) {
    const prev = result[result.length - 1];
    if (boundaries[i].distance - prev.distance > 50) {
      result.push(boundaries[i]);
    }
    // If within 50m, keep the one with higher-priority reason
  }

  return result;
}

// ============================================================================
// STEP 6: BUILD CANDIDATE SEGMENTS
// ============================================================================

interface CandidateSegment {
  startIdx: number;
  endIdx: number;
  startDistance: number;
  endDistance: number;
}

function buildCandidateSegments(
  points: StreamPoint[],
  _gradients: number[],
  boundaries: BoundaryPoint[],
  _stops: DetectedStop[]
): CandidateSegment[] {
  const candidates: CandidateSegment[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const distance = end.distance - start.distance;

    // Skip segments that are too short
    if (distance < CONFIG.MIN_SEGMENT_DISTANCE) continue;

    candidates.push({
      startIdx: start.index,
      endIdx: end.index,
      startDistance: start.distance,
      endDistance: end.distance,
    });
  }

  return candidates;
}

// ============================================================================
// STEP 7: MERGE SMALL SEGMENTS
// ============================================================================

function mergeSmallSegments(candidates: CandidateSegment[]): CandidateSegment[] {
  if (candidates.length <= 1) return candidates;

  const merged: CandidateSegment[] = [];
  let current = candidates[0];

  for (let i = 1; i < candidates.length; i++) {
    const next = candidates[i];
    const currentDist = current.endDistance - current.startDistance;
    const nextDist = next.endDistance - next.startDistance;

    // If current segment is very short, merge it with next
    if (currentDist < CONFIG.MIN_SEGMENT_DISTANCE) {
      current = {
        startIdx: current.startIdx,
        endIdx: next.endIdx,
        startDistance: current.startDistance,
        endDistance: next.endDistance,
      };
    }
    // If next segment is very short and there's another after it, merge
    else if (nextDist < CONFIG.MIN_SEGMENT_DISTANCE && i < candidates.length - 1) {
      current = {
        startIdx: current.startIdx,
        endIdx: candidates[i + 1].endIdx,
        startDistance: current.startDistance,
        endDistance: candidates[i + 1].endDistance,
      };
      i++; // skip the one we merged into
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

// ============================================================================
// STEP 8: CHARACTERIZE SEGMENTS
// ============================================================================

function characterizeSegment(
  candidate: CandidateSegment,
  points: StreamPoint[],
  allStops: DetectedStop[]
): DetectedSegment {
  const { startIdx, endIdx } = candidate;
  const segPoints = points.slice(startIdx, endIdx + 1);
  const distanceMeters = candidate.endDistance - candidate.startDistance;
  const durationSeconds = segPoints.length > 1
    ? segPoints[segPoints.length - 1].timestamp - segPoints[0].timestamp
    : 0;

  // Coordinates in GeoJSON [lng, lat]
  const coordinates: [number, number][] = segPoints.map(p => [p.lng, p.lat]);

  // Elevation analysis
  let elevGain = 0;
  let elevLoss = 0;
  const gradientSamples: number[] = [];

  for (let i = 1; i < segPoints.length; i++) {
    const elevDiff = segPoints[i].elevation - segPoints[i - 1].elevation;
    const distDiff = segPoints[i].distance - segPoints[i - 1].distance;

    if (Math.abs(elevDiff) >= CONFIG.ELEVATION_NOISE_THRESHOLD) {
      if (elevDiff > 0) elevGain += elevDiff;
      else elevLoss += Math.abs(elevDiff);
    }

    if (distDiff > 5) {
      gradientSamples.push((elevDiff / distDiff) * 100);
    }
  }

  const avgGradient = gradientSamples.length > 0
    ? gradientSamples.reduce((a, b) => a + b, 0) / gradientSamples.length
    : 0;
  const maxGradient = gradientSamples.length > 0
    ? Math.max(...gradientSamples)
    : 0;
  const minGradient = gradientSamples.length > 0
    ? Math.min(...gradientSamples)
    : 0;
  const gradientVariability = stdDev(gradientSamples);

  // Terrain classification
  const terrainType = classifyTerrain(avgGradient, gradientVariability, elevGain, distanceMeters);

  // Speed
  const speedSamples = segPoints.filter(p => p.speed > 0.5).map(p => p.speed);
  const avgSpeedKmh = speedSamples.length > 0
    ? (speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length) * 3.6
    : 0;

  // Power
  const powerSamples = segPoints.filter(p => p.power > 0).map(p => p.power);
  const avgPower = powerSamples.length > 0
    ? powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length
    : 0;
  const maxPower = powerSamples.length > 0
    ? Math.max(...powerSamples)
    : 0;
  const normalizedPower = powerSamples.length >= 10
    ? calculateNP(powerSamples)
    : avgPower;

  // Heart rate
  const hrSamples = segPoints.filter(p => p.heartRate > 30).map(p => p.heartRate);
  const avgHR = hrSamples.length > 0
    ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length)
    : 0;
  const maxHR = hrSamples.length > 0
    ? Math.max(...hrSamples)
    : 0;

  // Cadence
  const cadenceSamples = segPoints.filter(p => p.cadence > 0).map(p => p.cadence);
  const avgCadence = cadenceSamples.length > 0
    ? Math.round(cadenceSamples.reduce((a, b) => a + b, 0) / cadenceSamples.length)
    : 0;

  // Stops within this segment
  const segStops = allStops.filter(
    s => s.distance >= candidate.startDistance && s.distance <= candidate.endDistance
  );
  const distKm = distanceMeters / 1000;

  // Sharp turns
  const sharpTurnCount = countSharpTurns(segPoints);

  // Quality score
  const qualityScore = calculateQualityScore(
    distanceMeters,
    durationSeconds,
    gradientVariability,
    segStops.length,
    sharpTurnCount,
    distKm
  );

  return {
    startIdx,
    endIdx,
    startLat: segPoints[0].lat,
    startLng: segPoints[0].lng,
    endLat: segPoints[segPoints.length - 1].lat,
    endLng: segPoints[segPoints.length - 1].lng,
    coordinates,
    distanceMeters,
    avgGradient: Math.round(avgGradient * 100) / 100,
    maxGradient: Math.round(maxGradient * 100) / 100,
    minGradient: Math.round(minGradient * 100) / 100,
    gradientVariability: Math.round(gradientVariability * 100) / 100,
    elevationGain: Math.round(elevGain * 10) / 10,
    elevationLoss: Math.round(elevLoss * 10) / 10,
    terrainType,
    durationSeconds: Math.round(durationSeconds),
    avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
    avgPower: Math.round(avgPower),
    maxPower: Math.round(maxPower),
    normalizedPower: Math.round(normalizedPower),
    avgHR,
    maxHR,
    avgCadence,
    stops: segStops,
    stopCount: segStops.length,
    stopsPerKm: distKm > 0 ? Math.round((segStops.length / distKm) * 100) / 100 : 0,
    sharpTurnCount,
    qualityScore,
  };
}

// ============================================================================
// TERRAIN CLASSIFICATION
// ============================================================================

function classifyTerrain(
  avgGradient: number,
  gradientVariability: number,
  elevGain: number,
  distanceMeters: number
): 'flat' | 'climb' | 'descent' | 'rolling' {
  const absGradient = Math.abs(avgGradient);
  const elevPerKm = distanceMeters > 0 ? (elevGain / (distanceMeters / 1000)) : 0;

  // Rolling: high variability regardless of average
  if (gradientVariability > 3 && absGradient < CONFIG.CLIMB_THRESHOLD) {
    return 'rolling';
  }

  // Climb: sustained positive gradient
  if (avgGradient >= CONFIG.CLIMB_THRESHOLD || elevPerKm > 30) {
    return 'climb';
  }

  // Descent: sustained negative gradient
  if (avgGradient <= -CONFIG.CLIMB_THRESHOLD) {
    return 'descent';
  }

  // Flat: low gradient and low variability
  if (absGradient < CONFIG.FLAT_THRESHOLD && gradientVariability < 2) {
    return 'flat';
  }

  // Default to rolling for moderate terrain
  return 'rolling';
}

// ============================================================================
// TURN DETECTION
// ============================================================================

function countSharpTurns(points: StreamPoint[]): number {
  if (points.length < 3) return 0;

  let count = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const bearing1 = calculateBearing(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat, points[i].lng
    );
    const bearing2 = calculateBearing(
      points[i].lat, points[i].lng,
      points[i + 1].lat, points[i + 1].lng
    );

    let angleDiff = Math.abs(bearing2 - bearing1);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    if (angleDiff >= CONFIG.SHARP_TURN_ANGLE) {
      count++;
    }
  }

  return count;
}

function calculateBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ============================================================================
// QUALITY SCORING
// ============================================================================

function calculateQualityScore(
  distanceMeters: number,
  durationSeconds: number,
  gradientVariability: number,
  stopCount: number,
  sharpTurnCount: number,
  distKm: number
): number {
  let score = 100;

  // Penalty for very short segments
  if (distanceMeters < 1000) score -= 15;
  else if (distanceMeters < 2000) score -= 5;

  // Penalty for very short duration
  if (durationSeconds < 180) score -= 15;
  else if (durationSeconds < 300) score -= 5;

  // Penalty for high gradient variability (inconsistent terrain)
  if (gradientVariability > 5) score -= 20;
  else if (gradientVariability > 3) score -= 10;

  // Penalty for stops
  const stopsPerKm = distKm > 0 ? stopCount / distKm : 0;
  if (stopsPerKm > 2) score -= 25;
  else if (stopsPerKm > 1) score -= 15;
  else if (stopsPerKm > 0.5) score -= 5;

  // Penalty for sharp turns
  const turnsPerKm = distKm > 0 ? sharpTurnCount / distKm : 0;
  if (turnsPerKm > 3) score -= 15;
  else if (turnsPerKm > 1) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================================
// OBSTRUCTION SCORING (exported for use in characterization)
// ============================================================================

export function calculateObstructionScore(segment: DetectedSegment): {
  overall: number;
  stopFrequency: number;
  turnSharpness: number;
  surfaceConsistency: number;
  maxUninterruptedSeconds: number;
  suitableForSteadyState: boolean;
  suitableForShortIntervals: boolean;
  suitableForSprints: boolean;
  suitableForRecovery: boolean;
} {
  const distKm = segment.distanceMeters / 1000;

  // Stop frequency score: 0 stops/km = 100, 1 stop/km = 60, 3+ stops/km = 10
  const stopFrequency = Math.max(0, Math.min(100,
    Math.round(100 - (segment.stopsPerKm * 30))
  ));

  // Turn sharpness score: based on sharp turns per km
  const turnsPerKm = distKm > 0 ? segment.sharpTurnCount / distKm : 0;
  const turnSharpness = Math.max(0, Math.min(100,
    Math.round(100 - (turnsPerKm * 20))
  ));

  // Surface consistency: based on gradient variability and speed consistency
  const surfaceConsistency = Math.max(0, Math.min(100,
    Math.round(100 - (segment.gradientVariability * 5))
  ));

  // Overall weighted score
  const overall = Math.round(
    stopFrequency * 0.40 +
    turnSharpness * 0.25 +
    surfaceConsistency * 0.35
  );

  // Calculate max uninterrupted duration
  let maxUninterrupted = segment.durationSeconds;
  if (segment.stops.length > 0) {
    // Find the longest gap between stops
    const stopDistances = segment.stops.map(s => s.distance);
    stopDistances.unshift(segment.coordinates.length > 0
      ? 0
      : 0);

    // Rough estimate: proportional to distance between stops
    const segStart = segment.stops.length > 0
      ? segment.stops[0].distance - (segment.distanceMeters * (segment.startIdx / (segment.endIdx || 1)))
      : segment.distanceMeters;

    if (segment.stops.length > 0 && segment.durationSeconds > 0) {
      const avgSpeedMs = segment.distanceMeters / segment.durationSeconds;
      // Find longest gap between consecutive stops
      let maxGap = 0;
      const allDists = [0, ...segment.stops.map(s => s.distance - (segment.startIdx > 0 ? segment.stops[0].distance - segment.distanceMeters : 0)), segment.distanceMeters];
      for (let i = 1; i < allDists.length; i++) {
        const gap = Math.abs(allDists[i] - allDists[i - 1]);
        if (gap > maxGap) maxGap = gap;
      }
      maxUninterrupted = avgSpeedMs > 0 ? Math.round(maxGap / avgSpeedMs) : segment.durationSeconds;
    }
  }

  return {
    overall,
    stopFrequency,
    turnSharpness,
    surfaceConsistency,
    maxUninterruptedSeconds: maxUninterrupted,
    suitableForSteadyState: overall >= 75 && maxUninterrupted >= 300,
    suitableForShortIntervals: overall >= 60 && maxUninterrupted >= 60,
    suitableForSprints: overall >= 50 && maxUninterrupted >= 15,
    suitableForRecovery: segment.terrainType === 'flat' || segment.terrainType === 'descent',
  };
}

// ============================================================================
// TOPOLOGY CLASSIFICATION
// ============================================================================

export function classifyTopology(segment: DetectedSegment): {
  topology: 'loop' | 'out_and_back' | 'point_to_point' | 'circuit';
  isRepeatable: boolean;
} {
  // Check if start and end are within 200m (loop)
  const startEndDist = haversineMeters(
    segment.startLat, segment.startLng,
    segment.endLat, segment.endLng
  );

  if (startEndDist < 200) {
    return { topology: 'loop', isRepeatable: true };
  }

  // Out-and-back: if the segment covers similar ground twice
  // (detected by checking if midpoint is far from start-end line)
  if (segment.coordinates.length > 4) {
    const midIdx = Math.floor(segment.coordinates.length / 2);
    const mid = segment.coordinates[midIdx];
    const midToStart = haversineMeters(
      mid[1], mid[0], segment.startLat, segment.startLng
    );
    const midToEnd = haversineMeters(
      mid[1], mid[0], segment.endLat, segment.endLng
    );

    // If midpoint is much farther from both start and end than start-end distance
    if (midToStart > startEndDist * 1.5 && midToEnd > startEndDist * 1.5 && startEndDist < 500) {
      return { topology: 'out_and_back', isRepeatable: true };
    }
  }

  // Default: point-to-point
  return { topology: 'point_to_point', isRepeatable: false };
}

// ============================================================================
// POWER ZONE CLASSIFICATION
// ============================================================================

export function classifyPowerZone(avgPower: number, ftp: number): string {
  if (ftp <= 0 || avgPower <= 0) return 'unknown';

  const ratio = avgPower / ftp;

  if (ratio < 0.55) return 'recovery';
  if (ratio < 0.75) return 'endurance';
  if (ratio < 0.87) return 'tempo';
  if (ratio < 0.95) return 'sweet_spot';
  if (ratio < 1.05) return 'threshold';
  if (ratio < 1.20) return 'vo2max';
  return 'anaerobic';
}

export function classifyHRZone(avgHR: number, maxHR: number): string {
  if (maxHR <= 0 || avgHR <= 0) return 'unknown';

  const ratio = avgHR / maxHR;

  if (ratio < 0.60) return 'recovery';
  if (ratio < 0.70) return 'endurance';
  if (ratio < 0.80) return 'tempo';
  if (ratio < 0.90) return 'threshold';
  if (ratio < 0.95) return 'vo2max';
  return 'anaerobic';
}

// ============================================================================
// CONSISTENCY SCORING
// ============================================================================

export function calculateConsistencyScore(
  powerValues: number[]
): number {
  if (powerValues.length < 2) return 0;

  const mean = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
  if (mean <= 0) return 0;

  const sd = stdDev(powerValues);
  // Consistency = 100 - (stdDev/mean × 200)
  // Mean 247W, StdDev 12W → 90 (excellent)
  // Mean 200W, StdDev 45W → 55 (poor)
  return Math.max(0, Math.min(100, Math.round(100 - (sd / mean) * 200)));
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

export function calculateConfidenceScore(
  rideCount: number,
  lastRiddenAt: Date | null,
  ftpChangedSignificantly: boolean
): number {
  // Base from ride count
  let score: number;
  if (rideCount >= 15) score = 95;
  else if (rideCount >= 8) score = 85;
  else if (rideCount >= 5) score = 70;
  else if (rideCount >= 3) score = 50;
  else if (rideCount >= 2) score = 35;
  else score = 20;

  // Recency modifier
  if (lastRiddenAt) {
    const daysSince = (Date.now() - lastRiddenAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 14) score += 5;
    else if (daysSince < 30) score += 0;
    else if (daysSince < 90) score -= 10;
    else score -= 20;
  }

  // FTP change modifier
  if (ftpChangedSignificantly) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

export function calculateRelevanceScore(
  rideCount: number,
  ridesLast30Days: number,
  ridesPerMonth: number
): number {
  const base = Math.min(50, rideCount * 5);
  const recency = rideCount > 0 ? (ridesLast30Days / rideCount) * 30 : 0;
  const frequency = Math.min(20, ridesPerMonth * 10);

  return Math.min(100, Math.round(base + recency + frequency));
}

export function classifyFrequencyTier(
  ridesPerMonth: number
): 'primary' | 'regular' | 'occasional' | 'rare' {
  if (ridesPerMonth >= 4) return 'primary';
  if (ridesPerMonth >= 2) return 'regular';
  if (ridesPerMonth >= 1) return 'occasional';
  return 'rare';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function averageGradient(gradients: number[], start: number, end: number): number {
  const slice = gradients.slice(start, end);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Calculate Normalized Power from power samples.
 * Uses 30-second rolling average, then 4th root of mean of 4th powers.
 */
function calculateNP(powerValues: number[]): number {
  if (powerValues.length < 30) {
    return powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
  }

  // 30-point rolling average (approximating 30 seconds since points are simplified)
  const windowSize = Math.min(30, Math.floor(powerValues.length / 3));
  const rollingAvgs: number[] = [];

  for (let i = windowSize - 1; i < powerValues.length; i++) {
    let sum = 0;
    for (let j = i - windowSize + 1; j <= i; j++) {
      sum += powerValues[j];
    }
    rollingAvgs.push(sum / windowSize);
  }

  // 4th power average, then 4th root
  const fourthPowerAvg = rollingAvgs.reduce((sum, v) => sum + v ** 4, 0) / rollingAvgs.length;
  return Math.round(fourthPowerAvg ** 0.25);
}

// Export haversine for use in deduplication
export { haversineMeters };
