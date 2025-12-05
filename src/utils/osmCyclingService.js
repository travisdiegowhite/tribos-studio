/**
 * OSM Cycling Service
 * Uses OpenStreetMap's Overpass API to find real cycling infrastructure
 * and match Claude's route suggestions to actual trails/paths
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Cache for OSM data to respect rate limits (30 sec between requests)
const osmCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Query Overpass API for cycling infrastructure near a location
 * Returns full geometry (nodes) for ways so we can route along them
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusMeters - Search radius in meters (default 5km)
 * @returns {Promise<Object>} OSM data with cycling features
 */
export async function queryCyclingRoutes(lat, lon, radiusMeters = 5000) {
  // Check cache first (round to 0.01 degrees for cache key)
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${radiusMeters}`;
  const cached = osmCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('🗺️ Using cached OSM data');
    return cached.data;
  }

  // Query for cycling infrastructure with full geometry
  // "out geom" gives us all node coordinates for ways
  const query = `
    [out:json][timeout:25];
    (
      // Dedicated cycleways
      way[highway=cycleway](around:${radiusMeters},${lat},${lon});

      // Paths designated for bicycles
      way[highway=path][bicycle=designated](around:${radiusMeters},${lat},${lon});

      // Named trails and paths (common cycling features)
      way[name~"Trail|Path|Creek|Greenway|Bikeway|Cycle",i][highway](around:${radiusMeters},${lat},${lon});

      // Bicycle route relations
      relation[route=bicycle](around:${radiusMeters},${lat},${lon});

      // Roads with bike infrastructure
      way[cycleway](around:${radiusMeters},${lat},${lon});
    );
    out body geom;
  `;

  console.log(`🗺️ Querying OSM for cycling features near ${lat.toFixed(4)}, ${lon.toFixed(4)} (${radiusMeters}m radius)`);

  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data = await response.json();

    // Cache the result
    osmCache.set(cacheKey, { data, timestamp: Date.now() });

    console.log(`✅ OSM returned ${data.elements?.length || 0} cycling features`);
    return data;

  } catch (error) {
    console.error('❌ OSM query failed:', error);
    throw error;
  }
}

/**
 * Extract named cycling features from OSM response
 * Now includes full geometry for ways (array of coordinates)
 * @param {Object} osmData - Raw Overpass API response
 * @returns {Array} Array of cycling features with coordinates and geometry
 */
export function extractCyclingFeatures(osmData) {
  if (!osmData?.elements) return [];

  return osmData.elements
    .filter(el => el.tags?.name) // Only named features
    .map(el => {
      // Extract geometry from way nodes
      let geometry = [];
      let centerLat = null;
      let centerLng = null;

      if (el.geometry && Array.isArray(el.geometry)) {
        // Way with geometry - extract all coordinates
        geometry = el.geometry.map(node => ({
          lat: node.lat,
          lng: node.lon
        }));

        // Calculate center from geometry
        if (geometry.length > 0) {
          const midIndex = Math.floor(geometry.length / 2);
          centerLat = geometry[midIndex].lat;
          centerLng = geometry[midIndex].lng;
        }
      } else if (el.center) {
        // Fallback to center point
        centerLat = el.center.lat;
        centerLng = el.center.lon;
      } else if (el.lat && el.lon) {
        // Node
        centerLat = el.lat;
        centerLng = el.lon;
      }

      return {
        id: el.id,
        type: el.type,
        name: el.tags.name,
        lat: centerLat,
        lng: centerLng,
        geometry, // Full path coordinates
        highway: el.tags.highway || null,
        surface: el.tags.surface || null,
        route: el.tags.route || null,
        tags: el.tags
      };
    })
    .filter(f => f.lat && f.lng); // Only features with coordinates
}

/**
 * Fuzzy match Claude's route name to OSM features
 * Prioritizes features with geometry (actual trail coordinates)
 * @param {string} claudeName - Route name from Claude (e.g., "Boulder Creek Path East Loop")
 * @param {Array} osmFeatures - Extracted OSM features
 * @returns {Object|null} Best matching feature or null if no good match
 */
export function findMatchingFeature(claudeName, osmFeatures) {
  if (!claudeName || !osmFeatures?.length) return null;

  // Normalize and tokenize the Claude route name
  const searchTerms = claudeName
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(term => term.length > 2); // Skip short words

  // Common words to ignore in matching (Claude often adds these)
  const stopWords = new Set([
    'the', 'loop', 'route', 'extended', 'scenic', 'classic',
    'east', 'west', 'north', 'south', 'upper', 'lower',
    'ride', 'cycling', 'bike', 'bicycle'
  ]);
  const meaningfulTerms = searchTerms.filter(t => !stopWords.has(t));

  console.log(`🔍 Searching for terms: [${meaningfulTerms.join(', ')}] in ${osmFeatures.length} features`);

  // Score each OSM feature
  const scored = osmFeatures.map(feature => {
    const featureName = feature.name.toLowerCase();

    // Count matching meaningful terms
    const matches = meaningfulTerms.filter(term => featureName.includes(term));

    // Bonus for having actual geometry (trail coordinates we can use)
    const geometryBonus = (feature.geometry && feature.geometry.length > 5) ? 1 : 0;

    // Bonus for exact substring matches
    const exactBonus = featureName.includes(claudeName.toLowerCase().replace(/\s+(loop|route|extended)$/i, '')) ? 2 : 0;

    // Penalty for very short geometry (probably not useful for routing)
    const geometryPenalty = (feature.geometry && feature.geometry.length < 3) ? -0.5 : 0;

    return {
      ...feature,
      score: matches.length + exactBonus + geometryBonus + geometryPenalty,
      matchedTerms: matches
    };
  });

  // Sort by score descending
  const sorted = scored.sort((a, b) => b.score - a.score);

  // Log top candidates for debugging
  const topCandidates = sorted.slice(0, 5);
  console.log('🏆 Top OSM matches:');
  topCandidates.forEach((f, i) => {
    console.log(`   ${i + 1}. "${f.name}" (score: ${f.score.toFixed(1)}, geometry: ${f.geometry?.length || 0} pts, matched: [${f.matchedTerms.join(', ')}])`);
  });

  // Return best match if score >= 1 (at least one meaningful word matched)
  const best = sorted[0];
  if (best?.score >= 1) {
    console.log(`🎯 Selected: "${best.name}" (score: ${best.score.toFixed(1)}, ${best.geometry?.length || 0} geometry points)`);
    return best;
  }

  console.log(`⚠️ No OSM match found for "${claudeName}" (best score: ${best?.score || 0})`);
  return null;
}

/**
 * Get cycling features near a location with caching
 * Combines query and extraction into one call
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius
 * @returns {Promise<Array>} Array of cycling features
 */
export async function getCyclingFeaturesNear(lat, lng, radiusMeters = 5000) {
  try {
    const osmData = await queryCyclingRoutes(lat, lng, radiusMeters);
    return extractCyclingFeatures(osmData);
  } catch (error) {
    console.error('Failed to get cycling features:', error);
    return [];
  }
}

/**
 * Try to match a Claude route to real OSM cycling infrastructure
 * Returns the matched feature with full geometry for routing
 * @param {Object} claudeRoute - Route suggestion from Claude
 * @param {Object} startLocation - Starting location {lat, lng}
 * @returns {Promise<Object|null>} Matched OSM feature with coordinates and geometry, or null
 */
export async function matchRouteToOSM(claudeRoute, startLocation) {
  try {
    // Get cycling features near the start location
    const features = await getCyclingFeaturesNear(
      startLocation.lat,
      startLocation.lng,
      10000 // 10km radius to find nearby trails
    );

    if (!features.length) {
      console.log('⚠️ No cycling features found in OSM near this location');
      return null;
    }

    console.log(`🔍 Found ${features.length} named cycling features, searching for "${claudeRoute.name}"`);

    // Try to match the route name
    const match = findMatchingFeature(claudeRoute.name, features);

    if (match && match.geometry && match.geometry.length > 0) {
      console.log(`📍 Matched feature has ${match.geometry.length} waypoints along trail`);
    }

    return match;
  } catch (error) {
    console.error('OSM matching failed:', error);
    return null;
  }
}

/**
 * Get waypoints along a matched OSM trail
 * Samples points from the trail geometry to use as routing waypoints
 * @param {Object} osmMatch - Matched OSM feature with geometry
 * @param {Object} startLocation - User's start location
 * @param {number} targetDistanceKm - Target route distance
 * @returns {Array} Array of waypoints along the trail
 */
export function getTrailWaypoints(osmMatch, startLocation, targetDistanceKm) {
  if (!osmMatch.geometry || osmMatch.geometry.length === 0) {
    // No geometry, just use the center point
    return [osmMatch];
  }

  const geometry = osmMatch.geometry;

  // Find the closest point on the trail to the start location
  let closestIndex = 0;
  let closestDistance = Infinity;

  geometry.forEach((point, index) => {
    const dist = haversineDistance(startLocation.lat, startLocation.lng, point.lat, point.lng);
    if (dist < closestDistance) {
      closestDistance = dist;
      closestIndex = index;
    }
  });

  console.log(`📍 Closest trail point is ${closestDistance.toFixed(2)}km away at index ${closestIndex}/${geometry.length}`);

  // Sample points along the trail from the closest point
  // Take points in both directions to create a route along the trail
  const numWaypoints = Math.min(5, Math.ceil(geometry.length / 10)); // Up to 5 waypoints
  const waypoints = [];

  // Add closest point as first waypoint after start
  waypoints.push(geometry[closestIndex]);

  // Sample points going forward along the trail
  const stepSize = Math.max(1, Math.floor(geometry.length / (numWaypoints * 2)));

  for (let i = 1; i <= numWaypoints; i++) {
    const forwardIndex = Math.min(closestIndex + (i * stepSize), geometry.length - 1);
    if (forwardIndex !== closestIndex && !waypoints.some(wp => wp.lat === geometry[forwardIndex].lat)) {
      waypoints.push(geometry[forwardIndex]);
    }
  }

  console.log(`📍 Selected ${waypoints.length} waypoints along trail "${osmMatch.name}"`);

  return waypoints;
}

/**
 * Clear the OSM cache (useful for testing)
 */
export function clearOSMCache() {
  osmCache.clear();
  console.log('🗑️ OSM cache cleared');
}

export default {
  queryCyclingRoutes,
  extractCyclingFeatures,
  findMatchingFeature,
  getCyclingFeaturesNear,
  matchRouteToOSM,
  getTrailWaypoints,
  clearOSMCache
};
