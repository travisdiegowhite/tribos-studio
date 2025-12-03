/**
 * Smart cycling router that combines multiple routing services for optimal cycling routes
 * Priority: Stadia Maps (hosted Valhalla) → BRouter (gravel) → Mapbox (fallback)
 */

import { getStadiaMapsRoute, isStadiaMapsAvailable } from './stadiaMapsRouter';
import { getBRouterDirections, selectBRouterProfile, BROUTER_PROFILES } from './brouter';

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
 * @returns {Promise<Object>} Route with coordinates, distance, duration, elevation
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

  const isGravelRequest = profile === 'gravel';

  // Strategy 1: Try Stadia Maps (hosted Valhalla) - PRIMARY for all cycling routes
  if (isStadiaMapsAvailable()) {
    console.log('🗺️ Using Stadia Maps (hosted Valhalla routing engine)');
    const stadiaResult = await tryStadiaMapsRouting(waypoints, {
      profile,
      preferences,
      trainingGoal,
      userSpeed
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
  } else {
    console.log('⚠️ Stadia Maps not available, trying alternatives');
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
      console.warn('⚠️ BRouter gravel routing failed, falling back to Mapbox');
    }
  }

  // Strategy 3: Try Mapbox as final fallback
  if (mapboxToken) {
    console.log('🔄 Falling back to Mapbox with cycling profile...');
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
        confidence: 0.8
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

  try {
    console.log(`🗺️ Trying Stadia Maps with profile: ${profile}`);

    const result = await getStadiaMapsRoute(waypoints, {
      profile: profile,
      preferences: preferences,
      trainingGoal: trainingGoal,
      userSpeed: userSpeed
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
 * Try Mapbox routing with cycling profile
 */
async function tryMapboxRouting(waypoints, options) {
  const { preferences, trainingGoal, mapboxToken } = options;

  try {
    console.log('🗺️ Trying Mapbox Directions API...');

    // Format coordinates for Mapbox
    const coordinates = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');

    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?` +
      `geometries=geojson&overview=full&access_token=${mapboxToken}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Mapbox API error:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn('No routes from Mapbox');
      return null;
    }

    const route = data.routes[0];

    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance, // meters
      duration: route.duration, // seconds
      elevationGain: 0, // Mapbox basic doesn't include elevation
      elevationLoss: 0,
      confidence: 0.8,
      profile: 'cycling',
      source: 'mapbox'
    };

  } catch (error) {
    console.warn('Mapbox routing failed:', error);
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

export default {
  getSmartCyclingRoute,
  getRoutingStrategyDescription,
  isBRouterAvailable
};
