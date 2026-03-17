/**
 * Workout-Segment Matching Engine
 *
 * Scores how well each training segment fits a given workout type.
 * Uses a 0-100 composite score across 5 weighted factors:
 *   - Power match (30%): target zone vs segment's typical zone
 *   - Duration match (25%): longest interval vs max uninterrupted time
 *   - Obstruction match (20%): road quality needs by workout type
 *   - Repeatability match (10%): topology suitability for intervals
 *   - Relevance match (15%): frequency/recency from profile
 *
 * Stores results in workout_segment_matches with 7-day expiry.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Power zone boundaries (% of FTP) — same as segmentAnalysisPipeline.js CONFIG
const POWER_ZONES = {
  recovery: [0, 0.55],
  endurance: [0.55, 0.75],
  tempo: [0.75, 0.87],
  sweet_spot: [0.87, 0.95],
  threshold: [0.95, 1.05],
  vo2max: [1.05, 1.20],
  anaerobic: [1.20, Infinity],
};

// Ordered zone list for adjacency scoring
const ZONE_ORDER = ['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'];

// Score weights
const WEIGHTS = {
  power: 0.30,
  duration: 0.25,
  obstruction: 0.20,
  repeatability: 0.10,
  relevance: 0.15,
};

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// ============================================================================
// WORKOUT REQUIREMENTS EXTRACTION
// ============================================================================

/**
 * Map a powerPctFTP value (e.g. 90 meaning 90% of FTP) to a zone name.
 */
export function mapPowerPctToZone(pctFTP) {
  if (!pctFTP || pctFTP <= 0) return 'recovery';
  const ratio = pctFTP / 100;
  for (const [zone, [low, high]] of Object.entries(POWER_ZONES)) {
    if (ratio >= low && ratio < high) return zone;
  }
  return 'anaerobic';
}

/**
 * Recursively flatten workout structure into leaf-level work intervals.
 * Each entry has { durationMin, powerPctFTP, zone, totalReps }.
 */
function flattenWorkIntervals(main) {
  const intervals = [];

  function walk(items, outerSets = 1) {
    if (!items) return;
    const list = Array.isArray(items) ? items : [items];

    for (const item of list) {
      if (item.type === 'repeat') {
        const effectiveSets = outerSets * (item.sets || 1);
        walk(item.work, effectiveSets);
      } else if (item.duration != null) {
        // WorkoutSegment
        intervals.push({
          durationMin: item.duration,
          powerPctFTP: item.powerPctFTP || 0,
          zone: item.zone,
          totalReps: outerSets,
        });
      }
    }
  }

  walk(main);
  return intervals;
}

/**
 * Extract workout requirements from a WorkoutDefinition.
 * Parses the recursive structure to find key training demands.
 */
export function extractWorkoutRequirements(workoutDef) {
  const structure = workoutDef.structure || {};
  const mainIntervals = flattenWorkIntervals(structure.main || []);

  // Find longest single work interval
  let longestWorkIntervalMinutes = 0;
  let dominantPowerPctFTP = 0;
  let maxVolume = 0;
  let maxOuterSets = 1;

  for (const interval of mainIntervals) {
    if (interval.durationMin > longestWorkIntervalMinutes) {
      longestWorkIntervalMinutes = interval.durationMin;
    }
    // Dominant power = the interval with the highest total work volume
    const volume = interval.durationMin * interval.totalReps;
    if (volume > maxVolume) {
      maxVolume = volume;
      dominantPowerPctFTP = interval.powerPctFTP;
    }
    if (interval.totalReps > maxOuterSets) {
      maxOuterSets = interval.totalReps;
    }
  }

  // Count outermost sets from structure.main
  let totalSets = 1;
  const mainItems = Array.isArray(structure.main) ? structure.main : [];
  for (const item of mainItems) {
    if (item.type === 'repeat' && item.sets > totalSets) {
      totalSets = item.sets;
    }
  }

  // Classify workout needs
  const needsSteadyState = longestWorkIntervalMinutes >= 10;
  const needsShortIntervals = mainIntervals.some(
    i => i.durationMin < 5 && i.totalReps > 3
  );
  const needsSprints = mainIntervals.some(
    i => i.durationMin <= 0.5 && (i.zone >= 6 || i.powerPctFTP >= 150)
  );
  const isRecovery = workoutDef.category === 'recovery';

  const targetZone = mapPowerPctToZone(dominantPowerPctFTP);

  return {
    longestWorkIntervalMinutes,
    dominantPowerPctFTP,
    targetZone,
    totalSets,
    terrainPreference: workoutDef.terrainType || 'flat',
    category: workoutDef.category || 'endurance',
    needsSteadyState,
    needsShortIntervals,
    needsSprints,
    isRecovery,
  };
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Score power zone match (0-100).
 * Exact match = 100, adjacent zone = 60, 2 zones away = 30, else 20.
 */
function scorePowerMatch(targetZone, segmentZone) {
  if (!segmentZone) return 50; // No profile data — neutral score
  const targetIdx = ZONE_ORDER.indexOf(targetZone);
  const segIdx = ZONE_ORDER.indexOf(segmentZone);
  if (targetIdx === -1 || segIdx === -1) return 50;

  const distance = Math.abs(targetIdx - segIdx);
  if (distance === 0) return 100;
  if (distance === 1) return 60;
  if (distance === 2) return 30;
  return 20;
}

/**
 * Score duration match (0-100).
 * Whether the segment supports the workout's longest uninterrupted interval.
 */
function scoreDurationMatch(requiredMinutes, maxUninterruptedSeconds) {
  if (requiredMinutes <= 0) return 100; // No duration requirement
  const requiredSeconds = requiredMinutes * 60;
  const available = maxUninterruptedSeconds || 0;

  if (available >= requiredSeconds) return 100;
  if (available >= requiredSeconds * 0.75) return 70;
  if (available >= requiredSeconds * 0.50) return 40;
  return 20;
}

/**
 * Score obstruction match (0-100).
 * Different workout types have different obstruction tolerance.
 */
function scoreObstructionMatch(requirements, obstructionScore) {
  const obs = obstructionScore || 0;

  if (requirements.needsSteadyState) {
    // Steady-state needs very clear road
    if (obs >= 75) return 100;
    if (obs >= 60) return 70;
    if (obs >= 45) return 40;
    return 15;
  }
  if (requirements.needsShortIntervals) {
    if (obs >= 50) return 100;
    if (obs >= 35) return 70;
    if (obs >= 20) return 40;
    return 15;
  }
  if (requirements.needsSprints) {
    if (obs >= 30) return 100;
    if (obs >= 20) return 60;
    return 30;
  }
  // Recovery / general — least sensitive
  if (obs >= 30) return 100;
  if (obs >= 15) return 70;
  return 40;
}

/**
 * Score repeatability match (0-100).
 * Interval workouts with multiple sets prefer repeatable segments.
 */
function scoreRepeatabilityMatch(totalSets, topology, isRepeatable) {
  if (totalSets <= 1) return 50; // Non-interval workout — neutral
  if (isRepeatable) return 100;
  if (topology === 'loop' || topology === 'out_and_back' || topology === 'circuit') return 80;
  return 40; // point_to_point for interval workout
}

/**
 * Score a single segment against extracted requirements.
 * Returns all sub-scores and the weighted composite.
 */
export function scoreSegmentMatch(segment, requirements, ftp) {
  const profile = Array.isArray(segment.training_segment_profiles)
    ? segment.training_segment_profiles[0]
    : segment.training_segment_profiles || {};

  const powerMatch = scorePowerMatch(requirements.targetZone, profile.typical_power_zone);
  const durationMatch = scoreDurationMatch(
    requirements.longestWorkIntervalMinutes,
    segment.max_uninterrupted_seconds
  );
  const obstructionMatch = scoreObstructionMatch(requirements, segment.obstruction_score);
  const repeatabilityMatch = scoreRepeatabilityMatch(
    requirements.totalSets,
    segment.topology,
    segment.is_repeatable
  );
  const relevanceMatch = profile.relevance_score || 0;

  const matchScore = Math.round(
    powerMatch * WEIGHTS.power +
    durationMatch * WEIGHTS.duration +
    obstructionMatch * WEIGHTS.obstruction +
    repeatabilityMatch * WEIGHTS.repeatability +
    relevanceMatch * WEIGHTS.relevance
  );

  // Generate reasoning
  const reasoning = generateMatchReasoning(
    { powerMatch, durationMatch, obstructionMatch, repeatabilityMatch, relevanceMatch },
    requirements,
    segment,
    profile
  );

  // Generate recommended power target
  const recommendedPowerTarget = generatePowerTarget(requirements, ftp);

  return {
    matchScore: Math.min(100, Math.max(0, matchScore)),
    powerMatch,
    durationMatch,
    obstructionMatch,
    repeatabilityMatch,
    relevanceMatch,
    matchReasoning: reasoning,
    recommendedPowerTarget,
  };
}

// ============================================================================
// REASONING & POWER TARGET
// ============================================================================

function generateMatchReasoning(scores, requirements, segment, profile) {
  const reasons = [];

  if (scores.powerMatch >= 80) {
    reasons.push(`Power zone aligns well (segment: ${profile.typical_power_zone || 'unknown'}, target: ${requirements.targetZone})`);
  } else if (scores.powerMatch >= 60) {
    reasons.push(`Power zone is close (segment: ${profile.typical_power_zone || 'unknown'}, target: ${requirements.targetZone})`);
  } else if (scores.powerMatch < 40) {
    reasons.push(`Power zone mismatch (segment: ${profile.typical_power_zone || 'unknown'}, target: ${requirements.targetZone})`);
  }

  if (scores.durationMatch >= 70) {
    reasons.push(`Supports ${requirements.longestWorkIntervalMinutes}min intervals uninterrupted`);
  } else if (scores.durationMatch < 40) {
    reasons.push(`May be too short for ${requirements.longestWorkIntervalMinutes}min intervals`);
  }

  if (scores.obstructionMatch >= 70) {
    reasons.push('Low obstruction for sustained effort');
  } else if (scores.obstructionMatch < 40) {
    reasons.push('Higher obstruction may disrupt effort');
  }

  if (requirements.totalSets > 1 && scores.repeatabilityMatch >= 70) {
    reasons.push(`${segment.topology} shape allows repeats`);
  } else if (requirements.totalSets > 1 && scores.repeatabilityMatch < 50) {
    reasons.push(`${segment.topology} shape is less ideal for repeated intervals`);
  }

  if (scores.relevanceMatch >= 60) {
    reasons.push('Frequently ridden — familiar segment');
  }

  return reasons.join('. ') || 'General segment match';
}

function generatePowerTarget(requirements, ftp) {
  if (!ftp || ftp <= 0 || !requirements.dominantPowerPctFTP) return null;

  const pct = requirements.dominantPowerPctFTP;
  const lowerPct = Math.max(pct - 3, 0);
  const upperPct = pct + 3;
  const lowerW = Math.round(ftp * lowerPct / 100);
  const upperW = Math.round(ftp * upperPct / 100);

  return `${lowerW}-${upperW}W (${lowerPct}-${upperPct}% FTP)`;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Compute matches for a specific workout against all user segments.
 * Stores top matches in workout_segment_matches with 7-day expiry.
 */
export async function computeWorkoutSegmentMatches(userId, workoutId, workoutDef, supabaseClient, ftp) {
  const supabase = supabaseClient || getSupabase();

  // Fetch user's FTP if not provided
  let userFtp = ftp;
  if (!userFtp) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ftp')
      .eq('user_id', userId)
      .single();
    userFtp = profile?.ftp || 0;
  }

  // Fetch all user segments with profiles
  const { data: segments, error: segError } = await supabase
    .from('training_segments')
    .select(`
      id, display_name, terrain_type, obstruction_score,
      max_uninterrupted_seconds, topology, is_repeatable,
      ride_count, confidence_score, distance_meters, avg_gradient,
      training_segment_profiles (
        typical_power_zone, relevance_score, consistency_score,
        mean_avg_power, mean_normalized_power, zone_distribution,
        frequency_tier
      )
    `)
    .eq('user_id', userId);

  if (segError || !segments?.length) {
    return { computed: 0, matches: [] };
  }

  // Extract requirements from workout
  const requirements = extractWorkoutRequirements(workoutDef);

  // Score each segment
  const scored = segments.map(segment => ({
    segment,
    ...scoreSegmentMatch(segment, requirements, userFtp),
  }));

  // Sort by match score and take top 10
  scored.sort((a, b) => b.matchScore - a.matchScore);
  const topMatches = scored.slice(0, 10);

  // Upsert into workout_segment_matches
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const upsertRows = topMatches.map(m => ({
    user_id: userId,
    workout_type: workoutId,
    segment_id: m.segment.id,
    match_score: m.matchScore,
    power_match: m.powerMatch,
    duration_match: m.durationMatch,
    obstruction_match: m.obstructionMatch,
    repeatability_match: m.repeatabilityMatch,
    relevance_match: m.relevanceMatch,
    recommended_power_target: m.recommendedPowerTarget,
    match_reasoning: m.matchReasoning,
    expires_at: expiresAt,
  }));

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('workout_segment_matches')
      .upsert(upsertRows, {
        onConflict: 'user_id,workout_type,segment_id',
      });

    if (upsertError) {
      console.error('[WorkoutMatcher] Upsert error:', upsertError.message);
    }
  }

  return {
    computed: topMatches.length,
    matches: topMatches.map(m => ({
      segmentId: m.segment.id,
      segmentName: m.segment.display_name,
      matchScore: m.matchScore,
      powerMatch: m.powerMatch,
      durationMatch: m.durationMatch,
      obstructionMatch: m.obstructionMatch,
      repeatabilityMatch: m.repeatabilityMatch,
      relevanceMatch: m.relevanceMatch,
      reasoning: m.matchReasoning,
      recommendedPowerTarget: m.recommendedPowerTarget,
    })),
  };
}

/**
 * Compute matches for multiple workouts for a user.
 * Accepts a dictionary of { workoutId: workoutDef } pairs.
 */
export async function computeAllMatchesForUser(userId, workoutDefs, supabaseClient) {
  const supabase = supabaseClient || getSupabase();

  // Fetch user's FTP once
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('ftp')
    .eq('user_id', userId)
    .single();
  const ftp = profile?.ftp || 0;

  let totalComputed = 0;
  let workoutsProcessed = 0;

  const entries = Object.entries(workoutDefs || {});
  for (const [workoutId, workoutDef] of entries) {
    const result = await computeWorkoutSegmentMatches(userId, workoutId, workoutDef, supabase, ftp);
    totalComputed += result.computed;
    workoutsProcessed++;
  }

  return { computed: totalComputed, workouts: workoutsProcessed };
}
