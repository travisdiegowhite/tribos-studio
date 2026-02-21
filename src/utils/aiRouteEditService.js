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
import { getSmartRunningRoute } from './smartRunningRouter.js';
import { getBRouterDirections, BROUTER_PROFILES } from './brouter.js';
import { getStadiaMapsRoute } from './stadiaMapsRouter.js';
import { getElevationData, calculateElevationStats } from './elevation.js';

// Sport-aware routing helper
function getSmartRoute(waypoints, options, sportType = 'cycling') {
  return sportType === 'running'
    ? getSmartRunningRoute(waypoints, options)
    : getSmartCyclingRoute(waypoints, options);
}

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

export const RUNNING_QUICK_ACTIONS = [
  { id: 'flatten', icon: 'mountain', label: 'Flatter', description: 'Minimize climbing', intent: 'flatten' },
  { id: 'scenic', icon: 'tree', label: 'Scenic', description: 'Parks & paths', intent: 'scenic' },
  { id: 'trail', icon: 'road', label: 'More trail', description: 'Trails & paths', intent: 'surface_gravel' },
  { id: 'paved', icon: 'road', label: 'Sidewalks', description: 'Paved surfaces', intent: 'surface_paved' },
  { id: 'faster', icon: 'bolt', label: 'Shorter', description: 'Direct & efficient', intent: 'faster' },
  { id: 'reverse', icon: 'arrows', label: 'Reverse', description: 'Flip direction', intent: 'reverse' },
];

export function getQuickActions(sportType) {
  return sportType === 'running' ? RUNNING_QUICK_ACTIONS : QUICK_ACTIONS;
}

// ── Route modification engine ──────────────────────────────────────────────────

/**
 * Apply an AI edit to the current route.
 *
 * @param {Object} params
 * @param {Object} params.routeGeometry  GeoJSON LineString geometry
 * @param {string} params.routeProfile   Current profile: road | gravel | mountain | commuting
 * @param {Object} params.routeStats     { distance (km), elevation (m), duration (s) }
 * @param {Object} params.editIntent     Output of classifyEditIntent()
 * @param {Object} [params.mapboxToken]  For geocoding detour locations
 * @returns {Promise<Object>} { success, editedRoute, comparison, message }
 */
export async function applyRouteEdit(params) {
  const { routeGeometry, routeProfile, routeStats, editIntent, mapboxToken, sportType = 'cycling' } = params;

  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
    return { success: false, message: 'No route to edit' };
  }

  const coords = routeGeometry.coordinates;
  const intent = editIntent.intent;

  try {
    switch (intent) {
      case 'flatten':
        return await applyFlattenEdit(coords, routeProfile, routeStats, sportType);
      case 'surface_gravel':
        return await applySurfaceEdit(coords, routeProfile, routeStats, 'gravel', sportType);
      case 'surface_paved':
        return await applySurfaceEdit(coords, routeProfile, routeStats, 'paved', sportType);
      case 'scenic':
        return await applyScenicEdit(coords, routeProfile, routeStats, sportType);
      case 'faster':
        return await applyFasterEdit(coords, routeProfile, routeStats, sportType);
      case 'shorter':
        return applyShorterEdit(coords, routeStats, editIntent.distanceModifier);
      case 'longer':
        return await applyLongerEdit(coords, routeProfile, routeStats, editIntent.distanceModifier, sportType);
      case 'reverse':
        return applyReverseEdit(coords, routeStats);
      case 'avoid':
        return await applyAvoidEdit(coords, routeProfile, routeStats, editIntent.location, mapboxToken, sportType);
      case 'detour':
        return await applyDetourEdit(coords, routeProfile, routeStats, editIntent.location, mapboxToken, sportType);
      default:
        return { success: false, message: `I couldn't understand that edit. Try "make it flatter", "more gravel", "avoid [place]", or use the quick actions.` };
    }
  } catch (err) {
    console.error(`[AI Edit] Error applying ${intent}:`, err);
    return { success: false, message: `Edit failed: ${err.message}` };
  }
}

// ── Individual edit strategies ──────────────────────────────────────────────────

async function applyFlattenEdit(coords, profile, stats, sportType = 'cycling') {
  const start = coords[0];
  const end = coords[coords.length - 1];
  const isLoop = haversineKm(start, end) < 1;
  const waypoints = sampleWaypoints(coords, isLoop ? 5 : 3);

  // Strategy 1: Stadia Maps with use_hills=0 (flattest possible)
  const results = [];
  try {
    const stadiaRoute = await getStadiaMapsRoute(waypoints, {
      profile: profile === 'mountain' ? 'gravel' : profile,
      preferences: { use_hills: 0, avoid_bad_surfaces: profile === 'road' ? 0.8 : 0.2 },
    });
    if (stadiaRoute?.coordinates?.length > 1) {
      results.push({ ...stadiaRoute, label: 'Flattest (Valhalla)', strategy: 'stadia_flat' });
    }
  } catch (e) { console.warn('[AI Edit] Stadia flat failed:', e.message); }

  // Strategy 2: BRouter with safety profile (tends to avoid steep roads)
  try {
    const brouterRoute = await getBRouterDirections(waypoints, { profile: 'safety' });
    if (brouterRoute?.coordinates?.length > 1) {
      results.push({ ...brouterRoute, label: 'Safer & flatter (BRouter)', strategy: 'brouter_safety' });
    }
  } catch (e) { console.warn('[AI Edit] BRouter safety failed:', e.message); }

  if (results.length === 0) {
    return { success: false, message: 'Could not find a flatter alternative. The area may not have lower-elevation options.' };
  }

  // Pick the one with lowest elevation gain
  const best = await pickBestByElevation(results, 'lowest');
  const comparison = await buildComparison(coords, best.coordinates, stats);

  return {
    success: true,
    editedRoute: {
      coordinates: best.coordinates,
      source: best.source || best.strategy,
    },
    comparison,
    message: comparison.elevationDelta < 0
      ? `Found a flatter route: ${Math.abs(comparison.elevationDelta)}m less climbing`
      : 'This is already one of the flattest routes in the area',
  };
}

async function applySurfaceEdit(coords, profile, stats, targetSurface, sportType = 'cycling') {
  const start = coords[0];
  const end = coords[coords.length - 1];
  const isLoop = haversineKm(start, end) < 1;
  const waypoints = sampleWaypoints(coords, isLoop ? 5 : 3);

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
  const originalDistKm = stats.distance || estimateDistanceKm(coords);
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

async function applyScenicEdit(coords, profile, stats, sportType = 'cycling') {
  const start = coords[0];
  const end = coords[coords.length - 1];
  const isLoop = haversineKm(start, end) < 1;
  const waypoints = sampleWaypoints(coords, isLoop ? 5 : 3);
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

async function applyFasterEdit(coords, profile, stats, sportType = 'cycling') {
  const start = coords[0];
  const end = coords[coords.length - 1];
  const isLoop = haversineKm(start, end) < 1;
  const waypoints = sampleWaypoints(coords, isLoop ? 5 : 3);
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

function applyShorterEdit(coords, stats, targetReduction) {
  const totalDist = stats.distance || estimateDistanceKm(coords);

  // Default: cut ~20%, or user-specified amount
  const cutKm = targetReduction || totalDist * 0.2;
  const keepRatio = Math.max(0.4, 1 - cutKm / totalDist);

  const start = coords[0];
  const end = coords[coords.length - 1];
  const isLoop = haversineKm(start, end) < 1;

  let newCoords;
  if (isLoop) {
    // For loops, trim from the farthest point (cut the "bulge")
    const midIdx = Math.floor(coords.length / 2);
    const trimCount = Math.floor(coords.length * (1 - keepRatio));
    const trimStart = Math.max(1, midIdx - Math.floor(trimCount / 2));
    const trimEnd = Math.min(coords.length - 2, midIdx + Math.floor(trimCount / 2));
    newCoords = [...coords.slice(0, trimStart), ...coords.slice(trimEnd)];
  } else {
    // For point-to-point, trim proportionally from both ends toward center
    const keepCount = Math.floor(coords.length * keepRatio);
    const startTrim = Math.floor((coords.length - keepCount) * 0.3); // Trim less from start
    newCoords = coords.slice(startTrim, startTrim + keepCount);
  }

  if (newCoords.length < 2) newCoords = [coords[0], coords[coords.length - 1]];

  const newDist = estimateDistanceKm(newCoords);
  const distDelta = newDist - totalDist;

  return {
    success: true,
    editedRoute: {
      coordinates: newCoords,
      source: 'trimmed',
      needsReroute: true, // Caller should re-route this through proper routing
    },
    comparison: {
      distanceDelta: parseFloat(distDelta.toFixed(1)),
      newDistance: parseFloat(newDist.toFixed(1)),
      originalDistance: parseFloat(totalDist.toFixed(1)),
      elevationDelta: null, // Unknown until re-routed
    },
    message: `Shortened route by ~${Math.abs(distDelta).toFixed(1)}km. Route will be re-routed for road connectivity.`,
  };
}

async function applyLongerEdit(coords, profile, stats, targetExtension, sportType = 'cycling') {
  const totalDist = stats.distance || estimateDistanceKm(coords);
  const addKm = targetExtension || totalDist * 0.2;
  const start = coords[0];
  const end = coords[coords.length - 1];
  const isLoop = haversineKm(start, end) < 1;

  if (!isLoop) {
    return { success: false, message: 'Extending point-to-point routes is not yet supported. Try adding a detour instead.' };
  }

  // For loops: push the farthest point outward to extend the loop
  const midIdx = Math.floor(coords.length / 2);
  const midCoord = coords[midIdx];
  const bearing = calculateBearing(start, midCoord);

  // Push the midpoint further out
  const extraKm = addKm / 2; // Extending both legs
  const newMidpoint = projectPoint(midCoord, bearing, extraKm);

  // Create extended waypoints
  const waypoints = [
    start,
    coords[Math.floor(coords.length * 0.25)],
    newMidpoint,
    coords[Math.floor(coords.length * 0.75)],
    start, // Close loop
  ];

  try {
    const route = await getSmartRoute(waypoints, { profile }, sportType);
    if (route?.coordinates?.length > 1) {
      const comparison = await buildComparison(coords, route.coordinates, stats);
      return {
        success: true,
        editedRoute: {
          coordinates: route.coordinates,
          source: route.source,
        },
        comparison,
        message: `Extended loop by ~${Math.abs(comparison.distanceDelta).toFixed(1)}km`,
      };
    }
  } catch (e) {
    console.warn('[AI Edit] Extend route failed:', e.message);
  }

  return { success: false, message: 'Could not extend the route. Try a specific detour instead.' };
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
      newDistance: stats.distance || estimateDistanceKm(reversed),
      originalDistance: stats.distance || estimateDistanceKm(coords),
      elevationDelta: null, // Same total but opposite profile
    },
    message: 'Route direction reversed',
  };
}

async function applyAvoidEdit(coords, profile, stats, location, mapboxToken, sportType = 'cycling') {
  if (!location) {
    return { success: false, message: 'Please specify what to avoid (e.g., "avoid the highway" or "avoid downtown").' };
  }

  // Check for generic road-type avoidance
  const roadTypes = ['highway', 'motorway', 'busy road', 'main road', 'traffic', 'freeway'];
  const isRoadTypeAvoid = roadTypes.some(rt => location.includes(rt));

  if (isRoadTypeAvoid) {
    // Re-route with bike-path-heavy preferences
    return await applyScenicEdit(coords, profile, stats);
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
    const rerouted = await getSmartRoute(rerouteWaypoints, { profile }, sportType);
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

async function applyDetourEdit(coords, profile, stats, location, mapboxToken, sportType = 'cycling') {
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

  const legA = await getSmartRoute([coords[insertIdx], detourPoint], { profile }, sportType).catch(() => null);
  const legB = await getSmartRoute([detourPoint, after[0]], { profile }, sportType).catch(() => null);

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

// ── Helpers ─────────────────────────────────────────────────────────────────────

function sampleWaypoints(coords, count) {
  const wps = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(Math.round(i * (coords.length - 1) / (count - 1)), coords.length - 1);
    wps.push(coords[idx]);
  }
  return wps;
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

async function pickBestByElevation(routes, strategy = 'lowest') {
  // Try to get elevation for each route, pick the one with lowest gain
  let bestRoute = routes[0];
  let bestGain = Infinity;

  for (const route of routes) {
    try {
      const elevData = await getElevationData(route.coordinates);
      if (elevData) {
        const stats = calculateElevationStats(elevData);
        const gain = stats.totalAscent || route.elevation?.ascent || Infinity;
        if (gain < bestGain) {
          bestGain = gain;
          bestRoute = route;
        }
      }
    } catch {
      // Use router-reported elevation if available
      const gain = route.elevation?.ascent || route.elevationGain || Infinity;
      if (gain < bestGain) {
        bestGain = gain;
        bestRoute = route;
      }
    }
  }

  return bestRoute;
}

async function buildComparison(originalCoords, newCoords, originalStats) {
  const originalDist = originalStats.distance || estimateDistanceKm(originalCoords);
  const newDist = estimateDistanceKm(newCoords);

  let elevationDelta = null;
  try {
    const newElev = await getElevationData(newCoords);
    if (newElev) {
      const newStats = calculateElevationStats(newElev);
      const originalElev = originalStats.elevation || 0;
      elevationDelta = Math.round((newStats.totalAscent || 0) - originalElev);
    }
  } catch { /* elevation comparison unavailable */ }

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
  RUNNING_QUICK_ACTIONS,
  getQuickActions,
  EDIT_INTENTS,
};
