/**
 * Route POI Service
 *
 * Queries OpenStreetMap Overpass API for points of interest along a route corridor.
 * Supports water, food, bike shops, viewpoints, and restrooms.
 * Uses the same multi-server fallback and caching patterns as bikeInfrastructureService.
 */

// Overpass API endpoints (with fallbacks)
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

let currentServerIndex = 0;

// Cache POI results by route hash
const poiCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1500; // 1.5s between requests

// ── POI Categories ──────────────────────────────────────────────────

export const POI_CATEGORIES = {
  water: {
    id: 'water',
    label: 'Water',
    icon: 'droplet',      // maps to IconDroplet in the UI
    color: '#7BA9A0',     // teal
    overpassTags: [
      'node[amenity=drinking_water]',
      'node[man_made=water_tap]',
      'node[amenity=water_point]',
    ],
  },
  food: {
    id: 'food',
    label: 'Food & Drink',
    icon: 'coffee',       // IconCoffee
    color: '#D4A843',     // gold
    overpassTags: [
      'node[amenity=cafe]',
      'node[amenity=restaurant]',
      'node[amenity=fast_food]',
      'node[shop=bakery]',
      'node[shop=convenience]',
    ],
  },
  bike_shop: {
    id: 'bike_shop',
    label: 'Bike Shop',
    icon: 'tool',         // IconTool
    color: '#A8BFA8',     // sage
    overpassTags: [
      'node[shop=bicycle]',
      'node[amenity=bicycle_repair_station]',
      'node[amenity=bicycle_rental]',
    ],
  },
  viewpoint: {
    id: 'viewpoint',
    label: 'Viewpoint',
    icon: 'eye',          // IconEye
    color: '#C4A0B9',     // mauve
    overpassTags: [
      'node[tourism=viewpoint]',
      'node[natural=peak]',
    ],
  },
  restroom: {
    id: 'restroom',
    label: 'Restroom',
    icon: 'door',         // generic
    color: '#6b7280',     // gray
    overpassTags: [
      'node[amenity=toilets]',
    ],
  },
};

// ── Distance helpers ────────────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Create a bounding box around a route with a corridor buffer.
 * @param {Array<[lon,lat]>} coordinates Route coordinates
 * @param {number} bufferKm Buffer around the route in km
 * @returns {Object} { south, west, north, east }
 */
function routeBoundingBox(coordinates, bufferKm = 0.5) {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  for (const [lon, lat] of coordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  // ~0.009 degrees ≈ 1 km at mid-latitudes
  const bufferDeg = bufferKm * 0.009;
  return {
    south: minLat - bufferDeg,
    north: maxLat + bufferDeg,
    west: minLon - bufferDeg,
    east: maxLon + bufferDeg,
  };
}

/**
 * Compute the distance along the route for a POI by finding the nearest route point.
 * @param {Object} poi {lat, lon}
 * @param {Array<[lon,lat]>} coordinates
 * @param {Array<number>} cumulativeDistances
 * @returns {number} Distance in km along route
 */
function distanceAlongRoute(poi, coordinates, cumulativeDistances) {
  let nearestIdx = 0;
  let nearestDist = Infinity;

  for (let i = 0; i < coordinates.length; i++) {
    const d = haversineDistance(poi.lat, poi.lon, coordinates[i][1], coordinates[i][0]);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }

  return {
    routeDistanceKm: cumulativeDistances[nearestIdx],
    offRouteDistanceM: Math.round(nearestDist * 1000),
  };
}

/**
 * Simple hash for cache keying based on route endpoints + length.
 */
function routeHash(coordinates) {
  if (!coordinates || coordinates.length < 2) return '';
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return `${first[0].toFixed(3)},${first[1].toFixed(3)}_${last[0].toFixed(3)},${last[1].toFixed(3)}_${coordinates.length}`;
}

/**
 * Calculate cumulative distances along route coordinates (km).
 */
function cumulativeDistances(coordinates) {
  const dists = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const d = haversineDistance(
      coordinates[i - 1][1], coordinates[i - 1][0],
      coordinates[i][1], coordinates[i][0]
    );
    dists.push(dists[i - 1] + d);
  }
  return dists;
}

// ── Main query ──────────────────────────────────────────────────────

/**
 * Build an Overpass query for multiple POI categories within a bounding box.
 */
function buildPOIQuery(bbox, categories) {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const tagQueries = categories.flatMap(cat =>
    POI_CATEGORIES[cat]?.overpassTags || []
  );

  return `
[out:json][timeout:20][bbox:${bboxStr}];
(
  ${tagQueries.map(t => `${t};`).join('\n  ')}
);
out body;
`;
}

/**
 * Fetch POIs from Overpass with server fallback.
 */
async function fetchFromOverpass(query) {
  // Rate limiting
  const now = Date.now();
  const timeSince = now - lastRequestTime;
  if (timeSince < MIN_REQUEST_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - timeSince));
  }

  let lastError = null;
  for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
    const url = OVERPASS_SERVERS[(currentServerIndex + attempt) % OVERPASS_SERVERS.length];
    try {
      lastRequestTime = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
      });
      if (response.ok) {
        currentServerIndex = (currentServerIndex + attempt) % OVERPASS_SERVERS.length;
        return await response.json();
      }
      lastError = new Error(`Overpass ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Overpass servers failed');
}

/**
 * Classify an OSM element into a POI category.
 */
function classifyPOI(tags) {
  if (!tags) return null;

  // Water
  if (tags.amenity === 'drinking_water' || tags.man_made === 'water_tap' || tags.amenity === 'water_point') {
    return 'water';
  }
  // Food
  if (['cafe', 'restaurant', 'fast_food'].includes(tags.amenity) ||
      ['bakery', 'convenience'].includes(tags.shop)) {
    return 'food';
  }
  // Bike shop
  if (tags.shop === 'bicycle' || tags.amenity === 'bicycle_repair_station' || tags.amenity === 'bicycle_rental') {
    return 'bike_shop';
  }
  // Viewpoint
  if (tags.tourism === 'viewpoint' || tags.natural === 'peak') {
    return 'viewpoint';
  }
  // Restroom
  if (tags.amenity === 'toilets') {
    return 'restroom';
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Query POIs along a route corridor.
 *
 * @param {Array<[lon,lat]>} coordinates  Route coordinates
 * @param {string[]}  categories  Array of category IDs (default: all)
 * @param {number}    corridorKm  How far from the route to search (default 0.5km)
 * @returns {Promise<Array>} Array of POI objects
 */
export async function queryPOIsAlongRoute(
  coordinates,
  categories = Object.keys(POI_CATEGORIES),
  corridorKm = 0.5,
) {
  if (!coordinates || coordinates.length < 2) return [];

  // Check cache
  const hash = routeHash(coordinates) + '_' + categories.sort().join(',');
  const cached = poiCache.get(hash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.pois;
  }

  const bbox = routeBoundingBox(coordinates, corridorKm);
  const query = buildPOIQuery(bbox, categories);

  console.log(`📍 Querying POIs along route (${categories.length} categories, ${corridorKm}km corridor)…`);

  const data = await fetchFromOverpass(query);
  const cumDists = cumulativeDistances(coordinates);

  const pois = (data.elements || [])
    .filter(el => el.lat != null && el.lon != null && el.tags)
    .map(el => {
      const category = classifyPOI(el.tags);
      if (!category || !categories.includes(category)) return null;

      const { routeDistanceKm, offRouteDistanceM } = distanceAlongRoute(
        { lat: el.lat, lon: el.lon },
        coordinates,
        cumDists,
      );

      // Skip POIs that are too far off the route
      if (offRouteDistanceM > corridorKm * 1000) return null;

      return {
        id: el.id,
        category,
        name: el.tags.name || POI_CATEGORIES[category].label,
        lat: el.lat,
        lon: el.lon,
        routeDistanceKm: Math.round(routeDistanceKm * 10) / 10,
        offRouteDistanceM,
        openingHours: el.tags.opening_hours || null,
        website: el.tags.website || null,
        phone: el.tags.phone || null,
      };
    })
    .filter(Boolean);

  // Deduplicate very close POIs in the same category (within 30m)
  const deduped = deduplicatePOIs(pois);

  // Sort by distance along route
  deduped.sort((a, b) => a.routeDistanceKm - b.routeDistanceKm);

  console.log(`✅ Found ${deduped.length} POIs along route`);

  // Cache
  poiCache.set(hash, { pois: deduped, timestamp: Date.now() });

  return deduped;
}

function deduplicatePOIs(pois) {
  const seen = [];
  return pois.filter(poi => {
    const isDupe = seen.some(s =>
      s.category === poi.category &&
      haversineDistance(s.lat, s.lon, poi.lat, poi.lon) < 0.03 // 30m
    );
    if (!isDupe) {
      seen.push(poi);
      return true;
    }
    return false;
  });
}

/**
 * Clear the POI cache.
 */
export function clearPOICache() {
  poiCache.clear();
}

export default { queryPOIsAlongRoute, clearPOICache, POI_CATEGORIES };
