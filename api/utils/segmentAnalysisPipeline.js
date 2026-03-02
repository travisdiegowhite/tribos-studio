/**
 * Segment Analysis Pipeline
 *
 * Server-side orchestrator that processes an activity's stream data to detect,
 * deduplicate, store, and profile training segments. Designed to run in Vercel
 * serverless functions with Supabase service key access.
 *
 * Pipeline stages:
 * 1. Fetch activity with stream data
 * 2. Detect segments from streams (elevation, speed, gradient)
 * 3. Deduplicate against existing segment library
 * 4. Store new segments / update existing ones with ride data
 * 5. Update aggregate profiles (power, consistency, frequency)
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum activity requirements for segment analysis
  MIN_DISTANCE_METERS: 2000,       // 2km minimum ride distance
  MIN_DURATION_SECONDS: 600,       // 10 min minimum ride duration
  MIN_STREAM_POINTS: 20,           // Need enough GPS points

  // Segment matching thresholds
  MATCH_BBOX_EXPANSION: 0.005,     // ~500m at mid-latitudes
  MATCH_START_END_PROXIMITY: 200,  // meters
  MATCH_MIN_OVERLAP: 0.60,        // 60% overlap
  MATCH_DISTANCE_RATIO: 0.40,     // within 40% distance

  // Power zone boundaries (% of FTP)
  POWER_ZONES: {
    recovery: [0, 0.55],
    endurance: [0.55, 0.75],
    tempo: [0.75, 0.87],
    sweet_spot: [0.87, 0.95],
    threshold: [0.95, 1.05],
    vo2max: [1.05, 1.20],
    anaerobic: [1.20, Infinity],
  },

  // HR zone boundaries (% of max HR)
  HR_ZONES: {
    recovery: [0, 0.60],
    endurance: [0.60, 0.70],
    tempo: [0.70, 0.80],
    threshold: [0.80, 0.90],
    vo2max: [0.90, 0.95],
    anaerobic: [0.95, 1.0],
  },
};

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Analyze a single activity for training segments.
 * @param {string} activityId - Activity UUID
 * @param {string} userId - User UUID
 * @returns {Object} Analysis results
 */
export async function analyzeActivitySegments(activityId, userId) {
  const supabase = getSupabase();

  // Step 1: Fetch activity data
  const activity = await fetchActivity(supabase, activityId, userId);
  if (!activity) {
    return { success: false, error: 'Activity not found', segments: 0 };
  }

  // Validate minimum requirements
  if (!activity.activity_streams?.coords || activity.activity_streams.coords.length < CONFIG.MIN_STREAM_POINTS) {
    return { success: false, error: 'Insufficient stream data', segments: 0 };
  }

  const distance = activity.distance || 0;
  const duration = activity.moving_time || 0;
  if (distance < CONFIG.MIN_DISTANCE_METERS || duration < CONFIG.MIN_DURATION_SECONDS) {
    return { success: false, error: 'Activity too short', segments: 0 };
  }

  // Step 2: Detect segments from stream data
  const detected = detectSegmentsFromStreams(activity.activity_streams);
  if (detected.segments.length === 0) {
    // Mark as analyzed even with no segments
    await markAnalyzed(supabase, activityId);
    return { success: true, segments: 0, message: 'No trainable segments detected' };
  }

  // Step 3: Fetch user's FTP for power zone classification
  const ftp = await fetchUserFTP(supabase, userId);

  // Step 4: For each detected segment, deduplicate and store
  const results = {
    newSegments: 0,
    updatedSegments: 0,
    totalSegments: detected.segments.length,
  };

  for (const segment of detected.segments) {
    const result = await processDetectedSegment(
      supabase,
      segment,
      activityId,
      userId,
      activity,
      ftp
    );

    if (result.isNew) results.newSegments++;
    else results.updatedSegments++;
  }

  // Step 5: Mark activity as analyzed
  await markAnalyzed(supabase, activityId);

  return {
    success: true,
    ...results,
  };
}

/**
 * Analyze all unprocessed activities for a user.
 * @param {string} userId - User UUID
 * @param {number} limit - Max activities to process
 */
export async function analyzeUnprocessedActivities(userId, limit = 20) {
  const supabase = getSupabase();

  // Find activities with stream data that haven't been analyzed
  const { data: activities, error } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', userId)
    .is('training_segments_analyzed_at', null)
    .not('activity_streams', 'is', null)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (error || !activities) {
    return { success: false, error: error?.message || 'Failed to fetch activities', processed: 0 };
  }

  let processed = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  for (const activity of activities) {
    try {
      const result = await analyzeActivitySegments(activity.id, userId);
      if (result.success) {
        processed++;
        totalNew += result.newSegments || 0;
        totalUpdated += result.updatedSegments || 0;
      }
    } catch (err) {
      console.error(`[SegmentPipeline] Error analyzing activity ${activity.id}:`, err.message);
    }
  }

  return {
    success: true,
    processed,
    totalActivities: activities.length,
    newSegments: totalNew,
    updatedSegments: totalUpdated,
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchActivity(supabase, activityId, userId) {
  const { data, error } = await supabase
    .from('activities')
    .select('id, user_id, name, distance, moving_time, elapsed_time, total_elevation_gain, average_watts, average_heartrate, max_heartrate, average_speed, start_date, activity_streams, type, sport_type')
    .eq('id', activityId)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error(`[SegmentPipeline] Error fetching activity:`, error.message);
    return null;
  }

  return data;
}

async function fetchUserFTP(supabase, userId) {
  const { data } = await supabase
    .from('user_profiles')
    .select('ftp')
    .eq('user_id', userId)
    .single();

  return data?.ftp || 0;
}

async function markAnalyzed(supabase, activityId) {
  await supabase
    .from('activities')
    .update({ training_segments_analyzed_at: new Date().toISOString() })
    .eq('id', activityId);
}

// ============================================================================
// SEGMENT DETECTION (inline, since we can't import TS in serverless)
// ============================================================================

/**
 * Detect segments from activity stream data.
 * This is the server-side version of the detection algorithm.
 */
function detectSegmentsFromStreams(streams) {
  const { coords, elevation, speed, power, heartRate, cadence } = streams;
  if (!coords || coords.length < 10) {
    return { segments: [], stops: [] };
  }

  // Build enriched point array
  const points = [];
  let cumDist = 0;
  let cumTime = 0;

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];

    if (i > 0) {
      const dist = haversineMeters(
        points[i - 1].lat, points[i - 1].lng,
        lat, lng
      );
      cumDist += dist;
      const spd = speed?.[i] ?? speed?.[i - 1] ?? 5;
      cumTime += spd > 0.1 ? dist / spd : dist / 1.4;
    }

    points.push({
      lat, lng,
      elevation: elevation?.[i] ?? 0,
      speed: speed?.[i] ?? 0,
      power: power?.[i] ?? 0,
      heartRate: heartRate?.[i] ?? 0,
      cadence: cadence?.[i] ?? 0,
      distance: cumDist,
      timestamp: cumTime,
    });
  }

  // Smooth elevation
  smoothElevation(points);

  // Detect stops
  const stops = detectStops(points);

  // Calculate gradients
  const gradients = calculateGradients(points);

  // Find boundaries
  const boundaries = findBoundaries(points, gradients, stops);

  // Build and characterize segments
  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startIdx = boundaries[i];
    const endIdx = boundaries[i + 1];
    const dist = points[endIdx].distance - points[startIdx].distance;

    if (dist < 500) continue; // min 500m

    const seg = characterizeSegment(points, startIdx, endIdx, stops);
    if (seg) segments.push(seg);
  }

  return { segments, stops };
}

function smoothElevation(points) {
  const window = 5;
  const half = Math.floor(window / 2);
  const smoothed = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
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

function detectStops(points) {
  const stops = [];
  let stopStart = -1;

  for (let i = 0; i < points.length; i++) {
    const isStopped = points[i].speed < 0.6; // ~2 km/h

    if (isStopped && stopStart === -1) {
      stopStart = i;
    } else if (!isStopped && stopStart !== -1) {
      const duration = points[i].timestamp - points[stopStart].timestamp;
      if (duration >= 3) {
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

  return stops;
}

function calculateGradients(points) {
  const gradients = new Array(points.length).fill(0);
  const window = 100; // meters

  for (let i = 0; i < points.length; i++) {
    let lookBack = i;
    let lookForward = i;

    while (lookBack > 0 && points[i].distance - points[lookBack].distance < window / 2) lookBack--;
    while (lookForward < points.length - 1 && points[lookForward].distance - points[i].distance < window / 2) lookForward++;

    const distDiff = points[lookForward].distance - points[lookBack].distance;
    const elevDiff = points[lookForward].elevation - points[lookBack].elevation;

    if (distDiff > 10) gradients[i] = (elevDiff / distDiff) * 100;
  }

  return gradients;
}

function findBoundaries(points, gradients, stops) {
  const boundaries = [0]; // always start

  let prevAvgGrad = 0;
  let sustainedDist = 0;

  for (let i = 1; i < points.length; i++) {
    const distStep = points[i].distance - points[i - 1].distance;
    const gradDiff = Math.abs(gradients[i] - prevAvgGrad);

    if (gradDiff >= 3) { // 3% change threshold
      sustainedDist += distStep;
      if (sustainedDist >= 200) { // sustained for 200m
        const boundaryIdx = Math.max(0, i - Math.ceil(sustainedDist / Math.max(distStep, 1)));
        if (boundaryIdx > boundaries[boundaries.length - 1] + 5) {
          boundaries.push(boundaryIdx);
        }
        prevAvgGrad = gradients[i];
        sustainedDist = 0;
      }
    } else {
      prevAvgGrad = prevAvgGrad * 0.9 + gradients[i] * 0.1;
      sustainedDist = 0;
    }
  }

  // Extended stops as boundaries
  for (const stop of stops) {
    if (stop.durationSeconds >= 30) {
      const idx = stop.pointIndex;
      // Don't add if too close to existing boundary
      const tooClose = boundaries.some(b => Math.abs(points[idx]?.distance - points[b]?.distance) < 100);
      if (!tooClose) boundaries.push(idx);
    }
  }

  boundaries.push(points.length - 1); // always end
  boundaries.sort((a, b) => a - b);

  // Remove duplicates
  return [...new Set(boundaries)];
}

function characterizeSegment(points, startIdx, endIdx, allStops) {
  const segPoints = points.slice(startIdx, endIdx + 1);
  if (segPoints.length < 3) return null;

  const distMeters = segPoints[segPoints.length - 1].distance - segPoints[0].distance;
  const durSeconds = segPoints[segPoints.length - 1].timestamp - segPoints[0].timestamp;

  // Elevation analysis
  let elevGain = 0;
  let elevLoss = 0;
  const gradSamples = [];

  for (let i = 1; i < segPoints.length; i++) {
    const elevDiff = segPoints[i].elevation - segPoints[i - 1].elevation;
    const distDiff = segPoints[i].distance - segPoints[i - 1].distance;

    if (Math.abs(elevDiff) >= 1) {
      if (elevDiff > 0) elevGain += elevDiff;
      else elevLoss += Math.abs(elevDiff);
    }
    if (distDiff > 5) {
      gradSamples.push((elevDiff / distDiff) * 100);
    }
  }

  const avgGrad = gradSamples.length > 0
    ? gradSamples.reduce((a, b) => a + b, 0) / gradSamples.length : 0;
  const maxGrad = gradSamples.length > 0 ? Math.max(...gradSamples) : 0;
  const minGrad = gradSamples.length > 0 ? Math.min(...gradSamples) : 0;
  const gradVar = stdDev(gradSamples);

  // Terrain classification
  const terrainType = classifyTerrain(avgGrad, gradVar, elevGain, distMeters);

  // Stops within segment
  const segStops = allStops.filter(
    s => s.distance >= segPoints[0].distance && s.distance <= segPoints[segPoints.length - 1].distance
  );

  // Sharp turns
  let sharpTurns = 0;
  for (let i = 1; i < segPoints.length - 1; i++) {
    const b1 = bearing(segPoints[i - 1].lat, segPoints[i - 1].lng, segPoints[i].lat, segPoints[i].lng);
    const b2 = bearing(segPoints[i].lat, segPoints[i].lng, segPoints[i + 1].lat, segPoints[i + 1].lng);
    let diff = Math.abs(b2 - b1);
    if (diff > 180) diff = 360 - diff;
    if (diff >= 45) sharpTurns++;
  }

  // Power stats
  const powerSamples = segPoints.filter(p => p.power > 0).map(p => p.power);
  const avgPower = powerSamples.length > 0
    ? Math.round(powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length) : 0;
  const maxPower = powerSamples.length > 0 ? Math.max(...powerSamples) : 0;

  // HR stats
  const hrSamples = segPoints.filter(p => p.heartRate > 30).map(p => p.heartRate);
  const avgHR = hrSamples.length > 0
    ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) : 0;
  const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples) : 0;

  // Cadence
  const cadSamples = segPoints.filter(p => p.cadence > 0).map(p => p.cadence);
  const avgCadence = cadSamples.length > 0
    ? Math.round(cadSamples.reduce((a, b) => a + b, 0) / cadSamples.length) : 0;

  // Speed
  const speedSamples = segPoints.filter(p => p.speed > 0.5).map(p => p.speed);
  const avgSpeed = speedSamples.length > 0
    ? (speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length) * 3.6 : 0;

  const distKm = distMeters / 1000;

  return {
    startIdx,
    endIdx,
    startLat: segPoints[0].lat,
    startLng: segPoints[0].lng,
    endLat: segPoints[segPoints.length - 1].lat,
    endLng: segPoints[segPoints.length - 1].lng,
    coordinates: segPoints.map(p => [p.lng, p.lat]),
    distanceMeters: Math.round(distMeters),
    avgGradient: round2(avgGrad),
    maxGradient: round2(maxGrad),
    minGradient: round2(minGrad),
    gradientVariability: round2(gradVar),
    elevationGain: round1(elevGain),
    elevationLoss: round1(elevLoss),
    terrainType,
    durationSeconds: Math.round(durSeconds),
    avgSpeedKmh: round1(avgSpeed),
    avgPower,
    maxPower,
    normalizedPower: avgPower, // simplified for server-side
    avgHR,
    maxHR,
    avgCadence,
    stops: segStops,
    stopCount: segStops.length,
    stopsPerKm: distKm > 0 ? round2(segStops.length / distKm) : 0,
    sharpTurnCount: sharpTurns,
    qualityScore: calculateQuality(distMeters, durSeconds, gradVar, segStops.length, sharpTurns, distKm),
  };
}

// ============================================================================
// SEGMENT PROCESSING (DEDUP + STORE)
// ============================================================================

async function processDetectedSegment(supabase, segment, activityId, userId, activity, ftp) {
  // Try to find matching existing segment
  const existingMatch = await findMatchingExistingSegment(supabase, userId, segment);

  if (existingMatch) {
    // Update existing segment with this ride's data
    await addRideToSegment(supabase, existingMatch.id, activityId, userId, segment, activity, ftp);
    await updateSegmentMetadata(supabase, existingMatch.id, segment);
    await updateSegmentProfile(supabase, existingMatch.id, ftp);
    return { isNew: false, segmentId: existingMatch.id };
  }

  // Create new segment
  const newSegmentId = await createNewSegment(supabase, userId, segment);
  await addRideToSegment(supabase, newSegmentId, activityId, userId, segment, activity, ftp);
  await createSegmentProfile(supabase, newSegmentId);
  return { isNew: true, segmentId: newSegmentId };
}

async function findMatchingExistingSegment(supabase, userId, segment) {
  // Bounding box query for nearby segments
  const expansion = CONFIG.MATCH_BBOX_EXPANSION;
  const allLats = segment.coordinates.map(c => c[1]);
  const allLngs = segment.coordinates.map(c => c[0]);
  const minLat = Math.min(...allLats) - expansion;
  const maxLat = Math.max(...allLats) + expansion;
  const minLng = Math.min(...allLngs) - expansion;
  const maxLng = Math.max(...allLngs) + expansion;

  const { data: candidates } = await supabase
    .from('training_segments')
    .select('id, start_lat, start_lng, end_lat, end_lng, distance_meters, geojson')
    .eq('user_id', userId)
    .gte('start_lat', minLat)
    .lte('start_lat', maxLat)
    .gte('start_lng', minLng)
    .lte('start_lng', maxLng);

  if (!candidates || candidates.length === 0) return null;

  // Check each candidate for match quality
  let bestMatch = null;
  let bestOverlap = 0;

  for (const candidate of candidates) {
    // Quick distance ratio check
    const distRatio = Math.min(segment.distanceMeters, candidate.distance_meters) /
      Math.max(segment.distanceMeters, candidate.distance_meters);
    if (distRatio < (1 - CONFIG.MATCH_DISTANCE_RATIO)) continue;

    // Start/end proximity check (forward and reverse)
    const startDist = haversineMeters(segment.startLat, segment.startLng, candidate.start_lat, candidate.start_lng);
    const endDist = haversineMeters(segment.endLat, segment.endLng, candidate.end_lat, candidate.end_lng);
    const startDistRev = haversineMeters(segment.startLat, segment.startLng, candidate.end_lat, candidate.end_lng);
    const endDistRev = haversineMeters(segment.endLat, segment.endLng, candidate.start_lat, candidate.start_lng);

    const forwardOk = startDist <= CONFIG.MATCH_START_END_PROXIMITY && endDist <= CONFIG.MATCH_START_END_PROXIMITY;
    const reverseOk = startDistRev <= CONFIG.MATCH_START_END_PROXIMITY && endDistRev <= CONFIG.MATCH_START_END_PROXIMITY;

    if (!forwardOk && !reverseOk) continue;

    // Overlap calculation (sampling-based)
    const existingCoords = candidate.geojson?.coordinates || [];
    const overlap = calculateOverlap(segment.coordinates, existingCoords);

    if (overlap >= CONFIG.MATCH_MIN_OVERLAP && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function calculateOverlap(coordsA, coordsB) {
  if (!coordsA?.length || !coordsB?.length) return 0;

  // Sample points along A at 50m intervals
  const sampledA = samplePath(coordsA, 50);
  const sampledB = samplePath(coordsB, 50);
  if (sampledA.length === 0 || sampledB.length === 0) return 0;

  let matches = 0;
  for (const a of sampledA) {
    for (const b of sampledB) {
      if (haversineMeters(a[1], a[0], b[1], b[0]) <= 50) {
        matches++;
        break;
      }
    }
  }

  return matches / sampledA.length;
}

function samplePath(coords, intervalMeters) {
  if (coords.length < 2) return [];
  const samples = [coords[0]];
  let cumDist = 0;
  let nextDist = intervalMeters;

  for (let i = 1; i < coords.length; i++) {
    const d = haversineMeters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    cumDist += d;
    while (cumDist >= nextDist) {
      const frac = d > 0 ? 1 - (cumDist - nextDist) / d : 0;
      samples.push([
        coords[i - 1][0] + frac * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + frac * (coords[i][1] - coords[i - 1][1]),
      ]);
      nextDist += intervalMeters;
    }
  }

  samples.push(coords[coords.length - 1]);
  return samples;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function createNewSegment(supabase, userId, segment) {
  // Classify topology
  const topology = classifyTopologyFromSegment(segment);

  // Calculate obstruction score
  const obstruction = calculateObstruction(segment);

  // Generate name
  const autoName = generateAutoName(segment);
  const description = generateDescription(segment);

  const { data, error } = await supabase
    .from('training_segments')
    .insert({
      user_id: userId,
      start_lat: segment.startLat,
      start_lng: segment.startLng,
      end_lat: segment.endLat,
      end_lng: segment.endLng,
      geojson: {
        type: 'LineString',
        coordinates: segment.coordinates,
      },
      distance_meters: segment.distanceMeters,
      auto_name: autoName,
      description,
      avg_gradient: segment.avgGradient,
      max_gradient: segment.maxGradient,
      min_gradient: segment.minGradient,
      gradient_variability: segment.gradientVariability,
      elevation_gain_meters: segment.elevationGain,
      elevation_loss_meters: segment.elevationLoss,
      terrain_type: segment.terrainType,
      obstruction_score: obstruction.overall,
      stop_count: segment.stopCount,
      stops_per_km: segment.stopsPerKm,
      traffic_signal_count: 0, // determined later via cross-ride analysis
      sharp_turn_count: segment.sharpTurnCount,
      max_uninterrupted_seconds: obstruction.maxUninterrupted,
      topology: topology.topology,
      is_repeatable: topology.isRepeatable,
      ride_count: 1,
      first_ridden_at: new Date().toISOString(),
      last_ridden_at: new Date().toISOString(),
      confidence_score: 20, // low confidence with 1 ride
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SegmentPipeline] Error creating segment:', error.message);
    throw error;
  }

  return data.id;
}

async function addRideToSegment(supabase, segmentId, activityId, userId, segment, activity, ftp) {
  // Determine power zone
  let powerZone = null;
  if (segment.avgPower > 0 && ftp > 0) {
    powerZone = classifyPowerZone(segment.avgPower, ftp);
  }

  // Determine HR zone
  let hrZone = null;
  if (segment.avgHR > 0 && activity.max_heartrate > 0) {
    hrZone = classifyHRZone(segment.avgHR, activity.max_heartrate);
  }

  const { error } = await supabase
    .from('training_segment_rides')
    .upsert({
      segment_id: segmentId,
      activity_id: activityId,
      user_id: userId,
      ridden_at: activity.start_date || new Date().toISOString(),
      avg_power: segment.avgPower || null,
      normalized_power: segment.normalizedPower || null,
      max_power: segment.maxPower || null,
      power_zone: powerZone,
      avg_hr: segment.avgHR || null,
      max_hr: segment.maxHR || null,
      hr_zone: hrZone,
      duration_seconds: segment.durationSeconds,
      avg_speed: segment.avgSpeedKmh,
      avg_cadence: segment.avgCadence || null,
      stop_count: segment.stopCount,
      stop_duration_seconds: segment.stops?.reduce((sum, s) => sum + s.durationSeconds, 0) || 0,
    }, {
      onConflict: 'segment_id,activity_id',
    });

  if (error) {
    console.error('[SegmentPipeline] Error adding ride to segment:', error.message);
  }
}

async function updateSegmentMetadata(supabase, segmentId, segment) {
  // Increment ride count and update last ridden
  const { error } = await supabase
    .rpc('increment_segment_ride_count', {
      p_segment_id: segmentId,
      p_last_ridden: new Date().toISOString(),
    });

  // Fallback if RPC not available
  if (error) {
    await supabase
      .from('training_segments')
      .update({
        ride_count: supabase.raw('ride_count + 1'),
        last_ridden_at: new Date().toISOString(),
      })
      .eq('id', segmentId);
  }
}

async function createSegmentProfile(supabase, segmentId) {
  const { error } = await supabase
    .from('training_segment_profiles')
    .insert({
      segment_id: segmentId,
      updated_at: new Date().toISOString(),
    });

  if (error && !error.message.includes('duplicate')) {
    console.error('[SegmentPipeline] Error creating profile:', error.message);
  }
}

async function updateSegmentProfile(supabase, segmentId, ftp) {
  // Fetch all rides for this segment
  const { data: rides } = await supabase
    .from('training_segment_rides')
    .select('avg_power, normalized_power, power_zone, avg_hr, hr_zone, avg_cadence, ridden_at')
    .eq('segment_id', segmentId)
    .order('ridden_at', { ascending: false });

  if (!rides || rides.length === 0) return;

  // Calculate aggregate power stats
  const powerRides = rides.filter(r => r.avg_power && r.avg_power > 0);
  const powerValues = powerRides.map(r => r.avg_power);

  const meanPower = powerValues.length > 0
    ? powerValues.reduce((a, b) => a + b, 0) / powerValues.length : null;
  const sdPower = powerValues.length >= 2 ? stdDev(powerValues) : null;

  // Consistency score
  const consistencyScore = meanPower && sdPower !== null
    ? Math.max(0, Math.min(100, Math.round(100 - (sdPower / meanPower) * 200)))
    : 0;

  // Zone distribution
  const zoneDistribution = {};
  const totalZoneRides = powerRides.filter(r => r.power_zone).length;
  if (totalZoneRides > 0) {
    for (const ride of powerRides) {
      if (ride.power_zone) {
        zoneDistribution[ride.power_zone] = (zoneDistribution[ride.power_zone] || 0) + 1;
      }
    }
    for (const zone of Object.keys(zoneDistribution)) {
      zoneDistribution[zone] = round2(zoneDistribution[zone] / totalZoneRides);
    }
  }

  // Most common power zone
  const typicalZone = Object.entries(zoneDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // HR stats
  const hrRides = rides.filter(r => r.avg_hr && r.avg_hr > 30);
  const meanHR = hrRides.length > 0
    ? Math.round(hrRides.reduce((sum, r) => sum + r.avg_hr, 0) / hrRides.length) : null;
  const typicalHRZone = hrRides.filter(r => r.hr_zone).length > 0
    ? hrRides.map(r => r.hr_zone).sort((a, b) =>
        hrRides.filter(r => r.hr_zone === b).length -
        hrRides.filter(r => r.hr_zone === a).length
      )[0]
    : null;

  // Cadence
  const cadRides = rides.filter(r => r.avg_cadence && r.avg_cadence > 0);
  const meanCadence = cadRides.length > 0
    ? Math.round(cadRides.reduce((sum, r) => sum + r.avg_cadence, 0) / cadRides.length) : null;

  // Frequency analysis
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const ridesLast30 = rides.filter(r => new Date(r.ridden_at) >= thirtyDaysAgo).length;
  const ridesLast90 = rides.filter(r => new Date(r.ridden_at) >= ninetyDaysAgo).length;

  // Calculate rides per month (over last 90 days or total span)
  const firstRide = new Date(rides[rides.length - 1].ridden_at);
  const monthsSpan = Math.max(1, (now - firstRide) / (30 * 24 * 60 * 60 * 1000));
  const ridesPerMonth = round1(rides.length / monthsSpan);

  // Frequency tier
  let frequencyTier = 'rare';
  if (ridesPerMonth >= 4) frequencyTier = 'primary';
  else if (ridesPerMonth >= 2) frequencyTier = 'regular';
  else if (ridesPerMonth >= 1) frequencyTier = 'occasional';

  // Relevance score
  const baseScore = Math.min(50, rides.length * 5);
  const recencyScore = rides.length > 0 ? (ridesLast30 / rides.length) * 30 : 0;
  const freqScore = Math.min(20, ridesPerMonth * 10);
  const relevanceScore = Math.min(100, Math.round(baseScore + recencyScore + freqScore));

  // Typical days of week
  const dayCounts = {};
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const ride of rides) {
    const day = dayNames[new Date(ride.ridden_at).getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const typicalDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day);

  // Training suitability flags
  const { data: segmentData } = await supabase
    .from('training_segments')
    .select('obstruction_score, max_uninterrupted_seconds, terrain_type')
    .eq('id', segmentId)
    .single();

  const obs = segmentData?.obstruction_score || 0;
  const maxUnint = segmentData?.max_uninterrupted_seconds || 0;
  const terrain = segmentData?.terrain_type || 'flat';

  // Update profile
  await supabase
    .from('training_segment_profiles')
    .upsert({
      segment_id: segmentId,
      mean_avg_power: meanPower ? round1(meanPower) : null,
      std_dev_power: sdPower !== null ? round1(sdPower) : null,
      min_avg_power: powerValues.length > 0 ? round1(Math.min(...powerValues)) : null,
      max_avg_power: powerValues.length > 0 ? round1(Math.max(...powerValues)) : null,
      mean_normalized_power: meanPower ? round1(meanPower * 1.02) : null, // approximate
      typical_power_zone: typicalZone,
      zone_distribution: zoneDistribution,
      consistency_score: consistencyScore,
      mean_avg_hr: meanHR,
      typical_hr_zone: typicalHRZone,
      mean_cadence: meanCadence,
      suitable_for_steady_state: obs >= 75 && maxUnint >= 300,
      suitable_for_short_intervals: obs >= 60 && maxUnint >= 60,
      suitable_for_sprints: obs >= 50 && maxUnint >= 15,
      suitable_for_recovery: terrain === 'flat' || terrain === 'descent',
      rides_last_30_days: ridesLast30,
      rides_last_90_days: ridesLast90,
      avg_rides_per_month: ridesPerMonth,
      frequency_tier: frequencyTier,
      typical_days: typicalDays,
      relevance_score: relevanceScore,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'segment_id',
    });

  // Update confidence score on main segment
  const lastRidden = rides[0]?.ridden_at ? new Date(rides[0].ridden_at) : null;
  const daysSince = lastRidden ? (now - lastRidden) / (86400000) : 999;

  let confidence = rides.length >= 15 ? 95 : rides.length >= 8 ? 85 : rides.length >= 5 ? 70
    : rides.length >= 3 ? 50 : rides.length >= 2 ? 35 : 20;
  if (daysSince < 14) confidence += 5;
  else if (daysSince >= 30 && daysSince < 90) confidence -= 10;
  else if (daysSince >= 90) confidence -= 20;
  confidence = Math.max(0, Math.min(100, confidence));

  await supabase
    .from('training_segments')
    .update({
      confidence_score: confidence,
      ride_count: rides.length,
    })
    .eq('id', segmentId);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function classifyTerrain(avgGrad, gradVar, elevGain, distMeters) {
  const absGrad = Math.abs(avgGrad);
  const elevPerKm = distMeters > 0 ? (elevGain / (distMeters / 1000)) : 0;

  if (gradVar > 3 && absGrad < 4) return 'rolling';
  if (avgGrad >= 4 || elevPerKm > 30) return 'climb';
  if (avgGrad <= -4) return 'descent';
  if (absGrad < 2 && gradVar < 2) return 'flat';
  return 'rolling';
}

function classifyTopologyFromSegment(segment) {
  const startEndDist = haversineMeters(
    segment.startLat, segment.startLng,
    segment.endLat, segment.endLng
  );

  if (startEndDist < 200) return { topology: 'loop', isRepeatable: true };
  if (startEndDist < 500 && segment.coordinates.length > 4) {
    const midIdx = Math.floor(segment.coordinates.length / 2);
    const mid = segment.coordinates[midIdx];
    const midToStart = haversineMeters(mid[1], mid[0], segment.startLat, segment.startLng);
    if (midToStart > startEndDist * 1.5) {
      return { topology: 'out_and_back', isRepeatable: true };
    }
  }
  return { topology: 'point_to_point', isRepeatable: false };
}

function calculateObstruction(segment) {
  const distKm = segment.distanceMeters / 1000;
  const stopFreq = Math.max(0, Math.min(100, Math.round(100 - (segment.stopsPerKm * 30))));
  const turnsPerKm = distKm > 0 ? segment.sharpTurnCount / distKm : 0;
  const turnScore = Math.max(0, Math.min(100, Math.round(100 - turnsPerKm * 20)));
  const surfScore = Math.max(0, Math.min(100, Math.round(100 - segment.gradientVariability * 5)));
  const overall = Math.round(stopFreq * 0.4 + turnScore * 0.25 + surfScore * 0.35);

  // Estimate max uninterrupted time
  let maxUninterrupted = segment.durationSeconds;
  if (segment.stopCount > 0 && segment.durationSeconds > 0) {
    const avgSpeed = segment.distanceMeters / segment.durationSeconds;
    if (avgSpeed > 0) {
      // Rough: divide distance equally between stops
      const gapDist = segment.distanceMeters / (segment.stopCount + 1);
      maxUninterrupted = Math.round(gapDist / avgSpeed);
    }
  }

  return { overall, maxUninterrupted };
}

function generateAutoName(segment) {
  const suffix = segment.terrainType === 'climb' ? 'Climb'
    : segment.terrainType === 'descent' ? 'Descent'
    : segment.terrainType === 'rolling' ? 'Rolling'
    : 'Flat';
  const distKm = (segment.distanceMeters / 1000).toFixed(1);
  const durMin = Math.round(segment.durationSeconds / 60);

  if (segment.terrainType === 'climb') {
    return `${durMin} min ${suffix} ${segment.avgGradient.toFixed(1)}%`;
  }
  return `${suffix} ${distKm}km`;
}

function generateDescription(segment) {
  const parts = [];
  const duration = segment.durationSeconds < 60
    ? `${Math.round(segment.durationSeconds)}s`
    : `${Math.round(segment.durationSeconds / 60)} min`;

  const terrainDesc = segment.terrainType === 'climb'
    ? (segment.avgGradient >= 8 ? 'steep climb' : segment.avgGradient >= 5 ? 'sustained climb' : 'gradual climb')
    : segment.terrainType;

  parts.push(`${duration} ${terrainDesc}`);
  if (segment.terrainType === 'climb' || segment.terrainType === 'rolling') {
    parts.push(`${segment.avgGradient.toFixed(1)}% avg`);
  }
  parts.push(segment.stopCount === 0 ? 'no stops' : `${segment.stopCount} stop${segment.stopCount > 1 ? 's' : ''}`);
  return parts.join(', ');
}

function classifyPowerZone(avgPower, ftp) {
  if (ftp <= 0 || avgPower <= 0) return null;
  const ratio = avgPower / ftp;
  for (const [zone, [min, max]] of Object.entries(CONFIG.POWER_ZONES)) {
    if (ratio >= min && ratio < max) return zone;
  }
  return 'anaerobic';
}

function classifyHRZone(avgHR, maxHR) {
  if (maxHR <= 0 || avgHR <= 0) return null;
  const ratio = avgHR / maxHR;
  for (const [zone, [min, max]] of Object.entries(CONFIG.HR_ZONES)) {
    if (ratio >= min && ratio < max) return zone;
  }
  return 'anaerobic';
}

function calculateQuality(distM, durS, gradVar, stops, turns, distKm) {
  let score = 100;
  if (distM < 1000) score -= 15;
  else if (distM < 2000) score -= 5;
  if (durS < 180) score -= 15;
  else if (durS < 300) score -= 5;
  if (gradVar > 5) score -= 20;
  else if (gradVar > 3) score -= 10;
  const sPerKm = distKm > 0 ? stops / distKm : 0;
  if (sPerKm > 2) score -= 25;
  else if (sPerKm > 1) score -= 15;
  else if (sPerKm > 0.5) score -= 5;
  const tPerKm = distKm > 0 ? turns / distKm : 0;
  if (tPerKm > 3) score -= 15;
  else if (tPerKm > 1) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================================
// MATH HELPERS
// ============================================================================

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
