/**
 * AI-Assisted Route Editing Service (Phase 3.1)
 *
 * Parses natural language edit requests and applies intelligent route modifications
 * using the existing routing infrastructure (BRouter, Stadia Maps, Mapbox).
 *
 * Edit types supported:
 *   - flatten:  "make it flatter", "avoid hills", "less climbing"
 *   - surface:  "more gravel", "paved only", "off-road"
 *   - scenic:   "more scenic", "quieter roads", "bike paths"
 *   - shorter:  "make it shorter", "cut 5km"
 *   - longer:   "make it longer", "extend by 10km"
 *   - avoid:    "avoid the highway", "skip downtown"
 *   - detour:   "go through the park", "pass by the lake"
 *   - reverse:  "reverse the route", "flip direction"
 */

import { getSmartCyclingRoute } from './smartCyclingRouter.js';
import { getBRouterDirections, BROUTER_PROFILES } from './brouter.js';
import { getStadiaMapsRoute } from './stadiaMapsRouter.js';
import { getElevationData, calculateElevationStats } from './elevation.js';
import { hillsBiasForTarget } from './routeTargets.js';

// ── Intent classification ──────────────────────────────────────────────────────

const EDIT_INTENTS = {
  flatten: {
    label: 'Flatten route',
    keywords: ['flat', 'flatter', 'flatten', 'hill', 'climb', 'elevation', 'less climbing', 'no hills', 'avoid hills', 'gentler', 'easier'],
    description: 'Re-routes to minimize elevation gain',
  },
  surface_gravel: {
    label: 'More gravel/trails',
    keywords: ['gravel', 'dirt', 'trail', 'off-road', 'offroad', 'unpaved', 'singletrack', 'mtb'],
    description: 'Shifts route toward gravel and unpaved paths',
  },
  surface_paved: {
    label: 'More paved roads',
    keywords: ['paved', 'pavement', 'road', 'tarmac', 'asphalt', 'smooth'],
    description: 'Shifts route toward paved surfaces',
  },
  scenic: {
    label: 'More scenic / quieter',
    keywords: ['scenic', 'quiet', 'quieter', 'calm', 'peaceful', 'bike path', 'cycle path', 'bikepath', 'cycleway', 'greenway', 'park', 'river', 'waterfront', 'lakeside'],
    description: 'Prefers bike paths, parks, and scenic routes',
  },
  faster: {
    label: 'Fastest / direct',
    keywords: ['fast', 'faster', 'fastest', 'direct', 'quickest', 'shortest time', 'efficient'],
    description: 'Optimizes for speed on main roads',
  },
  shorter: {
    label: 'Shorter distance',
    keywords: ['shorter', 'shorten', 'cut', 'trim', 'reduce', 'less distance', 'too long'],
    description: 'Reduces total route distance',
  },
  longer: {
    label: 'Longer distance',
    keywords: ['longer', 'extend', 'more distance', 'too short', 'add distance', 'increase'],
    description: 'Extends the route with additional distance',
  },
  avoid: {
    label: 'Avoid area',
    keywords: ['avoid', 'skip', 'bypass', 'go around', 'stay away', 'no highway', 'no motorway'],
    description: 'Routes around a specified area or road type',
  },
  detour: {
    label: 'Add detour',
    keywords: ['detour', 'go through', 'pass by', 'via', 'stop at', 'include', 'add waypoint'],
    description: 'Adds a waypoint or detour through a location',
  },
  reverse: {
    label: 'Reverse direction',
    keywords: ['reverse', 'flip', 'opposite direction', 'backwards', 'other way'],
    description: 'Reverses the route direction',
  },
};

/**
 * Classify a natural language edit request into an intent + extracted parameters
 */
export function classifyEditIntent(text) {
  const lower = text.toLowerCase().trim();

  let bestIntent = null;
  let bestScore = 0;

  for (const [intentId, intent] of Object.entries(EDIT_INTENTS)) {
    let score = 0;
    for (const kw of intent.keywords) {
      if (lower.includes(kw)) {
        // Longer keyword matches score higher (more specific)
        score += kw.split(' ').length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intentId;
    }
  }

  // Extract location parameter for avoid/detour intents
  let location = null;
  if (bestIntent === 'avoid' || bestIntent === 'detour') {
    location = extractLocationFromText(lower, bestIntent);
  }

  // Extract distance modifier for shorter/longer
  let distanceModifier = null;
  if (bestIntent === 'shorter' || bestIntent === 'longer') {
    const kmMatch = lower.match(/(\d+)\s*(?:km|kilometers|kilometres)/);
    const miMatch = lower.match(/(\d+)\s*(?:mi|miles)/);
    if (kmMatch) distanceModifier = parseFloat(kmMatch[1]);
    else if (miMatch) distanceModifier = parseFloat(miMatch[1]) * 1.609;
  }

  return {
    intent: bestIntent || 'unknown',
    confidence: bestScore > 0 ? Math.min(1, bestScore / 3) : 0,
    label: bestIntent ? EDIT_INTENTS[bestIntent].label : 'Unknown edit',
    description: bestIntent ? EDIT_INTENTS[bestIntent].description : '',
    location,
    distanceModifier,
    originalText: text,
  };
}

function extractLocationFromText(text, intent) {
  // Strip common prefixes to isolate the location noun
  const patterns = [
    /avoid\s+(?:the\s+)?(.+)/,
    /skip\s+(?:the\s+)?(.+)/,
    /bypass\s+(?:the\s+)?(.+)/,
    /go\s+around\s+(?:the\s+)?(.+)/,
    /go\s+through\s+(?:the\s+)?(.+)/,
    /pass\s+by\s+(?:the\s+)?(.+)/,
    /via\s+(?:the\s+)?(.+)/,
    /stop\s+at\s+(?:the\s+)?(.+)/,
    /include\s+(?:the\s+)?(.+)/,
    /add\s+(?:a\s+)?(?:waypoint\s+)?(?:at\s+|through\s+)?(?:the\s+)?(.+)/,
    /detour\s+(?:through\s+|to\s+|via\s+)?(?:the\s+)?(.+)/,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      // Clean trailing punctuation / filler words
      return m[1].replace(/[.!?,;]+$/, '').trim();
    }
  }
  return null;
}

// ── Quick-action presets ────────────────────────────────────────────────────────

export const QUICK_ACTIONS = [
  { id: 'flatten', icon: 'mountain', label: 'Flatter', description: 'Minimize climbing', intent: 'flatten' },
  { id: 'scenic', icon: 'tree', label: 'Scenic', description: 'Bike paths & parks', intent: 'scenic' },
  { id: 'gravel', icon: 'road', label: 'More gravel', description: 'Trails & unpaved', intent: 'surface_gravel' },
  { id: 'paved', icon: 'road', label: 'More paved', description: 'Smooth surfaces', intent: 'surface_paved' },
  { id: 'faster', icon: 'bolt', label: 'Faster', description: 'Direct & efficient', intent: 'faster' },
  { id: 'reverse', icon: 'arrows', label: 'Reverse', description: 'Flip direction', intent: 'reverse' },
];

// ── Route modification engine ──────────────────────────────────────────────────

/**
 * Apply an AI edit to the current route.
 *
 * @param {Object} params
 * @param {Object} params.routeGeometry  GeoJSON LineString geometry
 * @param {string} params.routeProfile   Current profile: road | gravel | mountain | commuting
 * @param {Object} params.routeStats     { distance_km, elevation_gain_m, duration_s }
 * @param {Object} params.editIntent     Output of classifyEditIntent()
 * @param {Object} [params.mapboxToken]  For geocoding detour locations
 * @param {string} [params.routeType]    Declared shape from the builder store
 *                                       ('loop' | 'out_and_back' | 'point_to_point').
 *                                       Optional — omitted (RB1 callers) falls back
 *                                       to pure geometric loop detection.
 * @returns {Promise<Object>} { success, editedRoute, comparison, message }
 */
export async function applyRouteEdit(params) {
  const { routeGeometry, routeProfile, routeStats, editIntent, mapboxToken, routeType } = params;

  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
    return { success: false, message: 'No route to edit' };
  }

  const coords = routeGeometry.coordinates;
  const intent = editIntent.intent;
  const totalDistKm =
    (routeStats?.distance_km ?? routeStats?.distance) || estimateDistanceKm(coords);
  const isLoop = resolveIsLoop(coords, totalDistKm, routeType);

  try {
    switch (intent) {
      case 'flatten':
        return await applyElevationEdit(coords, routeProfile, routeStats, {
          direction: 'down',
          elevationDeltaM: editIntent.elevationDeltaM,
          isLoop,
        });
      case 'add_climbing':
        return await applyElevationEdit(coords, routeProfile, routeStats, {
          direction: 'up',
          elevationDeltaM: editIntent.elevationDeltaM,
          isLoop,
        });
      case 'shift_direction':
        return await applyShiftDirectionEdit(coords, routeProfile, routeStats, {
          direction: editIntent.direction,
          roadPreference: editIntent.roadPreference,
          isLoop,
        });
      case 'add_waypoint':
        return await applyAddWaypointEdit(coords, routeProfile, routeStats, editIntent.waypoint);
      case 'surface_gravel':
        return await applySurfaceEdit(coords, routeProfile, routeStats, 'gravel', isLoop);
      case 'surface_paved':
        return await applySurfaceEdit(coords, routeProfile, routeStats, 'paved', isLoop);
      case 'scenic':
        return await applyScenicEdit(coords, routeProfile, routeStats, isLoop);
      case 'faster':
        return await applyFasterEdit(coords, routeProfile, routeStats, isLoop);
      case 'shorter':
      case 'longer':
        return await (intent === 'shorter' ? applyShorterEdit : applyLongerEdit)(
          coords,
          routeProfile,
          routeStats,
          resolveDistanceGoalKm(intent, totalDistKm, editIntent),
          isLoop,
        );
      case 'reverse':
        return applyReverseEdit(coords, routeStats);
      case 'avoid':
        return await applyAvoidEdit(coords, routeProfile, routeStats, editIntent.location, mapboxToken, isLoop);
      case 'detour':
        return await applyDetourEdit(coords, routeProfile, routeStats, editIntent.location, mapboxToken);
      case 'restore_previous':
        // Handled by the chat layer's checkpoint stack before geometry
        // dispatch — reaching here means a caller without checkpoints.
        return { success: false, message: 'Nothing to restore here — use Undo instead.' };
      default:
        return { success: false, message: `I couldn't understand that edit. Try "make it flatter", "more gravel", "avoid [place]", or use the quick actions.` };
    }
  } catch (err) {
    console.error(`[AI Edit] Error applying ${intent}:`, err);
    return { success: false, message: `Edit failed: ${err.message}` };
  }
}

// ── Individual edit strategies ──────────────────────────────────────────────────

// A hilly/flat reroute may not drift more than this fraction from the
// original distance — beyond it, the edit silently rewrites the ride.
const ELEVATION_EDIT_MAX_DISTANCE_DRIFT = 0.25;

/**
 * Shared core for flatten ('down') and add_climbing ('up').
 *
 * Distance-preserving by design: anchors are sampled by cumulative
 * distance (one per ~8 km, clamped 4–8) so the reroute keeps the ride's
 * shape, candidates that drift more than 25 % from the original distance
 * are rejected outright, and a finite `elevationDeltaM` steers Valhalla's
 * use_hills toward the implied gain/km instead of the blunt 0/1 extremes.
 */
async function applyElevationEdit(coords, profile, stats, { direction, elevationDeltaM, isLoop }) {
  const wantMore = direction === 'up';
  // The gate compares router geometry against current geometry — both via
  // estimateDistanceKm — so a stale stats row can't skew the drift check.
  const originalGeomDistKm = estimateDistanceKm(coords);
  const originalDistKm = (stats?.distance_km ?? stats?.distance) || originalGeomDistKm;
  const originalGainM = stats?.elevation_gain_m ?? stats?.elevation ?? null;

  const anchorCount = Math.min(8, Math.max(4, Math.round(originalDistKm / 8)));
  const waypoints = buildRerouteWaypoints(coords, isLoop, anchorCount);

  const targetGainM =
    Number.isFinite(elevationDeltaM) && Number.isFinite(originalGainM)
      ? Math.max(0, originalGainM + elevationDeltaM)
      : null;
  let useHills = wantMore ? 1 : 0;
  if (targetGainM != null) {
    const bias = hillsBiasForTarget(targetGainM, originalDistKm);
    if (bias != null) useHills = bias;
  }

  const results = [];

  // Strategy 1: Stadia Maps with the hills bias
  try {
    const stadiaRoute = await getStadiaMapsRoute(waypoints, {
      profile: profile === 'mountain' ? 'gravel' : profile,
      preferences: { use_hills: useHills, avoid_bad_surfaces: profile === 'road' ? 0.8 : 0.2 },
    });
    if (stadiaRoute?.coordinates?.length > 1) {
      results.push({
        ...stadiaRoute,
        label: wantMore ? 'Hilliest (Valhalla)' : 'Flattest (Valhalla)',
        strategy: wantMore ? 'stadia_hills' : 'stadia_flat',
      });
    }
  } catch (e) { console.warn(`[AI Edit] Stadia ${wantMore ? 'hills' : 'flat'} failed:`, e.message); }

  // Strategy 2: BRouter — trekking trends toward terrain, safety avoids steep roads
  try {
    const brouterRoute = await getBRouterDirections(waypoints, {
      profile: wantMore ? 'trekking' : 'safety',
    });
    if (brouterRoute?.coordinates?.length > 1) {
      results.push({
        ...brouterRoute,
        label: wantMore ? 'Hillier (BRouter)' : 'Safer & flatter (BRouter)',
        strategy: wantMore ? 'brouter_trekking' : 'brouter_safety',
      });
    }
  } catch (e) { console.warn(`[AI Edit] BRouter ${wantMore ? 'trekking' : 'safety'} failed:`, e.message); }

  if (results.length === 0) {
    return {
      success: false,
      message: wantMore
        ? 'Could not find a hillier alternative. The area may not have steeper options.'
        : 'Could not find a flatter alternative. The area may not have lower-elevation options.',
    };
  }

  // Measure each candidate: distance is free; gain costs one elevation
  // lookup per candidate (≤2 here, +0 for the winner since we reuse it).
  const measured = [];
  for (const route of results) {
    const distKm = estimateDistanceKm(route.coordinates);
    let gain = null;
    try {
      const elevData = await getElevationData(route.coordinates);
      if (elevData) {
        const elevStats = calculateElevationStats(elevData);
        if (Number.isFinite(elevStats?.gain)) gain = elevStats.gain;
      }
    } catch { /* fall through to router-reported gain */ }
    if (gain == null) {
      const reported = route.elevation?.ascent ?? route.elevationGain;
      if (Number.isFinite(reported)) gain = reported;
    }
    measured.push({ route, distKm, gain });
  }

  const surviving = measured.filter(
    (m) =>
      Math.abs(m.distKm - originalGeomDistKm) / originalGeomDistKm <=
      ELEVATION_EDIT_MAX_DISTANCE_DRIFT
  );
  if (surviving.length === 0) {
    return {
      success: false,
      message: wantMore
        ? "Couldn't add climbing without changing the route's distance too much — try a detour through a hilly area instead."
        : "Couldn't flatten the route without changing its distance too much — try a specific detour instead.",
    };
  }

  // With a target: closest gain to it. Without: hilliest / flattest.
  let best = surviving[0];
  for (const m of surviving.slice(1)) {
    if (m.gain == null) continue;
    if (best.gain == null) { best = m; continue; }
    if (targetGainM != null) {
      if (Math.abs(m.gain - targetGainM) < Math.abs(best.gain - targetGainM)) best = m;
    } else if (wantMore ? m.gain > best.gain : m.gain < best.gain) {
      best = m;
    }
  }

  const comparison = await buildComparison(
    coords,
    best.route.coordinates,
    stats,
    best.gain != null ? { newGainM: best.gain } : {}
  );

  const distNote =
    Math.abs(comparison.distanceDelta) < originalDistKm * 0.05
      ? 'distance roughly unchanged'
      : `${comparison.distanceDelta > 0 ? '+' : ''}${comparison.distanceDelta.toFixed(1)}km`;

  return {
    success: true,
    editedRoute: {
      coordinates: best.route.coordinates,
      source: best.route.source || best.route.strategy,
    },
    comparison,
    message: wantMore
      ? comparison.elevationDelta > 0
        ? `Found a hillier route: ${comparison.elevationDelta}m more climbing (${distNote})`
        : 'This is already one of the hilliest routes nearby that keeps your distance'
      : comparison.elevationDelta < 0
        ? `Found a flatter route: ${Math.abs(comparison.elevationDelta)}m less climbing (${distNote})`
        : 'This is already one of the flattest routes nearby that keeps your distance',
  };
}

async function applySurfaceEdit(coords, profile, stats, targetSurface, isLoop) {
  const waypoints = buildRerouteWaypoints(coords, isLoop, isLoop ? 5 : 3);

  const newProfile = targetSurface === 'gravel' ? 'gravel' : 'road';
  const results = [];

  // BRouter with appropriate profile
  const brouterProfile = targetSurface === 'gravel' ? 'trekking' : 'fastbike';
  try {
    const route = await getBRouterDirections(waypoints, { profile: brouterProfile });
    if (route?.coordinates?.length > 1) {
      results.push({ ...route, label: `${targetSurface === 'gravel' ? 'Trail-focused' : 'Road-focused'} (BRouter)`, strategy: `brouter_${brouterProfile}` });
    }
  } catch (e) { console.warn('[AI Edit] BRouter surface failed:', e.message); }

  // Stadia Maps with surface preferences
  try {
    const route = await getStadiaMapsRoute(waypoints, {
      profile: newProfile,
      preferences: {
        avoid_bad_surfaces: targetSurface === 'gravel' ? 0 : 1.0,
        use_roads: targetSurface === 'gravel' ? 0.05 : 0.5,
      },
    });
    if (route?.coordinates?.length > 1) {
      results.push({ ...route, label: `${targetSurface === 'gravel' ? 'Off-road' : 'Paved'} (Valhalla)`, strategy: `stadia_${targetSurface}` });
    }
  } catch (e) { console.warn('[AI Edit] Stadia surface failed:', e.message); }

  if (results.length === 0) {
    return { success: false, message: `No ${targetSurface} alternatives found in this area.` };
  }

  // Pick best by distance similarity to original (don't deviate too much)
  const originalDistKm = (stats.distance_km ?? stats.distance) || estimateDistanceKm(coords);
  const best = results.reduce((a, b) => {
    const diffA = Math.abs((a.distance || 0) / 1000 - originalDistKm);
    const diffB = Math.abs((b.distance || 0) / 1000 - originalDistKm);
    return diffA <= diffB ? a : b;
  });

  const comparison = await buildComparison(coords, best.coordinates, stats);

  return {
    success: true,
    editedRoute: {
      coordinates: best.coordinates,
      source: best.source || best.strategy,
    },
    comparison,
    message: `Route shifted toward ${targetSurface} surfaces (${comparison.distanceDelta > 0 ? '+' : ''}${comparison.distanceDelta.toFixed(1)}km)`,
  };
}

async function applyScenicEdit(coords, profile, stats, isLoop) {
  const waypoints = buildRerouteWaypoints(coords, isLoop, isLoop ? 5 : 3);
  const results = [];

  // Stadia Maps with max bike path preference
  try {
    const route = await getStadiaMapsRoute(waypoints, {
      profile: 'commuting', // Commuting profile maximizes bike path usage
      preferences: { use_roads: 0, use_living_streets: 1.0 },
    });
    if (route?.coordinates?.length > 1) {
      results.push({ ...route, label: 'Bike paths (Valhalla)', strategy: 'stadia_scenic' });
    }
  } catch (e) { console.warn('[AI Edit] Stadia scenic failed:', e.message); }

  // BRouter safety profile (prefers quiet roads and bike infra)
  try {
    const route = await getBRouterDirections(waypoints, { profile: 'safety' });
    if (route?.coordinates?.length > 1) {
      results.push({ ...route, label: 'Quiet roads (BRouter)', strategy: 'brouter_scenic' });
    }
  } catch (e) { console.warn('[AI Edit] BRouter scenic failed:', e.message); }

  if (results.length === 0) {
    return { success: false, message: 'No scenic alternatives found.' };
  }

  const best = results[0]; // Prefer Stadia commuting which maximizes bike paths
  const comparison = await buildComparison(coords, best.coordinates, stats);

  return {
    success: true,
    editedRoute: {
      coordinates: best.coordinates,
      source: best.source || best.strategy,
    },
    comparison,
    message: `Route shifted to prefer bike paths and quieter roads`,
  };
}

async function applyFasterEdit(coords, profile, stats, isLoop) {
  const waypoints = buildRerouteWaypoints(coords, isLoop, isLoop ? 5 : 3);
  const results = [];

  // BRouter fastbike profile
  try {
    const route = await getBRouterDirections(waypoints, { profile: 'fastbike' });
    if (route?.coordinates?.length > 1) {
      results.push({ ...route, label: 'Fast bike (BRouter)', strategy: 'brouter_fast' });
    }
  } catch (e) { console.warn('[AI Edit] BRouter fast failed:', e.message); }

  // Stadia road profile
  try {
    const route = await getStadiaMapsRoute(waypoints, {
      profile: 'road',
      preferences: { use_roads: 0.5, use_hills: 0.3 },
    });
    if (route?.coordinates?.length > 1) {
      results.push({ ...route, label: 'Road-optimized (Valhalla)', strategy: 'stadia_fast' });
    }
  } catch (e) { console.warn('[AI Edit] Stadia fast failed:', e.message); }

  if (results.length === 0) {
    return { success: false, message: 'No faster alternatives found.' };
  }

  // Pick fastest (shortest duration)
  const best = results.reduce((a, b) => (a.duration || Infinity) < (b.duration || Infinity) ? a : b);
  const comparison = await buildComparison(coords, best.coordinates, stats);

  return {
    success: true,
    editedRoute: {
      coordinates: best.coordinates,
      source: best.source || best.strategy,
    },
    comparison,
    message: `Found a more direct route (${comparison.distanceDelta < 0 ? '' : '+'}${comparison.distanceDelta.toFixed(1)}km)`,
  };
}

/**
 * How close a distance edit has to land before it stops correcting. Matches
 * the generator's target tolerance so "make it 40 km" and "generate 40 km"
 * mean the same thing to the rider.
 */
const DISTANCE_EDIT_TOLERANCE = 0.10;

/**
 * Resolve what the finished route should measure.
 *
 * The coach tool sends an absolute `targetDistanceKm` when the rider named one
 * ("make it 40 km"); `distanceModifier` is the legacy delta. Working from the
 * absolute target where we have it means the edit can be *measured* against
 * what was asked for rather than hoping a delta lands.
 */
function resolveDistanceGoalKm(intent, totalDistKm, editIntent) {
  const explicit = Number(editIntent?.targetDistanceKm);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const delta = Number(editIntent?.distanceModifier);
  const step = Number.isFinite(delta) && delta > 0 ? delta : totalDistKm * 0.2;
  return intent === 'shorter'
    ? Math.max(totalDistKm * 0.4, totalDistKm - step)
    : totalDistKm + step;
}

/**
 * Trim a route toward a target distance.
 *
 * Trimming happens by *point count*, but router output is denser through
 * turns — so cutting N% of the points does not cut N% of the kilometres, and
 * the trimmed chord then has to be snapped back onto roads, which changes the
 * length again. Both effects made the old single-shot version report a delta
 * it hadn't delivered. So: trim, reroute, measure, and correct once.
 */
async function applyShorterEdit(coords, profile, stats, goalKm, isLoop) {
  const totalDist = (stats.distance_km ?? stats.distance) || estimateDistanceKm(coords);
  const target = goalKm > 0 ? goalKm : totalDist * 0.8;

  const trimTo = (keepRatio) => {
    const ratio = Math.max(0.25, Math.min(0.99, keepRatio));
    let next;
    if (isLoop) {
      // For loops, trim from the farthest point (cut the "bulge")
      const midIdx = Math.floor(coords.length / 2);
      const trimCount = Math.floor(coords.length * (1 - ratio));
      const trimStart = Math.max(1, midIdx - Math.floor(trimCount / 2));
      const trimEnd = Math.min(coords.length - 2, midIdx + Math.floor(trimCount / 2));
      next = [...coords.slice(0, trimStart), ...coords.slice(trimEnd)];
    } else {
      // For point-to-point, trim proportionally from both ends toward center
      const keepCount = Math.floor(coords.length * ratio);
      const startTrim = Math.floor((coords.length - keepCount) * 0.3); // Trim less from start
      next = coords.slice(startTrim, startTrim + keepCount);
    }
    return next.length >= 2 ? next : [coords[0], coords[coords.length - 1]];
  };

  // Aim straight at the requested ratio; `trimTo` clamps the degenerate ends,
  // so there's no need for a second floor here to hold big cuts back.
  let keepRatio = target / totalDist;
  let best = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const trimmed = trimTo(keepRatio);
    // Snap the trimmed chord back onto roads before measuring — the raw trim
    // jumps straight across the cut, so its length is not the ride's length.
    const routed = await rerouteTrimmed(trimmed, profile, isLoop);
    const measuredKm = estimateDistanceKm(routed);
    if (measuredKm <= 0) break;
    if (!best || Math.abs(measuredKm - target) < Math.abs(best.measuredKm - target)) {
      best = { coords: routed, measuredKm };
    }
    if (Math.abs(measuredKm - target) / target <= DISTANCE_EDIT_TOLERANCE) break;
    if (attempt === 0) {
      // Rerouting reliably returns more than the trimmed chord, so correct
      // the keep-ratio by how far the measured result actually landed.
      keepRatio = Math.max(0.25, Math.min(0.99, keepRatio * (target / measuredKm)));
    }
  }

  if (!best) {
    return { success: false, message: 'Could not shorten the route. Try a specific detour instead.' };
  }

  const comparison = await buildComparison(coords, best.coords, stats);
  return {
    success: true,
    editedRoute: {
      coordinates: best.coords,
      source: 'trimmed',
      // Already rerouted and measured here, so callers must not re-snap:
      // doing so would change the length again after we reported it.
      needsReroute: false,
    },
    comparison,
    message: `Shortened to ${best.measuredKm.toFixed(1)}km`,
  };
}

/**
 * Snap a trimmed coordinate list back onto roads. Mirrors
 * `routeMutation.rerouteShortened`, which the chat callers used to run *after*
 * this edit reported its numbers; doing it here is what lets the reported
 * distance be the delivered one.
 */
async function rerouteTrimmed(trimmed, profile, isLoop) {
  if (trimmed.length < 2) return trimmed;
  const waypoints = buildRerouteWaypoints(trimmed, isLoop, 5);
  try {
    const routed = await getSmartCyclingRoute(waypoints, { profile });
    if (routed?.coordinates?.length > 1) return routed.coordinates;
  } catch (e) {
    console.warn('[AI Edit] Reroute after trim failed:', e.message);
  }
  return trimmed;
}

async function applyLongerEdit(coords, profile, stats, goalKm, isLoop) {
  const totalDist = (stats.distance_km ?? stats.distance) || estimateDistanceKm(coords);
  const target = goalKm > 0 ? goalKm : totalDist * 1.2;
  const addKm = Math.max(0.1, target - totalDist);
  const start = coords[0];
  const end = coords[coords.length - 1];

  if (!isLoop) {
    return await extendPointToPoint(coords, profile, stats, totalDist, addKm, start, end);
  }

  // For loops: push the farthest point outward to extend the loop. How far
  // that actually lengthens the ride depends on the road network, so measure
  // and correct once — this branch was the only distance edit with no
  // convergence at all, which is why "make it 40 km" used to drift.
  const midCoord = coordAtDistanceFraction(coords, 0.5);
  const bearing = calculateBearing(start, midCoord);
  let extraKm = addKm / 2; // Extending both legs
  let best = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const newMidpoint = projectPoint(midCoord, bearing, extraKm);
    // Anchors by cumulative distance, closing the loop at the exact start.
    const waypoints = [
      start,
      coordAtDistanceFraction(coords, 0.25),
      newMidpoint,
      coordAtDistanceFraction(coords, 0.75),
      start,
    ];

    try {
      const route = await getSmartCyclingRoute(waypoints, { profile });
      if (route?.coordinates?.length > 1) {
        const measuredKm = estimateDistanceKm(route.coordinates);
        if (!best || Math.abs(measuredKm - target) < Math.abs(best.measuredKm - target)) {
          best = { route, measuredKm };
        }
        if (measuredKm > 0 && Math.abs(measuredKm - target) / target <= DISTANCE_EDIT_TOLERANCE) break;
        if (attempt === 0 && measuredKm > 0) {
          const achievedDelta = measuredKm - totalDist;
          extraKm =
            achievedDelta > 0
              ? Math.min(Math.max(extraKm * (addKm / achievedDelta), extraKm * 0.4), extraKm * 2.5)
              : extraKm * 2;
        }
      }
    } catch (e) {
      console.warn('[AI Edit] Extend route failed:', e.message);
    }
  }

  if (best?.route) {
    const comparison = await buildComparison(coords, best.route.coordinates, stats);
    return {
      success: true,
      editedRoute: {
        coordinates: best.route.coordinates,
        source: best.route.source,
      },
      comparison,
      message: `Extended loop to ${best.measuredKm.toFixed(1)}km`,
    };
  }

  return { success: false, message: 'Could not extend the route. Try a specific detour instead.' };
}

/**
 * Extend a point-to-point route without moving either endpoint: bow the
 * route's distance-based midpoint perpendicular to the start→end chord
 * and reroute start → bowed midpoint → end. The bow height starts at
 * addKm/2 and is rescaled once against the measured result when the
 * first attempt lands more than 20 % off target (max 2 routing calls).
 */
async function extendPointToPoint(coords, profile, stats, totalDist, addKm, start, end) {
  const midCoord = coordAtDistanceFraction(coords, 0.5);
  const bowBearing = (calculateBearing(start, end) + 90) % 360;
  let bowKm = Math.max(0.5, addKm / 2);
  let best = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const bowedMid = projectPoint(midCoord, bowBearing, bowKm);
    try {
      const route = await getSmartCyclingRoute([start, bowedMid, end], { profile });
      if (route?.coordinates?.length > 1) {
        const achievedDeltaKm = estimateDistanceKm(route.coordinates) - totalDist;
        if (
          !best ||
          Math.abs(achievedDeltaKm - addKm) < Math.abs(best.achievedDeltaKm - addKm)
        ) {
          best = { route, achievedDeltaKm };
        }
        if (achievedDeltaKm > 0 && Math.abs(achievedDeltaKm - addKm) / addKm <= 0.2) break;
        if (attempt === 0) {
          // Rescale the bow height toward the target; if the first bow
          // added nothing measurable, just bow twice as far.
          bowKm =
            achievedDeltaKm > 0
              ? Math.min(bowKm * (addKm / achievedDeltaKm), bowKm * 4)
              : bowKm * 2;
        }
      }
    } catch (e) {
      console.warn('[AI Edit] Extend point-to-point failed:', e.message);
    }
  }

  if (best?.route && best.achievedDeltaKm > 0) {
    const comparison = await buildComparison(coords, best.route.coordinates, stats);
    return {
      success: true,
      editedRoute: {
        coordinates: best.route.coordinates,
        source: best.route.source,
      },
      comparison,
      message: `Extended the route by ~${Math.abs(comparison.distanceDelta).toFixed(1)}km (start and end unchanged)`,
    };
  }

  return { success: false, message: 'Could not extend the route. Try adding a detour through a nearby area instead.' };
}

function applyReverseEdit(coords, stats) {
  const reversed = [...coords].reverse();
  return {
    success: true,
    editedRoute: {
      coordinates: reversed,
      source: 'reversed',
    },
    comparison: {
      distanceDelta: 0,
      newDistance: (stats.distance_km ?? stats.distance) || estimateDistanceKm(reversed),
      originalDistance: (stats.distance_km ?? stats.distance) || estimateDistanceKm(coords),
      elevationDelta: null, // Same total but opposite profile
    },
    message: 'Route direction reversed',
  };
}

async function applyAvoidEdit(coords, profile, stats, location, mapboxToken, isLoop) {
  if (!location) {
    return { success: false, message: 'Please specify what to avoid (e.g., "avoid the highway" or "avoid downtown").' };
  }

  // Check for generic road-type avoidance
  const roadTypes = ['highway', 'motorway', 'busy road', 'main road', 'traffic', 'freeway'];
  const isRoadTypeAvoid = roadTypes.some(rt => location.includes(rt));

  if (isRoadTypeAvoid) {
    // Re-route with bike-path-heavy preferences
    return await applyScenicEdit(coords, profile, stats, isLoop);
  }

  // Location-based avoidance: geocode → find nearest segment → re-route around
  if (!mapboxToken) {
    return { success: false, message: 'Geocoding not available. Try a road-type avoidance like "avoid highways".' };
  }

  const avoidPoint = await geocodeLocation(location, coords[0], mapboxToken);
  if (!avoidPoint) {
    return { success: false, message: `Couldn't find "${location}" near the route.` };
  }

  // Find the segment closest to the avoid point
  const { segStart, segEnd } = findSegmentNear(coords, avoidPoint);

  if (segStart == null) {
    return { success: false, message: `"${location}" doesn't seem to be near the current route.` };
  }

  // Re-route the avoid segment through a point perpendicular to the avoid area
  const midpoint = coords[Math.floor((segStart + segEnd) / 2)];
  const bearing = calculateBearing(midpoint, avoidPoint);
  const detourPoint = projectPoint(midpoint, bearing + 180, 1.0); // 1km away in opposite direction

  const beforeCoords = coords.slice(0, segStart + 1);
  const afterCoords = coords.slice(segEnd);

  const rerouteWaypoints = [
    coords[segStart],
    detourPoint,
    coords[segEnd],
  ];

  try {
    const rerouted = await getSmartCyclingRoute(rerouteWaypoints, { profile });
    if (rerouted?.coordinates?.length > 1) {
      const newCoords = [...beforeCoords, ...rerouted.coordinates, ...afterCoords];
      const comparison = await buildComparison(coords, newCoords, stats);
      return {
        success: true,
        editedRoute: {
          coordinates: newCoords,
          source: rerouted.source,
        },
        comparison,
        message: `Route now avoids "${location}" (${comparison.distanceDelta > 0 ? '+' : ''}${comparison.distanceDelta.toFixed(1)}km)`,
      };
    }
  } catch (e) {
    console.warn('[AI Edit] Avoid re-route failed:', e.message);
  }

  return { success: false, message: `Could not route around "${location}".` };
}

async function applyDetourEdit(coords, profile, stats, location, mapboxToken) {
  if (!location) {
    return { success: false, message: 'Please specify where to detour (e.g., "go through the park" or "pass by Main Street").' };
  }

  if (!mapboxToken) {
    return { success: false, message: 'Geocoding not available for detour locations.' };
  }

  const detourPoint = await geocodeLocation(location, coords[0], mapboxToken);
  if (!detourPoint) {
    return { success: false, message: `Couldn't find "${location}" near the route.` };
  }

  // Find the closest point on the route to the detour location
  const { segStart, segEnd } = findSegmentNear(coords, detourPoint);

  const insertIdx = segStart != null ? Math.floor((segStart + segEnd) / 2) : Math.floor(coords.length / 2);

  // Re-route through the detour point
  const before = coords.slice(0, insertIdx + 1);
  const after = coords.slice(insertIdx);

  const legA = await getSmartCyclingRoute([coords[insertIdx], detourPoint], { profile }).catch(() => null);
  const legB = await getSmartCyclingRoute([detourPoint, after[0]], { profile }).catch(() => null);

  if (!legA?.coordinates?.length || !legB?.coordinates?.length) {
    return { success: false, message: `Could not route through "${location}".` };
  }

  const newCoords = [
    ...before,
    ...legA.coordinates.slice(1), // Skip duplicate start point
    ...legB.coordinates.slice(1), // Skip duplicate start point
    ...after.slice(1),
  ];

  const comparison = await buildComparison(coords, newCoords, stats);

  return {
    success: true,
    editedRoute: {
      coordinates: newCoords,
      source: legA.source || 'detour',
    },
    comparison,
    message: `Route now passes through "${location}" (+${comparison.distanceDelta.toFixed(1)}km)`,
  };
}

const DIRECTION_BEARINGS = {
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315,
};

async function applyShiftDirectionEdit(coords, profile, stats, { direction, roadPreference, isLoop }) {
  const bearing = DIRECTION_BEARINGS[direction];
  if (bearing == null) {
    return { success: false, message: `I couldn't tell which way to shift — try "shift north", "shift west", etc.` };
  }

  const start = coords[0];
  const end = coords[coords.length - 1];
  const totalDist = (stats?.distance_km ?? stats?.distance) || estimateDistanceKm(coords);
  const wantQuiet = roadPreference === 'quiet';

  // Quiet mode ("more rural / less traffic"): bias the rebuilt route onto
  // low-traffic roads. getSmartCyclingRoute forwards `preferences` into
  // Valhalla costing; the BRouter fallback simply isn't quiet-biased.
  const routeOpts = wantQuiet
    ? { profile, preferences: { use_roads: 0, use_living_streets: 1.0 } }
    : { profile };
  const quietNote = wantQuiet ? ' on quieter roads' : '';

  if (!isLoop) {
    // Point-to-point: keep the start and end fixed and bow the route's midpoint
    // toward the requested compass direction, then reroute start → bowed → end.
    const midCoord = coordAtDistanceFraction(coords, 0.5);
    const shiftKm = Math.max(1, totalDist * 0.15);
    const bowedMidpoint = projectPoint(midCoord, bearing, shiftKm);
    try {
      const route = await getSmartCyclingRoute([start, bowedMidpoint, end], routeOpts);
      if (route?.coordinates?.length > 1) {
        const comparison = await buildComparison(coords, route.coordinates, stats);
        return {
          success: true,
          editedRoute: {
            coordinates: route.coordinates,
            source: route.source || 'shift_direction',
          },
          comparison,
          message: `Shifted the route toward the ${direction}${quietNote} — now ${comparison.newDistance.toFixed(1)}km`,
        };
      }
    } catch (e) {
      console.warn('[AI Edit] Shift direction failed:', e.message);
    }
    return { success: false, message: `Could not shift the route ${direction}. The roads in that direction may not connect.` };
  }

  // Loops: project a fresh lobe out toward the bearing and route a new loop
  // through it — this RELOCATES the body of the ride while keeping the start.
  // The lobe radius starts at totalDist/4 (≈ the radius of a loop of that
  // length) and is rescaled once against the measured result so the rebuilt
  // loop lands near the original distance.
  let radiusKm = totalDist / 4;
  let best = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const waypoints = [
      start,
      projectPoint(start, bearing - 30, radiusKm),
      projectPoint(start, bearing, radiusKm * 1.3),
      projectPoint(start, bearing + 30, radiusKm),
      start, // close the loop
    ];
    try {
      const route = await getSmartCyclingRoute(waypoints, routeOpts);
      if (route?.coordinates?.length > 1) {
        const measuredKm = estimateDistanceKm(route.coordinates);
        if (!best || Math.abs(measuredKm - totalDist) < Math.abs(best.measuredKm - totalDist)) {
          best = { route, measuredKm };
        }
        if (measuredKm > 0 && Math.abs(measuredKm - totalDist) / totalDist <= 0.2) break;
        if (attempt === 0 && measuredKm > 0) {
          radiusKm = Math.min(
            Math.max(radiusKm * (totalDist / measuredKm), radiusKm * 0.4),
            radiusKm * 2.5,
          );
        }
      }
    } catch (e) {
      console.warn('[AI Edit] Shift direction failed:', e.message);
    }
  }

  // No hard distance reject — relocation is the point; take the closest
  // candidate and report the real numbers honestly.
  if (best?.route) {
    const comparison = await buildComparison(coords, best.route.coordinates, stats);
    return {
      success: true,
      editedRoute: {
        coordinates: best.route.coordinates,
        source: best.route.source || 'shift_direction',
      },
      comparison,
      message: `Rebuilt the loop toward the ${direction}${quietNote}, keeping your start — now ${comparison.newDistance.toFixed(1)}km`,
    };
  }

  return { success: false, message: `Could not shift the route ${direction}. The roads in that direction may not connect.` };
}

async function applyAddWaypointEdit(coords, profile, stats, waypoint) {
  const lng = Array.isArray(waypoint) ? Number(waypoint[0]) : NaN;
  const lat = Array.isArray(waypoint) ? Number(waypoint[1]) : NaN;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { success: false, message: 'I need a valid coordinate to route through. Try dropping a pin or naming the place.' };
  }
  const waypointPoint = [lng, lat];

  // Same insert-and-restitch as detour, but the coordinate is given directly
  // (no geocoding needed).
  const { segStart, segEnd } = findSegmentNear(coords, waypointPoint);
  const insertIdx = segStart != null ? Math.floor((segStart + segEnd) / 2) : Math.floor(coords.length / 2);

  const before = coords.slice(0, insertIdx + 1);
  const after = coords.slice(insertIdx);

  const legA = await getSmartCyclingRoute([coords[insertIdx], waypointPoint], { profile }).catch(() => null);
  const legB = await getSmartCyclingRoute([waypointPoint, after[0]], { profile }).catch(() => null);

  if (!legA?.coordinates?.length || !legB?.coordinates?.length) {
    return { success: false, message: 'Could not route through that point. It may be unreachable by bike.' };
  }

  const newCoords = [
    ...before,
    ...legA.coordinates.slice(1), // Skip duplicate start point
    ...legB.coordinates.slice(1), // Skip duplicate start point
    ...after.slice(1),
  ];

  const comparison = await buildComparison(coords, newCoords, stats);

  return {
    success: true,
    editedRoute: {
      coordinates: newCoords,
      source: legA.source || 'add_waypoint',
    },
    comparison,
    message: `Route now passes through the added waypoint (+${comparison.distanceDelta.toFixed(1)}km)`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Loop detection with an optional declared shape. Geometry rules first: a
 * start/end gap under 1 km is always a loop. A route the builder DECLARES
 * to be a loop keeps loop status up to a wider gap — max(2, 5 % of
 * distance) km — so one edit that fails to close cleanly doesn't silently
 * reclassify the route as point-to-point for every edit after it.
 */
function resolveIsLoop(coords, totalDistKm, declaredRouteType) {
  const gapKm = haversineKm(coords[0], coords[coords.length - 1]);
  if (gapKm < 1) return true;
  if (declaredRouteType === 'loop') {
    return gapKm < Math.max(2, totalDistKm * 0.05);
  }
  return false;
}

/**
 * Sample `count` anchors spaced evenly by CUMULATIVE DISTANCE. Router
 * output is far denser through turns and urban sections than on straights,
 * so index-based sampling lands anchors nowhere near their intended
 * distance fraction — the cause of drastic route shrink on reroutes.
 * Keeps the exact first and last coordinates.
 */
function sampleWaypointsByDistance(coords, count) {
  if (count <= 2 || coords.length <= count) {
    return count <= 2 ? [coords[0], coords[coords.length - 1]] : [...coords];
  }
  const cumKm = [0];
  for (let i = 1; i < coords.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  const totalKm = cumKm[cumKm.length - 1];
  if (totalKm <= 0) return [coords[0], coords[coords.length - 1]];

  const wps = [coords[0]];
  let idx = 0;
  for (let i = 1; i < count - 1; i++) {
    const targetKm = (totalKm * i) / (count - 1);
    while (idx < cumKm.length - 1 && cumKm[idx] < targetKm) idx++;
    wps.push(coords[idx]);
  }
  wps.push(coords[coords.length - 1]);
  return wps;
}

/**
 * Anchors for rerouting the whole route. Loops end with the EXACT start
 * coordinate so the rerouted result closes again — even when the current
 * geometry's closure has drifted.
 */
function buildRerouteWaypoints(coords, isLoop, count) {
  const wps = sampleWaypointsByDistance(coords, count);
  if (isLoop) wps[wps.length - 1] = coords[0];
  return wps;
}

/** The coordinate at a cumulative-distance fraction (0–1) along the route. */
function coordAtDistanceFraction(coords, fraction) {
  if (coords.length < 2) return coords[0];
  const totalKm = estimateDistanceKm(coords);
  if (totalKm <= 0) return coords[Math.floor(coords.length * fraction)];
  const targetKm = totalKm * Math.min(1, Math.max(0, fraction));
  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    cum += haversineKm(coords[i - 1], coords[i]);
    if (cum >= targetKm) return coords[i];
  }
  return coords[coords.length - 1];
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function estimateDistanceKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}

function calculateBearing(from, to) {
  const dLon = (to[0] - from[0]) * Math.PI / 180;
  const lat1 = from[1] * Math.PI / 180;
  const lat2 = to[1] * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function projectPoint(coord, bearingDeg, distKm) {
  const R = 6371;
  const brng = bearingDeg * Math.PI / 180;
  const lat1 = coord[1] * Math.PI / 180;
  const lon1 = coord[0] * Math.PI / 180;
  const d = distKm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
}

function findSegmentNear(coords, point, radiusKm = 2) {
  let minDist = Infinity;
  let nearestIdx = -1;

  // Sample every 10th coordinate for performance
  const step = Math.max(1, Math.floor(coords.length / 200));
  for (let i = 0; i < coords.length; i += step) {
    const d = haversineKm(coords[i], point);
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }

  if (minDist > radiusKm * 3) return { segStart: null, segEnd: null };

  // Expand segment around nearest point (±10% of route)
  const extent = Math.max(20, Math.floor(coords.length * 0.1));
  return {
    segStart: Math.max(0, nearestIdx - extent),
    segEnd: Math.min(coords.length - 1, nearestIdx + extent),
  };
}

async function geocodeLocation(query, nearCoord, mapboxToken) {
  try {
    const proximity = `${nearCoord[0]},${nearCoord[1]}`;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${proximity}&limit=1&access_token=${mapboxToken}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.features?.length > 0) {
      return data.features[0].center; // [lon, lat]
    }
  } catch (e) {
    console.warn('[AI Edit] Geocode failed:', e.message);
  }
  return null;
}

async function buildComparison(originalCoords, newCoords, originalStats, precomputed = {}) {
  // Read canonical-first with legacy fallback (RB2/route-coach passes
  // distance_km/elevation_gain_m; older callers pass distance/elevation).
  const originalDist =
    originalStats?.distance_km ?? originalStats?.distance ?? estimateDistanceKm(originalCoords);
  const newDist = estimateDistanceKm(newCoords);
  const originalElev = originalStats?.elevation_gain_m ?? originalStats?.elevation ?? 0;

  let elevationDelta = null;
  if (Number.isFinite(precomputed.newGainM)) {
    // Caller already measured the new route's gain — don't re-fetch.
    elevationDelta = Math.round(precomputed.newGainM - originalElev);
  } else {
    try {
      const newElev = await getElevationData(newCoords);
      if (newElev) {
        const newStats = calculateElevationStats(newElev);
        if (Number.isFinite(newStats?.gain)) {
          elevationDelta = Math.round(newStats.gain - originalElev);
        }
      }
    } catch { /* elevation comparison unavailable */ }
  }

  return {
    originalDistance: parseFloat(originalDist.toFixed(1)),
    newDistance: parseFloat(newDist.toFixed(1)),
    distanceDelta: parseFloat((newDist - originalDist).toFixed(1)),
    elevationDelta,
  };
}

export default {
  classifyEditIntent,
  applyRouteEdit,
  QUICK_ACTIONS,
  EDIT_INTENTS,
};
