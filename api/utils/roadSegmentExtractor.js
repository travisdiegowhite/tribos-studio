/**
 * Road Segment Extractor
 * Extracts discrete road segments from activity polylines for preference-based routing
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Segment length targets (in meters)
  MIN_SEGMENT_LENGTH: 50,     // Minimum segment length to store
  TARGET_SEGMENT_LENGTH: 200, // Target segment length for consistent granularity
  MAX_SEGMENT_LENGTH: 500,    // Maximum segment length before splitting

  // Coordinate precision for hashing (8 decimal places = ~1mm precision)
  COORD_PRECISION: 8,

  // Simplification tolerance (in degrees, ~11m at equator)
  SIMPLIFICATION_TOLERANCE: 0.0001,

  // Mapbox Map Matching API (optional, for OSM enrichment)
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN,
};

// ============================================================================
// POLYLINE DECODER
// ============================================================================

/**
 * Decode Google-encoded polyline to coordinates
 * @param {string} encoded - Google-encoded polyline string
 * @returns {Array<{lat: number, lng: number}>} Array of coordinates
 */
export function decodePolyline(encoded) {
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

    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coords;
}

// ============================================================================
// GEO UTILITIES
// ============================================================================

/**
 * Calculate haversine distance between two points (in meters)
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate bearing between two points (in degrees, 0-360)
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Round coordinate to specified precision
 */
function roundCoord(value, precision = CONFIG.COORD_PRECISION) {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Create a unique hash for a segment based on its start and end coordinates
 * Coordinates are rounded to ensure consistent matching
 */
export function createSegmentHash(startLat, startLng, endLat, endLng) {
  const roundedStart = `${roundCoord(startLat)},${roundCoord(startLng)}`;
  const roundedEnd = `${roundCoord(endLat)},${roundCoord(endLng)}`;

  // Sort to ensure same segment in either direction has same hash
  // (Optional: remove this if you want directional segments)
  const [first, second] = [roundedStart, roundedEnd].sort();

  return crypto
    .createHash('sha256')
    .update(`${first}|${second}`)
    .digest('hex')
    .substring(0, 16); // 16 char hex = 64 bits, plenty for uniqueness
}

// ============================================================================
// TRACK SIMPLIFICATION
// ============================================================================

/**
 * Perpendicular distance from point to line segment
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  const lineLengthSquared = dx * dx + dy * dy;

  if (lineLengthSquared === 0) {
    return haversineDistance(point.lat, point.lng, lineStart.lat, lineStart.lng);
  }

  // Project point onto line
  let t = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / lineLengthSquared;
  t = Math.max(0, Math.min(1, t));

  const projLng = lineStart.lng + t * dx;
  const projLat = lineStart.lat + t * dy;

  // Return distance in degrees (approximate)
  return Math.sqrt(
    Math.pow(point.lat - projLat, 2) +
    Math.pow(point.lng - projLng, 2)
  );
}

/**
 * Ramer-Douglas-Peucker algorithm for track simplification
 */
export function simplifyTrack(points, tolerance = CONFIG.SIMPLIFICATION_TOLERANCE) {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyTrack(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyTrack(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

// ============================================================================
// SEGMENT EXTRACTION
// ============================================================================

/**
 * Extract road segments from a polyline
 * @param {string} polyline - Google-encoded polyline
 * @param {Object} options - Extraction options
 * @returns {Array<ExtractedSegment>} Array of extracted segments
 */
export function extractSegmentsFromPolyline(polyline, options = {}) {
  const {
    minLength = CONFIG.MIN_SEGMENT_LENGTH,
    targetLength = CONFIG.TARGET_SEGMENT_LENGTH,
    maxLength = CONFIG.MAX_SEGMENT_LENGTH,
  } = options;

  // Decode polyline
  const coords = decodePolyline(polyline);
  if (coords.length < 2) return [];

  // Simplify track to reduce noise while preserving shape
  const simplified = simplifyTrack(coords);
  if (simplified.length < 2) return [];

  const segments = [];
  let segmentStart = simplified[0];
  let segmentStartIndex = 0;
  let accumulatedDistance = 0;

  for (let i = 1; i < simplified.length; i++) {
    const current = simplified[i];
    const distToPoint = haversineDistance(
      simplified[i - 1].lat, simplified[i - 1].lng,
      current.lat, current.lng
    );
    accumulatedDistance += distToPoint;

    // Check if we should create a segment
    const shouldSplit = accumulatedDistance >= targetLength ||
                        i === simplified.length - 1;

    if (shouldSplit && accumulatedDistance >= minLength) {
      const bearing = calculateBearing(
        segmentStart.lat, segmentStart.lng,
        current.lat, current.lng
      );

      segments.push({
        startLat: roundCoord(segmentStart.lat),
        startLng: roundCoord(segmentStart.lng),
        endLat: roundCoord(current.lat),
        endLng: roundCoord(current.lng),
        segmentHash: createSegmentHash(
          segmentStart.lat, segmentStart.lng,
          current.lat, current.lng
        ),
        lengthM: Math.round(accumulatedDistance),
        bearing: Math.round(bearing),
        pointsInSegment: i - segmentStartIndex + 1,
      });

      // Start new segment
      segmentStart = current;
      segmentStartIndex = i;
      accumulatedDistance = 0;
    }
  }

  return segments;
}

/**
 * Extract segments from an activity and store in database
 * @param {string} activityId - Activity UUID
 * @param {string} userId - User UUID
 * @param {Object} options - Additional options
 * @returns {Promise<{extracted: number, stored: number, errors: string[]}>}
 */
export async function extractAndStoreActivitySegments(activityId, userId, options = {}) {
  const { activityDate = new Date(), speedData = null } = options;

  const result = {
    extracted: 0,
    stored: 0,
    errors: [],
  };

  try {
    // Fetch activity polyline
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select('map_summary_polyline, start_date, moving_time, distance')
      .eq('id', activityId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      result.errors.push(`Failed to fetch activity: ${fetchError.message}`);
      return result;
    }

    if (!activity?.map_summary_polyline) {
      result.errors.push('Activity has no GPS data');
      return result;
    }

    // Extract segments
    const segments = extractSegmentsFromPolyline(activity.map_summary_polyline);
    result.extracted = segments.length;

    if (segments.length === 0) {
      result.errors.push('No segments extracted (track too short?)');
      return result;
    }

    // Calculate average speed if we have activity data
    let avgSpeedMs = null;
    if (activity.moving_time > 0 && activity.distance > 0) {
      avgSpeedMs = activity.distance / activity.moving_time;
    }

    // Store each segment
    const activityDateTs = activity.start_date || activityDate;

    for (const segment of segments) {
      try {
        // Calculate segment time based on length proportion
        const segmentTimeS = avgSpeedMs && segment.lengthM
          ? Math.round(segment.lengthM / avgSpeedMs)
          : null;

        const { error: upsertError } = await supabase.rpc('upsert_user_road_segment', {
          p_user_id: userId,
          p_segment_hash: segment.segmentHash,
          p_start_lat: segment.startLat,
          p_start_lng: segment.startLng,
          p_end_lat: segment.endLat,
          p_end_lng: segment.endLng,
          p_segment_length_m: segment.lengthM,
          p_bearing: segment.bearing,
          p_speed_ms: avgSpeedMs,
          p_time_s: segmentTimeS,
          p_activity_date: activityDateTs,
        });

        if (upsertError) {
          result.errors.push(`Segment ${segment.segmentHash}: ${upsertError.message}`);
        } else {
          result.stored++;
        }
      } catch (segmentError) {
        result.errors.push(`Segment error: ${segmentError.message}`);
      }
    }

    // Mark activity as processed
    const { error: updateError } = await supabase
      .from('activities')
      .update({ segments_extracted_at: new Date().toISOString() })
      .eq('id', activityId);

    if (updateError) {
      result.errors.push(`Failed to mark activity as processed: ${updateError.message}`);
    }

  } catch (error) {
    result.errors.push(`Extraction failed: ${error.message}`);
  }

  return result;
}

/**
 * Extract segments from multiple activities (batch processing)
 * @param {string} userId - User UUID
 * @param {Object} options - Processing options
 * @returns {Promise<{processed: number, segments: number, errors: string[]}>}
 */
export async function extractSegmentsForUser(userId, options = {}) {
  const {
    limit = 50,
    includeProcessed = false,
    beforeDate = null,
    afterDate = null,
  } = options;

  const result = {
    processed: 0,
    segments: 0,
    errors: [],
    remaining: 0,
  };

  try {
    // Build query for unprocessed activities
    let query = supabase
      .from('activities')
      .select('id, start_date, moving_time, distance')
      .eq('user_id', userId)
      .not('map_summary_polyline', 'is', null)
      .order('start_date', { ascending: false })
      .limit(limit);

    if (!includeProcessed) {
      query = query.is('segments_extracted_at', null);
    }

    if (beforeDate) {
      query = query.lt('start_date', beforeDate);
    }

    if (afterDate) {
      query = query.gt('start_date', afterDate);
    }

    const { data: activities, error: fetchError } = await query;

    if (fetchError) {
      result.errors.push(`Failed to fetch activities: ${fetchError.message}`);
      return result;
    }

    if (!activities || activities.length === 0) {
      return result;
    }

    // Count remaining unprocessed
    const { count: remainingCount } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('map_summary_polyline', 'is', null)
      .is('segments_extracted_at', null);

    result.remaining = (remainingCount || 0) - activities.length;

    // Process each activity
    for (const activity of activities) {
      const extractResult = await extractAndStoreActivitySegments(
        activity.id,
        userId,
        { activityDate: activity.start_date }
      );

      result.processed++;
      result.segments += extractResult.stored;

      if (extractResult.errors.length > 0) {
        result.errors.push(...extractResult.errors.map(e => `Activity ${activity.id}: ${e}`));
      }
    }

  } catch (error) {
    result.errors.push(`Batch extraction failed: ${error.message}`);
  }

  return result;
}

// ============================================================================
// PREFERENCE SCORING
// ============================================================================

/**
 * Calculate preference score for a segment based on ride history
 * @param {number} rideCount - Number of times segment was ridden
 * @param {Date} lastRidden - When segment was last ridden
 * @param {Object} userPrefs - User's preference settings
 * @returns {number} Preference score multiplier (1.0 = neutral)
 */
export function calculatePreferenceScore(rideCount, lastRidden, userPrefs = {}) {
  const {
    familiarityStrength = 50,
    minRidesForFamiliar = 2,
    recencyWeight = 30,
    familiarityDecayDays = 180,
  } = userPrefs;

  if (rideCount === 0) return 1.0;

  // Base score from ride count (1.0 to 1.5)
  let baseScore;
  if (rideCount === 1) baseScore = 1.1;
  else if (rideCount <= 3) baseScore = 1.2 + (rideCount - 1) * 0.05;
  else if (rideCount <= 5) baseScore = 1.3 + (rideCount - 3) * 0.025;
  else if (rideCount <= 10) baseScore = 1.35 + (rideCount - 5) * 0.03;
  else baseScore = 1.5;

  // Apply familiarity strength (0 = ignore, 100 = full effect)
  const strengthMultiplier = familiarityStrength / 100;
  const adjustedScore = 1.0 + (baseScore - 1.0) * strengthMultiplier;

  // Apply recency decay if enabled
  if (familiarityDecayDays > 0 && lastRidden) {
    const daysSinceRidden = (Date.now() - new Date(lastRidden).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRidden > familiarityDecayDays) {
      const decayFactor = Math.max(0.5, 1.0 - (daysSinceRidden - familiarityDecayDays) / familiarityDecayDays);
      return 1.0 + (adjustedScore - 1.0) * decayFactor;
    }
  }

  return adjustedScore;
}

/**
 * Get confidence level based on ride count
 */
export function getConfidenceLevel(rideCount) {
  if (rideCount >= 5) return 'high';
  if (rideCount >= 2) return 'medium';
  if (rideCount === 1) return 'low';
  return 'unknown';
}

// ============================================================================
// ROUTE SEGMENT MATCHING
// ============================================================================

/**
 * Extract segment hashes from a route polyline for preference lookup
 * @param {string} polyline - Route polyline
 * @returns {string[]} Array of segment hashes
 */
export function getRouteSegmentHashes(polyline) {
  const segments = extractSegmentsFromPolyline(polyline);
  return segments.map(s => s.segmentHash);
}

/**
 * Score a route based on user's segment preferences
 * @param {string} polyline - Route polyline
 * @param {string} userId - User UUID
 * @returns {Promise<RoutePreferenceScore>}
 */
export async function scoreRoutePreferences(polyline, userId) {
  // Extract segments from route
  const routeSegments = extractSegmentsFromPolyline(polyline);

  if (routeSegments.length === 0) {
    return {
      overallScore: 1.0,
      familiarSegments: 0,
      unknownSegments: 0,
      totalSegments: 0,
      familiarKm: 0,
      unknownKm: 0,
      confidence: 'unknown',
    };
  }

  const segmentHashes = routeSegments.map(s => s.segmentHash);

  // Fetch user's preferences for these segments
  const { data: preferences, error } = await supabase.rpc('get_segment_preferences', {
    p_user_id: userId,
    p_segment_hashes: segmentHashes,
  });

  if (error) {
    console.error('Failed to fetch preferences:', error);
    return {
      overallScore: 1.0,
      familiarSegments: 0,
      unknownSegments: routeSegments.length,
      totalSegments: routeSegments.length,
      confidence: 'unknown',
      error: error.message,
    };
  }

  const prefMap = new Map(preferences?.map(p => [p.segment_hash, p]) || []);

  // Calculate scores
  let totalScore = 0;
  let familiarKm = 0;
  let unknownKm = 0;
  let familiarCount = 0;

  for (const segment of routeSegments) {
    const pref = prefMap.get(segment.segmentHash);
    const segmentKm = segment.lengthM / 1000;

    if (pref && pref.ride_count > 0) {
      totalScore += pref.preference_score * segmentKm;
      familiarKm += segmentKm;
      familiarCount++;
    } else {
      totalScore += 1.0 * segmentKm; // Neutral score for unknown
      unknownKm += segmentKm;
    }
  }

  const totalKm = familiarKm + unknownKm;
  const overallScore = totalKm > 0 ? totalScore / totalKm : 1.0;

  // Confidence based on how much of the route is known
  const familiarRatio = totalKm > 0 ? familiarKm / totalKm : 0;
  let confidence;
  if (familiarRatio >= 0.7) confidence = 'high';
  else if (familiarRatio >= 0.4) confidence = 'medium';
  else if (familiarRatio > 0) confidence = 'low';
  else confidence = 'unknown';

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    familiarSegments: familiarCount,
    unknownSegments: routeSegments.length - familiarCount,
    totalSegments: routeSegments.length,
    familiarKm: Math.round(familiarKm * 10) / 10,
    unknownKm: Math.round(unknownKm * 10) / 10,
    confidence,
    familiarRatio: Math.round(familiarRatio * 100),
  };
}

export default {
  decodePolyline,
  extractSegmentsFromPolyline,
  extractAndStoreActivitySegments,
  extractSegmentsForUser,
  calculatePreferenceScore,
  getConfidenceLevel,
  scoreRoutePreferences,
  getRouteSegmentHashes,
  haversineDistance,
  calculateBearing,
  createSegmentHash,
};
