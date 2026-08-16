/**
 * Segment Coverage
 *
 * Decides whether a ride traversed a segment, by asking whether the ride's
 * full track runs along the segment's path — not whether the ride's own
 * detected boundaries happened to land near the segment's endpoints.
 *
 * That distinction is the whole point. Boundary detection is heuristic and
 * shifts between rides of the same road, so identity built on endpoints
 * fragments: in production 92% of segments were stuck at ride_count = 1
 * while the rider had ridden those roads dozens of times. Coverage is
 * computed against the raw track, so it is immune to boundary drift and can
 * be backfilled across every ride that has GPS without re-running the
 * detector.
 *
 * Pure module: no database, no network, no config. Everything here is
 * directly unit-testable.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const COVERAGE_DEFAULTS = {
  /** Interval at which the segment path is sampled for testing. */
  sampleMeters: 50,

  /**
   * Track densification interval. Required, not an optimisation: Strava
   * summary polylines average ~310m between vertices (p10 ~720m), so a
   * segment sample sitting mid-straight would be hundreds of metres from
   * the nearest *vertex* while being right on the *path*. Densifying makes
   * distance-to-vertex a good proxy for distance-to-path.
   */
  densifyMeters: 20,

  /**
   * Match radius. Budget: segment geometry simplification ~11m (the RDP
   * tolerance in fitParser) + ride track simplification ~11m + GPS noise
   * ~8m + densification residual <=10m. 35m is the floor; past ~45m you
   * start matching the parallel road or the opposite carriageway.
   */
  toleranceMeters: 40,

  /** Fraction of segment samples that must lie on the track. */
  minCoverage: 0.8,

  /**
   * Fraction that must form one contiguous run. Without this, a ride that
   * criss-crosses a neighbourhood scores high coverage on a segment it
   * never rode end-to-end — which is exactly the failure being replaced.
   */
  minContiguous: 0.7,

  /** Consecutive unmatched samples tolerated inside a contiguous run. */
  gapTolerance: 2,

  /** Sampling stride used by the cheap pre-screen. */
  screenStride: 5,

  /** Screen coverage below this aborts before the full pass. */
  screenMinCoverage: 0.5,
};

const METERS_PER_DEG_LAT = 111320;

// ============================================================================
// GEOMETRY PRIMITIVES
// ============================================================================

/**
 * Equirectangular distance in metres. Accurate to well under a metre at the
 * scales involved here, and materially faster than haversine — this runs
 * millions of times in a backfill, where haversine's atan2/sqrt dominates.
 */
export function approxDistanceMeters(lng1, lat1, lng2, lat2) {
  const midLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dx = (lng2 - lng1) * Math.cos(midLatRad) * METERS_PER_DEG_LAT;
  const dy = (lat2 - lat1) * METERS_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Bounding box of a `[lng, lat][]` path. */
export function bboxOf(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  if (minLat === Infinity) return null;
  return { minLat, maxLat, minLng, maxLng };
}

/** Do two bboxes intersect once `padMeters` is added to each side? */
export function bboxIntersects(a, b, padMeters = 0) {
  if (!a || !b) return false;

  const padLat = padMeters / METERS_PER_DEG_LAT;
  const midLat = (a.minLat + a.maxLat) / 2;
  const cosLat = Math.max(0.01, Math.cos(midLat * (Math.PI / 180)));
  const padLng = padMeters / (METERS_PER_DEG_LAT * cosLat);

  return !(
    a.maxLat + padLat < b.minLat ||
    a.minLat - padLat > b.maxLat ||
    a.maxLng + padLng < b.minLng ||
    a.minLng - padLng > b.maxLng
  );
}

// ============================================================================
// PATH RESAMPLING
// ============================================================================

/**
 * Insert points so no gap along the path exceeds `intervalMeters`.
 *
 * Each output point carries the index of the source vertex it follows, so a
 * matched sample can be mapped back to a position in the original stream —
 * which is what lets a measured ride yield a real duration for a traversal
 * the detector never emitted.
 *
 * Note this deliberately bridges gaps between consecutive track points: a
 * gap in a recorded track means the rider covered that ground unrecorded, so
 * the straight line between them is the best available estimate of where
 * they went. A ride that genuinely left the road shows up as points that
 * lead somewhere else, not as a hole.
 *
 * @returns {{coords: Array<[number,number]>, sourceIdx: number[], cumDist: number[]}}
 */
export function densifyPath(coords, intervalMeters = COVERAGE_DEFAULTS.densifyMeters) {
  const outCoords = [];
  const sourceIdx = [];
  const cumDist = [];

  if (!Array.isArray(coords) || coords.length === 0) {
    return { coords: outCoords, sourceIdx, cumDist };
  }
  if (coords.length === 1) {
    return { coords: [coords[0]], sourceIdx: [0], cumDist: [0] };
  }

  let running = 0;
  outCoords.push(coords[0]);
  sourceIdx.push(0);
  cumDist.push(0);

  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1];
    const [lng1, lat1] = coords[i];
    const span = approxDistanceMeters(lng0, lat0, lng1, lat1);

    if (span > intervalMeters) {
      const steps = Math.ceil(span / intervalMeters);
      for (let s = 1; s < steps; s++) {
        const f = s / steps;
        outCoords.push([lng0 + (lng1 - lng0) * f, lat0 + (lat1 - lat0) * f]);
        // Attribute interpolated points to the vertex they came *from*.
        sourceIdx.push(i - 1);
        cumDist.push(running + span * f);
      }
    }

    running += span;
    outCoords.push(coords[i]);
    sourceIdx.push(i);
    cumDist.push(running);
  }

  return { coords: outCoords, sourceIdx, cumDist };
}

/**
 * Sample a path at fixed distance intervals.
 *
 * Unlike the version this replaces, the interpolation fraction is measured
 * from the previous sample rather than from the start of the edge, so
 * samples do not drift on long edges.
 */
export function samplePath(coords, intervalMeters = COVERAGE_DEFAULTS.sampleMeters) {
  if (!Array.isArray(coords) || coords.length < 2) return [];

  const samples = [coords[0]];
  let travelled = 0;
  let nextAt = intervalMeters;

  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1];
    const [lng1, lat1] = coords[i];
    const span = approxDistanceMeters(lng0, lat0, lng1, lat1);
    if (span <= 0) continue;

    while (travelled + span >= nextAt) {
      const f = (nextAt - travelled) / span;
      samples.push([lng0 + (lng1 - lng0) * f, lat0 + (lat1 - lat0) * f]);
      nextAt += intervalMeters;
    }

    travelled += span;
  }

  const last = coords[coords.length - 1];
  const prev = samples[samples.length - 1];
  if (approxDistanceMeters(prev[0], prev[1], last[0], last[1]) > intervalMeters / 2) {
    samples.push(last);
  }

  return samples;
}

// ============================================================================
// SPATIAL INDEX
// ============================================================================

/**
 * Bucket a densified track into a lat/lng grid sized to the match radius, so
 * a nearest-point query inspects a 3x3 cell neighbourhood instead of the
 * whole track. This is what makes the backfill tractable.
 *
 * @param {Array<[number,number]>} coords - raw `[lng, lat][]` track
 */
export function buildTrackIndex(coords, opts = {}) {
  const { densifyMeters, toleranceMeters } = { ...COVERAGE_DEFAULTS, ...opts };

  const dense = densifyPath(coords, densifyMeters);
  const n = dense.coords.length;

  const index = {
    points: dense.coords,
    sourceIdx: dense.sourceIdx,
    cumDist: dense.cumDist,
    cells: new Map(),
    cellLat: toleranceMeters / METERS_PER_DEG_LAT,
    cellLng: toleranceMeters / METERS_PER_DEG_LAT,
    length: n,
    bbox: bboxOf(dense.coords),
  };

  if (n === 0) return index;

  const midLat = (index.bbox.minLat + index.bbox.maxLat) / 2;
  const cosLat = Math.max(0.01, Math.cos(midLat * (Math.PI / 180)));
  index.cellLng = toleranceMeters / (METERS_PER_DEG_LAT * cosLat);

  for (let i = 0; i < n; i++) {
    const [lng, lat] = dense.coords[i];
    const key = `${Math.floor(lat / index.cellLat)}:${Math.floor(lng / index.cellLng)}`;
    const bucket = index.cells.get(key);
    if (bucket) bucket.push(i);
    else index.cells.set(key, [i]);
  }

  return index;
}

/**
 * Closest densified track point to a coordinate, or null beyond `maxMeters`.
 *
 * @returns {{distance: number, pointIdx: number} | null}
 */
export function nearestOnTrack(index, lng, lat, maxMeters = COVERAGE_DEFAULTS.toleranceMeters) {
  if (!index || index.length === 0) return null;

  const gy = Math.floor(lat / index.cellLat);
  const gx = Math.floor(lng / index.cellLng);

  let best = null;
  let bestDist = maxMeters;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const bucket = index.cells.get(`${gy + dy}:${gx + dx}`);
      if (!bucket) continue;
      for (const idx of bucket) {
        const [plng, plat] = index.points[idx];
        const d = approxDistanceMeters(lng, lat, plng, plat);
        if (d <= bestDist) {
          bestDist = d;
          best = idx;
        }
      }
    }
  }

  return best === null ? null : { distance: bestDist, pointIdx: best };
}

// ============================================================================
// COVERAGE
// ============================================================================

/**
 * How much of `segmentCoords` the indexed track covers.
 *
 * A traversal requires three things, all of which matter:
 *   - enough samples matched at all (`coverage`)
 *   - most of them in one unbroken run (`contiguousCoverage`), so a ride
 *     that merely wandered the same neighbourhood doesn't qualify
 *   - matched track positions advancing consistently in one direction
 *     (`monotonic`), so a ride that crossed the segment repeatedly doesn't
 *     read as having ridden it
 *
 * @returns {{
 *   coverage: number, contiguousCoverage: number,
 *   matched: number, total: number,
 *   entryTrackIdx: number|null, exitTrackIdx: number|null,
 *   entrySourceIdx: number|null, exitSourceIdx: number|null,
 *   direction: 'forward'|'reverse'|'unknown', monotonic: boolean,
 *   passes: boolean
 * }}
 */
export function pathCoverage(segmentCoords, trackIndex, opts = {}) {
  const cfg = { ...COVERAGE_DEFAULTS, ...opts };

  const empty = {
    coverage: 0,
    contiguousCoverage: 0,
    matched: 0,
    total: 0,
    entryTrackIdx: null,
    exitTrackIdx: null,
    entrySourceIdx: null,
    exitSourceIdx: null,
    direction: 'unknown',
    monotonic: false,
    passes: false,
  };

  if (!Array.isArray(segmentCoords) || segmentCoords.length < 2) return empty;
  if (!trackIndex || trackIndex.length === 0) return empty;

  const samples = samplePath(segmentCoords, cfg.sampleMeters);
  if (samples.length === 0) return empty;

  // Cheap pre-screen: test every Nth sample first. Most candidate pairs are
  // nowhere near each other, and this rejects them at a fraction of the cost.
  if (samples.length >= cfg.screenStride * 2) {
    let screenHits = 0;
    let screenTotal = 0;
    for (let i = 0; i < samples.length; i += cfg.screenStride) {
      screenTotal++;
      if (nearestOnTrack(trackIndex, samples[i][0], samples[i][1], cfg.toleranceMeters)) {
        screenHits++;
      }
    }
    if (screenTotal > 0 && screenHits / screenTotal < cfg.screenMinCoverage) {
      return { ...empty, total: samples.length };
    }
  }

  const matchedIdx = new Array(samples.length).fill(-1);
  let matched = 0;

  for (let i = 0; i < samples.length; i++) {
    const hit = nearestOnTrack(trackIndex, samples[i][0], samples[i][1], cfg.toleranceMeters);
    if (hit) {
      matchedIdx[i] = hit.pointIdx;
      matched++;
    }
  }

  const coverage = matched / samples.length;

  // Longest run of matched samples, tolerating short gaps.
  let bestRunStart = -1;
  let bestRunEnd = -1;
  let bestRunLen = 0;
  let runStart = -1;
  let runLast = -1;
  let runLen = 0;
  let gap = 0;

  for (let i = 0; i < samples.length; i++) {
    if (matchedIdx[i] >= 0) {
      if (runStart === -1) runStart = i;
      runLast = i;
      runLen++;
      gap = 0;
    } else if (runStart !== -1) {
      gap++;
      if (gap > cfg.gapTolerance) {
        if (runLen > bestRunLen) {
          bestRunLen = runLen;
          bestRunStart = runStart;
          bestRunEnd = runLast;
        }
        runStart = -1;
        runLast = -1;
        runLen = 0;
        gap = 0;
      }
    }
  }
  if (runLen > bestRunLen) {
    bestRunLen = runLen;
    bestRunStart = runStart;
    bestRunEnd = runLast;
  }

  const contiguousCoverage = bestRunLen / samples.length;

  if (bestRunLen === 0) return { ...empty, coverage, matched, total: samples.length };

  // Direction and monotonicity over the best run: do the matched positions
  // along the track advance consistently, or does the ride bounce around?
  let forwardSteps = 0;
  let backwardSteps = 0;
  let prevIdx = null;
  for (let i = bestRunStart; i <= bestRunEnd; i++) {
    const idx = matchedIdx[i];
    if (idx < 0) continue;
    if (prevIdx !== null) {
      if (idx > prevIdx) forwardSteps++;
      else if (idx < prevIdx) backwardSteps++;
    }
    prevIdx = idx;
  }

  const totalSteps = forwardSteps + backwardSteps;
  const dominant = Math.max(forwardSteps, backwardSteps);
  const monotonic = totalSteps === 0 ? false : dominant / totalSteps >= 0.9;
  const direction = totalSteps === 0
    ? 'unknown'
    : forwardSteps >= backwardSteps ? 'forward' : 'reverse';

  const runIdxs = [];
  for (let i = bestRunStart; i <= bestRunEnd; i++) {
    if (matchedIdx[i] >= 0) runIdxs.push(matchedIdx[i]);
  }
  const entryTrackIdx = runIdxs.length ? Math.min(...runIdxs) : null;
  const exitTrackIdx = runIdxs.length ? Math.max(...runIdxs) : null;

  return {
    coverage,
    contiguousCoverage,
    matched,
    total: samples.length,
    entryTrackIdx,
    exitTrackIdx,
    entrySourceIdx: entryTrackIdx === null ? null : trackIndex.sourceIdx[entryTrackIdx],
    exitSourceIdx: exitTrackIdx === null ? null : trackIndex.sourceIdx[exitTrackIdx],
    direction,
    monotonic,
    passes:
      coverage >= cfg.minCoverage &&
      contiguousCoverage >= cfg.minContiguous &&
      monotonic,
  };
}

/**
 * Do two paths describe the same stretch of road?
 *
 * Mutual coverage replaces the old endpoint-proximity + distance-ratio
 * gates. It subsumes the distance ratio (two paths that each cover 80% of
 * the other cannot differ much in length) and, unlike endpoint matching, is
 * unaffected by where each ride's boundary detection happened to cut.
 */
export function mutualCoverage(coordsA, coordsB, opts = {}) {
  const cfg = { ...COVERAGE_DEFAULTS, ...opts };

  if (!Array.isArray(coordsA) || coordsA.length < 2) return { score: 0, aInB: null, bInA: null };
  if (!Array.isArray(coordsB) || coordsB.length < 2) return { score: 0, aInB: null, bInA: null };

  const indexB = buildTrackIndex(coordsB, cfg);
  const aInB = pathCoverage(coordsA, indexB, cfg);

  // Cheap rejection before paying for the second index.
  if (aInB.coverage < cfg.minCoverage) {
    return { score: aInB.coverage, aInB, bInA: null };
  }

  const indexA = buildTrackIndex(coordsA, cfg);
  const bInA = pathCoverage(coordsB, indexA, cfg);

  return { score: Math.min(aInB.coverage, bInA.coverage), aInB, bInA };
}

export default {
  COVERAGE_DEFAULTS,
  approxDistanceMeters,
  bboxOf,
  bboxIntersects,
  densifyPath,
  samplePath,
  buildTrackIndex,
  nearestOnTrack,
  pathCoverage,
  mutualCoverage,
};
