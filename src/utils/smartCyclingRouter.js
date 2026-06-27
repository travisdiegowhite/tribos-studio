/**
 * Smart cycling router that combines multiple routing services for optimal cycling routes
 *
 * Priority varies by profile:
 * - Gravel/MTB: BRouter (PRIMARY - has dedicated gravel profile) → Stadia Maps → Mapbox
 * - Road/Commuting: Stadia Maps (PRIMARY - excellent for paved roads) → BRouter → Mapbox
 */

import { getStadiaMapsRoute, isStadiaMapsAvailable } from './stadiaMapsRouter';
import { getBRouterDirections, selectBRouterProfile, BROUTER_PROFILES } from './brouter';
import { trackRouteBuilder, truncateErrorMessage } from './routeBuilderTelemetry';

/**
 * Get the best cycling route using multiple routing services
 *
 * @param {Array<[lon, lat]>} waypoints - Array of [longitude, latitude] coordinates
 * @param {Object} options - Routing options
 * @param {string} options.profile - Route profile: 'road', 'gravel', 'mountain', 'commuting'
 * @param {Object} options.preferences - User preferences
 * @param {string} options.trainingGoal - Training goal
 * @param {string} options.mapboxToken - Mapbox access token for fallback
 * @param {number} options.userSpeed - Optional personalized cycling speed
 * @returns {Promise<Object>} Route with coordinates, distance_m, duration_s, elevation
 */
export async function getSmartCyclingRoute(waypoints, options = {}) {
  const {
    profile = 'road',
    preferences = null,
    trainingGoal = 'endurance',
    mapboxToken = null,
    userSpeed = null
  } = options;

  console.log('🧠 Smart cycling router: Finding optimal route...');
  console.log('📍 Waypoints:', waypoints.length);
  console.log('🎯 Profile:', profile);
  console.log('🎯 Training goal:', trainingGoal);

  const isGravelOrMTB = profile === 'gravel' || profile === 'mountain';

  // For GRAVEL/MTB routes: BRouter is PRIMARY (has dedicated profiles that actively seek unpaved roads)
  // For ROAD/COMMUTING routes: Stadia Maps is PRIMARY (excellent for paved cycling infrastructure)
  if (isGravelOrMTB) {
    // === GRAVEL/MTB ROUTING STRATEGY ===
    // BRouter has dedicated gravel and MTB profiles that actively prioritize unpaved surfaces

    // Strategy 1: Try BRouter FIRST for gravel/MTB (it's the specialist)
    console.log('🌾 Gravel/MTB route requested - using BRouter as PRIMARY (dedicated unpaved profiles)');
    const brouterProfile = profile === 'mountain' ? BROUTER_PROFILES.MTB : BROUTER_PROFILES.GRAVEL;
    const brouterResult = await tryBRouterRouting(waypoints, {
      profile: brouterProfile,
      preferences,
      trainingGoal
    });

    if (brouterResult && brouterResult.coordinates && brouterResult.coordinates.length > 10) {
      console.log(`✅ BRouter provided ${profile} route - actively prioritizes unpaved roads`);
      return {
        ...brouterResult,
        source: 'brouter_gravel',
        confidence: 1.0 // Highest confidence for gravel - BRouter is the specialist
      };
    } else {
      console.warn('⚠️ BRouter routing failed, falling back to Stadia Maps');
      trackRouteBuilder('provider_fallback_chain_advanced', {
        from_provider: 'brouter',
        to_provider: 'stadia',
        failure_reason: 'brouter_no_route',
      });
    }

    // Strategy 2: Fall back to Stadia Maps for gravel
    if (isStadiaMapsAvailable()) {
      console.log('🗺️ Trying Stadia Maps as fallback for gravel route');
      const stadiaResult = await tryStadiaMapsRouting(waypoints, {
        profile,
        preferences,
        trainingGoal,
        userSpeed
      });

      if (stadiaResult && stadiaResult.coordinates && stadiaResult.coordinates.length > 10) {
        console.log('✅ Stadia Maps provided gravel route (fallback)');
        return {
          ...stadiaResult,
          source: 'stadia_maps',
          confidence: 0.8 // Lower confidence for gravel - Stadia allows but doesn't prefer gravel
        };
      }
    }
  } else {
    // === ROAD/COMMUTING ROUTING STRATEGY ===
    // Stadia Maps (Valhalla) excels at paved cycling infrastructure
    // Training goal is now passed through to influence Valhalla costing parameters

    // Strategy 1: Try Stadia Maps FIRST for road/commuting
    if (isStadiaMapsAvailable()) {
      console.log(`🗺️ Using Stadia Maps as PRIMARY (training goal: ${trainingGoal})`);
      const stadiaResult = await tryStadiaMapsRouting(waypoints, {
        profile,
        preferences,
        trainingGoal,
        userSpeed
      });

      if (stadiaResult && stadiaResult.coordinates && stadiaResult.coordinates.length > 10) {
        const maneuverInfo = stadiaResult.maneuvers
          ? `, ${stadiaResult.maneuvers.turnsPerKm.toFixed(1)} turns/km`
          : '';
        console.log(`✅ Stadia Maps route optimized for ${trainingGoal}${maneuverInfo}`);
        return {
          ...stadiaResult,
          source: 'stadia_maps',
          confidence: 1.0
        };
      } else {
        console.warn('⚠️ Stadia Maps routing failed, falling back to BRouter');
        trackRouteBuilder('provider_fallback_chain_advanced', {
          from_provider: 'stadia',
          to_provider: 'brouter',
          failure_reason: 'stadia_no_route',
        });
      }
    }

    // Strategy 2: Fall back to BRouter with training-goal-aware profile selection
    // For recovery: use SAFETY profile (quietest roads)
    // For intervals/tempo: use FASTBIKE (smooth, fast roads)
    // For endurance: use TREKKING (balanced)
    const brouterProfile = selectBRouterProfile(trainingGoal, preferences?.surfaceType);
    console.log(`🚴 Trying BRouter as fallback with profile: ${brouterProfile} (goal: ${trainingGoal})`);
    const brouterResult = await tryBRouterRouting(waypoints, {
      profile: brouterProfile,
      preferences,
      trainingGoal
    });

    if (brouterResult && brouterResult.coordinates && brouterResult.coordinates.length > 10) {
      console.log('✅ BRouter provided cycling route (fallback)');
      return {
        ...brouterResult,
        source: 'brouter',
        confidence: 0.9
      };
    }
  }

  // Strategy 3: Try Mapbox as final fallback (for any profile)
  if (mapboxToken) {
    console.log('🔄 Falling back to Mapbox with cycling profile...');
    trackRouteBuilder('provider_fallback_chain_advanced', {
      from_provider: isGravelOrMTB ? 'stadia' : 'brouter',
      to_provider: 'mapbox',
      failure_reason: 'primary_and_secondary_failed',
    });
    const mapboxResult = await tryMapboxRouting(waypoints, {
      preferences,
      trainingGoal,
      mapboxToken
    });

    if (mapboxResult && mapboxResult.coordinates && mapboxResult.coordinates.length > 10) {
      console.log('✅ Mapbox provided viable cycling route');
      return {
        ...mapboxResult,
        source: 'mapbox_fallback',
        confidence: 0.7 // Lowest confidence - basic cycling routing
      };
    }
  }

  console.warn('❌ All routing strategies failed');
  return null;
}

/**
 * Try Stadia Maps routing (hosted Valhalla - PRIMARY for all cycling)
 */
async function tryStadiaMapsRouting(waypoints, options) {
  const { profile, preferences, trainingGoal, userSpeed } = options;
  const startMs = Date.now();
  trackRouteBuilder('generation_routing_called', {
    provider: 'stadia',
    profile,
    waypoint_count: waypoints?.length ?? 0,
  });

  try {
    console.log(`🗺️ Trying Stadia Maps with profile: ${profile}`);

    const result = await getStadiaMapsRoute(waypoints, {
      profile: profile,
      preferences: preferences,
      trainingGoal: trainingGoal,
      userSpeed: userSpeed
    });

    if (result && result.coordinates && result.coordinates.length > 0) {
      trackRouteBuilder('generation_routing_succeeded', {
        provider: 'stadia',
        duration_ms: Date.now() - startMs,
      });
      // T1.1: emit canonical suffixed fields. `distance` / `duration` are
      // kept as transitional aliases for callers that haven't migrated.
      const distance_m = result.distance_m ?? result.distance;
      const duration_s = result.duration_s ?? result.duration;
      return {
        coordinates: result.coordinates,
        distance_m,
        duration_s,
        distance: distance_m, // alias (deprecated)
        duration: duration_s, // alias (deprecated)
        elevationGain: result.elevationGain || 0,
        elevationLoss: result.elevationLoss || 0,
        confidence: result.confidence || 1.0,
        profile: profile,
        source: 'stadia_maps',
        maneuvers: result.maneuvers || null,
        trafficScore: result.trafficScore,
        quietnessScore: result.quietnessScore,
        roadClassification: result.roadClassification || null,
        infrastructureScore: result.infrastructureScore
      };
    }

    trackRouteBuilder('generation_routing_failed', {
      provider: 'stadia',
      duration_ms: Date.now() - startMs,
      failure_reason: 'empty_or_no_coordinates',
    });
    return null;
  } catch (error) {
    console.warn('Stadia Maps routing failed:', error);
    trackRouteBuilder('generation_routing_failed', {
      provider: 'stadia',
      duration_ms: Date.now() - startMs,
      failure_reason: truncateErrorMessage(error?.message ?? String(error)),
    });
    return null;
  }
}

/**
 * Try BRouter routing (FREE, excellent for gravel/unpaved roads)
 */
async function tryBRouterRouting(waypoints, options) {
  const { profile, preferences, trainingGoal } = options;
  const brouterProfile = profile || selectBRouterProfile(trainingGoal, preferences?.surfaceType);
  const startMs = Date.now();
  trackRouteBuilder('generation_routing_called', {
    provider: 'brouter',
    profile: brouterProfile,
    waypoint_count: waypoints?.length ?? 0,
  });

  try {
    console.log(`🚴 Trying BRouter with profile: ${brouterProfile}`);

    const result = await getBRouterDirections(waypoints, {
      profile: brouterProfile
    });

    if (result && result.coordinates && result.coordinates.length > 0) {
      trackRouteBuilder('generation_routing_succeeded', {
        provider: 'brouter',
        duration_ms: Date.now() - startMs,
      });
      const distance_m = result.distance_m ?? result.distance;
      const duration_s = result.duration_s ?? result.duration;
      return {
        coordinates: result.coordinates,
        distance_m,
        duration_s,
        distance: distance_m,
        duration: duration_s,
        elevationGain: result.elevation?.ascent || 0,
        elevationLoss: result.elevation?.descent || 0,
        confidence: result.confidence || 0.9,
        profile: brouterProfile,
        source: 'brouter'
      };
    }

    trackRouteBuilder('generation_routing_failed', {
      provider: 'brouter',
      duration_ms: Date.now() - startMs,
      failure_reason: 'empty_or_no_coordinates',
    });
    return null;
  } catch (error) {
    console.warn('BRouter routing failed:', error);
    trackRouteBuilder('generation_routing_failed', {
      provider: 'brouter',
      duration_ms: Date.now() - startMs,
      failure_reason: truncateErrorMessage(error?.message ?? String(error)),
    });
    return null;
  }
}

/**
 * Try Mapbox routing with cycling profile
 */
async function tryMapboxRouting(waypoints, options) {
  const { preferences, trainingGoal, mapboxToken } = options;
  const startMs = Date.now();
  trackRouteBuilder('generation_routing_called', {
    provider: 'mapbox',
    profile: 'cycling',
    waypoint_count: waypoints?.length ?? 0,
  });

  try {
    console.log('🗺️ Trying Mapbox Directions API...');

    // Format coordinates for Mapbox
    const coordinates = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');

    // Ferries are forbidden, 100% — exclude them at request time (Mapbox
    // doesn't return per-segment way tags, so this is the only ferry defense
    // on the Mapbox path).
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?` +
      `geometries=geojson&overview=full&exclude=ferry&access_token=${mapboxToken}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Mapbox API error:', response.status);
      trackRouteBuilder('generation_routing_failed', {
        provider: 'mapbox',
        duration_ms: Date.now() - startMs,
        failure_reason: `http_${response.status}`,
      });
      return null;
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn('No routes from Mapbox');
      trackRouteBuilder('generation_routing_failed', {
        provider: 'mapbox',
        duration_ms: Date.now() - startMs,
        failure_reason: 'empty_routes',
      });
      return null;
    }

    const route = data.routes[0];

    trackRouteBuilder('generation_routing_succeeded', {
      provider: 'mapbox',
      duration_ms: Date.now() - startMs,
    });
    return {
      coordinates: route.geometry.coordinates,
      distance_m: route.distance,
      duration_s: route.duration,
      distance: route.distance, // legacy alias (meters)
      duration: route.duration, // legacy alias (seconds)
      elevationGain: 0, // Mapbox basic doesn't include elevation
      elevationLoss: 0,
      confidence: 0.8,
      profile: 'cycling',
      source: 'mapbox'
    };

  } catch (error) {
    console.warn('Mapbox routing failed:', error);
    trackRouteBuilder('generation_routing_failed', {
      provider: 'mapbox',
      duration_ms: Date.now() - startMs,
      failure_reason: truncateErrorMessage(error?.message ?? String(error)),
    });
    return null;
  }
}

/**
 * Get routing strategy description for user feedback
 */
export function getRoutingStrategyDescription(route) {
  if (!route) return 'No route available';

  // Check for gravel profile first
  if (route.profile === 'gravel') {
    return 'Prioritized dirt roads, trails, and unpaved surfaces';
  }

  switch (route.source) {
    case 'stadia_maps':
      return 'Powered by Valhalla - optimized for bike paths and cycling infrastructure';
    case 'brouter':
    case 'brouter_gravel':
      return 'Optimized for gravel riding with unpaved surface preference';
    case 'mapbox_fallback':
      return 'Standard cycling route via Mapbox';
    default:
      return 'Standard routing';
  }
}

/**
 * Check if BRouter is available (public service, always available)
 */
export function isBRouterAvailable() {
  return true;
}

/**
 * Get human-readable label for a routing source identifier
 * @param {string} source - Routing source (e.g. 'stadia_maps', 'brouter')
 * @returns {string} Human-readable label
 */
export function getRoutingSourceLabel(source) {
  switch (source) {
    case 'stadia_maps': return 'Stadia Maps (Valhalla)';
    case 'brouter': return 'BRouter';
    case 'brouter_gravel': return 'BRouter Gravel';
    case 'mapbox_fallback': return 'Mapbox';
    case 'iterative_quarter_loop': return 'Iterative Builder (Loop)';
    case 'iterative_out_and_back': return 'Iterative Builder (Out & Back)';
    case 'iterative_point_to_point': return 'Iterative Builder (P2P)';
    case 'iterative_builder': return 'Iterative Builder';
    default: return source || 'Unknown';
  }
}

export default {
  getSmartCyclingRoute,
  getRoutingStrategyDescription,
  getRoutingSourceLabel,
  isBRouterAvailable
};
