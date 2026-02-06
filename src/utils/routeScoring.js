/**
 * Route Scoring Utilities
 *
 * Scores routes against user's riding history and provides familiar
 * waypoints for route building.
 *
 * Extracted from RouteBuilder.jsx for maintainability.
 */

/**
 * Score a route against user's road segment history
 * @param {Array<[number, number]>} coordinates - Route coordinates [[lng, lat], ...]
 * @param {string} accessToken - User's auth token
 * @returns {Promise<Object|null>} Score object or null if scoring fails
 */
export async function scoreRoutePreference(coordinates, accessToken) {
  if (!coordinates || coordinates.length < 2 || !accessToken) {
    return null;
  }

  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: 'score_route',
        coordinates
      })
    });

    if (!response.ok) {
      console.warn('Route scoring failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.score || null;
  } catch (error) {
    console.error('Route scoring error:', error);
    return null;
  }
}

/**
 * Fetch waypoints from familiar road segments to build a loop route
 * @param {number} startLat - Start latitude
 * @param {number} startLng - Start longitude
 * @param {number} targetDistanceKm - Target route distance in km
 * @param {string} accessToken - User's auth token
 * @param {boolean} exploreMode - If true, use fewer familiar waypoints
 * @returns {Promise<Object|null>} Waypoints and metadata or null if failed
 */
export async function getFamiliarLoopWaypoints(startLat, startLng, targetDistanceKm, accessToken, exploreMode = false) {
  if (!accessToken) {
    return null;
  }

  try {
    console.log(`🧠 Fetching familiar segments for ${targetDistanceKm}km loop...`);
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: 'get_loop_waypoints',
        startLat,
        startLng,
        targetDistanceKm,
        minRideCount: 2,
        exploreMode
      })
    });

    if (!response.ok) {
      console.warn('Failed to get familiar waypoints:', response.status);
      return null;
    }

    const data = await response.json();
    console.log(`🧠 Got ${data.waypoints?.length || 0} familiar waypoints from ${data.totalFamiliarSegments || 0} segments`);
    return data;
  } catch (error) {
    console.error('Error fetching familiar waypoints:', error);
    return null;
  }
}
