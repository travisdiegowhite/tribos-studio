/**
 * Smart route naming based on actual route characteristics
 */

/**
 * Generate a meaningful name for a route based on its actual path
 */
export function generateSmartRouteName(route, pattern = null, trainingGoal = 'endurance') {
  if (!route || !route.coordinates || route.coordinates.length < 10) {
    return 'Generated Route';
  }

  const actualDirection = analyzeRouteDirection(route.coordinates);
  const routeCharacteristics = analyzeRouteCharacteristics(route);

  // Get base name from actual direction and characteristics
  const baseName = getBaseRouteName(actualDirection, routeCharacteristics, pattern);

  // Add training goal suffix
  const goalSuffix = getTrainingGoalSuffix(trainingGoal);

  return `${baseName}${goalSuffix}`;
}

/**
 * Analyze which direction the route actually goes
 */
function analyzeRouteDirection(coordinates) {
  if (coordinates.length < 5) return 'Local';

  const start = coordinates[0];
  const maxDistance = { distance: 0, point: start, direction: 'Center' };

  // Find the point furthest from start
  for (let i = 1; i < coordinates.length; i++) {
    const point = coordinates[i];
    const distance = calculateDistance(start, point);

    if (distance > maxDistance.distance) {
      maxDistance.distance = distance;
      maxDistance.point = point;
    }
  }

  // If we don't travel far, it's a local route
  if (maxDistance.distance < 1) { // Less than 1km
    return 'Local';
  }

  // Calculate bearing to furthest point
  const bearing = calculateBearing(start, maxDistance.point);

  return getDirectionFromBearing(bearing);
}

/**
 * Calculate bearing between two points in degrees
 */
function calculateBearing(point1, point2) {
  const lat1 = point1[1] * Math.PI / 180;
  const lat2 = point2[1] * Math.PI / 180;
  const deltaLon = (point2[0] - point1[0]) * Math.PI / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Calculate distance between two points (simple approximation)
 */
function calculateDistance(point1, point2) {
  const lat1 = point1[1];
  const lon1 = point1[0];
  const lat2 = point2[1];
  const lon2 = point2[0];

  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert bearing to readable direction
 */
function getDirectionFromBearing(bearing) {
  if (bearing >= 337.5 || bearing < 22.5) return 'North';
  if (bearing >= 22.5 && bearing < 67.5) return 'Northeast';
  if (bearing >= 67.5 && bearing < 112.5) return 'East';
  if (bearing >= 112.5 && bearing < 157.5) return 'Southeast';
  if (bearing >= 157.5 && bearing < 202.5) return 'South';
  if (bearing >= 202.5 && bearing < 247.5) return 'Southwest';
  if (bearing >= 247.5 && bearing < 292.5) return 'West';
  if (bearing >= 292.5 && bearing < 337.5) return 'Northwest';
  return 'Unknown';
}

/**
 * Analyze route characteristics for better naming
 */
function analyzeRouteCharacteristics(route) {
  const characteristics = {
    distance: route.distance || 0,
    elevation: route.elevationGain || 0,
    isLoop: isLoopRoute(route.coordinates),
    complexity: calculateRouteComplexity(route.coordinates)
  };

  return characteristics;
}

/**
 * Check if route is actually a loop
 */
function isLoopRoute(coordinates) {
  if (coordinates.length < 4) return false;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const distance = calculateDistance(start, end);

  // If start and end are within 500m, consider it a loop
  return distance < 0.5;
}

/**
 * Calculate route complexity (how winding it is)
 */
function calculateRouteComplexity(coordinates) {
  if (coordinates.length < 3) return 0;

  let totalTurns = 0;
  let significantTurns = 0;

  for (let i = 1; i < coordinates.length - 1; i++) {
    const prev = coordinates[i - 1];
    const current = coordinates[i];
    const next = coordinates[i + 1];

    const bearing1 = calculateBearing(prev, current);
    const bearing2 = calculateBearing(current, next);

    let turnAngle = Math.abs(bearing2 - bearing1);
    if (turnAngle > 180) turnAngle = 360 - turnAngle;

    totalTurns++;
    if (turnAngle > 30) significantTurns++; // Turns greater than 30 degrees
  }

  return totalTurns > 0 ? significantTurns / totalTurns : 0;
}

/**
 * Generate base route name from characteristics
 */
function getBaseRouteName(direction, characteristics, pattern) {
  const { distance, elevation, isLoop, complexity } = characteristics;

  // For very local routes
  if (direction === 'Local') {
    if (isLoop) return 'Neighborhood Loop';
    return 'Local Route';
  }

  // Choose descriptive terms based on characteristics
  let routeType = 'Route';
  if (isLoop) {
    routeType = 'Loop';
  } else if (complexity > 0.4) {
    routeType = 'Explorer'; // Winding route
  } else if (elevation > 200) {
    routeType = 'Climber'; // Hilly route
  }

  // For longer routes, be more specific
  if (distance > 50) {
    return `${direction} Adventure`;
  } else if (distance > 25) {
    return `${direction} ${routeType}`;
  } else {
    return `${direction} ${routeType}`;
  }
}

/**
 * Get training goal suffix
 */
function getTrainingGoalSuffix(trainingGoal) {
  switch (trainingGoal) {
    case 'recovery':
      return ' • Recovery';
    case 'intervals':
      return ' • Intervals';
    case 'hills':
      return ' • Hills';
    case 'endurance':
      return ' • Endurance';
    default:
      return '';
  }
}

/**
 * Alternative naming patterns for variety
 */
export function generateAlternativeNames(route, index = 0) {
  const distance = route.distance || 0;
  const elevation = route.elevationGain || 0;

  const names = [];

  // Distance-based names
  if (distance < 15) names.push('Quick Ride');
  else if (distance < 30) names.push('Standard Loop');
  else if (distance < 50) names.push('Long Route');
  else names.push('Epic Adventure');

  // Elevation-based names
  if (elevation < 100) names.push('Flat Cruiser');
  else if (elevation < 300) names.push('Rolling Hills');
  else if (elevation < 600) names.push('Hill Challenge');
  else names.push('Mountain Route');

  // Variety names
  names.push('Discovery Route', 'Explorer Loop', 'Scenic Route', 'Training Loop');

  return names[index % names.length] || 'Generated Route';
}