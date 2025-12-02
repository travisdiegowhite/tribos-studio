/**
 * Surface Data Utility
 * Fetches road surface type information from OpenStreetMap for route visualization
 */

// Surface type color scheme
export const SURFACE_COLORS = {
  paved: '#1E40AF',      // Dark blue - asphalt/paved roads
  gravel: '#D97706',     // Orange/brown - gravel roads
  unpaved: '#92400E',    // Dark brown - dirt/unpaved
  mixed: '#EAB308',      // Yellow - mixed/transitioning
  unknown: '#9CA3AF'     // Light gray - no data
};

// OSM surface tag mappings to our categories
const SURFACE_MAPPINGS = {
  paved: ['paved', 'asphalt', 'concrete', 'paving_stones', 'sett', 'cobblestone'],
  gravel: ['gravel', 'fine_gravel', 'pebblestone'],
  unpaved: ['unpaved', 'compacted', 'dirt', 'earth', 'ground', 'mud', 'sand', 'grass', 'wood', 'metal']
};

/**
 * Classify OSM surface tag into our color categories
 */
export function classifySurface(surfaceTag) {
  if (!surfaceTag) return 'unknown';

  const tag = surfaceTag.toLowerCase().trim();

  for (const [category, tags] of Object.entries(SURFACE_MAPPINGS)) {
    if (tags.includes(tag)) {
      return category;
    }
  }

  return 'unknown';
}

/**
 * Fetch surface type data for route coordinates from OpenStreetMap
 * @param {Array<[lon, lat]>} coordinates - Route coordinates
 * @param {Object} options - Options
 * @returns {Promise<Array<{surface: string, color: string}>>} Surface data for each segment
 */
export async function fetchRouteSurfaceData(coordinates, options = {}) {
  if (!coordinates || coordinates.length < 2) {
    console.warn('fetchRouteSurfaceData: Need at least 2 coordinates');
    return [];
  }

  const { bufferMeters = 10, maxSegments = 100 } = options;

  try {
    // For long routes, sample points to avoid overwhelming Overpass API
    const sampledCoords = sampleCoordinates(coordinates, maxSegments);

    console.log(`🗺️ Fetching surface data for ${sampledCoords.length} route segments`);

    // Build Overpass query for roads near route
    const overpassQuery = buildSurfaceQuery(sampledCoords, bufferMeters);

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`
    });

    if (!response.ok) {
      console.error(`Overpass API error: ${response.status}`);
      return createDefaultSurfaceData(coordinates.length);
    }

    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      console.warn('No OSM data found for route - using unknown surface');
      return createDefaultSurfaceData(coordinates.length);
    }

    // Process OSM data to match route segments
    const surfaceData = matchSurfaceToRoute(coordinates, data.elements);

    console.log(`✅ Found surface data:`, summarizeSurfaces(surfaceData));

    return surfaceData;

  } catch (error) {
    console.error('Error fetching surface data:', error);
    return createDefaultSurfaceData(coordinates.length);
  }
}

/**
 * Sample coordinates for large routes to limit API calls
 */
function sampleCoordinates(coordinates, maxSegments) {
  if (coordinates.length <= maxSegments) {
    return coordinates;
  }

  const step = Math.ceil(coordinates.length / maxSegments);
  const sampled = [];

  for (let i = 0; i < coordinates.length; i += step) {
    sampled.push(coordinates[i]);
  }

  // Always include last coordinate
  if (sampled[sampled.length - 1] !== coordinates[coordinates.length - 1]) {
    sampled.push(coordinates[coordinates.length - 1]);
  }

  return sampled;
}

/**
 * Build Overpass API query for surface data along route
 */
function buildSurfaceQuery(coordinates, bufferMeters) {
  // Calculate bounding box
  const lats = coordinates.map(c => c[1]);
  const lons = coordinates.map(c => c[0]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lons);
  const east = Math.max(...lons);

  // Add buffer (approximate degrees for meters)
  const bufferDeg = bufferMeters / 111000; // rough meters to degrees

  return `
    [out:json][timeout:10];
    (
      way["highway"]["surface"](${south - bufferDeg},${west - bufferDeg},${north + bufferDeg},${east + bufferDeg});
    );
    out geom;
  `;
}

/**
 * Match OSM surface data to route segments
 */
function matchSurfaceToRoute(coordinates, osmElements) {
  const surfaceData = [];

  // Create one surface data entry per coordinate segment
  for (let i = 0; i < coordinates.length - 1; i++) {
    const start = coordinates[i];
    const end = coordinates[i + 1];
    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

    // Find closest OSM way to this segment
    let closestWay = null;
    let minDistance = Infinity;

    for (const element of osmElements) {
      if (element.type === 'way' && element.geometry) {
        const distance = getMinDistanceToWay(midpoint, element.geometry);
        if (distance < minDistance) {
          minDistance = distance;
          closestWay = element;
        }
      }
    }

    // Extract surface from closest way
    let surface = 'unknown';
    if (closestWay && closestWay.tags && closestWay.tags.surface) {
      surface = classifySurface(closestWay.tags.surface);
    }

    surfaceData.push({
      surface,
      color: SURFACE_COLORS[surface],
      startIdx: i,
      endIdx: i + 1
    });
  }

  return surfaceData;
}

/**
 * Calculate minimum distance from point to way
 */
function getMinDistanceToWay(point, geometry) {
  let minDist = Infinity;

  for (const node of geometry) {
    const dist = getDistance(point, [node.lon, node.lat]);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return minDist;
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function getDistance([lon1, lat1], [lon2, lat2]) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Create default surface data (unknown) for all segments
 */
function createDefaultSurfaceData(length) {
  const data = [];
  for (let i = 0; i < length - 1; i++) {
    data.push({
      surface: 'unknown',
      color: SURFACE_COLORS.unknown,
      startIdx: i,
      endIdx: i + 1
    });
  }
  return data;
}

/**
 * Summarize surface distribution for logging
 */
function summarizeSurfaces(surfaceData) {
  const counts = {};
  surfaceData.forEach(({ surface }) => {
    counts[surface] = (counts[surface] || 0) + 1;
  });
  return counts;
}

/**
 * Interpolate surfaces for smoother transitions
 * If segments alternate between types, mark transitions as "mixed"
 */
export function smoothSurfaceTransitions(surfaceData, windowSize = 3) {
  if (surfaceData.length < windowSize) return surfaceData;

  const smoothed = [...surfaceData];

  for (let i = 1; i < surfaceData.length - 1; i++) {
    const prev = surfaceData[i - 1].surface;
    const curr = surfaceData[i].surface;
    const next = surfaceData[i + 1].surface;

    // If current differs from both neighbors, mark as mixed
    if (curr !== prev && curr !== next && prev === next) {
      smoothed[i] = {
        ...surfaceData[i], // Preserve startIdx and endIdx
        surface: 'mixed',
        color: SURFACE_COLORS.mixed
      };
    }
  }

  return smoothed;
}
