// Plan Generator Utility
// Generates periodized training plans based on methodology, goal, and target events

// Workout library with TSS and duration values
const WORKOUT_LIBRARY = {
  // Recovery
  recovery_spin: { name: 'Recovery Spin', duration: 30, tss: 20, category: 'recovery' },
  easy_recovery_ride: { name: 'Easy Recovery Ride', duration: 45, tss: 30, category: 'recovery' },

  // Endurance
  foundation_miles: { name: 'Foundation Miles', duration: 60, tss: 55, category: 'endurance' },
  endurance_base_build: { name: 'Endurance Base Build', duration: 90, tss: 70, category: 'endurance' },
  long_endurance_ride: { name: 'Long Endurance Ride', duration: 180, tss: 140, category: 'endurance' },
  polarized_long_ride: { name: 'Polarized Long Ride', duration: 240, tss: 180, category: 'endurance' },

  // Tempo
  tempo_ride: { name: 'Tempo Ride', duration: 60, tss: 65, category: 'tempo' },
  two_by_twenty_tempo: { name: '2x20 Tempo', duration: 75, tss: 80, category: 'tempo' },
  progressive_tempo: { name: 'Progressive Tempo', duration: 70, tss: 75, category: 'tempo' },

  // Sweet Spot
  traditional_sst: { name: 'Traditional Sweet Spot', duration: 65, tss: 85, category: 'sweet_spot' },
  three_by_ten_sst: { name: '3x10 Sweet Spot', duration: 60, tss: 80, category: 'sweet_spot' },
  four_by_twelve_sst: { name: '4x12 Sweet Spot', duration: 80, tss: 95, category: 'sweet_spot' },
  sweet_spot_progression: { name: 'Sweet Spot Progression', duration: 90, tss: 105, category: 'sweet_spot' },

  // Threshold
  two_by_twenty_ftp: { name: '2x20 FTP', duration: 70, tss: 90, category: 'threshold' },
  over_under_intervals: { name: 'Over-Under Intervals', duration: 75, tss: 100, category: 'threshold' },
  three_by_twelve_threshold: { name: '3x12 Threshold', duration: 75, tss: 95, category: 'threshold' },

  // VO2max
  thirty_thirty_intervals: { name: '30/30 Intervals', duration: 60, tss: 85, category: 'vo2max' },
  five_by_four_vo2: { name: '5x4 VO2max', duration: 65, tss: 95, category: 'vo2max' },
  four_by_eight_vo2: { name: '4x8 VO2max', duration: 75, tss: 105, category: 'vo2max' },
  bossi_intervals: { name: 'Bossi Intervals', duration: 65, tss: 100, category: 'vo2max' },
  polarized_intensity_day: { name: 'Polarized Intensity Day', duration: 90, tss: 110, category: 'vo2max' },

  // Climbing
  hill_repeats: { name: 'Hill Repeats', duration: 70, tss: 80, category: 'climbing' },

  // Race Prep
  sprint_intervals: { name: 'Sprint Intervals', duration: 75, tss: 70, category: 'sprint' },
  race_simulation: { name: 'Race Simulation', duration: 90, tss: 105, category: 'race_prep' },
};

// Workout patterns by methodology
const METHODOLOGY_PATTERNS = {
  polarized: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'endurance', workout: 'endurance_base_build' },
      3: { type: 'vo2max', workout: 'five_by_four_vo2' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'endurance', workout: 'polarized_long_ride' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'recovery_spin' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'easy_recovery_ride' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'endurance', workout: 'endurance_base_build' },
      3: { type: 'vo2max', workout: 'four_by_eight_vo2' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'vo2max', workout: 'bossi_intervals' },
      6: { type: 'endurance', workout: 'long_endurance_ride' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'vo2max', workout: 'five_by_four_vo2' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'race_prep', workout: 'race_simulation' },
      6: { type: 'endurance', workout: 'endurance_base_build' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'vo2max', workout: 'thirty_thirty_intervals' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
  },
  sweet_spot: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'sweet_spot', workout: 'traditional_sst' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'sweet_spot', workout: 'four_by_twelve_sst' },
      6: { type: 'endurance', workout: 'endurance_base_build' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'recovery_spin' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'easy_recovery_ride' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'sweet_spot', workout: 'sweet_spot_progression' },
      3: { type: 'endurance', workout: 'endurance_base_build' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'threshold', workout: 'two_by_twenty_ftp' },
      6: { type: 'endurance', workout: 'long_endurance_ride' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'threshold', workout: 'over_under_intervals' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'vo2max', workout: 'five_by_four_vo2' },
      6: { type: 'endurance', workout: 'endurance_base_build' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'sweet_spot', workout: 'three_by_ten_sst' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
  },
  threshold: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'threshold', workout: 'two_by_twenty_ftp' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'tempo', workout: 'progressive_tempo' },
      6: { type: 'endurance', workout: 'endurance_base_build' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'recovery_spin' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'easy_recovery_ride' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'threshold', workout: 'over_under_intervals' },
      3: { type: 'endurance', workout: 'endurance_base_build' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'threshold', workout: 'three_by_twelve_threshold' },
      6: { type: 'endurance', workout: 'long_endurance_ride' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'vo2max', workout: 'five_by_four_vo2' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'threshold', workout: 'two_by_twenty_ftp' },
      6: { type: 'endurance', workout: 'endurance_base_build' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'threshold', workout: 'two_by_twenty_ftp' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
  },
  pyramidal: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'endurance', workout: 'endurance_base_build' },
      3: { type: 'tempo', workout: 'two_by_twenty_tempo' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'endurance', workout: 'long_endurance_ride' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'recovery_spin' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'easy_recovery_ride' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'tempo', workout: 'two_by_twenty_tempo' },
      3: { type: 'endurance', workout: 'endurance_base_build' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'sweet_spot', workout: 'traditional_sst' },
      6: { type: 'endurance', workout: 'polarized_long_ride' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'sweet_spot', workout: 'four_by_twelve_sst' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'vo2max', workout: 'five_by_four_vo2' },
      6: { type: 'endurance', workout: 'endurance_base_build' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'tempo', workout: 'tempo_ride' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
  },
  endurance: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'endurance', workout: 'foundation_miles' },
      3: { type: 'endurance', workout: 'endurance_base_build' },
      4: { type: 'rest', workout: null },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'endurance', workout: 'long_endurance_ride' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'recovery_spin' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'rest', workout: null },
      5: { type: 'recovery', workout: 'easy_recovery_ride' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'easy_recovery_ride' },
      2: { type: 'endurance', workout: 'endurance_base_build' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'endurance_base_build' },
      6: { type: 'endurance', workout: 'polarized_long_ride' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'tempo', workout: 'tempo_ride' },
      3: { type: 'endurance', workout: 'foundation_miles' },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'endurance_base_build' },
      6: { type: 'endurance', workout: 'long_endurance_ride' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'recovery_spin' },
      2: { type: 'endurance', workout: 'foundation_miles' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'recovery_spin' },
      5: { type: 'endurance', workout: 'foundation_miles' },
      6: { type: 'rest', workout: null },
    },
  },
};

// Helper to add days to a date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Helper to format date as YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Resolve relative date strings like 'next_monday'
function resolveStartDate(dateStr) {
  if (!dateStr) return new Date();

  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay();

  if (dateStr === 'next_monday') {
    const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
    return addDays(today, daysUntilMonday);
  }

  if (dateStr === 'today') {
    return today;
  }

  if (dateStr === 'tomorrow') {
    return addDays(today, 1);
  }

  // Default to next Monday
  const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
  return addDays(today, daysUntilMonday);
}

// Determine training phase based on week number and total weeks
function getPhase(weekNum, totalWeeks, hasTargetEvent) {
  if (!hasTargetEvent) {
    // No target event - simple 3:1 periodization
    if (weekNum % 4 === 0) return 'recovery';
    return 'regular';
  }

  // With target event - periodize to peak for event
  const progress = weekNum / totalWeeks;

  if (progress <= 0.3) return 'regular';      // Base phase (first 30%)
  if (progress <= 0.6) return 'build';        // Build phase (30-60%)
  if (progress <= 0.85) return 'peak';        // Peak phase (60-85%)
  return 'taper';                              // Taper phase (last 15%)
}

// Generate a complete training plan
export function generateTrainingPlan(params) {
  const {
    name,
    duration_weeks,
    methodology = 'sweet_spot',
    goal = 'general_fitness',
    start_date,
    target_event_date,
    weekly_hours,
    include_rest_weeks = true,
    notes = '',
  } = params;

  const startDate = resolveStartDate(start_date);
  const hasTargetEvent = !!target_event_date;

  // Get methodology patterns
  const patterns = METHODOLOGY_PATTERNS[methodology] || METHODOLOGY_PATTERNS.sweet_spot;

  // Generate workouts for each day
  const workouts = [];
  let totalTSS = 0;
  let totalDuration = 0;

  // Phase summaries for preview
  const phases = [];
  let currentPhase = null;
  let phaseStartWeek = 1;

  for (let week = 1; week <= duration_weeks; week++) {
    // Determine phase for this week
    let phase = getPhase(week, duration_weeks, hasTargetEvent);

    // Insert recovery weeks every 4th week if enabled
    if (include_rest_weeks && week % 4 === 0 && phase !== 'taper') {
      phase = 'recovery';
    }

    // Track phases for summary
    if (phase !== currentPhase) {
      if (currentPhase !== null) {
        phases.push({
          phase: currentPhase,
          weeks: [phaseStartWeek, week - 1],
        });
      }
      currentPhase = phase;
      phaseStartWeek = week;
    }

    const weekPattern = patterns[phase] || patterns.regular;
    let weekTSS = 0;
    let weekDuration = 0;

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const dayPlan = weekPattern[dayOfWeek];
      const workoutDate = addDays(startDate, (week - 1) * 7 + dayOfWeek);
      const workoutInfo = dayPlan.workout ? WORKOUT_LIBRARY[dayPlan.workout] : null;

      workouts.push({
        week_number: week,
        day_of_week: dayOfWeek,
        scheduled_date: formatDate(workoutDate),
        workout_type: dayPlan.type || 'rest',
        workout_id: dayPlan.workout,
        name: workoutInfo?.name || (dayPlan.type === 'rest' ? 'Rest Day' : 'Workout'),
        duration_minutes: workoutInfo?.duration || 0,
        target_tss: workoutInfo?.tss || 0,
        phase: phase,
      });

      if (workoutInfo) {
        weekTSS += workoutInfo.tss;
        weekDuration += workoutInfo.duration;
      }
    }

    totalTSS += weekTSS;
    totalDuration += weekDuration;
  }

  // Add final phase
  if (currentPhase !== null) {
    phases.push({
      phase: currentPhase,
      weeks: [phaseStartWeek, duration_weeks],
    });
  }

  // Calculate end date
  const endDate = addDays(startDate, duration_weeks * 7 - 1);

  // Count workouts by type
  const workoutCounts = workouts.reduce((acc, w) => {
    if (w.workout_type !== 'rest') {
      acc[w.workout_type] = (acc[w.workout_type] || 0) + 1;
    }
    return acc;
  }, {});

  // Calculate average weekly stats
  const avgWeeklyTSS = Math.round(totalTSS / duration_weeks);
  const avgWeeklyHours = Math.round(totalDuration / duration_weeks / 60 * 10) / 10;

  return {
    // Plan metadata
    name,
    duration_weeks,
    methodology,
    goal,
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    target_event_date: target_event_date || null,
    notes,

    // Summary stats
    summary: {
      total_workouts: workouts.filter(w => w.workout_type !== 'rest').length,
      total_tss: totalTSS,
      total_hours: Math.round(totalDuration / 60 * 10) / 10,
      avg_weekly_tss: avgWeeklyTSS,
      avg_weekly_hours: avgWeeklyHours,
      workout_counts: workoutCounts,
    },

    // Phases breakdown
    phases: phases.map(p => ({
      phase: p.phase,
      weeks: p.weeks[0] === p.weeks[1] ? `Week ${p.weeks[0]}` : `Weeks ${p.weeks[0]}-${p.weeks[1]}`,
      description: getPhaseDescription(p.phase),
    })),

    // All workouts
    workouts,
  };
}

// Get human-readable phase description
function getPhaseDescription(phase) {
  const descriptions = {
    regular: 'Building aerobic base and establishing training consistency',
    recovery: 'Reduced volume to allow adaptation and prevent overtraining',
    build: 'Increasing intensity and race-specific work',
    peak: 'High intensity with race simulation efforts',
    taper: 'Reduced volume while maintaining intensity for peak performance',
  };
  return descriptions[phase] || 'Training phase';
}

export default { generateTrainingPlan };
