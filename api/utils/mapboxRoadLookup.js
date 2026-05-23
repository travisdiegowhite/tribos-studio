/**
 * Mapbox Tilequery → OSM road metadata for a user_road_segment.
 *
 * Queries the mapbox-streets-v8 road layer at the segment midpoint (and
 * optionally at 25%/75% for longer segments) and picks the candidate
 * whose road bearing best matches the segment's stored bearing. Returns
 * `null` if no confident match.
 *
 * Coordinates passed in are `lat/lng` decimals (matching the column shape).
 * The Tilequery URL takes `{lng},{lat}` per the GeoJSON convention.
 */

const TILEQUERY_BASE = 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery';

// ~15 m radius works well for residential/local roads; primary highways
// have wider geometry but the midpoint usually lands on or very near.
const DEFAULT_RADIUS_M = 15;

// A candidate road must be within ±20° of the segment's bearing
// (mod 180 — direction-agnostic) to be considered a match.
const BEARING_TOLERANCE_DEG = 20;

const EARTH_RADIUS_M = 6371000;

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

/** Great-circle midpoint of two lat/lng points. */
function haversineMidpoint(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);
  const φm = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2)
  );
  const λm = toRad(lng1) + Math.atan2(By, Math.cos(φ1) + Bx);

  return { lat: toDeg(φm), lng: ((toDeg(λm) + 540) % 360) - 180 };
}

/** Interpolate along the great circle from p1→p2 at fraction f (0..1). */
function interpolatePoint(lat1, lng1, lat2, lng2, f) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const λ1 = toRad(lng1);
  const λ2 = toRad(lng2);

  const Δφ = φ2 - φ1;
  const Δλ = λ2 - λ1;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (δ === 0) return { lat: lat1, lng: lng1 };

  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);

  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);

  const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λi = Math.atan2(y, x);
  return { lat: toDeg(φi), lng: toDeg(λi) };
}

/** Bearing in degrees (0..360) from p1 to p2. */
function bearingDeg(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Direction-agnostic bearing difference (0..90). */
function bearingDelta(a, b) {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

/**
 * Score a Tilequery feature against the segment's bearing. Returns
 * `null` if the feature has no geometry to compute a bearing from,
 * or is outside the bearing tolerance.
 */
function scoreFeature(feature, segmentBearing) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  // Tilequery returns a LineString clipped near the query point. Use
  // the first and last vertices to derive the local road bearing.
  const [lng1, lat1] = coords[0];
  const [lng2, lat2] = coords[coords.length - 1];
  const roadBearing = bearingDeg(lat1, lng1, lat2, lng2);

  const delta = bearingDelta(roadBearing, segmentBearing);
  if (delta > BEARING_TOLERANCE_DEG) return null;

  // Lower delta = better match. Tilequery also returns a `tilequery.distance`
  // property in metres — prefer closer features as a tiebreaker.
  const tqDistance = feature.properties?.tilequery?.distance ?? 0;
  return delta + tqDistance * 0.5;
}

/** Fetch one Tilequery point. Returns the raw features array or []. */
async function tilequeryAt(lat, lng, token, radius_m, signal) {
  const url =
    `${TILEQUERY_BASE}/${lng},${lat}.json` +
    `?radius=${radius_m}&limit=5&layers=road&geometry=linestring` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Tilequery ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  return Array.isArray(body?.features) ? body.features : [];
}

/**
 * Pick the modal road `name` across multiple Tilequery sample points.
 * If no name appears more than once and the longest segment is < 500 m,
 * just return the best-scoring feature from the midpoint sample.
 */
function pickBestFeature(samples, segmentBearing) {
  // samples: Array<Array<feature>> — one inner array per sample point.
  const scored = [];
  for (const features of samples) {
    for (const f of features) {
      const score = scoreFeature(f, segmentBearing);
      if (score === null) continue;
      scored.push({ feature: f, score });
    }
  }
  if (scored.length === 0) return null;

  // Vote by name across all sample points.
  const nameVotes = new Map();
  for (const { feature, score } of scored) {
    const name = feature.properties?.name;
    if (!name) continue;
    const prev = nameVotes.get(name) ?? { votes: 0, bestScore: Infinity, feature };
    prev.votes += 1;
    if (score < prev.bestScore) {
      prev.bestScore = score;
      prev.feature = feature;
    }
    nameVotes.set(name, prev);
  }

  if (nameVotes.size > 0) {
    const ranked = Array.from(nameVotes.values()).sort(
      (a, b) => b.votes - a.votes || a.bestScore - b.bestScore
    );
    return ranked[0].feature;
  }

  // Fall back to lowest-score unnamed match (still useful for road_type).
  scored.sort((a, b) => a.score - b.score);
  return scored[0].feature;
}

/**
 * Look up OSM road metadata for a single user_road_segment.
 *
 * @param {object} seg
 * @param {number} seg.start_lat
 * @param {number} seg.start_lng
 * @param {number} seg.end_lat
 * @param {number} seg.end_lng
 * @param {number} seg.bearing            stored compass bearing (0..359)
 * @param {number} seg.segment_length_m   stored segment length
 * @param {object} [opts]
 * @param {string} [opts.token]           Mapbox access token (defaults to env)
 * @param {number} [opts.radius_m]        Tilequery search radius
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{road_name: string|null, osm_way_id: number|null,
 *                    road_type: string|null, surface_type: string|null} | null>}
 */
export async function lookupRoadForSegment(seg, opts = {}) {
  const token =
    opts.token ||
    process.env.VITE_MAPBOX_TOKEN ||
    process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error('VITE_MAPBOX_TOKEN not configured');
  }

  const radius_m = opts.radius_m ?? DEFAULT_RADIUS_M;
  const { start_lat, start_lng, end_lat, end_lng, bearing, segment_length_m } = seg;

  if (
    !Number.isFinite(start_lat) || !Number.isFinite(start_lng) ||
    !Number.isFinite(end_lat) || !Number.isFinite(end_lng)
  ) {
    return null;
  }

  const samplePoints = [];

  const mid = haversineMidpoint(start_lat, start_lng, end_lat, end_lng);
  samplePoints.push(mid);

  if ((segment_length_m ?? 0) > 500) {
    samplePoints.push(interpolatePoint(start_lat, start_lng, end_lat, end_lng, 0.25));
    samplePoints.push(interpolatePoint(start_lat, start_lng, end_lat, end_lng, 0.75));
  }

  // Bearing fallback: if not stored, derive from start→end.
  const segmentBearing = Number.isFinite(bearing)
    ? bearing
    : bearingDeg(start_lat, start_lng, end_lat, end_lng);

  const samples = [];
  for (const p of samplePoints) {
    const features = await tilequeryAt(p.lat, p.lng, token, radius_m, opts.signal);
    samples.push(features);
  }

  const best = pickBestFeature(samples, segmentBearing);
  if (!best) return null;

  const props = best.properties || {};
  return {
    road_name: props.name ?? null,
    osm_way_id:
      typeof props.osm_id === 'number' ? props.osm_id :
      typeof props.osm_id === 'string' ? Number(props.osm_id) || null :
      null,
    road_type: props.class ?? null,
    surface_type: props.surface ?? null,
  };
}

export const _internal = { bearingDelta, bearingDeg, haversineMidpoint, interpolatePoint, scoreFeature };
