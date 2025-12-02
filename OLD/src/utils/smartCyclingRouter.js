/**
 * Smart cycling router that combines multiple routing services for optimal cycling routes
 * Priority: Stadia Maps (hosted Valhalla) → BRouter (gravel) → Mapbox (fallback)
 */

import { getStadiaMapsRoute, isStadiaMapsAvailable } from './stadiaMapsRouter';
import { getBRouterDirections, selectBRouterProfile, BROUTER_PROFILES } from './brouter';
import { getCyclingDirections } from './directions';
import { fetchElevationProfile, calculateElevationStats } from './directions';

/**
 * Get the best cycling route using multiple routing services
 */
export async function getSmartCyclingRoute(waypoints, options = {}) {
  const {
    profile = 'bike',
    preferences = null,
    trainingGoal = 'endurance',
    mapboxToken = null,
    userId = null,
    maxRetries = 2
  } = options;

  console.log('🧠 Smart cycling router: Finding optimal route...');
  console.log('📍 Waypoints:', waypoints.length);
  console.log('🎯 Profile:', profile);
  console.log('🎯 Training goal:', trainingGoal);
  console.log('⚙️ Preferences:', preferences);

  const isGravelRequest = profile === 'gravel';

  // Strategy 1: Try Stadia Maps (hosted Valhalla) - PRIMARY for all cycling routes
  const stadiaAvailable = isStadiaMapsAvailable();
  console.log('🔍 Stadia Maps availability check:', {
    available: stadiaAvailable,
    apiKey: process.env.REACT_APP_STADIA_API_KEY ? 'present' : 'missing',
    enabled: process.env.REACT_APP_USE_STADIA_MAPS
  });

  if (stadiaAvailable) {
    console.log('🗺️ Using Stadia Maps (hosted Valhalla routing engine)');
    const stadiaResult = await tryStadiaMapsRouting(waypoints, {
      profile,
      preferences,
      trainingGoal,
      userId
    });

    if (stadiaResult && stadiaResult.coordinates && stadiaResult.coordinates.length > 10) {
      console.log('✅ Stadia Maps provided superior cycling route with Valhalla engine');
      return {
        ...stadiaResult,
        source: 'stadia_maps',
        confidence: 1.0 // Highest confidence - purpose-built for cycling
      };
    } else {
      console.warn('⚠️ Stadia Maps routing failed, falling back to alternative services');
    }
  }

  // Strategy 2: For GRAVEL routes, use BRouter (FREE and excellent for unpaved roads)
  if (isGravelRequest) {
    console.log('🌾 Gravel route requested - using BRouter (free OSM routing with gravel profile)');
    const brouterResult = await tryBRouterRouting(waypoints, {
      profile: BROUTER_PROFILES.GRAVEL,
      preferences,
      trainingGoal
    });

    if (brouterResult && brouterResult.coordinates && brouterResult.coordinates.length > 10) {
      console.log('✅ BRouter provided gravel route - prioritizes unpaved roads');
      return {
        ...brouterResult,
        source: 'brouter_gravel',
        confidence: Math.min(brouterResult.confidence + 0.2, 1.0)
      };
    } else {
      console.warn('⚠️ BRouter gravel routing failed (area coverage limited), falling back to available roads');
      console.log('📍 Using Mapbox routing on available roads (rural areas may not have bike lanes)');

      // Fallback to Mapbox for gravel request if BRouter fails (area coverage issue in rural regions)
      if (mapboxToken) {
        const mapboxResult = await tryMapboxRouting(waypoints, {
          preferences,
          trainingGoal,
          mapboxToken
        });

        if (mapboxResult && mapboxResult.coordinates && mapboxResult.coordinates.length > 10) {
          console.log('✅ Using Mapbox routing on available roads (BRouter coverage unavailable for this rural area)');
          return {
            ...mapboxResult,
            source: 'mapbox_gravel_fallback',
            confidence: 0.6,
            warnings: [
              'BRouter coverage unavailable for this area',
              'Using available roads - this is a rural area without dedicated bike lanes',
              'Route will use existing roads that are suitable for cycling'
            ]
          };
        }
      }

      console.error('❌ No routing service available for this area');
      return null;
    }
  }

  // Strategy 3: Try Mapbox with optimized settings (ONLY for non-gravel routes, last resort)
  if (mapboxToken && !isGravelRequest) {
    console.log('🔄 Falling back to Mapbox with cycling optimizations...');
    const mapboxResult = await tryMapboxRouting(waypoints, {
      preferences,
      trainingGoal,
      mapboxToken
    });

    if (mapboxResult && mapboxResult.coordinates && mapboxResult.coordinates.length > 10) {
      console.log('✅ Mapbox provided viable cycling route');
      return {
        ...mapboxResult,
        source: 'mapbox_optimized',
        confidence: Math.max(mapboxResult.confidence - 0.1, 0.5) // Reduce confidence slightly for non-cycling-specific service
      };
    }
  } else if (isGravelRequest) {
    console.log('⚠️ Skipping Mapbox fallback for gravel route (Mapbox does not support gravel routing)');
  }

  console.warn('❌ All routing strategies failed');
  return null;
}

/**
 * Try Stadia Maps routing (hosted Valhalla - PRIMARY for all cycling)
 */
async function tryStadiaMapsRouting(waypoints, options) {
  const { profile, preferences, trainingGoal, userId } = options;

  try {
    console.log(`🗺️ Trying Stadia Maps with profile: ${profile}`);

    const result = await getStadiaMapsRoute(waypoints, {
      profile: profile,
      preferences: preferences,
      trainingGoal: trainingGoal,
      userId: userId
    });

    if (result && result.coordinates && result.coordinates.length > 0) {
      return {
        coordinates: result.coordinates,
        distance: result.distance,
        duration: result.duration,
        elevationGain: result.elevationGain || 0,
        elevationLoss: result.elevationLoss || 0,
        confidence: result.confidence || 1.0,
        profile: profile,
        source: 'stadia_maps'
      };
    }

    return null;
  } catch (error) {
    console.warn('Stadia Maps routing failed:', error);
    return null;
  }
}

/**
 * Try BRouter routing (FREE, excellent for gravel/unpaved roads)
 */
async function tryBRouterRouting(waypoints, options) {
  const { profile, preferences, trainingGoal } = options;

  try {
    // Select BRouter profile (gravel, trekking, mtb, etc.)
    const brouterProfile = profile || selectBRouterProfile(trainingGoal, preferences?.surfaceType);

    console.log(`🚴 Trying BRouter with profile: ${brouterProfile}`);

    const result = await getBRouterDirections(waypoints, {
      profile: brouterProfile
    });

    if (result && result.coordinates && result.coordinates.length > 0) {
      return {
        coordinates: result.coordinates,
        distance: result.distance,
        duration: result.duration,
        elevationGain: result.elevation?.ascent || 0,
        elevationLoss: result.elevation?.descent || 0,
        confidence: result.confidence || 0.9,
        profile: brouterProfile,
        source: 'brouter'
      };
    }

    return null;
  } catch (error) {
    console.warn('BRouter routing failed:', error);
    return null;
  }
}

/**
 * Try Mapbox routing with cycling optimizations
 */
async function tryMapboxRouting(waypoints, options) {
  const { preferences, trainingGoal, mapboxToken } = options;

  try {
    console.log('🗺️ Trying Mapbox with enhanced cycling preferences...');

    const result = await getCyclingDirections(waypoints, mapboxToken, {
      profile: 'cycling',
      preferences: preferences
    });

    return result;
  } catch (error) {
    console.warn('Mapbox routing failed:', error);
    return null;
  }
}

/**
 * Evaluate if a route is good for cycling based on preferences
 */
function isGoodCyclingRoute(route, preferences) {
  if (!route || !route.coordinates || route.coordinates.length < 10) {
    return false;
  }

  // Check route quality metrics
  const qualityScore = calculateRouteQuality(route, preferences);

  console.log(`📊 Route quality score: ${qualityScore.toFixed(2)}`);

  // Route is considered good if it scores above 0.7
  return qualityScore > 0.7;
}

/**
 * Calculate route quality score based on cycling preferences
 */
function calculateRouteQuality(route, preferences) {
  let score = 0.5; // Base score

  // Distance reasonableness (not too short or too long)
  if (route.distance > 1000 && route.distance < 200000) { // 1km to 200km
    score += 0.2;
  }

  // Confidence boost
  if (route.confidence > 0.8) {
    score += 0.1;
  }

  // Cycling-specific service bonus
  if (route.source === 'stadia_maps') {
    score += 0.25; // Stadia Maps (Valhalla) is purpose-built for cycling
  } else if (route.source === 'brouter' || route.source === 'brouter_gravel') {
    score += 0.20; // BRouter excellent for gravel routing
  }

  // Preferences alignment
  if (preferences) {
    // Traffic avoidance bonus
    if (preferences.routingPreferences?.trafficTolerance === 'low') {
      // Stadia Maps with use_roads parameter gets bonus
      if (route.source === 'stadia_maps') {
        score += 0.15;
      }
    }

    // Bike infrastructure bonus
    if (preferences.safetyPreferences?.bikeInfrastructure === 'strongly_preferred' ||
        preferences.safetyPreferences?.bikeInfrastructure === 'required') {
      if (route.source === 'stadia_maps') {
        score += 0.20; // Valhalla excels at bike infrastructure routing
      }
    }
  }

  // Gravel profile bonus
  if (route.profile === 'gravel' && (route.source === 'brouter' || route.source === 'brouter_gravel')) {
    score += 0.25; // Strong preference for BRouter on gravel routes
  }

  return Math.min(score, 1.0);
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
      return 'Powered by Valhalla routing engine - optimized for bike paths and cycling infrastructure';
    case 'brouter':
    case 'brouter_gravel':
      return 'Optimized for gravel riding with unpaved surface preference';
    case 'mapbox_optimized':
      return 'Enhanced routing with traffic filtering';
    case 'mapbox_gravel_fallback':
      return 'Using available roads in rural area';
    default:
      return 'Standard routing';
  }
}

/**
 * Check if BRouter is available
 */
export function isBRouterAvailable() {
  // BRouter public instance is always available (free service)
  return true;
}