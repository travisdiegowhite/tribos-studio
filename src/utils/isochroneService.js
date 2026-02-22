/**
 * Isochrone Service — Run Reach / Road Network Reachability
 *
 * Primary: Valhalla Expansion API (returns actual road edges as GeoJSON LineStrings)
 * Fallback: Mapbox Isochrone API (returns polygon bands)
 *
 * Uses distance-based contours to handle the pace mismatch between
 * running speed and the API's walking profile. Distance along roads
 * is the same regardless of speed.
 */

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de';

// --- Pace & Speed Presets ---

export const PACE_PRESETS = [
  { label: 'Easy', value: 10.0, description: '10:00/mi' },
  { label: 'Moderate', value: 8.5, description: '8:30/mi' },
  { label: 'Tempo', value: 7.5, description: '7:30/mi' },
  { label: 'Fast', value: 6.5, description: '6:30/mi' },
];

export const CYCLING_PRESETS = [
  { label: 'Casual', value: 12, description: '12 mph' },
  { label: 'Moderate', value: 15, description: '15 mph' },
  { label: 'Fast', value: 18, description: '18 mph' },
  { label: 'Race', value: 22, description: '22 mph' },
];

// Color ramp: green (close) → yellow → orange → red (far)
export const REACH_COLORS = [
  { ratio: 0.0, color: '#22c55e' },  // green-500
  { ratio: 0.33, color: '#84cc16' }, // lime-500
  { ratio: 0.5, color: '#eab308' },  // yellow-500
  { ratio: 0.66, color: '#f97316' }, // orange-500
  { ratio: 0.85, color: '#ef4444' }, // red-500
  { ratio: 1.0, color: '#dc2626' },  // red-600
];

// --- Distance Calculations ---

/**
 * Calculate reachable distance from pace and time.
 * @param {number} paceMinPerMile - Pace in minutes per mile (e.g. 8.5 for 8:30/mi)
 * @param {number} timeMinutes - Total time in minutes
 * @returns {number} Distance in meters
 */
export function calculateDistanceFromPace(paceMinPerMile, timeMinutes) {
  const miles = timeMinutes / paceMinPerMile;
  return miles * 1609.34; // miles to meters
}

/**
 * Calculate reachable distance from speed and time (for cycling).
 * @param {number} speedMph - Speed in mph
 * @param {number} timeMinutes - Total time in minutes
 * @returns {number} Distance in meters
 */
export function calculateDistanceFromSpeed(speedMph, timeMinutes) {
  const miles = speedMph * (timeMinutes / 60);
  return miles * 1609.34;
}

/**
 * Format distance for display.
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted string (e.g. "3.7 mi")
 */
export function formatDistance(meters) {
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Format pace for display.
 * @param {number} paceMinPerMile - Pace as decimal minutes (e.g. 8.5)
 * @returns {string} Formatted string (e.g. "8:30/mi")
 */
export function formatPace(paceMinPerMile) {
  const mins = Math.floor(paceMinPerMile);
  const secs = Math.round((paceMinPerMile - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

// --- Valhalla Expansion API (Primary — road network edges) ---

/**
 * Fetch reachable road segments using Valhalla Expansion API.
 * Returns a GeoJSON FeatureCollection of LineString edges with distance/duration properties.
 *
 * @param {[number, number]} center - [lng, lat]
 * @param {Object} options
 * @param {'running'|'cycling'} options.mode
 * @param {number} options.maxDistanceMeters - Maximum distance in meters
 * @returns {Promise<Object|null>} GeoJSON FeatureCollection or null on failure
 */
export async function fetchRunReachRoads(center, options = {}) {
  const {
    mode = 'running',
    maxDistanceMeters = 5000,
  } = options;

  const costing = mode === 'cycling' ? 'bicycle' : 'pedestrian';
  const distanceKm = maxDistanceMeters / 1000;

  const body = {
    costing,
    action: 'isochrone',
    locations: [{ lon: center[0], lat: center[1] }],
    contours: [{ distance: distanceKm }],
    skip_opposites: true,
    expansion_properties: ['distance', 'duration', 'edge_status'],
  };

  try {
    console.log(`🏃 Valhalla Expansion: Fetching ${costing} roads within ${distanceKm.toFixed(1)}km`);

    const response = await fetch(`${VALHALLA_BASE}/expansion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Valhalla Expansion API error: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();

    if (!data || !data.features || data.features.length === 0) {
      console.warn('Valhalla: No edges returned');
      return null;
    }

    // Normalize edge properties for consistent rendering.
    // Valhalla's expansion returns cumulative cost from origin on each edge.
    // We normalize distance to [0,1] range for color mapping.
    const maxCost = Math.max(
      ...data.features.map(f => f.properties?.distance ?? f.properties?.cost ?? 0)
    );

    const normalized = {
      ...data,
      features: data.features
        .filter(f => f.geometry?.coordinates?.length >= 2)
        .map(f => ({
          ...f,
          properties: {
            ...f.properties,
            normalizedDistance: maxCost > 0
              ? (f.properties?.distance ?? f.properties?.cost ?? 0) / maxCost
              : 0,
          },
        })),
    };

    console.log(`✅ Valhalla: ${normalized.features.length} road edges loaded (max ${(maxCost / 1000).toFixed(1)}km)`);
    return normalized;

  } catch (error) {
    console.error('Valhalla Expansion request failed:', error);
    return null;
  }
}

// --- Mapbox Isochrone API (Fallback — polygon bands) ---

/**
 * Fetch isochrone polygons using Mapbox Isochrone API.
 * Returns a GeoJSON FeatureCollection of Polygon features.
 *
 * @param {[number, number]} center - [lng, lat]
 * @param {Object} options
 * @param {'running'|'cycling'} options.mode
 * @param {number} options.maxDistanceMeters - Maximum distance in meters
 * @param {string} options.mapboxToken - Mapbox access token
 * @returns {Promise<Object|null>} GeoJSON FeatureCollection or null on failure
 */
export async function fetchRunReachPolygons(center, options = {}) {
  const {
    mode = 'running',
    maxDistanceMeters = 5000,
    mapboxToken,
  } = options;

  if (!mapboxToken) {
    console.error('Mapbox token required for isochrone fallback');
    return null;
  }

  const profile = mode === 'cycling' ? 'cycling' : 'walking';

  // Generate 3 distance bands at 33%, 66%, 100%
  const band1 = Math.round(maxDistanceMeters * 0.33);
  const band2 = Math.round(maxDistanceMeters * 0.66);
  const band3 = Math.round(maxDistanceMeters);

  const params = new URLSearchParams({
    contours_meters: `${band1},${band2},${band3}`,
    polygons: 'true',
    denoise: '0.5',
    generalize: '50',
    access_token: mapboxToken,
  });

  const url = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${center[0]},${center[1]}?${params}`;

  try {
    console.log(`🗺️ Mapbox Isochrone fallback: ${profile}, distances: ${band1}m/${band2}m/${band3}m`);

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Mapbox Isochrone error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data || !data.features || data.features.length === 0) {
      console.warn('Mapbox Isochrone: No features returned');
      return null;
    }

    // Add normalized distance for consistent color mapping
    const distances = [band1, band2, band3];
    const enriched = {
      ...data,
      type: 'polygon_fallback',
      features: data.features.map((f, i) => ({
        ...f,
        properties: {
          ...f.properties,
          distanceMeters: distances[i] || band3,
          bandIndex: i,
          normalizedDistance: (i + 1) / data.features.length,
        },
      })),
    };

    console.log(`✅ Mapbox Isochrone: ${enriched.features.length} polygon bands loaded`);
    return enriched;

  } catch (error) {
    console.error('Mapbox Isochrone request failed:', error);
    return null;
  }
}

// --- Main entry point ---

/**
 * Fetch Run Reach data — tries Valhalla first, falls back to Mapbox.
 *
 * @param {[number, number]} center - [lng, lat]
 * @param {Object} options
 * @param {'running'|'cycling'} options.mode
 * @param {number} options.paceMinPerMile - Pace for running (ignored if cycling)
 * @param {number} options.speedMph - Speed for cycling (ignored if running)
 * @param {number} options.timeMinutes - Total time
 * @param {boolean} options.outAndBack - If true, uses half distance
 * @param {string} options.mapboxToken - Mapbox token for fallback
 * @returns {Promise<{data: Object, source: 'valhalla'|'mapbox', maxDistanceMeters: number}>}
 */
export async function fetchRunReach(center, options = {}) {
  const {
    mode = 'running',
    paceMinPerMile = 8.5,
    speedMph = 15,
    timeMinutes = 30,
    outAndBack = true,
    mapboxToken,
  } = options;

  // Calculate max distance
  let maxDistanceMeters;
  if (mode === 'cycling') {
    maxDistanceMeters = calculateDistanceFromSpeed(speedMph, timeMinutes);
  } else {
    maxDistanceMeters = calculateDistanceFromPace(paceMinPerMile, timeMinutes);
  }

  // Out-and-back: you can only go half the distance before turning around
  if (outAndBack) {
    maxDistanceMeters = maxDistanceMeters / 2;
  }

  // Cap at 100km (Mapbox limit, and practical limit for Valhalla response size)
  maxDistanceMeters = Math.min(maxDistanceMeters, 100000);

  console.log(`🏃 Run Reach: mode=${mode}, distance=${(maxDistanceMeters / 1609.34).toFixed(1)}mi, outAndBack=${outAndBack}`);

  // Try Valhalla first (road network edges)
  const valhallaData = await fetchRunReachRoads(center, { mode, maxDistanceMeters });
  if (valhallaData) {
    return {
      data: valhallaData,
      source: 'valhalla',
      maxDistanceMeters,
    };
  }

  // Fallback to Mapbox polygons
  console.log('⚠️ Valhalla unavailable, falling back to Mapbox Isochrone');
  const mapboxData = await fetchRunReachPolygons(center, { mode, maxDistanceMeters, mapboxToken });
  if (mapboxData) {
    return {
      data: mapboxData,
      source: 'mapbox',
      maxDistanceMeters,
    };
  }

  // Both failed
  console.error('❌ Both Valhalla and Mapbox isochrone APIs failed');
  return { data: null, source: 'none', maxDistanceMeters };
}
