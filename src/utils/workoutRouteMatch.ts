/**
 * Workout-to-Route Matching Service
 * Matches workout prescriptions to the best routes from user's activity history
 */

import type { WorkoutCategory } from '../types/training';
import type { RouteTrainingProfile, IntervalSegment } from './activityRouteAnalyzer';

// Activity with analysis data
export interface AnalyzedActivity {
  id: string;
  name: string;
  start_date: string;
  distance: number;       // meters
  moving_time: number;    // seconds
  total_elevation_gain: number;
  map_summary_polyline?: string;
  provider?: string;
  provider_activity_id?: string;
  analysis?: RouteTrainingProfile;
}

// Workout definition (simplified from full WorkoutDefinition)
export interface WorkoutForMatching {
  id: string;
  name: string;
  category: WorkoutCategory;
  duration: number;       // minutes
  targetTSS?: number;
  terrainType?: 'flat' | 'rolling' | 'hilly';
  structure?: {
    main?: Array<{
      type?: string;
      sets?: number;
      work?: { duration: number };
      duration?: number;
    }>;
  };
}

// Route match result
export interface RouteMatch {
  activity: AnalyzedActivity;
  analysis: RouteTrainingProfile;
  matchScore: number;           // 0-100 overall match quality
  matchReasons: string[];       // Human-readable reasons
  warnings?: string[];          // Potential issues
  suggestedSegments: IntervalSegment[];  // Best segments for the workout
  workoutOverlay?: WorkoutOverlay;       // Segments mapped to workout structure
}

// Overlay of workout structure on route
export interface WorkoutOverlay {
  segments: WorkoutOverlaySegment[];
  totalDistance: number;
  fitsRoute: boolean;
}

export interface WorkoutOverlaySegment {
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'steady';
  zone: number;
  startDistance: number;
  endDistance: number;
  duration: number;         // minutes
  instruction: string;
  coordinates: [number, number][];
  color: string;
}

// Workout category requirements
interface CategoryRequirements {
  minFlatKm?: number;
  minSegmentLength?: number;
  preferFlat: boolean;
  preferRolling: boolean;
  preferHilly: boolean;
  minElevationGain?: number;
  maxElevationGain?: number;
  idealDuration?: { min: number; max: number };
}

const CATEGORY_REQUIREMENTS: Record<WorkoutCategory, CategoryRequirements> = {
  recovery: {
    preferFlat: true,
    preferRolling: false,
    preferHilly: false,
    maxElevationGain: 200,
    idealDuration: { min: 20, max: 45 }
  },
  endurance: {
    preferFlat: true,
    preferRolling: true,
    preferHilly: false,
    idealDuration: { min: 60, max: 240 }
  },
  tempo: {
    minFlatKm: 5,
    minSegmentLength: 3,
    preferFlat: true,
    preferRolling: true,
    preferHilly: false,
    idealDuration: { min: 45, max: 90 }
  },
  sweet_spot: {
    minFlatKm: 4,
    minSegmentLength: 2,
    preferFlat: true,
    preferRolling: true,
    preferHilly: false,
    idealDuration: { min: 45, max: 90 }
  },
  threshold: {
    minFlatKm: 6,
    minSegmentLength: 3,
    preferFlat: true,
    preferRolling: false,
    preferHilly: false,
    idealDuration: { min: 45, max: 75 }
  },
  vo2max: {
    minFlatKm: 3,
    minSegmentLength: 1,
    preferFlat: true,
    preferRolling: false,
    preferHilly: false,
    idealDuration: { min: 30, max: 60 }
  },
  climbing: {
    preferFlat: false,
    preferRolling: false,
    preferHilly: true,
    minElevationGain: 300,
    idealDuration: { min: 45, max: 120 }
  },
  anaerobic: {
    minFlatKm: 2,
    minSegmentLength: 0.5,
    preferFlat: true,
    preferRolling: false,
    preferHilly: false,
    idealDuration: { min: 30, max: 60 }
  },
  racing: {
    preferFlat: true,
    preferRolling: true,
    preferHilly: true,
    idealDuration: { min: 45, max: 120 }
  },
  strength: {
    preferFlat: true,
    preferRolling: false,
    preferHilly: false
  },
  core: {
    preferFlat: true,
    preferRolling: false,
    preferHilly: false
  },
  flexibility: {
    preferFlat: true,
    preferRolling: false,
    preferHilly: false
  },
  rest: {
    preferFlat: true,
    preferRolling: false,
    preferHilly: false
  }
};

// Zone colors for map display
const ZONE_COLORS: Record<number, string> = {
  1: '#6B8C72',   // Sage - recovery
  2: '#5C7A5E',   // Teal - endurance
  3: '#B89040',   // Gold - tempo
  3.5: '#B89040', // Gold - sweet spot
  4: '#9E5A3C',   // Terracotta - threshold
  5: '#9E5A3C',   // Terracotta - VO2 max
  6: '#6B7F94',   // Mauve - anaerobic
  7: '#8B6B5A',   // Dusty rose - sprint
};

/**
 * Calculate match score between a workout and an analyzed activity
 */
function calculateMatchScore(
  workout: WorkoutForMatching,
  analysis: RouteTrainingProfile
): { score: number; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  const category = workout.category;
  const requirements = CATEGORY_REQUIREMENTS[category];

  if (!requirements) {
    return { score: 50, reasons: ['Unknown workout category'], warnings: [] };
  }

  // Base score from suitability analysis
  const categoryScore = analysis.suitability[category as keyof typeof analysis.suitability];
  if (categoryScore !== undefined) {
    score += categoryScore * 0.5; // 50% weight from pre-calculated suitability
    if (categoryScore >= 80) {
      reasons.push(`Excellent ${category} terrain (${categoryScore}% match)`);
    } else if (categoryScore >= 60) {
      reasons.push(`Good ${category} terrain (${categoryScore}% match)`);
    }
  }

  // Check flat segment requirements
  if (requirements.minFlatKm && analysis.totalFlatKm >= requirements.minFlatKm) {
    score += 15;
    reasons.push(`Has ${analysis.totalFlatKm.toFixed(1)}km of flat terrain`);
  } else if (requirements.minFlatKm && analysis.totalFlatKm < requirements.minFlatKm) {
    warnings.push(`Only ${analysis.totalFlatKm.toFixed(1)}km flat (need ${requirements.minFlatKm}km)`);
  }

  // Check interval segment requirements
  if (requirements.minSegmentLength) {
    const goodSegments = analysis.intervalSegments.filter(
      s => s.length >= requirements.minSegmentLength!
    );
    if (goodSegments.length >= 2) {
      score += 15;
      reasons.push(`${goodSegments.length} segments of ${requirements.minSegmentLength}km+ for intervals`);
    } else if (goodSegments.length === 1) {
      score += 8;
      reasons.push(`1 segment of ${requirements.minSegmentLength}km+ for intervals`);
    } else {
      warnings.push(`No segments long enough for ${category} intervals`);
    }
  }

  // Check terrain preference
  if (requirements.preferFlat && analysis.terrainType === 'flat') {
    score += 10;
    reasons.push('Flat terrain ideal for this workout');
  } else if (requirements.preferRolling && analysis.terrainType === 'rolling') {
    score += 10;
    reasons.push('Rolling terrain works well for this workout');
  } else if (requirements.preferHilly && (analysis.terrainType === 'hilly' || analysis.terrainType === 'mountainous')) {
    score += 10;
    reasons.push('Hilly terrain perfect for climbing work');
  }

  // Check elevation requirements
  if (requirements.minElevationGain && analysis.totalClimbingKm > 0) {
    score += 10;
    reasons.push(`Good climbing: ${analysis.totalClimbingKm.toFixed(1)}km of climbs`);
  }
  if (requirements.maxElevationGain && analysis.terrainType === 'flat') {
    score += 5;
    reasons.push('Minimal elevation for recovery');
  }

  // Check duration fit
  if (requirements.idealDuration && workout.duration) {
    const { min, max } = requirements.idealDuration;
    if (analysis.idealDurationMin <= workout.duration && analysis.idealDurationMax >= workout.duration) {
      score += 10;
      reasons.push(`Route duration matches workout (${workout.duration}min)`);
    } else if (analysis.idealDurationMax < workout.duration) {
      warnings.push(`Route may be too short for ${workout.duration}min workout`);
    }
  }

  // Bonus for being in the "best for" list
  if (analysis.bestFor.includes(category)) {
    score += 10;
    reasons.push(`Route is optimal for ${category} workouts`);
  }

  // Cap at 100
  score = Math.min(100, Math.round(score));

  return { score, reasons, warnings };
}

/**
 * Find suitable segments for a specific workout type
 */
function findSuitableSegments(
  workout: WorkoutForMatching,
  analysis: RouteTrainingProfile
): IntervalSegment[] {
  const category = workout.category;

  // Filter interval segments that are suitable for this workout
  return analysis.intervalSegments
    .filter(segment => segment.suitableFor.includes(category))
    .sort((a, b) => {
      // Sort by length (longer first) then by consistency
      if (Math.abs(a.length - b.length) > 0.5) {
        return b.length - a.length;
      }
      return b.consistencyScore - a.consistencyScore;
    })
    .slice(0, 5); // Return top 5 segments
}

/**
 * Create workout overlay on route - maps workout structure to route segments
 */
function createWorkoutOverlay(
  workout: WorkoutForMatching,
  analysis: RouteTrainingProfile,
  totalDistanceKm: number
): WorkoutOverlay {
  const segments: WorkoutOverlaySegment[] = [];
  let currentDistance = 0;

  // Simple workout structure mapping
  // In real implementation, this would use generateCuesFromWorkoutStructure logic
  const workoutDuration = workout.duration || 60;
  const avgSpeed = 25; // km/h

  // Warmup (10-15% of route)
  const warmupDist = Math.min(3, totalDistanceKm * 0.12);
  segments.push({
    type: 'warmup',
    zone: 2,
    startDistance: 0,
    endDistance: warmupDist,
    duration: Math.round((warmupDist / avgSpeed) * 60),
    instruction: 'Warmup: Easy Zone 2',
    coordinates: getCoordinatesForSegment(analysis, 0, warmupDist),
    color: ZONE_COLORS[2]
  });
  currentDistance = warmupDist;

  // Main workout based on category
  const mainZone = getMainZoneForCategory(workout.category);
  const cooldownDist = Math.min(2, totalDistanceKm * 0.1);
  const mainDist = totalDistanceKm - warmupDist - cooldownDist;

  if (workout.category === 'threshold' || workout.category === 'vo2max' || workout.category === 'sweet_spot') {
    // Interval-based workout
    const intervalCount = workout.category === 'vo2max' ? 5 : 3;
    const intervalDist = mainDist / (intervalCount * 2);

    for (let i = 0; i < intervalCount; i++) {
      // Hard interval
      segments.push({
        type: 'interval',
        zone: mainZone,
        startDistance: currentDistance,
        endDistance: currentDistance + intervalDist,
        duration: Math.round((intervalDist / avgSpeed) * 60),
        instruction: `Interval ${i + 1}: Zone ${mainZone} effort`,
        coordinates: getCoordinatesForSegment(analysis, currentDistance, currentDistance + intervalDist),
        color: ZONE_COLORS[mainZone]
      });
      currentDistance += intervalDist;

      // Recovery
      segments.push({
        type: 'recovery',
        zone: 2,
        startDistance: currentDistance,
        endDistance: currentDistance + intervalDist,
        duration: Math.round((intervalDist / avgSpeed) * 60),
        instruction: 'Recovery: Easy spin',
        coordinates: getCoordinatesForSegment(analysis, currentDistance, currentDistance + intervalDist),
        color: ZONE_COLORS[2]
      });
      currentDistance += intervalDist;
    }
  } else {
    // Steady-state workout
    segments.push({
      type: 'steady',
      zone: mainZone,
      startDistance: currentDistance,
      endDistance: currentDistance + mainDist,
      duration: Math.round((mainDist / avgSpeed) * 60),
      instruction: `Steady Zone ${mainZone}`,
      coordinates: getCoordinatesForSegment(analysis, currentDistance, currentDistance + mainDist),
      color: ZONE_COLORS[mainZone]
    });
    currentDistance += mainDist;
  }

  // Cooldown
  segments.push({
    type: 'cooldown',
    zone: 1,
    startDistance: currentDistance,
    endDistance: totalDistanceKm,
    duration: Math.round((cooldownDist / avgSpeed) * 60),
    instruction: 'Cooldown: Easy Zone 1',
    coordinates: getCoordinatesForSegment(analysis, currentDistance, totalDistanceKm),
    color: ZONE_COLORS[1]
  });

  return {
    segments,
    totalDistance: totalDistanceKm,
    fitsRoute: true
  };
}

/**
 * Get coordinates for a distance range from analysis
 */
function getCoordinatesForSegment(
  analysis: RouteTrainingProfile,
  startKm: number,
  endKm: number
): [number, number][] {
  // Combine all segment coordinates and find those in range
  const allSegments = [
    ...analysis.flatSegments,
    ...analysis.climbSegments,
    ...analysis.rollingSegments
  ].sort((a, b) => a.startDistance - b.startDistance);

  const coords: [number, number][] = [];

  for (const segment of allSegments) {
    if (segment.endDistance < startKm) continue;
    if (segment.startDistance > endKm) break;

    // Add coordinates from this segment
    coords.push(...segment.coordinates);
  }

  return coords.length > 0 ? coords : [[0, 0]];
}

/**
 * Get main training zone for a workout category
 */
function getMainZoneForCategory(category: WorkoutCategory): number {
  const zoneMap: Partial<Record<WorkoutCategory, number>> = {
    recovery: 1,
    endurance: 2,
    tempo: 3,
    sweet_spot: 3.5,
    threshold: 4,
    vo2max: 5,
    climbing: 4,
    anaerobic: 6,
    racing: 4
  };
  return zoneMap[category] || 3;
}

/**
 * Main function: Find best routes for a workout
 */
export function findRoutesForWorkout(
  workout: WorkoutForMatching,
  analyzedActivities: AnalyzedActivity[],
  options: {
    maxResults?: number;
    minMatchScore?: number;
    userLocation?: { lat: number; lng: number };
  } = {}
): RouteMatch[] {
  const { maxResults = 5, minMatchScore = 40 } = options;

  const matches: RouteMatch[] = [];

  for (const activity of analyzedActivities) {
    if (!activity.analysis) continue;

    const { score, reasons, warnings } = calculateMatchScore(workout, activity.analysis);

    if (score < minMatchScore) continue;

    const suitableSegments = findSuitableSegments(workout, activity.analysis);
    const workoutOverlay = createWorkoutOverlay(
      workout,
      activity.analysis,
      activity.distance / 1000
    );

    matches.push({
      activity,
      analysis: activity.analysis,
      matchScore: score,
      matchReasons: reasons,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestedSegments: suitableSegments,
      workoutOverlay
    });
  }

  // Sort by match score (highest first)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches.slice(0, maxResults);
}

/**
 * Batch analyze: Find best routes for multiple workouts
 */
export function findRoutesForWorkouts(
  workouts: WorkoutForMatching[],
  analyzedActivities: AnalyzedActivity[],
  options: {
    maxResultsPerWorkout?: number;
    minMatchScore?: number;
  } = {}
): Map<string, RouteMatch[]> {
  const results = new Map<string, RouteMatch[]>();

  for (const workout of workouts) {
    const matches = findRoutesForWorkout(workout, analyzedActivities, {
      maxResults: options.maxResultsPerWorkout || 3,
      minMatchScore: options.minMatchScore || 40
    });
    results.set(workout.id, matches);
  }

  return results;
}

/**
 * Create GeoJSON for workout overlay on map
 */
export function createWorkoutOverlayGeoJSON(
  overlay: WorkoutOverlay
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: overlay.segments.map(segment => ({
      type: 'Feature',
      properties: {
        type: segment.type,
        zone: segment.zone,
        color: segment.color,
        instruction: segment.instruction,
        duration: segment.duration
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates
      }
    }))
  };
}

/**
 * Get human-readable match quality description
 */
export function getMatchQualityLabel(score: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (score >= 90) return { label: 'Excellent', color: 'green', emoji: '🥇' };
  if (score >= 75) return { label: 'Great', color: 'teal', emoji: '🥈' };
  if (score >= 60) return { label: 'Good', color: 'blue', emoji: '🥉' };
  if (score >= 45) return { label: 'Fair', color: 'yellow', emoji: '👍' };
  return { label: 'Limited', color: 'gray', emoji: '⚠️' };
}
