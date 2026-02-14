/**
 * Route Preferences Utility
 * Provides client-side utilities for preference-based route scoring and selection
 */

/**
 * Score a single route based on user's road preferences
 * @param {string} polyline - Google-encoded polyline of the route
 * @param {string} authToken - User's auth token
 * @returns {Promise<RouteScore>}
 */
export async function scoreRoute(polyline, authToken) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        action: 'score_route',
        polyline
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to score route: ${response.status}`);
    }

    const data = await response.json();
    return data.score;
  } catch (error) {
    console.warn('Route scoring failed:', error);
    return null;
  }
}

/**
 * Score multiple routes and return them ranked by preference
 * @param {Array<{id: string, name: string, polyline: string}>} routes - Routes to score
 * @param {string} authToken - User's auth token
 * @returns {Promise<Array<ScoredRoute>>}
 */
export async function scoreAndRankRoutes(routes, authToken) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        action: 'score_routes',
        routes
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to score routes: ${response.status}`);
    }

    const data = await response.json();
    return data.routes || [];
  } catch (error) {
    console.warn('Route ranking failed:', error);
    return routes.map(r => ({ ...r, overallScore: 1.0, confidence: 'unknown' }));
  }
}

/**
 * Get user's segment statistics
 * @param {string} authToken - User's auth token
 * @returns {Promise<SegmentStats>}
 */
export async function getSegmentStats(authToken) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ action: 'get_stats' })
    });

    if (!response.ok) {
      throw new Error(`Failed to get stats: ${response.status}`);
    }

    const data = await response.json();
    return data.stats;
  } catch (error) {
    console.warn('Failed to get segment stats:', error);
    return null;
  }
}

/**
 * Get user's road preference settings
 * @param {string} authToken - User's auth token
 * @returns {Promise<UserPreferences>}
 */
export async function getPreferences(authToken) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ action: 'get_preferences' })
    });

    if (!response.ok) {
      throw new Error(`Failed to get preferences: ${response.status}`);
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.warn('Failed to get preferences:', error);
    return {
      familiarity_strength: 50,
      explore_mode: false,
      min_rides_for_familiar: 2,
      recency_weight: 30,
      familiarity_decay_days: 180
    };
  }
}

/**
 * Update user's road preference settings
 * @param {Object} preferences - Preference updates
 * @param {string} authToken - User's auth token
 * @returns {Promise<UserPreferences>}
 */
export async function updatePreferences(preferences, authToken) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        action: 'update_preferences',
        ...preferences
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update preferences: ${response.status}`);
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.warn('Failed to update preferences:', error);
    return null;
  }
}

/**
 * Extract segments from all unprocessed activities
 * @param {Object} options - Extraction options
 * @param {string} authToken - User's auth token
 * @returns {Promise<ExtractionResult>}
 */
export async function extractSegments(authToken, options = {}) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        action: 'extract_all',
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to extract segments: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Segment extraction failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get familiar segments in a map bounding box (for visualization)
 * @param {Object} bbox - Bounding box {minLat, maxLat, minLng, maxLng}
 * @param {string} authToken - User's auth token
 * @param {number} minRideCount - Minimum ride count to include
 * @returns {Promise<GeoJSON>}
 */
export async function getFamiliarSegmentsGeoJSON(bbox, authToken, minRideCount = 1) {
  try {
    const response = await fetch('/api/road-segments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        action: 'visualize_segments',
        ...bbox,
        minRideCount
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get segments: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Failed to get familiar segments:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Get color for route segment based on familiarity
 * @param {number} rideCount - Number of times segment was ridden
 * @returns {string} Hex color code
 */
export function getSegmentColor(rideCount) {
  if (rideCount >= 10) return '#A8BFA8'; // Sage - very familiar
  if (rideCount >= 5) return '#7BA9A0';  // Teal - familiar
  if (rideCount >= 3) return '#D4A843';  // Gold - known
  if (rideCount >= 2) return '#C4785C';  // Terracotta - somewhat known
  if (rideCount === 1) return '#6b7280'; // Gray - ridden once
  return '#94a3b8';                       // Light gray - unknown
}

/**
 * Get familiarity label based on ride count
 * @param {number} rideCount - Number of times segment was ridden
 * @returns {string} Human-readable label
 */
export function getFamiliarityLabel(rideCount) {
  if (rideCount >= 10) return 'Very Familiar';
  if (rideCount >= 5) return 'Familiar';
  if (rideCount >= 3) return 'Known';
  if (rideCount >= 2) return 'Somewhat Known';
  if (rideCount === 1) return 'Ridden Once';
  return 'New';
}

/**
 * Get confidence label from score
 * @param {string} confidence - Confidence level ('high', 'medium', 'low', 'unknown')
 * @returns {string} Human-readable description
 */
export function getConfidenceDescription(confidence) {
  switch (confidence) {
    case 'high':
      return 'Highly confident - most of this route follows roads you ride regularly';
    case 'medium':
      return 'Moderately confident - some familiar roads, some new';
    case 'low':
      return 'Low confidence - mostly new roads with some familiar sections';
    case 'unknown':
    default:
      return 'Unknown territory - this route is mostly new to you';
  }
}

/**
 * Format preference score for display
 * @param {number} score - Preference score (1.0 = neutral)
 * @returns {string} Formatted score
 */
export function formatPreferenceScore(score) {
  if (score >= 1.4) return 'Highly Preferred';
  if (score >= 1.2) return 'Preferred';
  if (score >= 1.1) return 'Somewhat Preferred';
  if (score <= 0.9) return 'Less Preferred';
  return 'Neutral';
}

/**
 * Get route recommendation based on score comparison
 * @param {Array<ScoredRoute>} scoredRoutes - Routes sorted by preference score
 * @returns {Object} Recommendation with explanation
 */
export function getRouteRecommendation(scoredRoutes) {
  if (!scoredRoutes || scoredRoutes.length === 0) {
    return {
      recommended: null,
      reason: 'No routes to compare'
    };
  }

  const best = scoredRoutes[0];

  if (scoredRoutes.length === 1) {
    return {
      recommended: best,
      reason: best.familiarRatio > 50
        ? `${best.familiarRatio}% of this route follows roads you've ridden before`
        : 'This route includes mostly new roads for you to explore'
    };
  }

  const second = scoredRoutes[1];
  const scoreDiff = best.overallScore - second.overallScore;

  if (scoreDiff > 0.2) {
    return {
      recommended: best,
      reason: `Strongly recommended - ${best.familiarRatio}% familiar roads vs ${second.familiarRatio}% for the alternative`
    };
  } else if (scoreDiff > 0.1) {
    return {
      recommended: best,
      reason: `Slightly preferred - more familiar roads than alternatives`
    };
  } else {
    return {
      recommended: best,
      reason: 'Similar familiarity to alternatives - choose based on other factors'
    };
  }
}

export default {
  scoreRoute,
  scoreAndRankRoutes,
  getSegmentStats,
  getPreferences,
  updatePreferences,
  extractSegments,
  getFamiliarSegmentsGeoJSON,
  getSegmentColor,
  getFamiliarityLabel,
  getConfidenceDescription,
  formatPreferenceScore,
  getRouteRecommendation
};
