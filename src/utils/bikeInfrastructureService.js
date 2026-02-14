/**
 * Bike Infrastructure Service
 * Fetches cycling infrastructure data from OpenStreetMap Overpass API
 * based on the current map viewport for on-demand overlay rendering
 */

// Overpass API endpoints (with fallbacks)
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Cache infrastructure data by grid cells to avoid duplicate requests
const infrastructureCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const GRID_SIZE = 0.02; // ~2km grid cells for caching

// Maximum bounding box size (in degrees) to prevent timeout
// ~0.1 degrees ≈ 11km, so 0.15 x 0.15 ≈ 16km x 16km max area
const MAX_BBOX_SIZE = 0.15;

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

// Abort controller for canceling pending requests
let currentAbortController = null;

// Track which server to try next
let currentServerIndex = 0;

/**
 * Infrastructure type classification for styling
 */
export const INFRASTRUCTURE_TYPES = {
  PROTECTED_CYCLEWAY: 'protected_cycleway',    // Tier 1: Safest
  BIKE_LANE: 'bike_lane',                      // Tier 2: On-road lane
  SHARED_PATH: 'shared_path',                  // Tier 3: Multi-use path
  BIKE_FRIENDLY: 'bike_friendly',              // Tier 4: Bike-allowed street
  SHARED_LANE: 'shared_lane',                  // Tier 5: Sharrow/shared
};

/**
 * Color scheme for infrastructure types (cyan/teal gradient - avoids green used for routes)
 */
export const INFRASTRUCTURE_COLORS = {
  [INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY]: '#5C7A5E', // Teal - safest
  [INFRASTRUCTURE_TYPES.BIKE_LANE]: '#6B8C72',          // Sage
  [INFRASTRUCTURE_TYPES.SHARED_PATH]: '#507052',        // Teal variant
  [INFRASTRUCTURE_TYPES.BIKE_FRIENDLY]: '#B89040',      // Gold - caution
  [INFRASTRUCTURE_TYPES.SHARED_LANE]: '#9A9C90',        // Text muted - warning
};

/**
 * Classify an OSM way into an infrastructure type
 * @param {Object} tags - OSM tags for the way
 * @returns {string} Infrastructure type constant
 */
function classifyInfrastructure(tags) {
  if (!tags) return INFRASTRUCTURE_TYPES.BIKE_FRIENDLY;

  const highway = tags.highway || '';
  const cycleway = tags.cycleway || '';
  const cyclewayBoth = tags['cycleway:both'] || '';
  const cyclewayLeft = tags['cycleway:left'] || '';
  const cyclewayRight = tags['cycleway:right'] || '';
  const bicycle = tags.bicycle || '';

  // Tier 1: Protected/Separated cycleways
  if (highway === 'cycleway') {
    return INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY;
  }
  if (cycleway === 'track' || cyclewayBoth === 'track' ||
      cyclewayLeft === 'track' || cyclewayRight === 'track') {
    return INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY;
  }

  // Tier 2: Bike lanes (on-road, painted)
  if (cycleway === 'lane' || cyclewayBoth === 'lane' ||
      cyclewayLeft === 'lane' || cyclewayRight === 'lane') {
    return INFRASTRUCTURE_TYPES.BIKE_LANE;
  }

  // Tier 3: Shared paths / Greenways
  if (highway === 'path' && bicycle === 'designated') {
    return INFRASTRUCTURE_TYPES.SHARED_PATH;
  }
  if (highway === 'footway' && (bicycle === 'yes' || bicycle === 'designated')) {
    return INFRASTRUCTURE_TYPES.SHARED_PATH;
  }
  if (tags.route === 'bicycle') {
    return INFRASTRUCTURE_TYPES.SHARED_PATH;
  }

  // Tier 5: Shared lanes / Sharrows
  if (cycleway === 'shared_lane' || cyclewayBoth === 'shared_lane') {
    return INFRASTRUCTURE_TYPES.SHARED_LANE;
  }

  // Tier 4: Bike-friendly streets (residential, etc.)
  if (bicycle === 'yes' || bicycle === 'designated') {
    return INFRASTRUCTURE_TYPES.BIKE_FRIENDLY;
  }

  // Default to bike-friendly if it has any cycleway tag
  if (cycleway || cyclewayBoth || cyclewayLeft || cyclewayRight) {
    return INFRASTRUCTURE_TYPES.BIKE_LANE;
  }

  return INFRASTRUCTURE_TYPES.BIKE_FRIENDLY;
}

/**
 * Convert bounds to grid cell key for caching
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Grid cell key
 */
function getGridCell(lat, lng) {
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  return `${gridLat.toFixed(3)},${gridLng.toFixed(3)}`;
}

/**
 * Get all grid cells that overlap with the given bounds
 * @param {Object} bounds - Map bounds {north, south, east, west}
 * @returns {Array} Array of grid cell keys
 */
function getGridCellsForBounds(bounds) {
  const cells = [];
  for (let lat = Math.floor(bounds.south / GRID_SIZE) * GRID_SIZE;
       lat <= bounds.north;
       lat += GRID_SIZE) {
    for (let lng = Math.floor(bounds.west / GRID_SIZE) * GRID_SIZE;
         lng <= bounds.east;
         lng += GRID_SIZE) {
      cells.push(getGridCell(lat, lng));
    }
  }
  return cells;
}

/**
 * Clamp bounds to maximum size to prevent API timeout
 * @param {Object} bounds - {south, west, north, east}
 * @returns {Object} Clamped bounds centered on original
 */
function clampBounds(bounds) {
  const latSize = bounds.north - bounds.south;
  const lngSize = bounds.east - bounds.west;

  // If within limits, return as-is
  if (latSize <= MAX_BBOX_SIZE && lngSize <= MAX_BBOX_SIZE) {
    return bounds;
  }

  // Otherwise, clamp to max size centered on the viewport center
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const halfSize = MAX_BBOX_SIZE / 2;

  return {
    south: centerLat - halfSize,
    north: centerLat + halfSize,
    west: centerLng - halfSize,
    east: centerLng + halfSize,
  };
}

/**
 * Build Overpass query for cycling infrastructure in a bounding box
 * @param {Object} bounds - {south, west, north, east}
 * @returns {string} Overpass QL query
 */
function buildOverpassQuery(bounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  // Simplified query focusing on most important infrastructure
  // to reduce load and prevent timeouts
  return `
[out:json][timeout:15][bbox:${bbox}];
(
  // Tier 1: Protected/Separated cycleways (most important)
  way[highway=cycleway];
  way[cycleway=track];

  // Tier 2: Bike lanes on road
  way[cycleway=lane];

  // Tier 3: Shared paths / Greenways
  way[highway=path][bicycle=designated];

  // Tier 5: Shared lanes / Sharrows
  way[cycleway=shared_lane];
);
out geom;
`;
}

/**
 * Fetch infrastructure data for a bounding box with retry and fallback
 * @param {Object} bounds - {south, west, north, east}
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
async function fetchInfrastructureData(bounds, signal) {
  // Clamp bounds to prevent timeout on large areas
  const clampedBounds = clampBounds(bounds);
  const query = buildOverpassQuery(clampedBounds);

  let lastError = null;

  // Try each server with retry
  for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
    const serverUrl = OVERPASS_SERVERS[(currentServerIndex + attempt) % OVERPASS_SERVERS.length];

    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
        signal,
      });

      if (response.ok) {
        const data = await response.json();
        // Remember this server worked
        currentServerIndex = (currentServerIndex + attempt) % OVERPASS_SERVERS.length;
        return data;
      }

      // Server returned error, try next
      lastError = new Error(`Overpass API error: ${response.status}`);
      console.warn(`⚠️ Server ${serverUrl} returned ${response.status}, trying next...`);

    } catch (error) {
      if (error.name === 'AbortError') {
        throw error; // Don't retry on abort
      }
      lastError = error;
      console.warn(`⚠️ Server ${serverUrl} failed: ${error.message}, trying next...`);
    }
  }

  // All servers failed
  throw lastError || new Error('All Overpass servers failed');
}

/**
 * Convert OSM data to GeoJSON with infrastructure classification
 * @param {Object} osmData - Raw Overpass API response
 * @returns {Object} GeoJSON FeatureCollection
 */
function osmToGeoJSON(osmData) {
  if (!osmData?.elements) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = osmData.elements
    .filter(el => el.type === 'way' && el.geometry && el.geometry.length >= 2)
    .map(el => {
      const infraType = classifyInfrastructure(el.tags);
      const color = INFRASTRUCTURE_COLORS[infraType];

      return {
        type: 'Feature',
        id: el.id,
        geometry: {
          type: 'LineString',
          coordinates: el.geometry.map(node => [node.lon, node.lat]),
        },
        properties: {
          id: el.id,
          name: el.tags?.name || null,
          infraType,
          color,
          highway: el.tags?.highway || null,
          cycleway: el.tags?.cycleway || null,
          surface: el.tags?.surface || null,
          // For layer ordering (lower = rendered first/bottom)
          sortOrder: Object.values(INFRASTRUCTURE_TYPES).indexOf(infraType),
        },
      };
    });

  // Sort features so safer infrastructure renders on top
  features.sort((a, b) => b.properties.sortOrder - a.properties.sortOrder);

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Fetch bike infrastructure for the current map viewport
 * Implements caching, rate limiting, and request cancellation
 *
 * @param {Object} bounds - Map bounds {north, south, east, west}
 * @param {Object} options - Options
 * @param {boolean} options.forceRefresh - Skip cache
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function fetchBikeInfrastructure(bounds, options = {}) {
  const { forceRefresh = false } = options;

  // Cancel any pending request
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  // Get grid cells for the bounds
  const cells = getGridCellsForBounds(bounds);

  // Check cache for all cells
  const now = Date.now();
  const cachedFeatures = [];
  const missingCells = [];

  for (const cell of cells) {
    const cached = infrastructureCache.get(cell);
    if (cached && !forceRefresh && (now - cached.timestamp < CACHE_TTL)) {
      cachedFeatures.push(...cached.features);
    } else {
      missingCells.push(cell);
    }
  }

  // If all data is cached, return immediately
  if (missingCells.length === 0) {
    console.log(`🚴 Using cached infrastructure data (${cachedFeatures.length} features)`);
    return {
      type: 'FeatureCollection',
      features: cachedFeatures,
    };
  }

  // Rate limiting
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  try {
    console.log(`🚴 Fetching infrastructure for ${missingCells.length} grid cells...`);
    lastRequestTime = Date.now();

    const osmData = await fetchInfrastructureData(bounds, signal);
    const geoJSON = osmToGeoJSON(osmData);

    // Cache the features by grid cell
    // For simplicity, we cache all features for each missing cell
    // A more sophisticated approach would spatially partition the features
    for (const cell of missingCells) {
      infrastructureCache.set(cell, {
        features: geoJSON.features,
        timestamp: Date.now(),
      });
    }

    // Combine cached and new features, deduplicate by id
    const allFeatures = [...cachedFeatures, ...geoJSON.features];
    const uniqueFeatures = Array.from(
      new Map(allFeatures.map(f => [f.id, f])).values()
    );

    console.log(`✅ Loaded ${geoJSON.features.length} new + ${cachedFeatures.length} cached = ${uniqueFeatures.length} unique features`);

    return {
      type: 'FeatureCollection',
      features: uniqueFeatures,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('🚴 Infrastructure request cancelled');
      // Return cached data if available
      return {
        type: 'FeatureCollection',
        features: cachedFeatures,
      };
    }
    console.error('❌ Failed to fetch infrastructure:', error);
    throw error;
  }
}

/**
 * Clear the infrastructure cache
 */
export function clearInfrastructureCache() {
  infrastructureCache.clear();
  console.log('🗑️ Infrastructure cache cleared');
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
  return {
    cellCount: infrastructureCache.size,
    gridSize: GRID_SIZE,
    ttlMinutes: CACHE_TTL / 60000,
  };
}

export default {
  fetchBikeInfrastructure,
  clearInfrastructureCache,
  getCacheStats,
  INFRASTRUCTURE_TYPES,
  INFRASTRUCTURE_COLORS,
};
