/**
 * Segment naming — turn "Rolling 14.7km" into a name that means something.
 *
 * A training segment is named after the roads it runs along ("Nelson Rd →
 * 63rd St → Niwot Rd", from Mapbox Map Matching), falling back to the place
 * it starts in ("Niwot Rolling 14.7km", from reverse geocoding) when the
 * matcher has nothing. The terrain-and-distance form the detector writes at
 * creation is the floor, never the goal.
 *
 * `custom_name` is the athlete's and is never touched here; only `auto_name`
 * is rebuilt, and only when the rebuild is an improvement.
 */

import { joinRoadNames, matchRoadNames } from './mapboxMapMatching.js';

const GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/** Pause between segments in a batch — Map Matching allows 300/min. */
const BATCH_DELAY_MS = 150;

/** Stop a batch before the platform does (functions default to 10 s on hobby, 15 s pro). */
const DEFAULT_BUDGET_MS = 9000;

/**
 * The detector's own names: "Rolling 14.7km", "Flat 2.1km", "Descent 3.0km",
 * "12 min Climb 5.4%", "Climb 1.2km 6.0%", optionally prefixed with a
 * geocoded place ("Niwot Rolling 14.7km"). Anything else — road names, a
 * custom name — is considered meaningful.
 */
const GENERIC_RE = /(^|\s)(\d+ min )?(Rolling|Flat|Descent|Climb)\s+[\d.]+\s?(km|%)/;

export function isGenericSegmentName(name) {
  if (name == null) return true;
  const s = String(name).trim();
  if (s.length === 0) return true;
  if (s.includes('→')) return false;
  return GENERIC_RE.test(s);
}

function terrainWord(terrainType) {
  switch (terrainType) {
    case 'climb':
      return 'Climb';
    case 'descent':
      return 'Descent';
    case 'rolling':
      return 'Rolling';
    default:
      return 'Flat';
  }
}

/**
 * Compose the best name the inputs allow.
 * @returns {{ name: string|null, source: 'roads'|'place'|'none' }}
 */
export function composeSegmentName({ roads, place, terrainType, distanceMeters }) {
  const byRoads = joinRoadNames(roads);
  if (byRoads) return { name: byRoads, source: 'roads' };
  if (place) {
    const km = distanceMeters != null && Number.isFinite(Number(distanceMeters)) ? (Number(distanceMeters) / 1000).toFixed(1) : null;
    const tail = km ? `${terrainWord(terrainType)} ${km}km` : terrainWord(terrainType);
    return { name: `${place} ${tail}`, source: 'place' };
  }
  return { name: null, source: 'none' };
}

function mapboxToken(opts = {}) {
  return opts.token || process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_TOKEN || null;
}

/**
 * The most specific place a point sits in (neighborhood > locality > place),
 * or null when Mapbox has nothing or the call fails.
 */
export async function reverseGeocodePlace(lat, lng, opts = {}) {
  const token = mapboxToken(opts);
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url =
      `${GEOCODE_BASE}/${lng},${lat}.json` +
      `?types=neighborhood,locality,place&limit=1&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return null;
    const body = await res.json();
    const text = body?.features?.[0]?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Rebuild one segment's auto_name. Reads the row, asks the matcher for its
 * roads, geocodes the start as a fallback, and writes auto_name only when
 * the result is better than what is there.
 *
 * @param {object} supabase   Service-role client.
 * @param {string} segmentId
 * @param {object} [opts]
 * @param {string} [opts.userId]  When set, the row must belong to this user.
 * @param {string} [opts.token]
 * @returns {Promise<{ segmentId: string, auto_name: string|null, custom_name: string|null, display_name: string|null, roads: string[], source: 'roads'|'place'|'unchanged'|'missing', error?: string }>}
 */
export async function nameTrainingSegment(supabase, segmentId, opts = {}) {
  let query = supabase
    .from('training_segments')
    .select('id, user_id, geojson, auto_name, custom_name, start_lat, start_lng, terrain_type, distance_meters')
    .eq('id', segmentId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  const { data: row, error: fetchErr } = await query.maybeSingle();

  if (fetchErr || !row) {
    return { segmentId, auto_name: null, custom_name: null, display_name: null, roads: [], source: 'missing', error: fetchErr?.message || 'not found' };
  }

  const coordinates = row.geojson?.coordinates;
  const result = {
    segmentId,
    auto_name: row.auto_name ?? null,
    custom_name: row.custom_name ?? null,
    display_name: row.custom_name ?? row.auto_name ?? null,
    roads: [],
    source: 'unchanged',
  };
  if (!Array.isArray(coordinates) || coordinates.length < 2) return result;

  let roads = [];
  let matchError = null;
  try {
    const match = await matchRoadNames(coordinates, { token: opts.token, signal: opts.signal });
    roads = match?.roads ?? [];
  } catch (err) {
    matchError = err?.message || String(err);
    console.warn('[SegmentNaming] map matching failed:', matchError);
  }

  // Geocode only when the roads came up empty — the place is a fallback,
  // and the current name may already carry it.
  let place = null;
  if (roads.length === 0 && isGenericSegmentName(row.auto_name)) {
    const lat = Number(row.start_lat);
    const lng = Number(row.start_lng);
    place = await reverseGeocodePlace(lat, lng, { token: opts.token, signal: opts.signal });
  }

  const composed = composeSegmentName({
    roads,
    place,
    terrainType: row.terrain_type,
    distanceMeters: row.distance_meters,
  });

  const improves =
    composed.name != null &&
    composed.name !== row.auto_name &&
    (composed.source === 'roads' || isGenericSegmentName(row.auto_name));

  if (!improves) {
    if (matchError) result.error = matchError;
    return result;
  }

  const { error: updateErr } = await supabase
    .from('training_segments')
    .update({ auto_name: composed.name })
    .eq('id', segmentId);
  if (updateErr) {
    return { ...result, error: updateErr.message };
  }

  return {
    segmentId,
    auto_name: composed.name,
    custom_name: row.custom_name ?? null,
    display_name: row.custom_name ?? composed.name,
    roads,
    source: composed.source,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Name several of one athlete's segments in order, stopping when the time
 * budget runs out so the caller can continue from where this left off.
 *
 * @param {object} supabase
 * @param {string} userId
 * @param {string[]} segmentIds
 * @param {object} [opts]
 * @param {number} [opts.budgetMs]
 * @param {number} [opts.delayMs]
 * @param {() => number} [opts.now]
 * @returns {Promise<{ results: Array<Awaited<ReturnType<typeof nameTrainingSegment>>>, processed: number, remaining: string[] }>}
 */
export async function nameTrainingSegments(supabase, userId, segmentIds, opts = {}) {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const delayMs = opts.delayMs ?? BATCH_DELAY_MS;
  const now = opts.now ?? Date.now;
  const started = now();
  const results = [];
  let i = 0;
  for (; i < segmentIds.length; i++) {
    if (i > 0 && now() - started > budgetMs) break;
    results.push(await nameTrainingSegment(supabase, segmentIds[i], { userId, token: opts.token }));
    if (i < segmentIds.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  return { results, processed: i, remaining: segmentIds.slice(i) };
}

export const _internal = { GENERIC_RE, terrainWord };
