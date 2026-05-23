/**
 * Mapbox Map Matching → human-readable training segment auto_name.
 *
 * Sends the segment's stored polyline to the cycling Map Matching API,
 * extracts named roads from the matched legs (using the `name`
 * annotation), dedupes consecutive duplicates, caps the list at 3
 * names, and formats them with `→` separators.
 *
 * Returns `null` if Map Matching has no confident match or returns no
 * named roads — the caller should preserve whatever name is already
 * present rather than overwriting with a worse one.
 */

const MATCH_BASE = 'https://api.mapbox.com/matching/v5/mapbox/cycling';

// Mapbox cycling Map Matching accepts up to 100 coordinates per request.
const MAX_COORDS = 100;
const MIN_COORDS = 2;

// If the matching confidence is below this on the chosen matching, treat
// it as a no-match. Map Matching confidence ranges 0..1.
const MIN_CONFIDENCE = 0.5;

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

/**
 * Build an auto_name string from a GeoJSON LineString coordinate array.
 *
 * @param {Array<[number, number]>} coordinates  [lng, lat] pairs per GeoJSON
 * @param {object} [opts]
 * @param {string} [opts.token]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string|null>}
 */
export async function buildAutoNameFromGeometry(coordinates, opts = {}) {
  const token =
    opts.token ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.VITE_MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('MAPBOX_ACCESS_TOKEN not configured');

  if (!Array.isArray(coordinates) || coordinates.length < MIN_COORDS) {
    return null;
  }

  const sampled = downsample(coordinates, MAX_COORDS);
  const coordStr = sampled
    .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(';');

  // `geometries=geojson` is required to avoid polyline decode noise.
  // `annotations=name` is what surfaces road names per leg.
  // `tidy=true` cleans up noisy GPS points before matching.
  const url =
    `${MATCH_BASE}/${coordStr}` +
    `?geometries=geojson&annotations=name&tidy=true&overview=simplified` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`MapMatching ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const body = await res.json();
  if (body?.code !== 'Ok' || !Array.isArray(body.matchings) || body.matchings.length === 0) {
    return null;
  }

  // Pick the highest-confidence matching.
  const match = body.matchings
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  if ((match.confidence ?? 0) < MIN_CONFIDENCE) return null;

  // Extract `name` annotations from each leg. The annotation array has
  // one entry per *step* segment; we want the ordered list of distinct
  // named roads.
  const ordered = [];
  for (const leg of match.legs || []) {
    const names = leg?.annotation?.name;
    if (!Array.isArray(names)) continue;
    for (const name of names) {
      if (!name) continue;
      if (ordered.length === 0 || ordered[ordered.length - 1] !== name) {
        ordered.push(name);
      }
    }
  }

  if (ordered.length === 0) return null;

  const top = ordered.slice(0, MAX_NAMES);
  return top.join(' → ');
}

export const _internal = { downsample };
