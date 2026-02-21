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

// Running workout library for plan generation
const RUNNING_WORKOUT_LIBRARY = {
  // Recovery
  run_recovery_jog: { name: 'Recovery Jog', duration: 25, tss: 20, category: 'recovery' },
  run_easy_recovery: { name: 'Easy Recovery Run', duration: 30, tss: 30, category: 'recovery' },

  // Easy / Aerobic
  run_easy_aerobic: { name: 'Easy Aerobic Run', duration: 40, tss: 45, category: 'endurance' },
  run_easy_long: { name: 'Easy Long Run', duration: 60, tss: 60, category: 'endurance' },
  run_long_run: { name: 'Long Run', duration: 90, tss: 100, category: 'endurance' },
  run_long_run_extended: { name: 'Extended Long Run', duration: 120, tss: 140, category: 'endurance' },

  // Tempo
  run_tempo_continuous: { name: 'Tempo Run', duration: 45, tss: 65, category: 'tempo' },
  run_tempo_cruise: { name: 'Cruise Intervals', duration: 50, tss: 70, category: 'tempo' },
  run_progression_run: { name: 'Progression Run', duration: 50, tss: 70, category: 'tempo' },

  // Threshold
  run_threshold_intervals: { name: 'Threshold Intervals', duration: 50, tss: 80, category: 'threshold' },
  run_threshold_continuous: { name: 'Continuous Threshold', duration: 45, tss: 75, category: 'threshold' },
  run_tempo_threshold_combo: { name: 'Tempo-Threshold Combo', duration: 55, tss: 80, category: 'threshold' },

  // VO2max
  run_vo2max_800s: { name: '800m Repeats', duration: 50, tss: 80, category: 'vo2max' },
  run_vo2max_1000s: { name: '1000m Repeats', duration: 50, tss: 80, category: 'vo2max' },
  run_vo2max_hills: { name: 'Hill Repeats', duration: 45, tss: 75, category: 'vo2max' },

  // Speed
  run_speed_200s: { name: '200m Strides', duration: 40, tss: 60, category: 'speed' },
  run_speed_400s: { name: '400m Repeats', duration: 45, tss: 65, category: 'speed' },

  // Race-specific
  run_race_pace_half: { name: 'Half Marathon Pace', duration: 60, tss: 90, category: 'race_pace' },
  run_race_pace_marathon: { name: 'Marathon Pace', duration: 90, tss: 110, category: 'race_pace' },

  // Strength (shared with cycling)
  cyclist_strength_foundation: { name: 'Strength Foundation', duration: 45, tss: 30, category: 'strength' },
  cyclist_core_stability: { name: 'Core Stability', duration: 30, tss: 15, category: 'core' },
};

// Running methodology patterns
const RUNNING_METHODOLOGY_PATTERNS = {
  polarized: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_easy_recovery' },
      2: { type: 'endurance', workout: 'run_easy_aerobic' },
      3: { type: 'vo2max', workout: 'run_vo2max_1000s' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'run_recovery_jog' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_easy_recovery' },
      5: { type: 'strength', workout: 'cyclist_core_stability' },
      6: { type: 'endurance', workout: 'run_easy_long' },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_easy_recovery' },
      2: { type: 'endurance', workout: 'run_easy_aerobic' },
      3: { type: 'vo2max', workout: 'run_vo2max_800s' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'threshold', workout: 'run_threshold_intervals' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_recovery_jog' },
      2: { type: 'vo2max', workout: 'run_vo2max_1000s' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'tempo', workout: 'run_tempo_continuous' },
      6: { type: 'endurance', workout: 'run_easy_long' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_recovery_jog' },
      2: { type: 'tempo', workout: 'run_tempo_continuous' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'rest', workout: null },
    },
  },
  pyramidal: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_easy_recovery' },
      2: { type: 'tempo', workout: 'run_tempo_continuous' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'run_recovery_jog' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_easy_recovery' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_easy_recovery' },
      2: { type: 'threshold', workout: 'run_threshold_intervals' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'tempo', workout: 'run_tempo_cruise' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_recovery_jog' },
      2: { type: 'vo2max', workout: 'run_vo2max_800s' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'threshold', workout: 'run_threshold_continuous' },
      6: { type: 'endurance', workout: 'run_easy_long' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_recovery_jog' },
      2: { type: 'tempo', workout: 'run_progression_run' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'rest', workout: null },
    },
  },
  // For running, endurance and sweet_spot methodologies both map to base-building
  endurance: {
    regular: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_easy_recovery' },
      2: { type: 'endurance', workout: 'run_easy_aerobic' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'strength', workout: 'cyclist_strength_foundation' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    recovery: {
      0: { type: 'rest', workout: null },
      1: { type: 'rest', workout: null },
      2: { type: 'recovery', workout: 'run_recovery_jog' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_easy_recovery' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'rest', workout: null },
    },
    build: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_easy_recovery' },
      2: { type: 'endurance', workout: 'run_easy_aerobic' },
      3: { type: 'tempo', workout: 'run_progression_run' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    peak: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_recovery_jog' },
      2: { type: 'tempo', workout: 'run_tempo_continuous' },
      3: { type: 'endurance', workout: 'run_easy_aerobic' },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'endurance', workout: 'run_long_run' },
    },
    taper: {
      0: { type: 'rest', workout: null },
      1: { type: 'recovery', workout: 'run_recovery_jog' },
      2: { type: 'endurance', workout: 'run_easy_aerobic' },
      3: { type: 'rest', workout: null },
      4: { type: 'recovery', workout: 'run_recovery_jog' },
      5: { type: 'endurance', workout: 'run_easy_aerobic' },
      6: { type: 'rest', workout: null },
    },
  },
};

// Map running methodologies: sweet_spot and threshold don't exist for running,
// fallback to pyramidal (balanced approach)
RUNNING_METHODOLOGY_PATTERNS.sweet_spot = RUNNING_METHODOLOGY_PATTERNS.pyramidal;
RUNNING_METHODOLOGY_PATTERNS.threshold = RUNNING_METHODOLOGY_PATTERNS.pyramidal;

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

// Redistribute workouts away from blocked days within each week.
// Swaps workout content between slots so dates/day_of_week stay consistent.
function redistributeForAvailability(workouts, availability) {
  if (!availability?.weeklyAvailability) return { workouts, redistributedCount: 0 };

  // Build a lookup: dayOfWeek -> status
  const dayStatus = {};
  for (const d of availability.weeklyAvailability) {
    dayStatus[d.dayOfWeek] = d.status;
  }

  const blockedDays = new Set(
    Object.entries(dayStatus)
      .filter(([, status]) => status === 'blocked')
      .map(([day]) => Number(day))
  );

  if (blockedDays.size === 0) return { workouts, redistributedCount: 0 };

  const preferredDays = new Set(
    Object.entries(dayStatus)
      .filter(([, status]) => status === 'preferred')
      .map(([day]) => Number(day))
  );

  const preferWeekendLong = availability.preferences?.preferWeekendLongRides
    ?? availability.preferences?.preferWeekendLongRuns
    ?? true;

  // Group workouts by week number
  const weekMap = new Map();
  for (const w of workouts) {
    if (!weekMap.has(w.week_number)) weekMap.set(w.week_number, []);
    weekMap.get(w.week_number).push(w);
  }

  let redistributedCount = 0;

  for (const [, weekWorkouts] of weekMap) {
    // Find real workouts on blocked days
    const onBlockedDays = weekWorkouts.filter(
      (w) => blockedDays.has(w.day_of_week) && w.workout_id && w.workout_type !== 'rest'
    );

    for (const blocked of onBlockedDays) {
      // Score candidate days to swap with
      let bestTarget = null;
      let bestScore = -Infinity;

      for (const candidate of weekWorkouts) {
        if (candidate === blocked) continue;
        if (blockedDays.has(candidate.day_of_week)) continue;

        // Only swap with rest days or lighter workouts
        const candidateHasWorkout = candidate.workout_id && candidate.workout_type !== 'rest';

        let score = 50;

        // Strongly prefer swapping into empty/rest slots
        if (!candidateHasWorkout) score += 25;
        else score -= 20; // Avoid doubling up

        // Bonus for preferred days
        if (preferredDays.has(candidate.day_of_week)) score += 15;

        // Weekend bonus for long rides
        if (preferWeekendLong && (candidate.day_of_week === 0 || candidate.day_of_week === 6)) {
          const isLong = blocked.duration_minutes >= 120 || blocked.workout_type === 'endurance';
          if (isLong) score += 10;
        }

        // Proximity bonus
        const dist = Math.min(
          Math.abs(candidate.day_of_week - blocked.day_of_week),
          7 - Math.abs(candidate.day_of_week - blocked.day_of_week)
        );
        score -= dist * 3;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = candidate;
        }
      }

      if (bestTarget) {
        // Swap the workout content between the two slots, keeping dates fixed
        const savedWorkout = {
          workout_type: blocked.workout_type,
          workout_id: blocked.workout_id,
          name: blocked.name,
          duration_minutes: blocked.duration_minutes,
          target_tss: blocked.target_tss,
          phase: blocked.phase,
        };

        blocked.workout_type = bestTarget.workout_type;
        blocked.workout_id = bestTarget.workout_id;
        blocked.name = bestTarget.name;
        blocked.duration_minutes = bestTarget.duration_minutes;
        blocked.target_tss = bestTarget.target_tss;
        blocked.phase = bestTarget.phase;

        bestTarget.workout_type = savedWorkout.workout_type;
        bestTarget.workout_id = savedWorkout.workout_id;
        bestTarget.name = savedWorkout.name;
        bestTarget.duration_minutes = savedWorkout.duration_minutes;
        bestTarget.target_tss = savedWorkout.target_tss;
        bestTarget.phase = savedWorkout.phase;

        redistributedCount++;
      }
    }
  }

  return { workouts, redistributedCount };
}

// Generate a complete training plan
export function generateTrainingPlan(params) {
  const {
    name,
    duration_weeks,
    methodology = 'sweet_spot',
    goal = 'general_fitness',
    sport_type = 'cycling',
    start_date,
    target_event_date,
    weekly_hours,
    include_rest_weeks = true,
    notes = '',
    userAvailability = null,
  } = params;

  const isRunning = sport_type === 'running';
  const startDate = resolveStartDate(start_date);
  const hasTargetEvent = !!target_event_date;

  // Get methodology patterns based on sport type
  const allPatterns = isRunning ? RUNNING_METHODOLOGY_PATTERNS : METHODOLOGY_PATTERNS;
  const defaultMethodology = isRunning ? 'polarized' : 'sweet_spot';
  const patterns = allPatterns[methodology] || allPatterns[defaultMethodology];

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
      const workoutLib = isRunning ? RUNNING_WORKOUT_LIBRARY : WORKOUT_LIBRARY;
      // Check both libraries in case of shared workouts (strength/core)
      const workoutInfo = dayPlan.workout ? (workoutLib[dayPlan.workout] || WORKOUT_LIBRARY[dayPlan.workout] || RUNNING_WORKOUT_LIBRARY[dayPlan.workout]) : null;

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

  // Apply schedule-aware redistribution if availability data provided
  const { redistributedCount } = redistributeForAvailability(workouts, userAvailability);

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
    sport_type,
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

    // Schedule adjustment info
    redistributedCount,
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
