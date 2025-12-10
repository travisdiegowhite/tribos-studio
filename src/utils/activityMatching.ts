/**
 * Activity Matching Utilities
 * Matches completed activities to planned workouts based on various criteria
 */

import type { PlannedWorkoutDB, ActivitySummary, ActivityMatch } from '../types/training';

interface MatchingOptions {
  dateToleranceDays?: number; // How many days before/after scheduled date to consider
  tssTolerancePercent?: number; // Percentage tolerance for TSS matching
  durationTolerancePercent?: number; // Percentage tolerance for duration matching
}

const DEFAULT_OPTIONS: MatchingOptions = {
  dateToleranceDays: 1,
  tssTolerancePercent: 30,
  durationTolerancePercent: 25,
};

/**
 * Calculate a match score between an activity and a planned workout
 * Returns a score from 0-100 where higher is better
 */
export function calculateMatchScore(
  activity: ActivitySummary,
  workout: PlannedWorkoutDB,
  options: MatchingOptions = DEFAULT_OPTIONS
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  let maxScore = 0;

  // 1. Date matching (40 points max)
  maxScore += 40;
  const activityDate = new Date(activity.date).toISOString().split('T')[0];
  const workoutDate = workout.scheduled_date;

  if (activityDate === workoutDate) {
    score += 40;
    reasons.push('Exact date match');
  } else {
    const daysDiff = Math.abs(
      (new Date(activityDate).getTime() - new Date(workoutDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff <= (options.dateToleranceDays || 1)) {
      const dateScore = Math.round(40 * (1 - daysDiff / ((options.dateToleranceDays || 1) + 1)));
      score += dateScore;
      reasons.push(`Date within ${daysDiff} day(s)`);
    }
  }

  // 2. Duration matching (30 points max)
  if (workout.target_duration && activity.duration) {
    maxScore += 30;
    const durationDiff = Math.abs(activity.duration - workout.target_duration);
    const durationPercent = (durationDiff / workout.target_duration) * 100;

    if (durationPercent <= 10) {
      score += 30;
      reasons.push('Duration matches closely');
    } else if (durationPercent <= (options.durationTolerancePercent || 25)) {
      const durationScore = Math.round(30 * (1 - durationPercent / 50));
      score += Math.max(0, durationScore);
      reasons.push(`Duration within ${Math.round(durationPercent)}%`);
    }
  }

  // 3. TSS matching (30 points max)
  if (workout.target_tss && activity.tss) {
    maxScore += 30;
    const tssDiff = Math.abs(activity.tss - workout.target_tss);
    const tssPercent = (tssDiff / workout.target_tss) * 100;

    if (tssPercent <= 15) {
      score += 30;
      reasons.push('TSS matches closely');
    } else if (tssPercent <= (options.tssTolerancePercent || 30)) {
      const tssScore = Math.round(30 * (1 - tssPercent / 50));
      score += Math.max(0, tssScore);
      reasons.push(`TSS within ${Math.round(tssPercent)}%`);
    }
  }

  // Normalize score to 0-100
  const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return { score: normalizedScore, reasons };
}

/**
 * Find the best matching activities for a planned workout
 */
export function findMatchingActivities(
  workout: PlannedWorkoutDB,
  activities: ActivitySummary[],
  options: MatchingOptions = DEFAULT_OPTIONS,
  minScore: number = 40
): ActivityMatch[] {
  const matches: ActivityMatch[] = [];

  for (const activity of activities) {
    const { score, reasons } = calculateMatchScore(activity, workout, options);

    if (score >= minScore) {
      matches.push({
        activityId: activity.id,
        plannedWorkoutId: workout.id,
        matchScore: score,
        matchReasons: reasons,
      });
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Find the best matching workout for an activity
 */
export function findMatchingWorkout(
  activity: ActivitySummary,
  workouts: PlannedWorkoutDB[],
  options: MatchingOptions = DEFAULT_OPTIONS,
  minScore: number = 40
): ActivityMatch | null {
  let bestMatch: ActivityMatch | null = null;

  for (const workout of workouts) {
    // Skip already completed workouts
    if (workout.completed || workout.activity_id) continue;

    // Skip rest days
    if (workout.workout_type === 'rest' || !workout.workout_id) continue;

    const { score, reasons } = calculateMatchScore(activity, workout, options);

    if (score >= minScore && (!bestMatch || score > bestMatch.matchScore)) {
      bestMatch = {
        activityId: activity.id,
        plannedWorkoutId: workout.id,
        matchScore: score,
        matchReasons: reasons,
      };
    }
  }

  return bestMatch;
}

/**
 * Auto-link activities to workouts for a given date range
 * Returns suggested matches that need user confirmation
 */
export function suggestActivityLinks(
  activities: ActivitySummary[],
  workouts: PlannedWorkoutDB[],
  options: MatchingOptions = DEFAULT_OPTIONS
): ActivityMatch[] {
  const suggestions: ActivityMatch[] = [];
  const usedActivities = new Set<string>();
  const usedWorkouts = new Set<string>();

  // Sort workouts by date
  const sortedWorkouts = [...workouts]
    .filter((w) => !w.completed && !w.activity_id && w.workout_id && w.workout_type !== 'rest')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  // For each workout, find the best unassigned activity
  for (const workout of sortedWorkouts) {
    let bestMatch: ActivityMatch | null = null;

    for (const activity of activities) {
      if (usedActivities.has(activity.id)) continue;

      const { score, reasons } = calculateMatchScore(activity, workout, options);

      if (score >= 50 && (!bestMatch || score > bestMatch.matchScore)) {
        bestMatch = {
          activityId: activity.id,
          plannedWorkoutId: workout.id,
          matchScore: score,
          matchReasons: reasons,
        };
      }
    }

    if (bestMatch) {
      suggestions.push(bestMatch);
      usedActivities.add(bestMatch.activityId);
      usedWorkouts.add(bestMatch.plannedWorkoutId);
    }
  }

  return suggestions;
}

/**
 * Convert activity data from database to ActivitySummary
 */
export function activityToSummary(activity: any): ActivitySummary {
  return {
    id: activity.id,
    name: activity.name || 'Untitled Activity',
    date: activity.start_date,
    duration: activity.duration_seconds ? Math.round(activity.duration_seconds / 60) : 0,
    distance: activity.distance_meters ? activity.distance_meters / 1000 : 0,
    tss: activity.tss || null,
    elevationGain: activity.elevation_gain_meters || 0,
    averagePower: activity.average_power_watts || null,
    normalizedPower: activity.normalized_power_watts || null,
  };
}

/**
 * Get match quality label
 */
export function getMatchQuality(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: 'green' };
  if (score >= 60) return { label: 'Good', color: 'blue' };
  if (score >= 40) return { label: 'Fair', color: 'yellow' };
  return { label: 'Poor', color: 'red' };
}
