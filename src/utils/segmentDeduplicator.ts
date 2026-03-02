/**
 * Segment Deduplicator
 *
 * Matches detected segments across different rides using GPS proximity.
 * Segments from different rides that overlap > 80% are considered the same segment.
 * Builds a persistent library that grows richer with every ride.
 */

import type { DetectedSegment } from './segmentDetector';

// ============================================================================
// TYPES
// ============================================================================

export interface StoredSegment {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceMeters: number;
  coordinates: [number, number][];  // [lng, lat]
}

export interface SegmentMatch {
  existingSegmentId: string;
  overlapRatio: number;        // 0-1, how much the new segment overlaps the existing one
  distanceRatio: number;       // ratio of distances (closer to 1 = more similar length)
  startProximityMeters: number;
  endProximityMeters: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Proximity thresholds for matching start/end points
  START_END_PROXIMITY: 200,     // meters — max distance between start/end points to consider match

  // Overlap threshold for considering two segments as "the same"
  MIN_OVERLAP_RATIO: 0.60,     // 60% overlap required

  // Distance ratio — segments must be similar length
  MAX_DISTANCE_RATIO_DIFF: 0.40, // within 40% distance

  // Spatial query bounding box expansion (degrees)
  BBOX_EXPANSION: 0.005,       // ~500m at mid-latitudes

  // Sampling interval for overlap calculation (meters)
  OVERLAP_SAMPLE_INTERVAL: 50, // check every 50m along the segment
  OVERLAP_PROXIMITY: 50,       // meters — points within 50m are considered overlapping
};

// ============================================================================
// MAIN MATCHING FUNCTION
// ============================================================================

/**
 * Find existing segments that match a newly detected segment.
 * Returns matches sorted by overlap quality (best first).
 */
export function findMatchingSegments(
  newSegment: DetectedSegment,
  existingSegments: StoredSegment[]
): SegmentMatch[] {
  const matches: SegmentMatch[] = [];

  for (const existing of existingSegments) {
    const match = calculateMatch(newSegment, existing);
    if (match) {
      matches.push(match);
    }
  }

  // Sort by overlap ratio (best match first)
  matches.sort((a, b) => b.overlapRatio - a.overlapRatio);
  return matches;
}

/**
 * Check if a new segment matches an existing one.
 * Uses a multi-stage filtering approach for efficiency.
 */
function calculateMatch(
  newSeg: DetectedSegment,
  existing: StoredSegment
): SegmentMatch | null {
  // Stage 1: Quick distance ratio check
  const distanceRatio = Math.min(newSeg.distanceMeters, existing.distanceMeters) /
    Math.max(newSeg.distanceMeters, existing.distanceMeters);
  if (distanceRatio < (1 - CONFIG.MAX_DISTANCE_RATIO_DIFF)) return null;

  // Stage 2: Start/end proximity check
  const startDist = haversineMeters(
    newSeg.startLat, newSeg.startLng,
    existing.startLat, existing.startLng
  );
  const endDist = haversineMeters(
    newSeg.endLat, newSeg.endLng,
    existing.endLat, existing.endLng
  );

  // Also check reverse direction (segment ridden in opposite direction)
  const startDistRev = haversineMeters(
    newSeg.startLat, newSeg.startLng,
    existing.endLat, existing.endLng
  );
  const endDistRev = haversineMeters(
    newSeg.endLat, newSeg.endLng,
    existing.startLat, existing.startLng
  );

  const forwardMatch = startDist <= CONFIG.START_END_PROXIMITY && endDist <= CONFIG.START_END_PROXIMITY;
  const reverseMatch = startDistRev <= CONFIG.START_END_PROXIMITY && endDistRev <= CONFIG.START_END_PROXIMITY;

  if (!forwardMatch && !reverseMatch) return null;

  const bestStartDist = forwardMatch ? startDist : startDistRev;
  const bestEndDist = forwardMatch ? endDist : endDistRev;

  // Stage 3: Detailed overlap calculation (sample-based)
  const overlapRatio = calculateOverlapRatio(
    newSeg.coordinates,
    existing.coordinates
  );

  if (overlapRatio < CONFIG.MIN_OVERLAP_RATIO) return null;

  return {
    existingSegmentId: existing.id,
    overlapRatio,
    distanceRatio,
    startProximityMeters: Math.round(bestStartDist),
    endProximityMeters: Math.round(bestEndDist),
  };
}

// ============================================================================
// OVERLAP CALCULATION
// ============================================================================

/**
 * Calculate what fraction of segment A is covered by segment B.
 * Samples points along A at regular intervals and checks proximity to B.
 */
function calculateOverlapRatio(
  coordsA: [number, number][],
  coordsB: [number, number][]
): number {
  if (coordsA.length < 2 || coordsB.length < 2) return 0;

  // Sample points along segment A
  const sampledA = sampleAlongPath(coordsA, CONFIG.OVERLAP_SAMPLE_INTERVAL);
  if (sampledA.length === 0) return 0;

  // Build a simple spatial index for segment B points
  const bPoints = sampleAlongPath(coordsB, CONFIG.OVERLAP_SAMPLE_INTERVAL);
  if (bPoints.length === 0) return 0;

  // For each sampled point on A, check if it's near any point on B
  let matchCount = 0;

  for (const pointA of sampledA) {
    for (const pointB of bPoints) {
      const dist = haversineMeters(
        pointA.lat, pointA.lng,
        pointB.lat, pointB.lng
      );
      if (dist <= CONFIG.OVERLAP_PROXIMITY) {
        matchCount++;
        break; // found a match, move to next A point
      }
    }
  }

  return matchCount / sampledA.length;
}

interface SampledPoint {
  lat: number;
  lng: number;
}

/**
 * Sample points along a coordinate path at regular distance intervals.
 */
function sampleAlongPath(
  coords: [number, number][],
  intervalMeters: number
): SampledPoint[] {
  if (coords.length < 2) return [];

  const samples: SampledPoint[] = [];
  let cumDistance = 0;
  let nextSampleDist = 0;

  // Always include first point
  samples.push({ lat: coords[0][1], lng: coords[0][0] });
  nextSampleDist = intervalMeters;

  for (let i = 1; i < coords.length; i++) {
    const segDist = haversineMeters(
      coords[i - 1][1], coords[i - 1][0],
      coords[i][1], coords[i][0]
    );
    cumDistance += segDist;

    while (cumDistance >= nextSampleDist) {
      // Interpolate position at nextSampleDist
      const overshoot = cumDistance - nextSampleDist;
      const fraction = segDist > 0 ? 1 - (overshoot / segDist) : 0;

      const lat = coords[i - 1][1] + fraction * (coords[i][1] - coords[i - 1][1]);
      const lng = coords[i - 1][0] + fraction * (coords[i][0] - coords[i - 1][0]);

      samples.push({ lat, lng });
      nextSampleDist += intervalMeters;
    }
  }

  // Always include last point
  const last = coords[coords.length - 1];
  samples.push({ lat: last[1], lng: last[0] });

  return samples;
}

// ============================================================================
// BOUNDING BOX HELPERS (for spatial queries)
// ============================================================================

/**
 * Calculate a bounding box for a segment with expansion for matching.
 * Returns [minLat, minLng, maxLat, maxLng].
 */
export function segmentBoundingBox(
  segment: DetectedSegment | StoredSegment
): [number, number, number, number] {
  const lats = 'coordinates' in segment && segment.coordinates.length > 0
    ? segment.coordinates.map(c => c[1])
    : [segment.startLat, segment.endLat];
  const lngs = 'coordinates' in segment && segment.coordinates.length > 0
    ? segment.coordinates.map(c => c[0])
    : [segment.startLng, segment.endLng];

  return [
    Math.min(...lats) - CONFIG.BBOX_EXPANSION,
    Math.min(...lngs) - CONFIG.BBOX_EXPANSION,
    Math.max(...lats) + CONFIG.BBOX_EXPANSION,
    Math.max(...lngs) + CONFIG.BBOX_EXPANSION,
  ];
}

/**
 * Check if two bounding boxes overlap.
 */
export function bboxOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return !(
    a[2] < b[0] || // a's max lat < b's min lat
    a[0] > b[2] || // a's min lat > b's max lat
    a[3] < b[1] || // a's max lng < b's min lng
    a[1] > b[3]    // a's min lng > b's max lng
  );
}

// ============================================================================
// MERGE STRATEGY
// ============================================================================

/**
 * When a new segment matches an existing one, decide how to update the existing segment.
 * Returns the fields to update on the existing segment.
 */
export function mergeSegmentData(
  existing: StoredSegment & { rideCount: number },
  newSegment: DetectedSegment
): {
  coordinates?: [number, number][];
  distanceMeters?: number;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
} {
  // If the new segment has more points (better resolution), use its geometry
  if (newSegment.coordinates.length > existing.coordinates.length * 1.2) {
    return {
      coordinates: newSegment.coordinates,
      distanceMeters: newSegment.distanceMeters,
      startLat: newSegment.startLat,
      startLng: newSegment.startLng,
      endLat: newSegment.endLat,
      endLng: newSegment.endLng,
    };
  }

  // Otherwise keep existing geometry (it's built from more rides)
  return {};
}

// ============================================================================
// HAVERSINE (duplicated here to avoid circular deps)
// ============================================================================

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
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
