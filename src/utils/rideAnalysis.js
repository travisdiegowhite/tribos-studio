// Past ride analysis for intelligent route generation
import { supabase } from '../lib/supabase';
import { calculateBearing } from './routeUtils';

// Fetch user's past rides from database with track points
export async function fetchPastRides(userId, limit = 50) {
  try {
    console.log('🔍 Fetching past rides for learning from user:', userId);
    
    // Get enhanced routes metadata from new comprehensive schema
    // Note: Using created_at instead of recorded_at for compatibility with different database schemas
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select(`
        id,
        name,
        description,
        activity_type,
        strava_id,
        imported_from,
        distance_km,
        duration_seconds,
        elevation_gain_m,
        elevation_loss_m,
        average_speed,
        max_speed,
        average_pace,
        average_heartrate,
        max_heartrate,
        hr_zones,
        average_watts,
        max_watts,
        normalized_power,
        intensity_factor,
        training_stress_score,
        kilojoules,
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
        bounds_north,
        bounds_south,
        bounds_east,
        bounds_west,
        surface_type,
        route_type,
        difficulty_rating,
        training_goal,
        effort_level,
        tags,
        has_gps_data,
        has_heart_rate_data,
        has_power_data,
        track_points_count,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (routesError) {
      console.error('Error fetching routes:', routesError);
      return [];
    }

    if (!routes || routes.length === 0) {
      console.log('📊 No past rides found for learning');
      return [];
    }

    console.log(`📊 Found ${routes.length} past rides, loading track points for analysis...`);

    // For each route, fetch a sample of track points for analysis
    const ridesWithTrackPoints = await Promise.all(
      routes.map(async (route) => {
        try {
          // Get track points (sample every 10th point for performance)
          const { data: trackPoints, error: trackError } = await supabase
            .from('track_points')
            .select(`
              latitude,
              longitude,
              elevation,
              time_seconds
            `)
            .eq('route_id', route.id)
            .order('time_seconds', { ascending: true });

          if (trackError) {
            console.warn(`Failed to load track points for route ${route.id}:`, trackError);
            return {
              ...route,
              track_points: [],
              summary: {
                distance: route.distance_km,
                elevation_gain: route.elevation_gain_m,
                duration: route.duration_seconds
              }
            };
          }

          // Sample track points for performance (every 5th point)
          const sampledPoints = trackPoints ? trackPoints.filter((_, index) => index % 5 === 0) : [];

          console.log(`📍 Route ${route.name || route.id}: ${sampledPoints.length} track points loaded`);

          return {
            ...route,
            track_points: sampledPoints,
            summary: {
              distance: route.distance_km,
              elevation_gain: route.elevation_gain_m,
              duration: route.duration_seconds
            }
          };
        } catch (error) {
          console.warn(`Error loading track points for route ${route.id}:`, error);
          return {
            ...route,
            track_points: [],
            summary: {
              distance: route.distance_km,
              elevation_gain: route.elevation_gain_m,
              duration: route.duration_seconds
            }
          };
        }
      })
    );

    const ridesWithData = ridesWithTrackPoints.filter(ride => ride.track_points.length > 0);
    console.log(`✅ Successfully loaded ${ridesWithData.length} rides with track data for learning`);

    return ridesWithTrackPoints;
  } catch (error) {
    console.error('Failed to fetch past rides:', error);
    return [];
  }
}

// Analyze riding patterns from past rides with Strava data prioritization
export function analyzeRidingPatterns(pastRides) {
  if (!pastRides || pastRides.length === 0) {
    return getDefaultPatterns();
  }

  // Separate Strava and manual rides for different analysis approaches
  const stravaRides = pastRides.filter(ride => ride.imported_from === 'strava' && ride.strava_id);
  const manualRides = pastRides.filter(ride => ride.imported_from !== 'strava');
  const fileUploads = pastRides.filter(ride => ride.imported_from === 'file_upload');
  
  console.log(`📊 Analyzing ${stravaRides.length} Strava rides, ${manualRides.length} manual rides, and ${fileUploads.length} file uploads`);

  const patterns = {
    preferredDistances: [],
    preferredDirections: [],
    elevationPreference: 'moderate',
    averageSpeed: 23, // km/h
    frequentAreas: [],
    timePreferences: {},
    distanceDistribution: {},
    elevationTolerance: { min: 0, max: 1000, preferred: 300 },
    routeSegments: [], // Actual route segments from past rides
    routeTemplates: [], // Route templates based on past rides
    performanceMetrics: {}, // Enhanced performance data from Strava
    trainingGoalPreferences: {}, // Training goal distribution
    routeTypePreferences: {}, // Route type preferences (loop, out-back, etc.)
    surfacePreferences: {}, // Surface type preferences (road, gravel, etc.)
    difficultyPreferences: {}, // Difficulty rating preferences
    dataSource: stravaRides.length > 0 ? 'strava_enhanced' : 'basic',
    confidence: stravaRides.length > manualRides.length ? 0.9 : 0.6
  };

  // Analyze distance preferences (prioritize Strava data)
  const distances = pastRides
    .map(ride => ride.distance_km)
    .filter(d => d && d > 0);
  
  if (distances.length > 0) {
    patterns.preferredDistances = analyzeDistanceDistribution(distances);
    patterns.distanceDistribution = getDistanceDistribution(distances);
  }
  
  // Analyze performance metrics from Strava data
  if (stravaRides.length > 0) {
    patterns.performanceMetrics = analyzePerformanceMetrics(stravaRides);
    patterns.averageSpeed = patterns.performanceMetrics.averageSpeed || 23;
  }

  // Analyze elevation preferences (enhanced with Strava data)
  const elevationGains = pastRides
    .map(ride => ride.elevation_gain_m)
    .filter(e => e !== null && e !== undefined);
  
  if (elevationGains.length > 0) {
    patterns.elevationTolerance = analyzeElevationPreference(elevationGains);
    patterns.elevationPreference = categorizeElevationPreference(elevationGains);
  }
  
  // Enhanced elevation analysis with Strava power data
  if (stravaRides.length > 0) {
    patterns.elevationTolerance = analyzeStravaElevationPatterns(stravaRides, patterns.elevationTolerance);
  }

  // Analyze frequent areas and directions from track points
  const ridesWithTrackPoints = pastRides.filter(ride => ride.track_points && ride.track_points.length > 0);
  console.log(`🧭 Analyzing patterns from ${ridesWithTrackPoints.length} rides with track data`);
  
  if (ridesWithTrackPoints.length > 0) {
    const rideLocations = ridesWithTrackPoints
      .map(ride => extractRideLocations(ride))
      .filter(locations => locations.length > 0);
    
    if (rideLocations.length > 0) {
      patterns.frequentAreas = findFrequentAreas(rideLocations);
      patterns.preferredDirections = analyzePreferredDirections(rideLocations);
      console.log(`📍 Found ${patterns.frequentAreas.length} frequent areas and ${patterns.preferredDirections.length} preferred directions`);
    }

    // Extract route segments from rides with track points
    const allSegments = ridesWithTrackPoints
      .map(ride => extractRouteSegments(ride))
      .flat()
      .filter(segment => segment.coordinates.length > 0);
    
    patterns.routeSegments = buildSegmentDatabase(allSegments);
    console.log(`🛣️ Extracted ${patterns.routeSegments.length} route segments from past rides`);

    // Create route templates from past rides
    patterns.routeTemplates = createRouteTemplates(ridesWithTrackPoints);
    console.log(`📋 Created ${patterns.routeTemplates.length} route templates from past rides`);
  } else {
    console.log('📊 No track points available for advanced pattern analysis');
    patterns.frequentAreas = [];
    patterns.preferredDirections = [];
    patterns.routeSegments = [];
    patterns.routeTemplates = [];
  }

  // Analyze training goal preferences
  if (pastRides.some(ride => ride.training_goal)) {
    patterns.trainingGoalPreferences = analyzeTrainingGoals(pastRides);
  }
  
  // Analyze route type preferences
  if (pastRides.some(ride => ride.route_type)) {
    patterns.routeTypePreferences = analyzeRouteTypes(pastRides);
  }
  
  // Analyze surface preferences
  if (pastRides.some(ride => ride.surface_type)) {
    patterns.surfacePreferences = analyzeSurfaceTypes(pastRides);
  }
  
  // Analyze difficulty preferences
  if (pastRides.some(ride => ride.difficulty_rating)) {
    patterns.difficultyPreferences = analyzeDifficultyRatings(pastRides);
  }

  // Calculate overall data confidence based on data sources
  patterns.confidence = calculateDataConfidence(pastRides, stravaRides, manualRides, fileUploads);
  
  console.log(`✅ Pattern analysis complete:`, {
    totalRides: pastRides.length,
    stravaRides: stravaRides.length,
    dataSource: patterns.dataSource,
    confidence: patterns.confidence,
    hasPerformanceMetrics: patterns.performanceMetrics.averageSpeed ? true : false
  });

  return patterns;
}

// Extract actual route segments from a ride
function extractRouteSegments(ride) {
  if (!ride.track_points || ride.track_points.length < 10) {
    return [];
  }

  const trackPoints = ride.track_points;
  const segments = [];
  
  // Extract meaningful segments (every ~2km or significant direction changes)
  const segmentDistance = 2; // km
  let currentSegment = [trackPoints[0]];
  let segmentDistance_m = 0;
  
  for (let i = 1; i < trackPoints.length; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];
    
    // Calculate distance between points
    const distance = calculateDistance(
      [prev.longitude, prev.latitude],
      [curr.longitude, curr.latitude]
    ) * 1000; // Convert to meters
    
    segmentDistance_m += distance;
    currentSegment.push(curr);
    
    // End segment if we've traveled enough distance or reached end
    if (segmentDistance_m >= segmentDistance * 1000 || i === trackPoints.length - 1) {
      if (currentSegment.length >= 5) { // Ensure segment has enough points
        segments.push({
          coordinates: currentSegment.map(p => [p.longitude, p.latitude]),
          startPoint: [currentSegment[0].longitude, currentSegment[0].latitude],
          endPoint: [currentSegment[currentSegment.length - 1].longitude, currentSegment[currentSegment.length - 1].latitude],
          distance: segmentDistance_m / 1000, // km
          bearing: calculateBearing(
            [currentSegment[0].longitude, currentSegment[0].latitude],
            [currentSegment[currentSegment.length - 1].longitude, currentSegment[currentSegment.length - 1].latitude]
          ),
          rideId: ride.id,
          timestamp: ride.created_at
        });
      }
      
      // Start new segment
      currentSegment = [curr];
      segmentDistance_m = 0;
    }
  }
  
  return segments;
}

// Extract key locations and route patterns from a ride
function extractRideLocations(ride) {
  if (!ride.track_points || ride.track_points.length === 0) {
    return [];
  }

  const trackPoints = ride.track_points;
  const locations = [];
  
  // Extract key junction points and decision points
  const keyPoints = findKeyPoints(trackPoints);
  
  keyPoints.forEach((point, index) => {
    locations.push({
      lat: point.latitude,
      lon: point.longitude,
      type: index === 0 ? 'start' : index === keyPoints.length - 1 ? 'end' : 'junction',
      confidence: point.confidence || 1.0
    });
  });

  return locations;
}

// Find key decision points in a route (turns, junctions, etc.)
function findKeyPoints(trackPoints) {
  if (trackPoints.length < 3) return trackPoints;
  
  const keyPoints = [trackPoints[0]]; // Always include start
  
  // Look for significant bearing changes (turns)
  for (let i = 1; i < trackPoints.length - 1; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];
    const next = trackPoints[i + 1];
    
    const bearing1 = calculateBearing([prev.longitude, prev.latitude], [curr.longitude, curr.latitude]);
    const bearing2 = calculateBearing([curr.longitude, curr.latitude], [next.longitude, next.latitude]);
    
    let bearingChange = Math.abs(bearing2 - bearing1);
    if (bearingChange > 180) bearingChange = 360 - bearingChange;
    
    // If significant turn (>30 degrees), mark as key point
    if (bearingChange > 30) {
      keyPoints.push({
        ...curr,
        confidence: Math.min(bearingChange / 90, 1.0) // Higher confidence for sharper turns
      });
    }
  }
  
  keyPoints.push(trackPoints[trackPoints.length - 1]); // Always include end
  
  return keyPoints;
}

// Find areas where user frequently rides
function findFrequentAreas(rideLocations) {
  const areas = [];
  const tolerance = 0.01; // ~1km tolerance for grouping locations

  // Flatten all locations
  const allLocations = rideLocations.flat();

  // Group nearby locations
  const clusters = [];
  allLocations.forEach(location => {
    let addedToCluster = false;
    
    for (const cluster of clusters) {
      const centerLat = cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length;
      const centerLon = cluster.reduce((sum, p) => sum + p.lon, 0) / cluster.length;
      
      const distance = Math.sqrt(
        Math.pow(location.lat - centerLat, 2) + 
        Math.pow(location.lon - centerLon, 2)
      );
      
      if (distance < tolerance) {
        cluster.push(location);
        addedToCluster = true;
        break;
      }
    }
    
    if (!addedToCluster) {
      clusters.push([location]);
    }
  });

  // Convert clusters to frequent areas
  clusters
    .filter(cluster => cluster.length >= 3) // At least 3 visits
    .forEach(cluster => {
      const centerLat = cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length;
      const centerLon = cluster.reduce((sum, p) => sum + p.lon, 0) / cluster.length;
      
      areas.push({
        center: [centerLon, centerLat],
        frequency: cluster.length,
        confidence: Math.min(cluster.length / 10, 1) // Max confidence at 10+ visits
      });
    });

  return areas.sort((a, b) => b.frequency - a.frequency).slice(0, 5); // Top 5 areas
}

// Analyze preferred riding directions
function analyzePreferredDirections(rideLocations) {
  const directions = [];
  
  rideLocations.forEach(locations => {
    if (locations.length < 2) return;
    
    for (let i = 0; i < locations.length - 1; i++) {
      const start = [locations[i].lon, locations[i].lat];
      const end = [locations[i + 1].lon, locations[i + 1].lat];
      const bearing = calculateBearing(start, end);
      directions.push(bearing);
    }
  });

  if (directions.length === 0) return [];

  // Group directions into sectors (45-degree sectors)
  const sectors = Array(8).fill(0);
  directions.forEach(bearing => {
    const sector = Math.floor(((bearing + 22.5) % 360) / 45);
    sectors[sector]++;
  });

  // Find preferred directions
  const sectorNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const preferences = sectors
    .map((count, index) => ({
      direction: sectorNames[index],
      bearing: index * 45,
      frequency: count,
      preference: count / directions.length
    }))
    .filter(p => p.preference > 0.1) // At least 10% of rides
    .sort((a, b) => b.frequency - a.frequency);

  return preferences.slice(0, 3); // Top 3 preferred directions
}

// Analyze distance distribution patterns
function analyzeDistanceDistribution(distances) {
  const sorted = [...distances].sort((a, b) => a - b);
  const percentiles = {
    p25: sorted[Math.floor(sorted.length * 0.25)],
    p50: sorted[Math.floor(sorted.length * 0.5)], // median
    p75: sorted[Math.floor(sorted.length * 0.75)],
    p90: sorted[Math.floor(sorted.length * 0.9)]
  };

  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;

  return {
    mean,
    median: percentiles.p50,
    percentiles,
    range: { min: sorted[0], max: sorted[sorted.length - 1] },
    mostCommon: findMostCommonDistanceRange(distances)
  };
}

// Find the most common distance range
function findMostCommonDistanceRange(distances) {
  const ranges = [
    { min: 0, max: 15, name: 'short' },
    { min: 15, max: 35, name: 'medium' },
    { min: 35, max: 65, name: 'long' },
    { min: 65, max: 150, name: 'very_long' }
  ];

  const rangeCounts = ranges.map(range => ({
    ...range,
    count: distances.filter(d => d >= range.min && d < range.max).length
  }));

  return rangeCounts.reduce((best, current) => 
    current.count > best.count ? current : best
  );
}

// Get distance distribution by categories
function getDistanceDistribution(distances) {
  const total = distances.length;
  return {
    short: distances.filter(d => d < 20).length / total,
    medium: distances.filter(d => d >= 20 && d < 50).length / total,
    long: distances.filter(d => d >= 50 && d < 100).length / total,
    veryLong: distances.filter(d => d >= 100).length / total
  };
}

// Analyze elevation gain preferences
function analyzeElevationPreference(elevationGains) {
  const sorted = [...elevationGains].sort((a, b) => a - b);
  const mean = elevationGains.reduce((sum, e) => sum + e, 0) / elevationGains.length;
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean),
    preferred: Math.round(sorted[Math.floor(sorted.length * 0.6)]), // 60th percentile
    tolerance: Math.round(sorted[Math.floor(sorted.length * 0.8)]) // 80th percentile
  };
}

// Categorize elevation preference
function categorizeElevationPreference(elevationGains) {
  const mean = elevationGains.reduce((sum, e) => sum + e, 0) / elevationGains.length;
  
  if (mean < 200) return 'flat';
  if (mean < 500) return 'rolling';
  if (mean < 1000) return 'hilly';
  return 'mountainous';
}

// Normalize startLocation to array format [lng, lat]
function normalizeLocation(location) {
  if (!location) return null;
  if (Array.isArray(location)) return location;
  if (typeof location === 'object') {
    const lng = location.lng ?? location.longitude ?? location.lon;
    const lat = location.lat ?? location.latitude;
    if (lng !== undefined && lat !== undefined) {
      return [lng, lat];
    }
  }
  return null;
}

// Generate route suggestions based on patterns
export function generateRouteFromPatterns(patterns, params) {
  const { startLocation: rawStartLocation, targetDistance, trainingGoal } = params;

  // Normalize startLocation to array format
  const startLocation = normalizeLocation(rawStartLocation);
  if (!startLocation) {
    console.warn('Invalid startLocation in generateRouteFromPatterns:', rawStartLocation);
    return {
      adjustedDistance: targetDistance,
      preferredDirection: { bearing: 90, preference: 0.5, source: 'default' },
      nearbyFrequentAreas: [],
      elevationTarget: 300,
      confidence: 0.3,
      ridingPatterns: patterns
    };
  }

  // Find preferred areas near the start location
  const nearbyAreas = patterns.frequentAreas.filter(area => {
    const distance = calculateDistance(startLocation, area.center);
    return distance < 20; // Within 20km
  });

  // Select preferred direction
  const preferredDirection = selectPreferredDirection(patterns.preferredDirections, params);

  // Adjust target distance based on patterns
  const adjustedDistance = adjustDistanceBasedOnPatterns(targetDistance, patterns, trainingGoal);

  return {
    adjustedDistance,
    preferredDirection,
    nearbyFrequentAreas: nearbyAreas,
    elevationTarget: getElevationTarget(patterns, trainingGoal),
    confidence: calculatePatternConfidence(patterns),
    ridingPatterns: patterns // Pass the full patterns including segments and templates
  };
}

// Calculate distance between two points (simple approximation)
function calculateDistance([lon1, lat1], [lon2, lat2]) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Select preferred direction based on patterns and training goal
function selectPreferredDirection(directions, params) {
  if (!directions || directions.length === 0) {
    // Default directions based on training goal
    const defaultDirections = {
      hills: [0, 45], // North, Northeast (often hillier)
      endurance: [90, 270], // East, West (longer routes)
      intervals: [180, 0], // South, North
      recovery: [135, 225] // Southeast, Southwest (gentler)
    };
    
    const defaults = defaultDirections[params.trainingGoal] || [90, 270];
    return { bearing: defaults[0], preference: 0.5, source: 'default' };
  }

  // Use most preferred direction
  return { 
    ...directions[0], 
    source: 'historical' 
  };
}

// Adjust distance based on historical patterns
function adjustDistanceBasedOnPatterns(targetDistance, patterns, trainingGoal) {
  if (!patterns.preferredDistances.mean) return targetDistance;

  const userMean = patterns.preferredDistances.mean;
  const confidence = patterns.preferredDistances.range.max > patterns.preferredDistances.range.min ? 1 : 0.5;

  // For recovery rides, bias towards shorter distances
  if (trainingGoal === 'recovery') {
    return Math.min(targetDistance, userMean * 0.8);
  }

  // For endurance rides, can go longer
  if (trainingGoal === 'endurance') {
    return Math.max(targetDistance, userMean * 1.2);
  }

  // Otherwise, blend target with user's typical distance
  const weight = confidence * 0.3; // 30% influence maximum
  return targetDistance * (1 - weight) + userMean * weight;
}

// Get elevation target based on patterns and training goal
function getElevationTarget(patterns, trainingGoal) {
  const baseTarget = patterns.elevationTolerance.preferred || 300;
  
  const multipliers = {
    hills: 1.5,
    endurance: 1.0,
    intervals: 0.8,
    recovery: 0.5
  };
  
  return Math.round(baseTarget * (multipliers[trainingGoal] || 1.0));
}

// Calculate confidence in patterns (0-1)
function calculatePatternConfidence(patterns) {
  let score = 0;
  let factors = 0;

  // Distance pattern confidence
  if (patterns.preferredDistances.mean) {
    score += 0.3;
    factors++;
  }

  // Area familiarity confidence
  if (patterns.frequentAreas.length > 0) {
    score += 0.3 * Math.min(patterns.frequentAreas.length / 3, 1);
    factors++;
  }

  // Direction preference confidence
  if (patterns.preferredDirections.length > 0) {
    score += 0.2 * patterns.preferredDirections[0].preference;
    factors++;
  }

  // Elevation pattern confidence
  if (patterns.elevationTolerance.mean !== undefined) {
    score += 0.2;
    factors++;
  }

  return factors > 0 ? score / factors : 0;
}


// Use real route segments to build new routes
export function buildRouteFromSegments(rawStartLocation, targetDistance, trainingGoal, patterns) {
  if (!patterns.routeSegments || patterns.routeSegments.length === 0) {
    return null;
  }

  // Normalize startLocation to array format
  const startLocation = normalizeLocation(rawStartLocation);
  if (!startLocation) {
    console.warn('Invalid startLocation in buildRouteFromSegments:', rawStartLocation);
    return null;
  }

  const nearbySegments = patterns.routeSegments.filter(segment => {
    const distanceToStart = calculateDistance(startLocation, segment.startPoint);
    const distanceToEnd = calculateDistance(startLocation, segment.endPoint);
    return Math.min(distanceToStart, distanceToEnd) < 5; // Within 5km
  });

  if (nearbySegments.length === 0) {
    return null;
  }

  // Try to chain segments together to build a route
  const route = chainSegments(nearbySegments, startLocation, targetDistance);

  // Validate route quality before returning
  // Must have good coordinate data AND be at least 50% of target distance (minimum 5km)
  const minDistance = Math.max(5, targetDistance * 0.5);

  if (route && route.coordinates.length > 10 && route.distance >= minDistance) {
    return {
      name: 'Route from Your Rides',
      coordinates: route.coordinates,
      distance: route.distance,
      elevationGain: route.elevationGain || 0,
      elevationLoss: route.elevationLoss || 0,
      difficulty: calculateDifficulty(route.distance, route.elevationGain || 0),
      description: 'Built from your actual riding patterns',
      trainingGoal,
      pattern: 'historical',
      confidence: 0.95, // High confidence since it's from real rides
      source: 'segments'
    };
  }

  return null;
}

// Chain route segments together to build a complete route
function chainSegments(segments, startLocation, targetDistance) {
  // Simple implementation: find the best segment near start and use it
  // In a more advanced version, this would intelligently chain multiple segments
  
  let bestSegment = null;
  let bestDistance = Infinity;
  
  for (const segment of segments) {
    const distanceToStart = calculateDistance(startLocation, segment.startPoint);
    const distanceToEnd = calculateDistance(startLocation, segment.endPoint);
    const minDistance = Math.min(distanceToStart, distanceToEnd);
    
    if (minDistance < bestDistance && segment.distance <= targetDistance * 1.5) {
      bestDistance = minDistance;
      bestSegment = segment;
    }
  }
  
  if (bestSegment) {
    // If we're closer to the end point, reverse the segment
    const distanceToStart = calculateDistance(startLocation, bestSegment.startPoint);
    const distanceToEnd = calculateDistance(startLocation, bestSegment.endPoint);
    
    const coordinates = distanceToEnd < distanceToStart ? 
      [...bestSegment.coordinates].reverse() : 
      bestSegment.coordinates;
    
    return {
      coordinates,
      distance: bestSegment.distance,
      elevationGain: bestSegment.elevationGain || 0,
      elevationLoss: bestSegment.elevationLoss || 0
    };
  }
  
  return null;
}

// Calculate difficulty
function calculateDifficulty(distance, elevationGain) {
  const elevationRatio = elevationGain / distance; // meters per km
  
  if (elevationRatio < 10) return 'easy';
  if (elevationRatio < 25) return 'moderate';
  return 'hard';
}

// Build a database of route segments for reuse
function buildSegmentDatabase(allSegments) {
  if (!allSegments || allSegments.length === 0) {
    return [];
  }

  console.log(`🔄 Processing ${allSegments.length} route segments...`);

  // Group similar segments by proximity and bearing
  const segmentGroups = [];
  const tolerance = 0.5; // 500m tolerance for grouping segments

  allSegments.forEach(segment => {
    let addedToGroup = false;
    
    for (const group of segmentGroups) {
      const representative = group[0];
      
      // Check if segments are similar (start/end points close, similar bearing)
      const startDistance = calculateDistance(segment.startPoint, representative.startPoint);
      const endDistance = calculateDistance(segment.endPoint, representative.endPoint);
      const bearingDiff = Math.abs(segment.bearing - representative.bearing);
      const normalizedBearingDiff = bearingDiff > 180 ? 360 - bearingDiff : bearingDiff;
      
      if (startDistance < tolerance && endDistance < tolerance && normalizedBearingDiff < 30) {
        group.push(segment);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      segmentGroups.push([segment]);
    }
  });

  // Convert groups to reusable segments with frequency data
  const segments = segmentGroups
    .filter(group => group.length >= 2) // Only keep segments used multiple times
    .map(group => ({
      id: group[0].rideId + '_' + group.length,
      coordinates: group[0].coordinates, // Use the first one as template
      startPoint: group[0].startPoint,
      endPoint: group[0].endPoint,
      distance: group[0].distance,
      bearing: group[0].bearing,
      frequency: group.length,
      confidence: Math.min(group.length / 5, 1.0), // Higher confidence for frequently used segments
      lastUsed: Math.max(...group.map(s => new Date(s.timestamp).getTime())),
      rideIds: group.map(s => s.rideId)
    }))
    .sort((a, b) => b.frequency - a.frequency); // Most frequently used first

  console.log(`✅ Built segment database with ${segments.length} reusable segments`);
  return segments;
}

// Create route templates from past rides
function createRouteTemplates(pastRides) {
  if (!pastRides || pastRides.length === 0) {
    return [];
  }

  console.log(`📋 Creating route templates from ${pastRides.length} past rides...`);

  const templates = [];
  let skippedNoGPS = 0;
  let skippedTooShort = 0;

  pastRides.forEach(ride => {
    if (!ride.track_points || ride.track_points.length < 10) {
      skippedNoGPS++;
      console.log(`⏭️ Skipping "${ride.name}" - insufficient GPS data (${ride.track_points?.length || 0} points)`);
      return;
    }

    // Extract key characteristics from this ride
    const keyPoints = findKeyPoints(ride.track_points);
    if (keyPoints.length < 3) {
      skippedTooShort++;
      console.log(`⏭️ Skipping "${ride.name}" - too few key points (${keyPoints.length})`);
      return; // Need at least start, middle, and end
    }

    // Debug ride data
    const distanceKm = ride.summary?.distance || ride.distance_km || 0;
    const elevationM = ride.summary?.elevation_gain || ride.elevation_gain_m || 0;

    if (distanceKm === 0) {
      console.log(`⚠️ "${ride.name}" has 0 distance - ride data:`, {
        summary: ride.summary,
        distance_km: ride.distance_km,
        elevation_gain_m: ride.elevation_gain_m
      });
    }

    // Create template based on this ride
    const template = {
      id: ride.id,
      name: ride.name || `Route from ${new Date(ride.created_at).toLocaleDateString()}`,
      baseDistance: distanceKm * 1000, // Convert to meters
      baseElevation: elevationM,
      baseDuration: ride.summary?.duration || ride.duration_seconds || 0,
      keyPoints: keyPoints.map(p => ({
        lat: p.latitude,
        lon: p.longitude,
        type: 'waypoint'
      })),
      startArea: [keyPoints[0].longitude, keyPoints[0].latitude],
      endArea: [keyPoints[keyPoints.length - 1].longitude, keyPoints[keyPoints.length - 1].latitude],
      routeType: analyzeRouteType(keyPoints),
      difficulty: categorizeDifficulty(ride.summary.distance, ride.summary.elevation_gain),
      pattern: analyzeRoutePattern(keyPoints),
      segments: extractRouteSegments(ride),
      confidence: Math.min(keyPoints.length / 10, 1.0), // More key points = higher confidence
      timestamp: ride.created_at,
      bounds: {
        north: ride.bounds_north,
        south: ride.bounds_south,
        east: ride.bounds_east,
        west: ride.bounds_west
      }
    };

    const templateDistanceKm = template.baseDistance / 1000;
    console.log(`✅ Created template: "${template.name}" - ${templateDistanceKm.toFixed(1)}km, ${template.pattern}, confidence: ${template.confidence.toFixed(2)}`);

    templates.push(template);
  });

  console.log(`📊 Template creation summary: ${templates.length} created, ${skippedNoGPS} skipped (no GPS), ${skippedTooShort} skipped (too short)`);

  // Sort by most recent and highest confidence
  templates.sort((a, b) => {
    const aScore = a.confidence * 0.7 + (new Date(a.timestamp).getTime() / 1000000000000) * 0.3;
    const bScore = b.confidence * 0.7 + (new Date(b.timestamp).getTime() / 1000000000000) * 0.3;
    return bScore - aScore;
  });

  console.log(`✅ Final template count: ${templates.length} (keeping top 10)`);
  return templates.slice(0, 10); // Keep top 10 templates
}

// Analyze what type of route this is (loop, out-and-back, point-to-point)
function analyzeRouteType(keyPoints) {
  if (keyPoints.length < 3) return 'unknown';
  
  const start = keyPoints[0];
  const end = keyPoints[keyPoints.length - 1];
  
  // Calculate distance between start and end
  const startEndDistance = calculateDistance(
    [start.longitude, start.latitude],
    [end.longitude, end.latitude]
  );
  
  // If start and end are close, it's likely a loop
  if (startEndDistance < 0.5) { // Less than 500m
    return 'loop';
  }
  
  // If start and end are far apart, check if it's out-and-back
  const midPoint = Math.floor(keyPoints.length / 2);
  const turnDistance = calculateDistance(
    [start.longitude, start.latitude],
    [keyPoints[midPoint].longitude, keyPoints[midPoint].latitude]
  );
  
  const endDistance = calculateDistance(
    [start.longitude, start.latitude],
    [end.longitude, end.latitude]
  );
  
  // If the furthest point is much further than the end, likely out-and-back
  if (turnDistance > endDistance * 1.5) {
    return 'out_back';
  }
  
  return 'point_to_point';
}

// Categorize route difficulty
function categorizeDifficulty(distanceKm, elevationGainM) {
  const elevationRatio = elevationGainM / distanceKm; // meters per km
  
  if (distanceKm < 20 && elevationGainM < 300) return 'easy';
  if (distanceKm < 40 && elevationGainM < 600) return 'moderate';
  if (distanceKm < 60 && elevationGainM < 1000) return 'challenging';
  return 'hard';
}

// Analyze the overall pattern/shape of the route
function analyzeRoutePattern(keyPoints) {
  if (keyPoints.length < 4) return 'simple';
  
  // Calculate total bearing changes
  let totalBearingChange = 0;
  for (let i = 1; i < keyPoints.length - 1; i++) {
    const bearing1 = calculateBearing(
      [keyPoints[i-1].longitude, keyPoints[i-1].latitude],
      [keyPoints[i].longitude, keyPoints[i].latitude]
    );
    const bearing2 = calculateBearing(
      [keyPoints[i].longitude, keyPoints[i].latitude],
      [keyPoints[i+1].longitude, keyPoints[i+1].latitude]
    );
    
    let change = Math.abs(bearing2 - bearing1);
    if (change > 180) change = 360 - change;
    totalBearingChange += change;
  }
  
  const avgBearingChange = totalBearingChange / (keyPoints.length - 2);
  
  if (avgBearingChange < 20) return 'straight';
  if (avgBearingChange < 45) return 'gentle_curves';
  if (avgBearingChange < 90) return 'winding';
  return 'very_winding';
}

// Analyze performance metrics from Strava data
function analyzePerformanceMetrics(stravaRides) {
  const validRides = stravaRides.filter(ride => {
    return ride.average_speed && ride.distance_km > 5; // Valid rides with reasonable distance
  });

  if (validRides.length === 0) {
    return { confidence: 0 };
  }

  const speeds = validRides.map(r => r.average_speed).filter(s => s > 0);
  const heartRates = validRides
    .map(r => r.average_heartrate)
    .filter(hr => hr && hr > 50 && hr < 200); // Reasonable HR range
  const powerValues = validRides
    .map(r => r.average_watts)
    .filter(p => p && p > 50 && p < 500); // Reasonable power range
  const maxSpeeds = validRides.map(r => r.max_speed).filter(s => s > 0);

  const metrics = {
    confidence: validRides.length / Math.max(stravaRides.length, 1),
    sampleSize: validRides.length
  };

  if (speeds.length > 0) {
    metrics.averageSpeed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
    metrics.speedRange = {
      min: Math.min(...speeds),
      max: Math.max(...speeds),
      variance: calculateVariance(speeds)
    };
  }

  if (maxSpeeds.length > 0) {
    metrics.maxSpeed = Math.max(...maxSpeeds);
    metrics.sprintCapability = maxSpeeds.reduce((sum, s) => sum + s, 0) / maxSpeeds.length;
  }

  if (heartRates.length > 0) {
    metrics.averageHeartRate = heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length;
    metrics.heartRateZones = analyzeHeartRateZones(heartRates);
    metrics.fitnessLevel = estimateFitnessLevel(heartRates, speeds);
  }

  if (powerValues.length > 0) {
    metrics.averagePower = powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
    metrics.powerProfile = categorizePowerProfile(powerValues);
    metrics.functionalThresholdPower = estimateFTP(powerValues);
  }

  // Analyze energy expenditure if available
  const energyValues = validRides
    .map(r => r.kilojoules)
    .filter(e => e && e > 0);
  
  if (energyValues.length > 0) {
    metrics.averageEnergyExpenditure = energyValues.reduce((sum, e) => sum + e, 0) / energyValues.length;
    metrics.efficiencyRatio = metrics.averagePower && metrics.averageEnergyExpenditure ?
      metrics.averagePower / (metrics.averageEnergyExpenditure * 1000 / 3600) : null;
  }

  return metrics;
}

// Analyze Strava elevation patterns with power data
function analyzeStravaElevationPatterns(stravaRides, existingTolerance) {
  const ridesWithPower = stravaRides.filter(ride => 
    ride.average_watts && ride.elevation_gain_m !== null
  );

  if (ridesWithPower.length === 0) {
    return existingTolerance;
  }

  // Calculate power-to-weight ratios for climbs
  const climbingEfficiency = ridesWithPower.map(ride => {
    const elevationRatio = ride.elevation_gain_m / ride.distance_km; // m/km
    const powerPerKg = ride.average_watts / 70; // Assume 70kg rider (could be enhanced)
    return {
      elevationGain: ride.elevation_gain_m,
      elevationRatio,
      powerPerKg,
      efficiency: powerPerKg / Math.max(elevationRatio, 1)
    };
  });

  // Find the rider's climbing sweet spot
  const sortedByEfficiency = climbingEfficiency
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, Math.ceil(climbingEfficiency.length * 0.3)); // Top 30% most efficient

  if (sortedByEfficiency.length > 0) {
    const optimalElevation = sortedByEfficiency
      .reduce((sum, climb) => sum + climb.elevationGain, 0) / sortedByEfficiency.length;
    
    return {
      ...existingTolerance,
      optimal: Math.round(optimalElevation),
      powerBasedRecommendation: true,
      climbingEfficiency: {
        average: climbingEfficiency.reduce((sum, c) => sum + c.efficiency, 0) / climbingEfficiency.length,
        range: {
          min: Math.min(...climbingEfficiency.map(c => c.elevationGain)),
          max: Math.max(...climbingEfficiency.map(c => c.elevationGain))
        }
      }
    };
  }

  return existingTolerance;
}

// Calculate variance for performance metrics
function calculateVariance(values) {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / (values.length - 1);
}

// Analyze heart rate zones
function analyzeHeartRateZones(heartRates) {
  const maxHR = Math.max(...heartRates);
  const avgHR = heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length;
  
  // Estimate zones based on common percentages
  return {
    zone1: Math.round(maxHR * 0.5), // Active recovery
    zone2: Math.round(maxHR * 0.65), // Aerobic base
    zone3: Math.round(maxHR * 0.75), // Aerobic
    zone4: Math.round(maxHR * 0.85), // Threshold
    zone5: Math.round(maxHR * 0.95), // Neuromuscular
    averageHR: Math.round(avgHR),
    maxObserved: Math.round(maxHR)
  };
}

// Estimate fitness level based on HR and speed data
function estimateFitnessLevel(heartRates, speeds) {
  if (heartRates.length === 0 || speeds.length === 0) return 'unknown';
  
  const avgHR = heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length;
  const avgSpeed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  
  // Simple fitness estimation based on speed at given HR
  const fitnessScore = avgSpeed / (avgHR / 100); // Speed per HR percentage
  
  if (fitnessScore > 25) return 'excellent';
  if (fitnessScore > 22) return 'good';
  if (fitnessScore > 18) return 'moderate';
  return 'developing';
}

// Categorize power profile
function categorizePowerProfile(powerValues) {
  const avgPower = powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
  const maxPower = Math.max(...powerValues);
  
  // Rough categorization (would be more accurate with body weight)
  if (avgPower > 250) return 'strong';
  if (avgPower > 200) return 'moderate';
  if (avgPower > 150) return 'developing';
  return 'beginner';
}

// Estimate Functional Threshold Power
function estimateFTP(powerValues) {
  // Very rough estimation - would need structured test for accuracy
  const avgPower = powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
  return Math.round(avgPower * 1.15); // Rough multiplier for FTP estimation
}

// Calculate confidence in data based on sources
function calculateDataConfidence(allRides, stravaRides, manualRides, fileUploads = []) {
  let confidence = 0.3; // Base confidence
  
  // Boost confidence based on data quality
  if (stravaRides.length > 0) {
    confidence += 0.4 * Math.min(stravaRides.length / 10, 1); // Up to 40% boost for Strava data
  }
  
  if (manualRides.length > 0) {
    confidence += 0.15 * Math.min(manualRides.length / 20, 1); // Up to 15% boost for manual data
  }
  
  if (fileUploads.length > 0) {
    confidence += 0.25 * Math.min(fileUploads.length / 10, 1); // Up to 25% boost for file uploads
  }
  
  // Boost for having track points (using new schema field)
  const ridesWithTrackPoints = allRides.filter(ride => 
    (ride.track_points && ride.track_points.length > 10) || 
    (ride.track_points_count && ride.track_points_count > 10)
  ).length;
  
  if (ridesWithTrackPoints > 0) {
    confidence += 0.1 * Math.min(ridesWithTrackPoints / 5, 1);
  }
  
  // Boost for enhanced data (training goals, route types, etc.)
  const enhancedDataRides = allRides.filter(ride => 
    ride.training_goal || ride.route_type || ride.surface_type || 
    ride.difficulty_rating || (ride.tags && ride.tags.length > 0)
  ).length;
  
  if (enhancedDataRides > 0) {
    confidence += 0.1 * Math.min(enhancedDataRides / 10, 1);
  }
  
  return Math.min(confidence, 1.0);
}

// Analyze training goal preferences
function analyzeTrainingGoals(pastRides) {
  const goals = {};
  let total = 0;
  
  pastRides.forEach(ride => {
    if (ride.training_goal) {
      goals[ride.training_goal] = (goals[ride.training_goal] || 0) + 1;
      total++;
    }
  });
  
  // Convert to percentages
  const preferences = {};
  Object.keys(goals).forEach(goal => {
    preferences[goal] = {
      count: goals[goal],
      percentage: (goals[goal] / total) * 100,
      preference: goals[goal] / total
    };
  });
  
  return {
    distribution: preferences,
    mostCommon: Object.keys(goals).reduce((a, b) => goals[a] > goals[b] ? a : b, 'endurance'),
    diversity: Object.keys(goals).length,
    confidence: total > 5 ? 0.8 : total > 2 ? 0.6 : 0.4
  };
}

// Analyze route type preferences
function analyzeRouteTypes(pastRides) {
  const types = {};
  let total = 0;
  
  pastRides.forEach(ride => {
    if (ride.route_type) {
      types[ride.route_type] = (types[ride.route_type] || 0) + 1;
      total++;
    }
  });
  
  const preferences = {};
  Object.keys(types).forEach(type => {
    preferences[type] = {
      count: types[type],
      percentage: (types[type] / total) * 100,
      preference: types[type] / total
    };
  });
  
  return {
    distribution: preferences,
    mostCommon: Object.keys(types).reduce((a, b) => types[a] > types[b] ? a : b, 'unknown'),
    diversity: Object.keys(types).length
  };
}

// Analyze surface type preferences
function analyzeSurfaceTypes(pastRides) {
  const surfaces = {};
  let total = 0;
  
  pastRides.forEach(ride => {
    if (ride.surface_type) {
      surfaces[ride.surface_type] = (surfaces[ride.surface_type] || 0) + 1;
      total++;
    }
  });
  
  const preferences = {};
  Object.keys(surfaces).forEach(surface => {
    preferences[surface] = {
      count: surfaces[surface],
      percentage: (surfaces[surface] / total) * 100,
      preference: surfaces[surface] / total
    };
  });
  
  return {
    distribution: preferences,
    mostCommon: Object.keys(surfaces).reduce((a, b) => surfaces[a] > surfaces[b] ? a : b, 'road'),
    diversity: Object.keys(surfaces).length
  };
}

// Analyze difficulty rating preferences
function analyzeDifficultyRatings(pastRides) {
  const ratings = {};
  const efforts = pastRides.filter(ride => ride.difficulty_rating).map(ride => ride.difficulty_rating);
  
  if (efforts.length === 0) return { averageRating: 3, preferredRange: [2, 4] };
  
  efforts.forEach(rating => {
    ratings[rating] = (ratings[rating] || 0) + 1;
  });
  
  const average = efforts.reduce((sum, rating) => sum + rating, 0) / efforts.length;
  const sorted = efforts.sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  
  return {
    averageRating: Math.round(average * 10) / 10,
    preferredRange: [p25, p75],
    distribution: ratings,
    mostCommon: Object.keys(ratings).reduce((a, b) => ratings[a] > ratings[b] ? a : b, '3')
  };
}

// Default patterns for new users
function getDefaultPatterns() {
  return {
    preferredDistances: {
      mean: 25,
      median: 20,
      percentiles: { p25: 15, p50: 20, p75: 30, p90: 40 },
      range: { min: 10, max: 50 },
      mostCommon: { min: 15, max: 35, name: 'medium', count: 1 }
    },
    preferredDirections: [],
    elevationPreference: 'moderate',
    averageSpeed: 23,
    frequentAreas: [],
    timePreferences: {},
    distanceDistribution: {
      short: 0.3,
      medium: 0.5,
      long: 0.2,
      veryLong: 0.0
    },
    elevationTolerance: { min: 0, max: 1000, preferred: 300, mean: 300 },
    routeSegments: [],
    routeTemplates: [],
    performanceMetrics: { confidence: 0 },
    dataSource: 'default',
    confidence: 0.3
  };
}