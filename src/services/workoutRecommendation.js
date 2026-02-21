/**
 * Unified Workout Recommendation Service
 *
 * Single source of truth for "what should I ride today?"
 * Consumed by: TodaysFocusCard, TrainNow component, Coach API context
 *
 * Merges logic from:
 * - getSuggestedWorkout() (race proximity)
 * - TrainNow analyzeTrainingNeeds() (form scoring, zone gaps, plan awareness)
 * - TrainNow getRecommendedWorkouts() (category ranking, time filtering)
 *
 * Decision priority (highest wins):
 * 1. Race proximity (race week / taper)
 * 2. Planned workout for today
 * 3. Form-based scoring (TSB)
 * 4. Zone gap detection (FTP-relative)
 * 5. Time filtering
 * 6. Workout selection from library
 */

import { getWorkoutById, getWorkoutsByCategory } from '../data/workoutLibrary';

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Determine race proximity phase for the nearest upcoming race.
 */
export function getRaceProximity(raceGoals = []) {
  if (!raceGoals || raceGoals.length === 0) {
    return { nextRace: null, daysUntilRace: null, phase: null };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Find the closest future race
  let closest = null;
  let closestDays = Infinity;

  for (const race of raceGoals) {
    const raceDate = new Date(race.race_date + 'T00:00:00');
    const days = Math.ceil((raceDate - now) / (1000 * 60 * 60 * 24));
    if (days > 0 && days < closestDays) {
      closest = race;
      closestDays = days;
    }
  }

  if (!closest) {
    return { nextRace: null, daysUntilRace: null, phase: null };
  }

  let phase = null;
  if (closestDays <= 7) phase = 'race_week';
  else if (closestDays <= 14) phase = 'taper';
  else if (closestDays <= 28) phase = 'final_build';
  else if (closestDays <= 56) phase = 'build';
  else phase = 'base';

  return { nextRace: closest, daysUntilRace: closestDays, phase };
}

/**
 * Detect zone gaps in recent training (FTP-relative thresholds).
 */
export function detectZoneGaps(activities = [], ftp = 200) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recentActivities = activities.filter(a =>
    new Date(a.start_date) >= weekAgo
  );

  const totalRides = recentActivities.length;

  const z2Threshold = ftp * 0.75;
  const intensityThreshold = ftp * 0.90;

  const hasZ2Recent = recentActivities.some(a => {
    const durationMin = (a.moving_time || 0) / 60;
    return durationMin > 60 && (!a.average_watts || a.average_watts < z2Threshold);
  });

  const hasIntensityRecent = recentActivities.some(a =>
    a.average_watts && a.average_watts > intensityThreshold
  );

  return {
    missingZ2: !hasZ2Recent && totalRides >= 2,
    missingIntensity: !hasIntensityRecent,
    recentActivities,
    totalRides,
  };
}

/**
 * Determine what the athlete needs based on form, gaps, plan, and race proximity.
 *
 * Returns scores (0-100) for each training category plus reasons.
 */
export function analyzeTrainingNeeds({
  trainingMetrics = {},
  activities = [],
  raceGoals = [],
  plannedWorkouts = [],
  ftp = 200,
}) {
  const { tsb = 0, ctl = 50 } = trainingMetrics;

  const needs = {
    recovery:  { score: 0, reason: '' },
    endurance: { score: 0, reason: '' },
    intensity: { score: 0, reason: '' },
    vo2max:    { score: 0, reason: '' },
    threshold: { score: 0, reason: '' },
  };

  // ── 1. Race proximity (highest priority) ──────────────────────────────────
  const raceProximity = getRaceProximity(raceGoals);

  if (raceProximity.phase === 'race_week') {
    needs.recovery.score = 95;
    needs.recovery.reason = `Race week — ${raceProximity.nextRace.name} in ${raceProximity.daysUntilRace} days. Recovery and openers only.`;
    needs.endurance.score = 15;
    needs.intensity.score = 5;
    needs.vo2max.score = 0;
    needs.threshold.score = 5;
    return { needs, raceProximity, gaps: { missingZ2: false, missingIntensity: false }, formStatus: getFormStatus(tsb) };
  }

  if (raceProximity.phase === 'taper') {
    needs.recovery.score = 40;
    needs.endurance.score = 70;
    needs.endurance.reason = `Taper — ${raceProximity.nextRace.name} in ${raceProximity.daysUntilRace} days. Easy endurance, maintain some sharpness.`;
    needs.intensity.score = 20;
    needs.vo2max.score = 10;
    needs.threshold.score = 20;
    return { needs, raceProximity, gaps: { missingZ2: false, missingIntensity: false }, formStatus: getFormStatus(tsb) };
  }

  // ── 2. Planned workout for today ──────────────────────────────────────────
  if (plannedWorkouts.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const todayWorkout = plannedWorkouts.find(w => w.scheduled_date === today);

    if (todayWorkout) {
      const type = todayWorkout.workout_type || 'endurance';
      if (type === 'recovery' || type === 'rest') {
        needs.recovery.score = Math.max(needs.recovery.score, 80);
        needs.recovery.reason = 'Planned recovery day';
      } else if (type === 'vo2max') {
        needs.vo2max.score = Math.max(needs.vo2max.score, 80);
        needs.intensity.score = Math.max(needs.intensity.score, 75);
        needs.vo2max.reason = 'Planned VO2max workout today';
      } else if (type === 'threshold') {
        needs.threshold.score = Math.max(needs.threshold.score, 80);
        needs.intensity.score = Math.max(needs.intensity.score, 75);
        needs.threshold.reason = 'Planned threshold workout today';
      } else if (type === 'endurance') {
        needs.endurance.score = Math.max(needs.endurance.score, 75);
        needs.endurance.reason = 'Planned endurance workout today';
      }
    }
  }

  // ── 3. Form-based scoring (TSB) ──────────────────────────────────────────
  if (tsb < -25) {
    needs.recovery.score = Math.max(needs.recovery.score, 90);
    needs.recovery.reason = needs.recovery.reason || 'High fatigue — recovery is essential';
    needs.endurance.score = Math.max(needs.endurance.score, 20);
    needs.intensity.score = Math.max(needs.intensity.score, 5);
  } else if (tsb < -10) {
    needs.recovery.score = Math.max(needs.recovery.score, 60);
    needs.recovery.reason = needs.recovery.reason || 'Moderate fatigue — easy day recommended';
    needs.endurance.score = Math.max(needs.endurance.score, 50);
    needs.intensity.score = Math.max(needs.intensity.score, 30);
  } else if (tsb > 15) {
    needs.recovery.score = Math.max(needs.recovery.score, 10);
    needs.intensity.score = Math.max(needs.intensity.score, 80);
    needs.intensity.reason = needs.intensity.reason || 'Fresh and ready for hard work!';
    needs.vo2max.score = Math.max(needs.vo2max.score, 70);
    needs.threshold.score = Math.max(needs.threshold.score, 75);
  } else if (tsb > 5) {
    needs.recovery.score = Math.max(needs.recovery.score, 20);
    needs.intensity.score = Math.max(needs.intensity.score, 65);
    needs.endurance.score = Math.max(needs.endurance.score, 60);
    needs.threshold.score = Math.max(needs.threshold.score, 60);
  } else {
    // Neutral form (-10 to +5)
    needs.endurance.score = Math.max(needs.endurance.score, 65);
    needs.intensity.score = Math.max(needs.intensity.score, 50);
    needs.threshold.score = Math.max(needs.threshold.score, 55);
    needs.recovery.score = Math.max(needs.recovery.score, 30);
  }

  // ── 4. Zone gap detection (FTP-relative) ──────────────────────────────────
  const gaps = detectZoneGaps(activities, ftp);

  if (gaps.missingZ2) {
    needs.endurance.score += 20;
    needs.endurance.reason = needs.endurance.reason || 'No long Z2 ride in the last week';
  }

  if (gaps.missingIntensity && tsb > -10) {
    needs.intensity.score += 15;
    needs.vo2max.score += 15;
    needs.vo2max.reason = needs.vo2max.reason || 'No high intensity in the last week';
  }

  const formStatus = getFormStatus(tsb);

  return { needs, raceProximity, gaps, formStatus };
}

// ─── Form Status ─────────────────────────────────────────────────────────────

export function getFormStatus(tsb) {
  if (tsb >= 15) return 'fresh';
  if (tsb >= 5) return 'ready';
  if (tsb >= -10) return 'optimal';
  if (tsb >= -25) return 'tired';
  return 'fatigued';
}

// ─── Recommendation Building ─────────────────────────────────────────────────

/**
 * Build ranked category recommendations from needs analysis.
 * Returns up to 3 categories, each with up to 2 workouts.
 */
function buildCategoryRecommendations(needs, timeAvailable = null) {
  const recommendations = [];

  const categories = [
    {
      key: 'recovery',
      title: 'Recovery',
      threshold: 60,
      libraryCategories: ['recovery'],
      defaultReason: 'Active recovery to reduce fatigue',
    },
    {
      key: 'endurance',
      title: 'Endurance',
      threshold: 50,
      libraryCategories: ['endurance'],
      defaultReason: 'Build aerobic base',
    },
    {
      key: 'threshold',
      title: 'Threshold / Sweet Spot',
      threshold: 50,
      libraryCategories: ['threshold', 'sweet_spot'],
      defaultReason: 'Improve FTP and lactate clearance',
    },
    {
      key: 'vo2max',
      title: 'VO2 Max',
      threshold: 50,
      libraryCategories: ['vo2max'],
      defaultReason: 'Develop maximum aerobic capacity',
    },
  ];

  for (const cat of categories) {
    const need = needs[cat.key] || needs.intensity;
    if (!need || need.score < cat.threshold) continue;

    let workouts = [];
    for (const libCat of cat.libraryCategories) {
      workouts = workouts.concat(getWorkoutsByCategory(libCat) || []);
    }

    // Apply time filter
    if (timeAvailable) {
      workouts = workouts.filter(w => w.duration <= timeAvailable + 15);
    }

    if (workouts.length === 0) continue;

    recommendations.push({
      category: cat.key,
      title: cat.title,
      reason: need.reason || cat.defaultReason,
      score: need.score,
      workouts: workouts.slice(0, 2),
    });
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get a single "what should I do today?" recommendation plus alternatives.
 *
 * This is the primary entry point consumed by all three UI surfaces.
 */
export function getWorkoutRecommendation({
  trainingMetrics = {},
  activities = [],
  raceGoals = [],
  plannedWorkouts = [],
  ftp = 200,
  timeAvailable = null,
} = {}) {
  const analysis = analyzeTrainingNeeds({
    trainingMetrics,
    activities,
    raceGoals,
    plannedWorkouts,
    ftp,
  });

  const { needs, raceProximity } = analysis;

  // Race proximity forces specific workouts regardless of scoring
  if (raceProximity.phase === 'race_week') {
    const workout = getWorkoutById('recovery_spin') || getWorkoutById('easy_recovery_ride');
    return {
      primary: workout ? {
        workout,
        reason: needs.recovery.reason,
        score: needs.recovery.score,
        category: 'recovery',
      } : null,
      alternatives: [],
      analysis,
    };
  }

  if (raceProximity.phase === 'taper') {
    const workout = getWorkoutById('foundation_miles') || getWorkoutById('endurance_base_build');
    return {
      primary: workout ? {
        workout,
        reason: needs.endurance.reason,
        score: needs.endurance.score,
        category: 'endurance',
      } : null,
      alternatives: [],
      analysis,
    };
  }

  // ── Planned workout for today takes priority ──────────────────────────────
  // If the training plan has a workout scheduled for today, surface it as the
  // primary recommendation so the Today card stays consistent with the calendar
  // and AI Coach (which also sees the planned calendar).
  const today = new Date().toISOString().split('T')[0];
  const todayPlanned = plannedWorkouts.find(w => w.scheduled_date === today && !w.completed && !w.skipped_reason);

  if (todayPlanned) {
    const plannedType = todayPlanned.workout_type || 'endurance';

    // Rest / off days: recommend rest, no workout
    if (plannedType === 'rest' || plannedType === 'off') {
      return {
        primary: null,
        alternatives: [],
        analysis,
        plannedRest: true,
        plannedRestReason: 'Rest day — your training plan has a rest day scheduled today.',
      };
    }

    // Try to find the exact workout from the library
    const plannedWorkout = todayPlanned.workout_id
      ? getWorkoutById(todayPlanned.workout_id)
      : null;

    if (plannedWorkout) {
      // Build alternatives from normal scoring for "if you want something different"
      const recommendations = buildCategoryRecommendations(needs, timeAvailable);
      const alternatives = recommendations
        .filter(rec => rec.workouts[0]?.id !== plannedWorkout.id)
        .slice(0, 2)
        .map(rec => ({
          workout: rec.workouts[0],
          reason: rec.reason,
          score: rec.score,
          category: rec.category,
        }));

      return {
        primary: {
          workout: plannedWorkout,
          reason: `Planned: ${todayPlanned.name || plannedWorkout.name}`,
          score: 90,
          category: plannedWorkout.category || plannedType,
          source: 'plan',
        },
        alternatives,
        analysis,
      };
    }
  }

  // Normal recommendation path: build ranked categories
  const recommendations = buildCategoryRecommendations(needs, timeAvailable);

  const primary = recommendations[0]
    ? {
        workout: recommendations[0].workouts[0],
        reason: recommendations[0].reason,
        score: recommendations[0].score,
        category: recommendations[0].category,
      }
    : null;

  const alternatives = recommendations.slice(1).map(rec => ({
    workout: rec.workouts[0],
    reason: rec.reason,
    score: rec.score,
    category: rec.category,
  }));

  return { primary, alternatives, analysis };
}

/**
 * Get full category-level recommendations (for TrainNow's multi-card UI).
 *
 * Returns the same ranked categories as the internal buildCategoryRecommendations,
 * with full workout arrays per category.
 */
export function getWorkoutRecommendations({
  trainingMetrics = {},
  activities = [],
  raceGoals = [],
  plannedWorkouts = [],
  ftp = 200,
  timeAvailable = null,
} = {}) {
  const analysis = analyzeTrainingNeeds({
    trainingMetrics,
    activities,
    raceGoals,
    plannedWorkouts,
    ftp,
  });

  const { needs, raceProximity } = analysis;

  // Race proximity: return single recovery/endurance category
  if (raceProximity.phase === 'race_week') {
    const workouts = getWorkoutsByCategory('recovery') || [];
    return {
      categories: workouts.length > 0 ? [{
        category: 'recovery',
        title: 'Recovery',
        reason: needs.recovery.reason,
        score: needs.recovery.score,
        workouts: workouts.slice(0, 2),
      }] : [],
      analysis,
    };
  }

  if (raceProximity.phase === 'taper') {
    const workouts = (getWorkoutsByCategory('endurance') || []).filter(w =>
      !timeAvailable || w.duration <= timeAvailable + 15
    );
    return {
      categories: workouts.length > 0 ? [{
        category: 'endurance',
        title: 'Endurance',
        reason: needs.endurance.reason,
        score: needs.endurance.score,
        workouts: workouts.slice(0, 2),
      }] : [],
      analysis,
    };
  }

  const categories = buildCategoryRecommendations(needs, timeAvailable);
  return { categories, analysis };
}
