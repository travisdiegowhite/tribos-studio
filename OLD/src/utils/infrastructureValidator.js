// Infrastructure Validator
// Validates and scores routes based on bike infrastructure requirements

/**
 * Score a route based on infrastructure preferences
 * @param {Object} route - The route to score
 * @param {Object} preferences - User preferences
 * @returns {Object} Score and validation details
 */
export function scoreRouteInfrastructure(route, preferences) {
  if (!preferences?.safetyPreferences) {
    return {
      score: 1.0,
      valid: true,
      details: 'No infrastructure preferences set'
    };
  }
  
  const { bikeInfrastructure } = preferences.safetyPreferences;
  
  // If no infrastructure requirement, always valid
  if (!bikeInfrastructure || bikeInfrastructure === 'flexible') {
    return {
      score: 1.0,
      valid: true,
      details: 'Flexible infrastructure preferences'
    };
  }
  
  // Analyze route infrastructure (this is a simplified version)
  // In production, would check against OSM data or Mapbox metadata
  const infrastructureScore = estimateInfrastructureScore(route);
  
  // Validation based on requirements
  let valid = true;
  let details = '';
  
  if (bikeInfrastructure === 'required') {
    // Strict requirement: must have high infrastructure score
    valid = infrastructureScore >= 0.8;
    details = infrastructureScore >= 0.8 
      ? 'Route uses primarily bike infrastructure' 
      : `WARNING: Route has insufficient bike infrastructure (${(infrastructureScore * 100).toFixed(0)}% coverage)`;
  } else if (bikeInfrastructure === 'strongly_preferred') {
    // Strong preference: should have good infrastructure
    valid = infrastructureScore >= 0.5;
    details = infrastructureScore >= 0.5
      ? `Good bike infrastructure coverage (${(infrastructureScore * 100).toFixed(0)}%)`
      : `Limited bike infrastructure (${(infrastructureScore * 100).toFixed(0)}%)`;
  } else if (bikeInfrastructure === 'preferred') {
    // Preference: nice to have infrastructure
    valid = true;
    details = `${(infrastructureScore * 100).toFixed(0)}% bike infrastructure coverage`;
  }
  
  return {
    score: infrastructureScore,
    valid,
    details,
    coverage: `${(infrastructureScore * 100).toFixed(0)}%`
  };
}

/**
 * Estimate infrastructure score based on route characteristics
 * @param {Object} route - The route to analyze
 * @returns {number} Score between 0 and 1
 */
function estimateInfrastructureScore(route) {
  // This is a heuristic based on route characteristics
  // In production, would query actual infrastructure data
  
  let score = 0.5; // Base score
  
  // Check route name/description for infrastructure hints
  const description = (route.description || '').toLowerCase();
  const name = (route.name || '').toLowerCase();
  const combined = `${name} ${description}`;
  
  // Positive indicators
  if (combined.includes('bike path') || combined.includes('bike lane')) score += 0.3;
  if (combined.includes('greenway') || combined.includes('trail')) score += 0.3;
  if (combined.includes('protected') || combined.includes('separated')) score += 0.2;
  if (combined.includes('park') || combined.includes('riverside')) score += 0.1;
  
  // Negative indicators
  if (combined.includes('highway') || combined.includes('motorway')) score -= 0.4;
  if (combined.includes('busy') || combined.includes('traffic')) score -= 0.3;
  if (combined.includes('no shoulder') || combined.includes('narrow')) score -= 0.2;
  
  // Check difficulty (easier routes often have better infrastructure)
  if (route.difficulty === 'easy') score += 0.1;
  if (route.difficulty === 'hard') score -= 0.1;
  
  // Check if route was generated with walking profile (indicates bike paths)
  if (route.profile === 'walking') score += 0.2;
  
  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score));
}

/**
 * Filter routes based on infrastructure requirements
 * @param {Array} routes - Array of routes to filter
 * @param {Object} preferences - User preferences
 * @returns {Array} Filtered and sorted routes
 */
export function filterRoutesByInfrastructure(routes, preferences) {
  if (!routes || routes.length === 0) return routes;
  
  // Score all routes
  const scoredRoutes = routes.map(route => {
    const infrastructureValidation = scoreRouteInfrastructure(route, preferences);
    return {
      ...route,
      infrastructureScore: infrastructureValidation.score,
      infrastructureValid: infrastructureValidation.valid,
      infrastructureDetails: infrastructureValidation.details,
      infrastructureCoverage: infrastructureValidation.coverage
    };
  });
  
  // Filter based on requirements
  let filteredRoutes = scoredRoutes;
  
  if (preferences?.safetyPreferences?.bikeInfrastructure === 'required') {
    // Strict filtering for required infrastructure
    filteredRoutes = scoredRoutes.filter(r => r.infrastructureValid);
    
    // If no routes meet strict requirements, include top 2 with warnings
    if (filteredRoutes.length === 0) {
      console.warn('No routes meet strict infrastructure requirements, showing best available');
      filteredRoutes = scoredRoutes
        .sort((a, b) => b.infrastructureScore - a.infrastructureScore)
        .slice(0, 2)
        .map(r => ({
          ...r,
          warning: 'Does not meet infrastructure requirements',
          name: `⚠️ ${r.name}`
        }));
    }
  } else if (preferences?.safetyPreferences?.bikeInfrastructure === 'strongly_preferred') {
    // Sort by infrastructure score for strong preference
    filteredRoutes = scoredRoutes.sort((a, b) => b.infrastructureScore - a.infrastructureScore);
  }
  
  return filteredRoutes;
}

/**
 * Add infrastructure metadata to route
 * @param {Object} route - The route to enhance
 * @param {Object} preferences - User preferences
 * @returns {Object} Enhanced route with infrastructure data
 */
export function enhanceRouteWithInfrastructure(route, preferences) {
  const validation = scoreRouteInfrastructure(route, preferences);
  
  return {
    ...route,
    infrastructure: {
      score: validation.score,
      valid: validation.valid,
      coverage: validation.coverage,
      details: validation.details,
      requirement: preferences?.safetyPreferences?.bikeInfrastructure || 'flexible'
    }
  };
}

/**
 * Generate infrastructure report for routes
 * @param {Array} routes - Array of routes
 * @param {Object} preferences - User preferences
 * @returns {Object} Infrastructure report
 */
export function generateInfrastructureReport(routes, preferences) {
  if (!routes || routes.length === 0) {
    return {
      summary: 'No routes to analyze',
      recommendation: null
    };
  }
  
  const scoredRoutes = routes.map(r => scoreRouteInfrastructure(r, preferences));
  const avgScore = scoredRoutes.reduce((sum, r) => sum + r.score, 0) / scoredRoutes.length;
  const validCount = scoredRoutes.filter(r => r.valid).length;
  
  const requirement = preferences?.safetyPreferences?.bikeInfrastructure || 'flexible';
  
  let summary = '';
  let recommendation = '';
  
  if (requirement === 'required') {
    if (validCount === 0) {
      summary = 'No routes meet the required bike infrastructure criteria';
      recommendation = 'Consider relaxing infrastructure requirements or choosing a different area with better bike infrastructure';
    } else if (validCount < routes.length) {
      summary = `Only ${validCount} of ${routes.length} routes meet infrastructure requirements`;
      recommendation = 'Some routes have been filtered out due to lack of bike infrastructure';
    } else {
      summary = 'All routes meet infrastructure requirements';
      recommendation = 'Routes have been optimized for bike infrastructure';
    }
  } else if (requirement === 'strongly_preferred') {
    summary = `Average infrastructure coverage: ${(avgScore * 100).toFixed(0)}%`;
    recommendation = avgScore > 0.7 
      ? 'Good bike infrastructure available in this area'
      : 'Limited bike infrastructure in this area - ride with caution';
  } else {
    summary = `Infrastructure coverage varies (${(avgScore * 100).toFixed(0)}% average)`;
    recommendation = 'Routes include mixed infrastructure';
  }
  
  return {
    summary,
    recommendation,
    averageScore: avgScore,
    validRoutes: validCount,
    totalRoutes: routes.length,
    requirement
  };
}

export default {
  scoreRouteInfrastructure,
  filterRoutesByInfrastructure,
  enhanceRouteWithInfrastructure,
  generateInfrastructureReport
};