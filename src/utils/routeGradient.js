/**
 * Route Gradient Utilities
 *
 * Creates a GeoJSON FeatureCollection where each feature is a route segment
 * colored by its slope grade. Used to render elevation-aware route lines.
 */

// Grade → color mapping following cycling conventions
const GRADE_COLORS = [
  { min: -Infinity, max: -8, color: '#6E9B92', label: '< -8%' },   // steep downhill — dark teal
  { min: -8,        max: -3, color: '#7BA9A0', label: '-8% to -3%' }, // downhill — teal
  { min: -3,        max: 3,  color: '#D4A843', label: '-3% to 3%' },  // flat — gold
  { min: 3,         max: 6,  color: '#B08E3A', label: '3% to 6%' },   // moderate uphill — gold variant
  { min: 6,         max: 9,  color: '#C4785C', label: '6% to 9%' },   // challenging — terracotta
  { min: 9,         max: 12, color: '#C4A0B9', label: '9% to 12%' },  // steep — mauve
  { min: 12,        max: Infinity, color: '#A87D9A', label: '> 12%' }, // very steep — dark mauve
];

export { GRADE_COLORS };

/**
 * Get the color for a given grade percentage
 */
function getGradeColor(grade) {
  for (const band of GRADE_COLORS) {
    if (grade >= band.min && grade < band.max) return band.color;
  }
  return '#D4A843'; // fallback: gold/flat
}

/**
 * Calculate grade between two points
 * @param {number} elev1 - elevation at point 1 (meters)
 * @param {number} elev2 - elevation at point 2 (meters)
 * @param {number} distanceMeters - horizontal distance between points (meters)
 * @returns {number} grade as percentage
 */
function calculateGrade(elev1, elev2, distanceMeters) {
  if (distanceMeters < 1) return 0; // avoid division by near-zero
  return ((elev2 - elev1) / distanceMeters) * 100;
}

/**
 * Create a gradient-colored route as a GeoJSON FeatureCollection.
 *
 * Groups consecutive coordinates with similar grade into single LineString
 * features to keep GeoJSON size reasonable.
 *
 * @param {Array} coordinates - [[lng, lat], ...] route coordinates
 * @param {Array} elevationData - [{ distance, elevation, lat, lon }, ...] from getElevationData
 * @returns {Object} GeoJSON FeatureCollection or null
 */
export function createGradientRoute(coordinates, elevationData) {
  if (!coordinates || coordinates.length < 2 || !elevationData || elevationData.length < 2) {
    return null;
  }

  const totalRouteCoords = coordinates.length;
  const totalElevPoints = elevationData.length;

  // Calculate cumulative distance for each coordinate (in km)
  const coordDistances = [0];
  for (let i = 1; i < totalRouteCoords; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    coordDistances.push(coordDistances[i - 1] + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Interpolate elevation for each coordinate distance
  const interpolatedElevations = new Float64Array(totalRouteCoords);
  let eIdx = 0;
  for (let i = 0; i < totalRouteCoords; i++) {
    const dist = coordDistances[i];
    while (eIdx < totalElevPoints - 2 && elevationData[eIdx + 1].distance < dist) {
      eIdx++;
    }
    const d1 = elevationData[eIdx].distance;
    const d2 = elevationData[Math.min(eIdx + 1, totalElevPoints - 1)].distance;
    const e1 = elevationData[eIdx].elevation;
    const e2 = elevationData[Math.min(eIdx + 1, totalElevPoints - 1)].elevation;
    const range = d2 - d1;
    const t = range > 0 ? Math.max(0, Math.min(1, (dist - d1) / range)) : 0;
    interpolatedElevations[i] = e1 + t * (e2 - e1);
  }

  // Build segments grouped by grade band
  const features = [];
  let segStart = 0;

  // Smoothing: calculate grade over a window rather than per-point
  const WINDOW = 5; // points to average over for grade calculation

  // Initialize with the first point's grade color
  const firstGrade = totalRouteCoords > 1
    ? calculateGrade(0, interpolatedElevations[1] - interpolatedElevations[0], (coordDistances[1] - coordDistances[0]) * 1000)
    : 0;
  let segColor = getGradeColor(firstGrade);

  for (let i = 1; i < totalRouteCoords; i++) {
    // Calculate grade using a smoothing window
    const lookBack = Math.max(0, i - WINDOW);
    const distM = (coordDistances[i] - coordDistances[lookBack]) * 1000; // km → m
    const elevDiff = interpolatedElevations[i] - interpolatedElevations[lookBack];
    const grade = calculateGrade(0, elevDiff, distM);
    const color = getGradeColor(grade);

    if (color !== segColor) {
      // Flush the previous segment
      if (i > segStart) {
        features.push({
          type: 'Feature',
          properties: { color: segColor },
          geometry: {
            type: 'LineString',
            coordinates: coordinates.slice(segStart, i + 1), // overlap by 1 for continuity
          },
        });
      }
      segStart = i;
      segColor = color;
    }
  }

  // Flush the last segment
  if (segColor !== null && totalRouteCoords > segStart) {
    features.push({
      type: 'Feature',
      properties: { color: segColor },
      geometry: {
        type: 'LineString',
        coordinates: coordinates.slice(segStart),
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
