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
 * Query Overpass API for cycling infrastructure near a location
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
    out center tags;
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
 * @param {Object} osmData - Raw Overpass API response
 * @returns {Array} Array of cycling features with coordinates
 */
export function extractCyclingFeatures(osmData) {
  if (!osmData?.elements) return [];

  return osmData.elements
    .filter(el => el.tags?.name) // Only named features
    .map(el => ({
      id: el.id,
      type: el.type,
      name: el.tags.name,
      lat: el.center?.lat || el.lat,
      lng: el.center?.lon || el.lon,
      highway: el.tags.highway || null,
      surface: el.tags.surface || null,
      route: el.tags.route || null,
      tags: el.tags
    }))
    .filter(f => f.lat && f.lng); // Only features with coordinates
}

/**
 * Fuzzy match Claude's route name to OSM features
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

  // Common words to ignore in matching
  const stopWords = new Set(['the', 'loop', 'route', 'east', 'west', 'north', 'south', 'upper', 'lower']);
  const meaningfulTerms = searchTerms.filter(t => !stopWords.has(t));

  // Score each OSM feature
  const scored = osmFeatures.map(feature => {
    const featureName = feature.name.toLowerCase();

    // Count matching meaningful terms
    const matches = meaningfulTerms.filter(term => featureName.includes(term));

    // Bonus for exact substring matches
    const exactBonus = featureName.includes(claudeName.toLowerCase().replace(/\s+(loop|route)$/i, '')) ? 2 : 0;

    return {
      ...feature,
      score: matches.length + exactBonus,
      matchedTerms: matches
    };
  });

  // Sort by score descending
  const sorted = scored.sort((a, b) => b.score - a.score);

  // Return best match if score >= 1 (at least one meaningful word matched)
  const best = sorted[0];
  if (best?.score >= 1) {
    console.log(`🎯 Matched "${claudeName}" to OSM: "${best.name}" (score: ${best.score}, matched: ${best.matchedTerms.join(', ')})`);
    return best;
  }

  console.log(`⚠️ No OSM match found for "${claudeName}"`);
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
 * @param {Object} claudeRoute - Route suggestion from Claude
 * @param {Object} startLocation - Starting location {lat, lng}
 * @returns {Promise<Object|null>} Matched OSM feature with coordinates, or null
 */
export async function matchRouteToOSM(claudeRoute, startLocation) {
  try {
    // Get cycling features near the start location
    const features = await getCyclingFeaturesNear(
      startLocation.lat,
      startLocation.lng,
      8000 // 8km radius to find nearby trails
    );

    if (!features.length) {
      console.log('⚠️ No cycling features found in OSM near this location');
      return null;
    }

    // Try to match the route name
    const match = findMatchingFeature(claudeRoute.name, features);

    return match;
  } catch (error) {
    console.error('OSM matching failed:', error);
    return null;
  }
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
  clearOSMCache
};
