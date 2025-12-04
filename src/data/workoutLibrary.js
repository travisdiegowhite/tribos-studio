/**
 * Comprehensive Cycling Workout Library
 * Based on 2024-2025 research and proven training methodologies
 */

export const WORKOUT_LIBRARY = {
  // RECOVERY & ACTIVE RECOVERY (Zone 1)
  recovery_spin: {
    id: 'recovery_spin',
    name: 'Recovery Spin',
    category: 'recovery',
    difficulty: 'beginner',
    duration: 30,
    targetTSS: 20,
    intensityFactor: 0.40,
    description: 'Easy spinning for active recovery. Focus on smooth pedaling and recovery.',
    focusArea: 'recovery',
    tags: ['recovery', 'z1', 'easy', 'active-recovery'],
    terrainType: 'flat',
    structure: {
      warmup: null,
      main: [
        { duration: 30, zone: 1, powerPctFTP: 45, cadence: '85-95', description: 'Easy spin' }
      ],
      cooldown: null
    },
    coachNotes: 'Keep power under 55% FTP. This should feel almost effortless.'
  },

  easy_recovery_ride: {
    id: 'easy_recovery_ride',
    name: 'Easy Recovery Ride',
    category: 'recovery',
    difficulty: 'beginner',
    duration: 45,
    targetTSS: 30,
    intensityFactor: 0.45,
    description: 'Extended recovery ride with easy Zone 1-2 effort.',
    focusArea: 'recovery',
    tags: ['recovery', 'z1', 'z2', 'easy'],
    terrainType: 'flat',
    structure: {
      warmup: null,
      main: [
        { duration: 45, zone: 1, powerPctFTP: 50, cadence: '85-95', description: 'Easy endurance pace' }
      ],
      cooldown: null
    },
    coachNotes: 'Ideal for day after hard training. Promotes blood flow without adding stress.'
  },

  // ENDURANCE / BASE BUILDING (Zone 2)
  foundation_miles: {
    id: 'foundation_miles',
    name: 'Foundation Miles',
    category: 'endurance',
    difficulty: 'beginner',
    duration: 60,
    targetTSS: 55,
    intensityFactor: 0.65,
    description: 'Classic Zone 2 endurance ride for aerobic base building.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'base', 'aerobic'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: 1, powerPctFTP: 50 },
      main: [
        { duration: 45, zone: 2, powerPctFTP: 65, cadence: '85-95', description: 'Steady Zone 2' }
      ],
      cooldown: { duration: 5, zone: 1, powerPctFTP: 45 }
    },
    coachNotes: 'The foundation of endurance training. Should be conversational pace.'
  },

  endurance_base_build: {
    id: 'endurance_base_build',
    name: 'Endurance Base Build',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 90,
    targetTSS: 70,
    intensityFactor: 0.67,
    description: '90-minute Zone 2 ride for building aerobic capacity.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'base', 'long-ride'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 10, zone: 1, powerPctFTP: 55 },
      main: [
        { duration: 70, zone: 2, powerPctFTP: 68, cadence: '85-95', description: 'Steady endurance' }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Perfect midweek endurance ride. Builds aerobic engine without excessive fatigue.'
  },

  long_endurance_ride: {
    id: 'long_endurance_ride',
    name: 'Long Endurance Ride',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 180,
    targetTSS: 140,
    intensityFactor: 0.68,
    description: 'Classic 3-hour Zone 2 long ride for weekend training.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'long-ride', 'weekend'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 1, powerPctFTP: 55 },
      main: [
        { duration: 150, zone: 2, powerPctFTP: 68, cadence: '85-95', description: 'Steady long ride' }
      ],
      cooldown: { duration: 15, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Weekend long ride. Stay in Zone 2, resist urge to go harder. Bring nutrition!'
  },

  polarized_long_ride: {
    id: 'polarized_long_ride',
    name: 'Polarized Long Ride',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 240,
    targetTSS: 180,
    intensityFactor: 0.68,
    description: '4-hour Zone 2 endurance ride. Foundation of polarized training.',
    focusArea: 'aerobic_base',
    tags: ['polarized', 'endurance', 'z2', 'long-ride'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 1, powerPctFTP: 55 },
      main: [
        { duration: 210, zone: 2, powerPctFTP: 68, cadence: '85-95', description: 'Steady Zone 2' }
      ],
      cooldown: { duration: 15, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Core of polarized training (80% low intensity). Stay disciplined in Zone 2!'
  },

  // TEMPO / ZONE 3 (76-90% FTP)
  tempo_ride: {
    id: 'tempo_ride',
    name: 'Tempo Ride',
    category: 'tempo',
    difficulty: 'intermediate',
    duration: 60,
    targetTSS: 65,
    intensityFactor: 0.83,
    description: 'Sustained Zone 3 tempo effort. Moderately hard but sustainable.',
    focusArea: 'muscular_endurance',
    tags: ['tempo', 'z3', 'aerobic-power'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 60 },
      main: [
        { duration: 35, zone: 3, powerPctFTP: 83, cadence: '85-95', description: 'Steady tempo' }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Should feel "moderately hard." Good for building aerobic power.'
  },

  two_by_twenty_tempo: {
    id: 'two_by_twenty_tempo',
    name: '2x20 Tempo',
    category: 'tempo',
    difficulty: 'intermediate',
    duration: 75,
    targetTSS: 80,
    intensityFactor: 0.85,
    description: 'Classic 2x20-minute tempo intervals. Builds muscular endurance.',
    focusArea: 'muscular_endurance',
    tags: ['tempo', 'z3', 'intervals', '2x20'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 60 },
      main: [
        { type: 'repeat', sets: 2, work: { duration: 20, zone: 3, powerPctFTP: 85 }, rest: { duration: 5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Classic workout for building aerobic power. Maintain consistent power.'
  },

  // SWEET SPOT (88-94% FTP)
  traditional_sst: {
    id: 'traditional_sst',
    name: 'Traditional Sweet Spot',
    category: 'sweet_spot',
    difficulty: 'intermediate',
    duration: 65,
    targetTSS: 85,
    intensityFactor: 0.90,
    description: '45-minute sustained Sweet Spot effort. Classic SST workout.',
    focusArea: 'threshold',
    tags: ['sst', 'sweet-spot', 'threshold-building'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: 2, powerPctFTP: 65 },
      main: [
        { duration: 45, zone: 3.5, powerPctFTP: 90, cadence: '85-95', description: 'Sweet Spot' }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Most time-efficient training zone. Builds FTP without excessive fatigue.'
  },

  three_by_ten_sst: {
    id: 'three_by_ten_sst',
    name: '3x10 Sweet Spot',
    category: 'sweet_spot',
    difficulty: 'intermediate',
    duration: 60,
    targetTSS: 80,
    intensityFactor: 0.88,
    description: '3x10-minute Sweet Spot intervals with short recovery.',
    focusArea: 'threshold',
    tags: ['sst', 'sweet-spot', 'intervals'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 3, work: { duration: 10, zone: 3.5, powerPctFTP: 90 }, rest: { duration: 5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Great introduction to Sweet Spot training. Builds threshold power progressively.'
  },

  four_by_twelve_sst: {
    id: 'four_by_twelve_sst',
    name: '4x12 Sweet Spot',
    category: 'sweet_spot',
    difficulty: 'advanced',
    duration: 80,
    targetTSS: 95,
    intensityFactor: 0.90,
    description: '4x12-minute Sweet Spot intervals. High training stress.',
    focusArea: 'threshold',
    tags: ['sst', 'sweet-spot', 'intervals', 'high-volume'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 4, work: { duration: 12, zone: 3.5, powerPctFTP: 90 }, rest: { duration: 3, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Advanced SST workout with short recoveries. Great for building FTP resilience.'
  },

  sweet_spot_progression: {
    id: 'sweet_spot_progression',
    name: 'Sweet Spot Progression',
    category: 'sweet_spot',
    difficulty: 'advanced',
    duration: 90,
    targetTSS: 105,
    intensityFactor: 0.91,
    description: 'Progressive Sweet Spot intervals: 20min + 15min + 10min.',
    focusArea: 'threshold',
    tags: ['sst', 'sweet-spot', 'progression', 'pyramid'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { duration: 20, zone: 3.5, powerPctFTP: 90 },
        { duration: 5, zone: 1, powerPctFTP: 50 },
        { duration: 15, zone: 3.5, powerPctFTP: 91 },
        { duration: 5, zone: 1, powerPctFTP: 50 },
        { duration: 10, zone: 3.5, powerPctFTP: 92 }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Descending duration with slight power increase. Tests mental toughness.'
  },

  // THRESHOLD / FTP (95-105% FTP)
  two_by_twenty_ftp: {
    id: 'two_by_twenty_ftp',
    name: '2x20 at FTP',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 70,
    targetTSS: 90,
    intensityFactor: 0.95,
    description: 'Classic 2x20-minute intervals at FTP. The gold standard threshold workout.',
    focusArea: 'threshold',
    tags: ['threshold', 'ftp', '2x20', 'classic'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 2, work: { duration: 20, zone: 4, powerPctFTP: 100 }, rest: { duration: 5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'The classic FTP builder. Should feel hard but sustainable.'
  },

  over_under_intervals: {
    id: 'over_under_intervals',
    name: 'Over-Under Intervals',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 75,
    targetTSS: 100,
    intensityFactor: 0.98,
    description: 'Alternating efforts above and below FTP. Improves lactate clearance.',
    focusArea: 'threshold',
    tags: ['over-under', 'threshold', 'lactate-clearance', 'race-simulation'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 3, work: [
          { duration: 2, zone: 4, powerPctFTP: 95 },
          { duration: 1, zone: 4, powerPctFTP: 105 }
        ], rest: { duration: 5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Teaches body to clear lactate while maintaining threshold power.'
  },

  three_by_twelve_threshold: {
    id: 'three_by_twelve_threshold',
    name: '3x12 Threshold',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 75,
    targetTSS: 95,
    intensityFactor: 0.96,
    description: '3x12-minute threshold intervals. High-quality FTP work.',
    focusArea: 'threshold',
    tags: ['threshold', 'ftp', 'intervals'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 3, work: { duration: 12, zone: 4, powerPctFTP: 98 }, rest: { duration: 4, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Alternative to 2x20 with slightly shorter intervals.'
  },

  // VO2 MAX (106-120% FTP)
  thirty_thirty_intervals: {
    id: 'thirty_thirty_intervals',
    name: '30/30 Intervals',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 60,
    targetTSS: 85,
    intensityFactor: 0.95,
    description: '30 seconds hard, 30 seconds easy. Maximizes time at VO2max.',
    focusArea: 'vo2max',
    tags: ['vo2max', '30-30', 'intervals', 'high-intensity'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 3, work: [
          { type: 'repeat', sets: 8, work: [
            { duration: 0.5, zone: 5, powerPctFTP: 130 },
            { duration: 0.5, zone: 2, powerPctFTP: 60 }
          ] }
        ], rest: { duration: 5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Maximizes time at VO2max. Keep the hard efforts truly hard!'
  },

  five_by_four_vo2: {
    id: 'five_by_four_vo2',
    name: '5x4min VO2 Max',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 65,
    targetTSS: 95,
    intensityFactor: 0.98,
    description: 'Classic 5x4-minute VO2max intervals. Research-proven effective.',
    focusArea: 'vo2max',
    tags: ['vo2max', 'intervals', 'aerobic-capacity'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 5, work: { duration: 4, zone: 5, powerPctFTP: 115 }, rest: { duration: 4, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Classic VO2max interval format. Aim for consistent power across all intervals.'
  },

  four_by_eight_vo2: {
    id: 'four_by_eight_vo2',
    name: '4x8min VO2 Max',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 75,
    targetTSS: 105,
    intensityFactor: 1.00,
    description: 'Long VO2max intervals. Research shows these are highly effective.',
    focusArea: 'vo2max',
    tags: ['vo2max', 'intervals', 'long-intervals'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 4, work: { duration: 8, zone: 5, powerPctFTP: 110 }, rest: { duration: 4, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: '4x8 intervals are optimal for VO2max gains. Slightly lower power than shorter intervals.'
  },

  bossi_intervals: {
    id: 'bossi_intervals',
    name: 'Bossi Intervals (5x5)',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 65,
    targetTSS: 100,
    intensityFactor: 1.00,
    description: 'Surging VO2max intervals. Alternates between VO2max and threshold.',
    focusArea: 'vo2max',
    tags: ['vo2max', 'bossi', 'surges', 'advanced'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 5, work: [
          { duration: 0.5, zone: 5, powerPctFTP: 120 },
          { duration: 1, zone: 4, powerPctFTP: 95 },
          { duration: 0.5, zone: 5, powerPctFTP: 120 },
          { duration: 1, zone: 4, powerPctFTP: 95 },
          { duration: 0.5, zone: 5, powerPctFTP: 120 },
          { duration: 1.5, zone: 4, powerPctFTP: 95 }
        ], rest: { duration: 5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Advanced VO2max workout. Surges cause faster ramp to VO2max.'
  },

  polarized_intensity_day: {
    id: 'polarized_intensity_day',
    name: 'Polarized Intensity Day',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 90,
    targetTSS: 110,
    intensityFactor: 1.00,
    description: 'High-intensity polarized workout: 4x8min VO2max with long Z2 bookends.',
    focusArea: 'vo2max',
    tags: ['polarized', 'vo2max', 'high-intensity'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 20, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 4, work: { duration: 8, zone: 5, powerPctFTP: 110 }, rest: { duration: 4, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 20, zone: 2, powerPctFTP: 65 }
    },
    coachNotes: 'The "hard day" in polarized training. Go HARD on intervals, stay easy on recovery.'
  },

  // CLIMBING / HILL REPEATS
  hill_repeats: {
    id: 'hill_repeats',
    name: 'Hill Repeats',
    category: 'climbing',
    difficulty: 'advanced',
    duration: 70,
    targetTSS: 80,
    intensityFactor: 0.88,
    description: '6x3-minute hill repeats at threshold power.',
    focusArea: 'muscular_endurance',
    tags: ['climbing', 'hill-repeats', 'threshold'],
    terrainType: 'hilly',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 6, work: { duration: 3, zone: 4, powerPctFTP: 95, cadence: '60-70' }, rest: { duration: 3, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Best done on actual climbs. Low cadence (60-70rpm) builds climbing-specific strength.'
  },

  // SPRINT / ANAEROBIC
  sprint_intervals: {
    id: 'sprint_intervals',
    name: 'Sprint Intervals',
    category: 'anaerobic',
    difficulty: 'advanced',
    duration: 75,
    targetTSS: 70,
    intensityFactor: 0.75,
    description: '10x30-second max sprints with full recovery.',
    focusArea: 'anaerobic',
    tags: ['sprints', 'anaerobic', 'power', 'neuromuscular'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 20, zone: 2, powerPctFTP: 65 },
      main: [
        { type: 'repeat', sets: 10, work: { duration: 0.5, zone: 7, powerPctFTP: 300 }, rest: { duration: 4.5, zone: 1, powerPctFTP: 50 } }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Builds neuromuscular power. Each sprint should be MAX effort.'
  },

  // RACE SIMULATION
  race_simulation: {
    id: 'race_simulation',
    name: 'Race Simulation',
    category: 'racing',
    difficulty: 'advanced',
    duration: 90,
    targetTSS: 105,
    intensityFactor: 0.95,
    description: 'Simulates race dynamics with varied efforts and surges.',
    focusArea: 'mixed',
    tags: ['race-simulation', 'mixed', 'surges', 'racing'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { duration: 20, zone: 3, powerPctFTP: 85 },
        { duration: 5, zone: 4, powerPctFTP: 100 },
        { duration: 5, zone: 2, powerPctFTP: 70 },
        { type: 'repeat', sets: 4, work: [
          { duration: 1, zone: 5, powerPctFTP: 120 },
          { duration: 4, zone: 3, powerPctFTP: 85 }
        ] },
        { duration: 10, zone: 4, powerPctFTP: 100 }
      ],
      cooldown: { duration: 15, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Practices race efforts: tempo, attacks, surges, and chases.'
  }
};

// Helper functions
export function getWorkoutsByCategory(category) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.category === category);
}

export function getWorkoutsByDifficulty(difficulty) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.difficulty === difficulty);
}

export function getWorkoutsByTSS(minTSS, maxTSS) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.targetTSS >= minTSS && w.targetTSS <= maxTSS);
}

export function getWorkoutById(id) {
  return WORKOUT_LIBRARY[id];
}

export function searchWorkoutsByTag(tag) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.tags.includes(tag));
}

export default WORKOUT_LIBRARY;
