/**
 * Smart running router that combines multiple routing services for optimal running routes
 *
 * Priority varies by profile:
 * - Trail: BRouter (PRIMARY - has foot-hiking profile) → Stadia Maps → Mapbox
 * - Road/Track/Mixed: Stadia Maps (PRIMARY - pedestrian costing) → BRouter → Mapbox
 */

import { getStadiaPedestrianRoute, isStadiaMapsAvailable } from './stadiaMapsRouter';
import { getBRouterDirections } from './brouter';

// BRouter profiles for running/hiking
const BROUTER_RUNNING_PROFILES = {
  HIKING: 'hiking',
  TREKKING: 'trekking',
};

/**
 * Select BRouter profile for running based on route profile and training goal
 */
function selectRunningBRouterProfile(routeProfile, trainingGoal) {
  if (routeProfile === 'trail') return BROUTER_RUNNING_PROFILES.HIKING;
  return BROUTER_RUNNING_PROFILES.TREKKING;
}

/**
 * Get the best running route using multiple routing services
 *
 * @param {Array<[lon, lat]>} waypoints - Array of [longitude, latitude] coordinates
 * @param {Object} options - Routing options
 * @param {string} options.profile - Route profile: 'road', 'trail', 'track', 'mixed'
 * @param {Object} options.preferences - User preferences
 * @param {string} options.trainingGoal - Training goal
 * @param {string} options.mapboxToken - Mapbox access token for fallback
 * @param {number} options.userSpeed - Optional personalized running speed in km/h
 * @returns {Promise<Object>} Route with coordinates, distance, duration, elevation
 */
export async function getSmartRunningRoute(waypoints, options = {}) {
  const {
    profile = 'road',
    preferences = null,
    trainingGoal = 'easy_run',
    mapboxToken = null,
    userSpeed = null
  } = options;

  console.log('🏃 Smart running router: Finding optimal route...');
  console.log('📍 Waypoints:', waypoints.length);
  console.log('🎯 Profile:', profile);
  console.log('🎯 Training goal:', trainingGoal);

  const isTrail = profile === 'trail';

  if (isTrail) {
    // === TRAIL RUNNING STRATEGY ===
    // BRouter hiking profile prioritizes trails and unpaved paths

    console.log('🌲 Trail run requested - using BRouter as PRIMARY (hiking profile)');
    const brouterProfile = selectRunningBRouterProfile(profile, trainingGoal);
    const brouterResult = await tryBRouterRunning(waypoints, {
      profile: brouterProfile,
      preferences,
      trainingGoal
    });

    if (brouterResult && brouterResult.coordinates && brouterResult.coordinates.length > 10) {
      console.log('✅ BRouter provided trail running route');
      return {
        ...brouterResult,
        source: 'brouter_hiking',
        confidence: 1.0
      };
    } else {
      console.warn('⚠️ BRouter routing failed, falling back to Stadia Maps');
    }

    // Fallback to Stadia Maps pedestrian
    if (isStadiaMapsAvailable()) {
      const stadiaResult = await tryStadiaPedestrianRouting(waypoints, {
        profile,
        preferences,
        trainingGoal,
        userSpeed
      });

      if (stadiaResult && stadiaResult.coordinates && stadiaResult.coordinates.length > 10) {
        console.log('✅ Stadia Maps provided trail running route (fallback)');
        return {
          ...stadiaResult,
          source: 'stadia_pedestrian',
          confidence: 0.8
        };
      }
    }
  } else {
    // === ROAD/TRACK/MIXED RUNNING STRATEGY ===
    // Stadia Maps pedestrian costing is excellent for paved/urban running

    if (isStadiaMapsAvailable()) {
      console.log('🗺️ Using Stadia Maps pedestrian as PRIMARY for road running');
      const stadiaResult = await tryStadiaPedestrianRouting(waypoints, {
        profile,
        preferences,
        trainingGoal,
        userSpeed
      });

      if (stadiaResult && stadiaResult.coordinates && stadiaResult.coordinates.length > 10) {
        console.log('✅ Stadia Maps provided optimized running route');
        return {
          ...stadiaResult,
          source: 'stadia_pedestrian',
          confidence: 1.0
        };
      } else {
        console.warn('⚠️ Stadia Maps routing failed, falling back to BRouter');
      }
    }

    // Fallback to BRouter trekking profile
    const brouterProfile = selectRunningBRouterProfile(profile, trainingGoal);
    const brouterResult = await tryBRouterRunning(waypoints, {
      profile: brouterProfile,
      preferences,
      trainingGoal
    });

    if (brouterResult && brouterResult.coordinates && brouterResult.coordinates.length > 10) {
      console.log('✅ BRouter provided running route (fallback)');
      return {
        ...brouterResult,
        source: 'brouter_trekking',
        confidence: 0.9
      };
    }
  }

  // Final fallback: Mapbox walking profile
  if (mapboxToken) {
    console.log('🔄 Falling back to Mapbox walking profile...');
    const mapboxResult = await tryMapboxWalking(waypoints, { mapboxToken });

    if (mapboxResult && mapboxResult.coordinates && mapboxResult.coordinates.length > 10) {
      console.log('✅ Mapbox provided running route (walking profile)');
      return {
        ...mapboxResult,
        source: 'mapbox_walking',
        confidence: 0.7
      };
    }
  }

  console.warn('❌ All running routing strategies failed');
  return null;
}

/**
 * Try Stadia Maps pedestrian routing
 */
async function tryStadiaPedestrianRouting(waypoints, options) {
  const { profile, preferences, trainingGoal, userSpeed } = options;

  try {
    const result = await getStadiaPedestrianRoute(waypoints, {
      profile,
      preferences,
      trainingGoal,
      userSpeed
    });

    if (result && result.coordinates && result.coordinates.length > 0) {
      return {
        coordinates: result.coordinates,
        distance: result.distance,
        duration: result.duration,
        elevationGain: result.elevationGain || 0,
        elevationLoss: result.elevationLoss || 0,
        confidence: result.confidence || 1.0,
        profile,
        source: 'stadia_pedestrian'
      };
    }
    return null;
  } catch (error) {
    console.warn('Stadia Maps pedestrian routing failed:', error);
    return null;
  }
}

/**
 * Try BRouter with hiking/trekking profile for running
 */
async function tryBRouterRunning(waypoints, options) {
  const { profile, preferences, trainingGoal } = options;

  try {
    const brouterProfile = profile || selectRunningBRouterProfile('road', trainingGoal);
    console.log(`🏃 Trying BRouter with profile: ${brouterProfile}`);

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
    console.warn('BRouter running routing failed:', error);
    return null;
  }
}

/**
 * Try Mapbox walking profile as final fallback
 */
async function tryMapboxWalking(waypoints, options) {
  const { mapboxToken } = options;

  try {
    const coordinates = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?` +
      `geometries=geojson&overview=full&access_token=${mapboxToken}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
      elevationGain: 0,
      elevationLoss: 0,
      confidence: 0.8,
      profile: 'walking',
      source: 'mapbox_walking'
    };
  } catch (error) {
    console.warn('Mapbox walking routing failed:', error);
    return null;
  }
}

/**
 * Get human-readable label for a running routing source
 */
export function getRunningRoutingSourceLabel(source) {
  switch (source) {
    case 'stadia_pedestrian': return 'Stadia Maps (Pedestrian)';
    case 'brouter_hiking': return 'BRouter (Hiking)';
    case 'brouter_trekking': return 'BRouter (Trekking)';
    case 'mapbox_walking': return 'Mapbox (Walking)';
    default: return source || 'Unknown';
  }
}

export default {
  getSmartRunningRoute,
  getRunningRoutingSourceLabel,
};
