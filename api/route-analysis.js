// Vercel API Route: Activity Route Analysis
// Analyzes imported activities for training suitability and workout matching

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase (server-side with service key for full access)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Extract and validate user from Authorization header
 */
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }

  return user;
}

/**
 * Decode Google-encoded polyline to coordinates
 */
function decodePolyline(encoded) {
  if (!encoded) return [];

  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push({ lng: lng / 1e5, lat: lat / 1e5 });
  }

  return coords;
}

/**
 * Haversine distance formula (returns km)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Add cumulative distances to coordinates
 */
function addCumulativeDistances(coords) {
  if (coords.length === 0) return coords;

  let cumulative = 0;
  coords[0].distance = 0;

  for (let i = 1; i < coords.length; i++) {
    const dist = haversineDistance(
      coords[i - 1].lat, coords[i - 1].lng,
      coords[i].lat, coords[i].lng
    );
    cumulative += dist;
    coords[i].distance = cumulative;
  }

  return coords;
}

/**
 * Identify segments in the route
 */
function identifySegments(coords, totalElevationGain, totalDistance) {
  const flat = [];
  const climb = [];
  const descent = [];
  const rolling = [];

  if (coords.length < 10) {
    return { flat, climb, descent, rolling };
  }

  const avgElevPerKm = totalDistance > 0 ? (totalElevationGain / totalDistance) : 0;
  const isGenerallyFlat = avgElevPerKm < 15;
  const isGenerallyRolling = avgElevPerKm >= 15 && avgElevPerKm < 25;

  const segmentLength = Math.max(1, totalDistance / 10);
  let segmentStart = 0;

  for (let i = 1; i < coords.length; i++) {
    const currentDistance = coords[i].distance || 0;
    const segmentDistance = currentDistance - (coords[segmentStart].distance || 0);

    if (segmentDistance >= segmentLength || i === coords.length - 1) {
      const segment = {
        startIdx: segmentStart,
        endIdx: i,
        startDistance: coords[segmentStart].distance || 0,
        endDistance: currentDistance,
        length: segmentDistance,
        avgGrade: isGenerallyFlat ? 0 : (isGenerallyRolling ? 3 : 6),
        maxGrade: isGenerallyFlat ? 2 : (isGenerallyRolling ? 5 : 10),
        minGrade: 0,
        elevationGain: segmentDistance * avgElevPerKm,
        elevationLoss: 0,
        coordinates: coords.slice(segmentStart, i + 1).map(c => [c.lng, c.lat]),
        quality: 80,
        type: isGenerallyFlat ? 'flat' : (isGenerallyRolling ? 'rolling' : 'climb')
      };

      if (isGenerallyFlat) {
        flat.push(segment);
      } else if (isGenerallyRolling) {
        rolling.push(segment);
      } else {
        climb.push(segment);
      }

      segmentStart = i;
    }
  }

  return { flat, climb, descent, rolling };
}

/**
 * Identify interval-suitable segments
 */
function identifyIntervalSegments(flatSegments, rollingSegments) {
  const intervalSegments = [];
  const MIN_INTERVAL_LENGTH = 1.0;
  const candidates = [...flatSegments, ...rollingSegments.filter(s => s.avgGrade < 3)];

  for (const segment of candidates) {
    if (segment.length < MIN_INTERVAL_LENGTH) continue;

    const consistencyScore = segment.type === 'flat' ? 95 : 75;
    const suitableFor = [];

    if (segment.length >= 1) suitableFor.push('vo2max');
    if (segment.length >= 2) {
      suitableFor.push('threshold');
      suitableFor.push('sweet_spot');
    }
    if (segment.length >= 3) suitableFor.push('tempo');
    if (segment.type === 'flat') {
      suitableFor.push('recovery');
      suitableFor.push('endurance');
    }

    intervalSegments.push({
      ...segment,
      suitableFor,
      uninterruptedLength: segment.length,
      consistencyScore
    });
  }

  intervalSegments.sort((a, b) => b.length - a.length);
  return intervalSegments;
}

/**
 * Calculate training suitability scores
 */
function calculateSuitabilityScores(totalDistance, totalElevationGain, flatSegments, climbSegments, rollingSegments, intervalSegments) {
  const elevPerKm = totalDistance > 0 ? (totalElevationGain / totalDistance) : 0;
  const totalFlatKm = flatSegments.reduce((sum, s) => sum + s.length, 0);
  const totalClimbingKm = climbSegments.reduce((sum, s) => sum + s.length, 0);
  const flatRatio = totalDistance > 0 ? totalFlatKm / totalDistance : 0;
  const longestFlatSegment = flatSegments.length > 0 ? Math.max(...flatSegments.map(s => s.length)) : 0;
  const goodIntervalSegments = intervalSegments.filter(s => s.length >= 2).length;

  return {
    recovery: Math.min(100, Math.round((flatRatio * 50) + (totalDistance < 20 ? 30 : 10) + (elevPerKm < 10 ? 20 : 0))),
    endurance: Math.min(100, Math.round((totalDistance >= 30 ? 40 : totalDistance * 1.3) + (flatRatio * 30) + 30)),
    tempo: Math.min(100, Math.round(((flatRatio + (rollingSegments.length > 0 ? 0.3 : 0)) * 40) + (longestFlatSegment >= 5 ? 30 : longestFlatSegment * 6) + (goodIntervalSegments >= 2 ? 30 : goodIntervalSegments * 15))),
    sweet_spot: Math.min(100, Math.round(((flatRatio * 0.7 + 0.3) * 40) + (longestFlatSegment >= 3 ? 30 : longestFlatSegment * 10) + (goodIntervalSegments >= 2 ? 30 : goodIntervalSegments * 15))),
    threshold: Math.min(100, Math.round((flatRatio * 50) + (longestFlatSegment >= 4 ? 30 : longestFlatSegment * 7.5) + (goodIntervalSegments >= 3 ? 20 : goodIntervalSegments * 7))),
    vo2max: Math.min(100, Math.round((flatRatio * 40) + (longestFlatSegment >= 2 ? 30 : longestFlatSegment * 15) + (intervalSegments.length >= 4 ? 30 : intervalSegments.length * 7.5))),
    climbing: Math.min(100, Math.round((elevPerKm >= 25 ? 50 : elevPerKm * 2) + (totalClimbingKm >= 5 ? 30 : totalClimbingKm * 6) + (climbSegments.length >= 3 ? 20 : climbSegments.length * 7))),
    intervals: Math.min(100, Math.round((goodIntervalSegments >= 4 ? 40 : goodIntervalSegments * 10) + (longestFlatSegment >= 3 ? 30 : longestFlatSegment * 10) + (flatRatio * 30)))
  };
}

/**
 * Determine terrain type
 */
function determineTerrainType(totalDistance, totalElevationGain) {
  if (totalDistance <= 0) return 'flat';
  const elevPerKm = totalElevationGain / totalDistance;
  if (elevPerKm < 10) return 'flat';
  if (elevPerKm < 20) return 'rolling';
  if (elevPerKm < 40) return 'hilly';
  return 'mountainous';
}

/**
 * Determine best workout categories
 */
function determineBestFor(suitability) {
  const scores = Object.entries(suitability);
  const best = scores
    .filter(([_, score]) => score >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  if (best.length === 0) {
    const highest = scores.sort((a, b) => b[1] - a[1])[0];
    return [highest[0]];
  }
  return best;
}

/**
 * Analyze a single activity
 */
function analyzeActivity(activity) {
  const polyline = activity.map_summary_polyline || activity.summary_polyline;
  if (!polyline) {
    return null;
  }

  const totalDistance = (activity.distance || 0) / 1000; // Convert meters to km
  const totalElevationGain = activity.total_elevation_gain || 0;

  let coords = decodePolyline(polyline);
  coords = addCumulativeDistances(coords);

  const { flat, climb, descent, rolling } = identifySegments(coords, totalElevationGain, totalDistance);
  const intervalSegments = identifyIntervalSegments(flat, rolling);

  const totalFlatKm = flat.reduce((sum, s) => sum + s.length, 0);
  const totalClimbingKm = climb.reduce((sum, s) => sum + s.length, 0);
  const longestUninterruptedKm = intervalSegments.length > 0
    ? Math.max(...intervalSegments.map(s => s.uninterruptedLength))
    : totalFlatKm;
  const segmentConsistency = flat.length > 0
    ? flat.reduce((sum, s) => sum + s.quality, 0) / flat.length / 100
    : 0.5;

  const suitability = calculateSuitabilityScores(
    totalDistance, totalElevationGain, flat, climb, rolling, intervalSegments
  );
  const bestFor = determineBestFor(suitability);
  const terrainType = determineTerrainType(totalDistance, totalElevationGain);

  const avgSpeed = 25;
  const idealDurationMin = Math.round((totalDistance / avgSpeed) * 60 * 0.8);
  const idealDurationMax = Math.round((totalDistance / avgSpeed) * 60 * 1.5);

  return {
    activity_id: activity.id,
    user_id: activity.user_id,
    flat_segments: flat,
    climb_segments: climb,
    descent_segments: descent,
    rolling_segments: rolling,
    interval_segments: intervalSegments,
    stop_frequency: 0,
    segment_consistency: segmentConsistency,
    longest_uninterrupted_km: longestUninterruptedKm,
    total_flat_km: totalFlatKm,
    total_climbing_km: totalClimbingKm,
    recovery_score: suitability.recovery,
    endurance_score: suitability.endurance,
    tempo_score: suitability.tempo,
    sweet_spot_score: suitability.sweet_spot,
    threshold_score: suitability.threshold,
    vo2max_score: suitability.vo2max,
    climbing_score: suitability.climbing,
    intervals_score: suitability.intervals,
    best_for: bestFor,
    terrain_type: terrainType,
    ideal_duration_min: idealDurationMin,
    ideal_duration_max: idealDurationMax
  };
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return;
  }

  // Validate authentication
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { action } = req.method === 'GET' ? req.query : req.body;

    switch (action) {
      case 'analyze_all':
        return await analyzeAllActivities(req, res, authUser);

      case 'analyze_one':
        return await analyzeOneActivity(req, res, authUser);

      case 'get_analysis':
        return await getAnalysis(req, res, authUser);

      case 'get_matches':
        return await getWorkoutMatches(req, res, authUser);

      default:
        return res.status(400).json({ error: 'Invalid action. Use: analyze_all, analyze_one, get_analysis, get_matches' });
    }

  } catch (error) {
    console.error('Route Analysis API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * Analyze all unanalyzed activities for a user
 * Supports date filtering and batch limits to avoid timeouts
 */
async function analyzeAllActivities(req, res, authUser) {
  const { months = 3, limit = 50 } = req.body || {};
  const batchLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 per batch

  console.log(`📊 Analyzing activities for user ${authUser.id} (last ${months} months, limit ${batchLimit})`);

  // Calculate date filter
  let dateFilter = null;
  if (months !== 'all' && months > 0) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));
    dateFilter = cutoffDate.toISOString();
  }

  // Build query for activities with polylines
  let query = supabase
    .from('activities')
    .select('id, user_id, name, distance, total_elevation_gain, map_summary_polyline, start_date')
    .eq('user_id', authUser.id)
    .not('map_summary_polyline', 'is', null)
    .order('start_date', { ascending: false });

  // Apply date filter if set
  if (dateFilter) {
    query = query.gte('start_date', dateFilter);
  }

  const { data: activities, error: fetchError } = await query;

  if (fetchError) {
    console.error('Error fetching activities:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }

  if (!activities || activities.length === 0) {
    return res.json({
      analyzed: 0,
      remaining: 0,
      total: 0,
      message: 'No activities with GPS data found in the selected time range'
    });
  }

  // Get existing analyses
  const { data: existing } = await supabase
    .from('activity_route_analysis')
    .select('activity_id')
    .eq('user_id', authUser.id);

  const existingIds = new Set((existing || []).map(e => e.activity_id));
  const toAnalyze = activities.filter(a => !existingIds.has(a.id));

  // Limit the batch size
  const batch = toAnalyze.slice(0, batchLimit);
  const remaining = toAnalyze.length - batch.length;

  console.log(`Found ${activities.length} activities in range, ${toAnalyze.length} need analysis, processing ${batch.length}`);

  // Analyze the batch
  const results = [];
  const errors = [];

  for (const activity of batch) {
    try {
      const analysis = analyzeActivity(activity);
      if (analysis) {
        results.push(analysis);
      }
    } catch (err) {
      console.error(`Error analyzing activity ${activity.id}:`, err);
      errors.push({ activityId: activity.id, error: err.message });
    }
  }

  // Batch insert analyses
  if (results.length > 0) {
    const { error: insertError } = await supabase
      .from('activity_route_analysis')
      .upsert(results, { onConflict: 'activity_id' });

    if (insertError) {
      console.error('Error inserting analyses:', insertError);
      return res.status(500).json({ error: 'Failed to save analyses' });
    }
  }

  return res.json({
    analyzed: results.length,
    remaining: remaining,
    alreadyAnalyzed: existingIds.size,
    total: activities.length,
    errors: errors.length,
    message: remaining > 0
      ? `Analyzed ${results.length} activities. ${remaining} more remaining - click again to continue.`
      : `Analyzed ${results.length} activities. All done!`
  });
}

/**
 * Analyze a single activity
 */
async function analyzeOneActivity(req, res, authUser) {
  const { activityId } = req.body;

  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  // Fetch the activity
  const { data: activity, error: fetchError } = await supabase
    .from('activities')
    .select('id, user_id, name, distance, total_elevation_gain, map_summary_polyline, start_date')
    .eq('id', activityId)
    .eq('user_id', authUser.id)
    .single();

  if (fetchError || !activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  if (!activity.map_summary_polyline) {
    return res.status(400).json({ error: 'Activity has no GPS data' });
  }

  // Analyze
  const analysis = analyzeActivity(activity);
  if (!analysis) {
    return res.status(500).json({ error: 'Analysis failed' });
  }

  // Save
  const { error: insertError } = await supabase
    .from('activity_route_analysis')
    .upsert(analysis, { onConflict: 'activity_id' });

  if (insertError) {
    console.error('Error saving analysis:', insertError);
    return res.status(500).json({ error: 'Failed to save analysis' });
  }

  return res.json({ success: true, analysis });
}

/**
 * Get analysis data for user's activities
 */
async function getAnalysis(req, res, authUser) {
  const { limit = 50, workoutType } = req.method === 'GET' ? req.query : req.body;

  let query = supabase
    .from('activity_route_analysis')
    .select(`
      *,
      activities (
        id,
        name,
        start_date,
        distance,
        total_elevation_gain,
        moving_time,
        map_summary_polyline,
        provider,
        provider_activity_id
      )
    `)
    .eq('user_id', authUser.id)
    .order('analyzed_at', { ascending: false })
    .limit(parseInt(limit));

  // If filtering by workout type, filter by best_for or high score
  if (workoutType) {
    query = query.or(`best_for.cs.{${workoutType}},${workoutType}_score.gte.60`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching analysis:', error);
    return res.status(500).json({ error: 'Failed to fetch analysis' });
  }

  return res.json({ analyses: data || [] });
}

/**
 * Get route matches for upcoming workouts
 */
async function getWorkoutMatches(req, res, authUser) {
  const { workouts } = req.body;

  if (!workouts || !Array.isArray(workouts) || workouts.length === 0) {
    return res.status(400).json({ error: 'workouts array required' });
  }

  // Get all analyzed activities
  const { data: analyses, error: fetchError } = await supabase
    .from('activity_route_analysis')
    .select(`
      *,
      activities (
        id,
        name,
        start_date,
        distance,
        total_elevation_gain,
        moving_time,
        map_summary_polyline,
        provider,
        provider_activity_id
      )
    `)
    .eq('user_id', authUser.id);

  if (fetchError) {
    console.error('Error fetching analyses:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch analyses' });
  }

  if (!analyses || analyses.length === 0) {
    return res.json({
      matches: {},
      message: 'No analyzed activities found. Run analyze_all first.'
    });
  }

  // Category requirements for scoring
  const categoryScoreKey = {
    recovery: 'recovery_score',
    endurance: 'endurance_score',
    tempo: 'tempo_score',
    sweet_spot: 'sweet_spot_score',
    threshold: 'threshold_score',
    vo2max: 'vo2max_score',
    climbing: 'climbing_score',
    intervals: 'intervals_score'
  };

  // Find matches for each workout
  const matches = {};

  for (const workout of workouts) {
    const scoreKey = categoryScoreKey[workout.category];
    if (!scoreKey) continue;

    // Score and rank activities for this workout
    const scored = analyses
      .filter(a => a.activities) // Has activity data
      .map(analysis => {
        const score = analysis[scoreKey] || 0;
        const reasons = [];
        const warnings = [];

        if (analysis.best_for?.includes(workout.category)) {
          reasons.push(`Optimal for ${workout.category} workouts`);
        }
        if (score >= 80) {
          reasons.push(`Excellent ${workout.category} terrain (${score}%)`);
        } else if (score >= 60) {
          reasons.push(`Good ${workout.category} terrain (${score}%)`);
        }
        if (analysis.longest_uninterrupted_km >= 3) {
          reasons.push(`${analysis.longest_uninterrupted_km.toFixed(1)}km uninterrupted segment`);
        }

        return {
          activity: analysis.activities,
          analysis: {
            ...analysis,
            activities: undefined // Remove nested to avoid duplication
          },
          matchScore: score,
          matchReasons: reasons,
          warnings: warnings.length > 0 ? warnings : undefined,
          intervalSegments: analysis.interval_segments || []
        };
      })
      .filter(m => m.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    matches[workout.id] = scored;
  }

  return res.json({ matches });
}
