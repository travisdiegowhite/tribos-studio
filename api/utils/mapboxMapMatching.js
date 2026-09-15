/**
 * Mapbox Map Matching → the named roads a training segment runs along.
 *
 * Sends the segment's stored polyline to the cycling Map Matching API with
 * `steps=true` and reads the road name off each step. (The API has no
 * `name` annotation — asking for one is a 422, which is why every segment
 * shipped with the "Rolling 14.7km" fallback for months.) Consecutive
 * duplicates are collapsed, unnamed steps are skipped, and the list is
 * capped so a name stays a name rather than a route sheet.
 *
 * Returns `null` when Map Matching has no usable match or no named roads —
 * the caller keeps whatever name is already there rather than overwriting
 * it with something worse.
 */

const MATCH_BASE = 'https://api.mapbox.com/matching/v5/mapbox/cycling';

// Mapbox cycling Map Matching accepts up to 100 coordinates per request.
const MAX_COORDS = 100;
const MIN_COORDS = 2;

// A downsampled 15 km segment has ~150 m between points, so the matcher
// needs room to snap; 25 m is the middle of Mapbox's "noisy trace" band.
const SNAP_RADIUS_M = 25;

// Below this the matching is a guess (0..1). Names from a guess are worse
// than no names, since a wrong road name is a lie the athlete will notice.
const MIN_CONFIDENCE = 0.3;

const MAX_NAMES = 3;

/** Evenly downsample a coordinate array to at most `max` entries. */
function downsample(coords, max) {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

/** Step names in travel order, consecutive repeats collapsed, blanks dropped. */
function roadNamesFromMatchings(matchings) {
  const ordered = [];
  for (const matching of matchings) {
    for (const leg of matching?.legs || []) {
      for (const step of leg?.steps || []) {
        const name = typeof step?.name === 'string' ? step.name.trim() : '';
        if (!name) continue;
        if (ordered.length === 0 || ordered[ordered.length - 1] !== name) {
          ordered.push(name);
        }
      }
    }
  }
  return ordered;
}

/**
 * The named roads along a GeoJSON LineString, in order.
 *
 * @param {Array<[number, number]>} coordinates  [lng, lat] pairs per GeoJSON
 * @param {object} [opts]
 * @param {string} [opts.token]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ roads: string[], confidence: number } | null>}
 */
export async function matchRoadNames(coordinates, opts = {}) {
  const token =
    opts.token ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.VITE_MAPBOX_TOKEN;
  if (!token) throw new Error('MAPBOX_ACCESS_TOKEN / VITE_MAPBOX_TOKEN not configured');

  if (!Array.isArray(coordinates) || coordinates.length < MIN_COORDS) {
    return null;
  }

  const sampled = downsample(coordinates, MAX_COORDS);
  const coordStr = sampled
    .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(';');
  const radiuses = sampled.map(() => SNAP_RADIUS_M).join(';');

  // `steps=true` is what carries road names. `tidy=true` cleans up noisy
  // GPS points before matching; `overview=false` keeps the payload small.
  const url =
    `${MATCH_BASE}/${coordStr}` +
    `?geometries=geojson&steps=true&tidy=true&overview=false` +
    `&radiuses=${radiuses}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`MapMatching ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const body = await res.json();
  if (body?.code !== 'Ok' || !Array.isArray(body.matchings) || body.matchings.length === 0) {
    return null;
  }

  // A tidy trace usually comes back as one matching; a trace the matcher
  // had to break at a gap comes back as several, still in travel order.
  // Confidence is judged on the longest piece, names are read from all.
  const matchings = body.matchings.filter((m) => m && typeof m === 'object');
  const primary = matchings
    .slice()
    .sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))[0];
  const confidence = Number(primary?.confidence ?? 0);
  if (!(confidence >= MIN_CONFIDENCE)) return null;

  const roads = roadNamesFromMatchings(matchings);
  if (roads.length === 0) return null;
  return { roads, confidence };
}

/**
 * Build an auto_name string ("Nelson Rd → 63rd St → Niwot Rd") from a
 * GeoJSON LineString coordinate array, or null when there is nothing to say.
 *
 * @param {Array<[number, number]>} coordinates
 * @param {object} [opts]
 * @returns {Promise<string|null>}
 */
export async function buildAutoNameFromGeometry(coordinates, opts = {}) {
  const match = await matchRoadNames(coordinates, opts);
  if (!match) return null;
  return joinRoadNames(match.roads);
}

/** "A → B → C", at most MAX_NAMES roads. */
export function joinRoadNames(roads) {
  const top = (roads || []).filter(Boolean).slice(0, MAX_NAMES);
  return top.length > 0 ? top.join(' → ') : null;
}

export const _internal = { downsample, roadNamesFromMatchings, MIN_CONFIDENCE, SNAP_RADIUS_M };
