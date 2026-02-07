/**
 * Segment Alternatives Service
 *
 * Generates 2-3 alternative route paths between two points by querying
 * multiple routing providers and profiles. Used when a user wants to
 * compare different ways to ride a particular segment of their route.
 *
 * Strategies:
 *   1. BRouter alternativeidx (built-in alternatives for the same profile)
 *   2. Different BRouter profiles (gravel vs fastbike vs safety)
 *   3. Stadia Maps with varied costing (hills, roads)
 */

import { getBRouterDirections, BROUTER_PROFILES } from './brouter';
import { getStadiaMapsRoute, isStadiaMapsAvailable } from './stadiaMapsRouter';

// ── Colors for alternatives ─────────────────────────────────────────
export const ALTERNATIVE_COLORS = [
  '#f59e0b', // amber  — Alt 1
  '#8b5cf6', // violet — Alt 2
  '#06b6d4', // cyan   — Alt 3
];

// Label presets per strategy
const STRATEGY_LABELS = {
  brouter_alt: 'Alternative',
  brouter_fast: 'Fastest',
  brouter_safe: 'Safest',
  brouter_scenic: 'Scenic',
  stadia_flat: 'Flattest',
  stadia_roads: 'Roads',
  stadia_offroad: 'Off-road',
};

// ── Helpers ─────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function routeLengthKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return total;
}

/**
 * Determine how similar two routes are (0 = identical, 1 = completely different).
 * Uses average distance between sampled points.
 */
function routeDissimilarity(coordsA, coordsB) {
  const samples = 10;
  let totalDist = 0;
  for (let s = 0; s < samples; s++) {
    const t = s / (samples - 1);
    const idxA = Math.min(Math.floor(t * (coordsA.length - 1)), coordsA.length - 1);
    const idxB = Math.min(Math.floor(t * (coordsB.length - 1)), coordsB.length - 1);
    totalDist += haversineKm(coordsA[idxA][1], coordsA[idxA][0], coordsB[idxB][1], coordsB[idxB][0]);
  }
  return totalDist / samples;
}

// ── Core function ───────────────────────────────────────────────────

/**
 * Generate alternative route segments between two points.
 *
 * @param {[lon,lat]} startPoint  Segment start coordinate
 * @param {[lon,lat]} endPoint    Segment end coordinate
 * @param {Object}    options
 * @param {string}    options.profile     Current route profile (road|gravel|mountain|commuting)
 * @param {string}    options.mapboxToken Mapbox token for fallback
 * @returns {Promise<Array>} Array of alternative objects sorted by distance
 */
export async function generateSegmentAlternatives(startPoint, endPoint, options = {}) {
  const { profile = 'road', mapboxToken } = options;

  console.log(`🔀 Generating segment alternatives (${profile}) …`);

  const waypoints = [startPoint, endPoint];
  const promises = [];

  // ── Strategy 1: BRouter native alternatives (same profile) ──────
  const brouterProfile = profileToBRouter(profile);
  promises.push(
    tryBRouterAlt(waypoints, brouterProfile, 1, 'brouter_alt'),
    tryBRouterAlt(waypoints, brouterProfile, 2, 'brouter_alt'),
  );

  // ── Strategy 2: Different BRouter profiles ──────────────────────
  if (profile === 'road' || profile === 'commuting') {
    promises.push(tryBRouterAlt(waypoints, BROUTER_PROFILES.SAFETY, 0, 'brouter_safe'));
    promises.push(tryBRouterAlt(waypoints, BROUTER_PROFILES.FASTBIKE, 0, 'brouter_fast'));
  } else if (profile === 'gravel' || profile === 'mountain') {
    promises.push(tryBRouterAlt(waypoints, BROUTER_PROFILES.TREKKING, 0, 'brouter_scenic'));
    promises.push(tryBRouterAlt(waypoints, BROUTER_PROFILES.FASTBIKE, 0, 'brouter_fast'));
  }

  // ── Strategy 3: Stadia Maps with varied costing ─────────────────
  if (isStadiaMapsAvailable()) {
    promises.push(tryStadiaAlt(waypoints, profile, 'flat', 'stadia_flat'));
  }

  const results = await Promise.allSettled(promises);

  // Collect successful results
  const alternatives = results
    .filter(r => r.status === 'fulfilled' && r.value != null)
    .map(r => r.value);

  // Deduplicate routes that are too similar (< 0.05 km avg deviation)
  const deduplicated = deduplicateAlternatives(alternatives);

  // Sort by distance (shortest first)
  deduplicated.sort((a, b) => a.distanceKm - b.distanceKm);

  // Assign colors and sequential labels
  const labeled = deduplicated.slice(0, 3).map((alt, i) => ({
    ...alt,
    color: ALTERNATIVE_COLORS[i],
    index: i,
  }));

  console.log(`✅ Found ${labeled.length} distinct alternatives`);
  return labeled;
}

// ── Provider wrappers ───────────────────────────────────────────────

async function tryBRouterAlt(waypoints, brouterProfile, altIdx, strategyId) {
  try {
    const result = await getBRouterDirections(waypoints, {
      profile: brouterProfile,
      alternativeidx: altIdx,
    });
    if (!result?.coordinates || result.coordinates.length < 2) return null;

    return {
      id: `${strategyId}_${brouterProfile}_${altIdx}`,
      label: altIdx > 0
        ? `${STRATEGY_LABELS[strategyId] || 'Alt'} ${altIdx}`
        : (STRATEGY_LABELS[strategyId] || brouterProfile),
      coordinates: result.coordinates,
      distanceKm: Math.round((result.distance / 1000) * 10) / 10,
      durationMin: Math.round(result.duration / 60),
      elevationGain: result.elevation?.ascent || result.elevationGain || 0,
      elevationLoss: result.elevation?.descent || result.elevationLoss || 0,
      source: `brouter_${brouterProfile}`,
      strategyId,
    };
  } catch (err) {
    console.warn(`BRouter alt failed (${brouterProfile}/${altIdx}):`, err.message);
    return null;
  }
}

async function tryStadiaAlt(waypoints, profile, variant, strategyId) {
  try {
    // Adjust costing based on variant
    const overrides = {};
    if (variant === 'flat') {
      overrides.use_hills = 0; // minimize hills
    } else if (variant === 'roads') {
      overrides.use_roads = 0.8;
    } else if (variant === 'offroad') {
      overrides.use_roads = 0;
      overrides.avoid_bad_surfaces = 0;
    }

    const result = await getStadiaMapsRoute(waypoints, {
      profile,
      preferences: overrides,
    });
    if (!result?.coordinates || result.coordinates.length < 2) return null;

    return {
      id: `${strategyId}_${variant}`,
      label: STRATEGY_LABELS[strategyId] || variant,
      coordinates: result.coordinates,
      distanceKm: Math.round((result.distance / 1000) * 10) / 10,
      durationMin: Math.round(result.duration / 60),
      elevationGain: 0, // Stadia basic doesn't always include elevation
      elevationLoss: 0,
      source: `stadia_${variant}`,
      strategyId,
    };
  } catch (err) {
    console.warn(`Stadia alt failed (${variant}):`, err.message);
    return null;
  }
}

// ── Deduplication ───────────────────────────────────────────────────

function deduplicateAlternatives(alts) {
  if (alts.length <= 1) return alts;

  const kept = [alts[0]];
  for (let i = 1; i < alts.length; i++) {
    const isTooSimilar = kept.some(k =>
      routeDissimilarity(k.coordinates, alts[i].coordinates) < 0.05
    );
    if (!isTooSimilar) {
      kept.push(alts[i]);
    }
  }
  return kept;
}

// ── Profile mapping ─────────────────────────────────────────────────

function profileToBRouter(profile) {
  switch (profile) {
    case 'road': return BROUTER_PROFILES.FASTBIKE;
    case 'gravel': return BROUTER_PROFILES.GRAVEL;
    case 'mountain': return BROUTER_PROFILES.MTB;
    case 'commuting': return BROUTER_PROFILES.TREKKING;
    default: return BROUTER_PROFILES.TREKKING;
  }
}

export default { generateSegmentAlternatives, ALTERNATIVE_COLORS };
