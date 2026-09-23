/**
 * BRouter Integration
 * OSM routing whose cost function is a per-tag profile: the specialist for
 * gravel, the source of the alternate "quiet" lines, and the way we learn
 * what tags a route rides (wayTags.ts).
 *
 * Servers: the self-hosted Tribos instance (VITE_BROUTER_URL, deploy/brouter)
 * first when configured, the public brouter.de after it. A server that
 * fails twice is skipped for a few minutes (circuit breaker) so one outage
 * costs one slow request, not every request.
 *
 * Profiles: the stock names (trekking, gravel, safety …) or, when
 * VITE_BROUTER_TRIBOS_PROFILES is "true", the Tribos profiles from
 * routing-profiles/ rendered for the rider and uploaded as custom profiles
 * (brouterProfiles.ts). Named-profile calls are upgraded transparently:
 * trekking → Tribos road at the rider's tolerance, safety → Tribos road
 * quiet, fastbike → Tribos road direct, gravel → Tribos gravel.
 */

import { canonicalToBRouter } from './coordConverters';
import { brouterUsesFerry } from './ferryGuard';
import { taggedWaysFromBRouterProperties, rememberTaggedWays } from './wayTags';
import { ensureProfileId, forgetProfileId, tribosParamsFor } from './brouterProfiles';
import { trackRouteBuilder } from './routeBuilderTelemetry';

// BRouter profiles for different cycling types
export const BROUTER_PROFILES = {
  GRAVEL: 'gravel',              // Prioritizes unpaved roads, gravel, dirt
  TREKKING: 'trekking',          // Balanced touring profile
  FASTBIKE: 'fastbike',          // Speed-oriented road cycling
  MTB: 'mtb',                     // Mountain biking
  SAFETY: 'safety'                // Safest routes, avoids traffic
};

export const PUBLIC_BROUTER_URL = 'https://brouter.de';
/** A server that failed this many times in a row is skipped … */
export const CIRCUIT_FAILURES = 2;
/** … for this long. */
export const CIRCUIT_OPEN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

function normalizeBase(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\/brouter$/, '');
}

/** Ordered, de-duplicated server list: the self-hosted one first when set. */
export function brouterServers() {
  const self = normalizeBase(import.meta.env.VITE_BROUTER_URL);
  const servers = [];
  if (self && /^https?:\/\//.test(self)) servers.push(self);
  if (!servers.includes(PUBLIC_BROUTER_URL)) servers.push(PUBLIC_BROUTER_URL);
  return servers;
}

export function tribosProfilesEnabled() {
  return String(import.meta.env.VITE_BROUTER_TRIBOS_PROFILES).toLowerCase() === 'true';
}

// ---- circuit breaker ------------------------------------------------------

const circuit = new Map(); // base → { failures, openUntil }

function circuitOpen(base, now = Date.now()) {
  const c = circuit.get(base);
  return !!c && c.openUntil > now;
}

function noteFailure(base, now = Date.now()) {
  const c = circuit.get(base) || { failures: 0, openUntil: 0 };
  c.failures += 1;
  if (c.failures >= CIRCUIT_FAILURES) {
    c.openUntil = now + CIRCUIT_OPEN_MS;
    c.failures = 0;
    console.warn(`⛔ BRouter ${base} skipped for ${CIRCUIT_OPEN_MS / 60000} min after repeated failures`);
  }
  circuit.set(base, c);
}

function noteSuccess(base) {
  circuit.delete(base);
}

/** Tests. */
export function resetBRouterCircuit() {
  circuit.clear();
}

// ---- profiles -------------------------------------------------------------

/**
 * Tribos params for a stock profile name, so existing callers get the
 * Tribos cost model without changing. mtb stays a named profile.
 */
export function tribosForProfileName(profile, tolerance = null, gravelTargetPct = null) {
  switch (profile) {
    case BROUTER_PROFILES.TREKKING:
      return tribosParamsFor({ surface: 'road', trafficTolerance: tolerance });
    case BROUTER_PROFILES.SAFETY:
      return tribosParamsFor({ surface: 'road', trafficTolerance: 'low' });
    case BROUTER_PROFILES.FASTBIKE:
      return tribosParamsFor({ surface: 'road', trafficTolerance: 'high' });
    case BROUTER_PROFILES.GRAVEL:
      return tribosParamsFor({ surface: 'gravel', trafficTolerance: tolerance, gravelTargetPct });
    default:
      return null;
  }
}

/**
 * Which profile string to send to `base`: a Tribos custom id when enabled
 * and resolvable, else the named profile.
 */
async function resolveProfile(base, options) {
  const { profile, tribos, tolerance = null, gravelTargetPct = null } = options;
  if (tribos === false || !tribosProfilesEnabled()) return { profile, tribosParams: null };
  const params = tribos && typeof tribos === 'object' ? tribos : tribosForProfileName(profile, tolerance, gravelTargetPct);
  if (!params) return { profile, tribosParams: null };
  try {
    const id = await ensureProfileId(base, params);
    return { profile: id, tribosParams: params };
  } catch (err) {
    console.warn(`BRouter: Tribos profile unavailable on ${base}, using ${profile}:`, err?.message ?? err);
    return { profile, tribosParams: null };
  }
}

// ---- routing --------------------------------------------------------------

/**
 * Get cycling directions from BRouter
 * @param {Array<[lon, lat]>} coordinates - Array of waypoint coordinates
 * @param {Object} options - Routing options
 * @param {string} [options.profile] - stock profile name (default gravel)
 * @param {number} [options.alternativeidx]
 * @param {object|false} [options.tribos] - Tribos params to render, or false to force the named profile
 * @param {string|null} [options.tolerance] - rider traffic tolerance, for the Tribos upgrade of a named profile
 * @param {number|null} [options.gravelTargetPct]
 * @returns {Promise<Object>} Route data
 */
export async function getBRouterDirections(coordinates, options = {}) {
  const {
    profile = BROUTER_PROFILES.GRAVEL,
    alternativeidx = 0
  } = options;

  if (!coordinates || coordinates.length < 2) {
    console.error('BRouter: At least 2 coordinates required');
    return null;
  }

  // Format coordinates as lon,lat|lon,lat|... via the canonical boundary converter
  const lonlats = canonicalToBRouter(coordinates);
  const servers = brouterServers();
  const now = Date.now();
  const candidates = servers.filter((base) => !circuitOpen(base, now));
  // Every server on cooldown: try them anyway rather than fail outright.
  const order = candidates.length > 0 ? candidates : servers;

  for (const base of order) {
    const startMs = Date.now();
    const resolved = await resolveProfile(base, { ...options, profile });
    let result = await requestRoute(base, lonlats, resolved.profile, alternativeidx, coordinates.length);
    // A server that has forgotten a custom profile answers with an error
    // naming it; upload again once.
    if (result.retryProfile && resolved.tribosParams) {
      forgetProfileId(base, resolved.tribosParams);
      const again = await resolveProfile(base, { ...options, profile });
      result = await requestRoute(base, lonlats, again.profile, alternativeidx, coordinates.length);
    }
    if (result.route) {
      noteSuccess(base);
      trackRouteBuilder('brouter_server_used', {
        server: base === PUBLIC_BROUTER_URL ? 'public' : 'self',
        tribos: !!resolved.tribosParams,
        duration_ms: Date.now() - startMs,
      });
      return result.route;
    }
    if (result.noRoute) {
      // The server answered and there is no route: another server will say
      // the same. Not a server failure.
      return null;
    }
    noteFailure(base);
  }
  return null;
}

/**
 * One request to one server. `{ route }` on success, `{ noRoute: true }`
 * when the server answered with no route, `{ retryProfile: true }` when it
 * rejected the profile id, `{}` on a server failure.
 */
async function requestRoute(base, lonlats, profile, alternativeidx, waypointCount) {
  const params = new URLSearchParams({
    lonlats,
    profile,
    alternativeidx,
    format: 'geojson'
  });
  const url = `${base}/brouter?${params.toString()}`;
  console.log(`🚴 BRouter: Requesting ${profile} route with ${waypointCount} waypoints from ${base}`);

  try {
    // No SLA on the public instance — without a timeout a hung request
    // stalls the whole routing fallback chain.
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BRouter API error: ${response.status}`, errorText);
      if (/profile/i.test(errorText) && /(not found|does not exist|no such|invalid)/i.test(errorText)) {
        return { retryProfile: true };
      }
      // BRouter answers 500 with a plain-text reason for "no route" too.
      if (/no route|target island|not found/i.test(errorText)) return { noRoute: true };
      return {};
    }

    const data = await response.json();

    if (!data || !data.features || data.features.length === 0) {
      console.warn('BRouter: No route found in response');
      return { noRoute: true };
    }

    const route = data.features[0];
    const geometry = route.geometry;
    const properties = route.properties;

    // Ferries are forbidden, 100%. BRouter's stock profiles penalize ferries
    // but will still cross water by ferry when there's no land route — reject
    // those so the caller falls back (or fails) rather than routing onto one.
    if (brouterUsesFerry(properties)) {
      console.warn('⛔ BRouter: route requires a ferry — rejecting (ferries forbidden)');
      return { noRoute: true };
    }

    // Extract route information
    // BRouter returns properties as strings, so parse them as numbers
    const routeCoordinates = geometry.coordinates; // GeoJSON: [lon, lat]
    const distance_m = parseFloat(properties['track-length']) || 0;
    const duration_s = parseFloat(properties['total-time']) || 0;
    const ascent = parseFloat(properties['filtered ascend']) || 0; // meters
    const descent = parseFloat(properties['filtered descend']) || 0; // meters

    // Per-segment OSM tags (surface, highway, cycleway, maxspeed, …) from the
    // messages table — the only free source of "what did we get routed onto".
    // Consumers (surface measurement, LTS scoring) use these instead of a
    // second network round-trip. Empty when the instance omits messages.
    const taggedWays = taggedWaysFromBRouterProperties(routeCoordinates, properties);
    // Keyed by the geometry so the traffic-stress analysis can recall them
    // once the route has travelled through the store as a bare LineString.
    rememberTaggedWays(routeCoordinates, taggedWays);

    console.log(`✅ BRouter route generated:`, {
      distance_km: `${(distance_m / 1000).toFixed(1)}km`,
      duration_min: `${(duration_s / 60).toFixed(0)}min`,
      ascent: `${ascent.toFixed(0)}m`,
      profile
    });

    return {
      route: {
        coordinates: routeCoordinates,
        distance_m,
        duration_s,
        distance: distance_m, // legacy alias (meters)
        duration: duration_s, // legacy alias (seconds)
        elevation: {
          ascent,
          descent
        },
        elevationGain: ascent,
        elevationLoss: descent,
        confidence: 0.9, // BRouter is very reliable for cycling
        profile,
        server: base,
        source: 'brouter',
        taggedWays,
        properties // Include all BRouter-specific properties
      },
    };
  } catch (error) {
    console.error(`BRouter request to ${base} failed:`, error?.message ?? error);
    return {};
  }
}

/**
 * Check if BRouter service is available
 */
export async function validateBRouterService() {
  try {
    // Test with a simple route in Europe (where BRouter has good coverage)
    const testCoords = [
      [13.388860, 52.517037], // Berlin
      [13.397634, 52.529407]
    ];

    const result = await getBRouterDirections(testCoords, {
      profile: BROUTER_PROFILES.TREKKING
    });

    if (result && result.distance > 0) {
      return {
        available: true,
        profiles: Object.values(BROUTER_PROFILES),
        testDistance: result.distance
      };
    } else {
      return {
        available: false,
        error: 'No route returned from test request'
      };
    }
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Select the best BRouter profile based on training goal and preferences
 * @param {string} trainingGoal - Training goal (endurance, hills, intervals, etc.)
 * @param {string|null} surfacePreference - 'gravel' for unpaved preference
 * @param {string|null} trafficTolerance - 'low' | 'medium' | 'high'
 * @returns {string} Profile name
 */
export function selectBRouterProfile(trainingGoal, surfacePreference = null, trafficTolerance = null) {
  // If explicitly requesting gravel/unpaved
  if (surfacePreference === 'gravel') {
    return BROUTER_PROFILES.GRAVEL;
  }

  if (trafficTolerance === 'low') {
    return BROUTER_PROFILES.SAFETY;
  }

  // Map training goals to profiles
  switch (trainingGoal) {
    case 'intervals':
    case 'tempo':
      return BROUTER_PROFILES.FASTBIKE; // Fast, smooth roads for speed work

    case 'hills':
      return BROUTER_PROFILES.MTB; // Mountain bike profile handles steep grades

    case 'recovery':
      return BROUTER_PROFILES.SAFETY; // Safest, quietest routes

    case 'endurance':
    default:
      return BROUTER_PROFILES.TREKKING; // Balanced touring profile
  }
}

export default {
  getBRouterDirections,
  validateBRouterService,
  selectBRouterProfile,
  BROUTER_PROFILES
};
