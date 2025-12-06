/**
 * Comprehensive Cycling Workout Library
 * Based on 2024-2025 research and proven training methodologies
 *
 * Sources:
 * - Polarized Training research (2024-2025 peer-reviewed studies)
 * - CTS (Carmichael Training Systems) Key Workouts
 * - Pyramidal training methodology (2024 meta-analysis)
 * - VO2max research (30/30, 40/20, Billat intervals)
 * - Sweet Spot Base protocols
 * - Classic Coggan power zones
 */

export const WORKOUT_LIBRARY = {
  // ============================================================
  // RECOVERY & ACTIVE RECOVERY (Zone 1)
  // ============================================================
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
    coachNotes: 'Keep power under 55% FTP. This should feel almost effortless. Purpose is recovery, not training stress.'
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
    coachNotes: 'Ideal for day after hard training. Promotes blood flow and aids recovery without adding stress.'
  },

  // ============================================================
  // ENDURANCE / BASE BUILDING (Zone 2)
  // ============================================================
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
    coachNotes: 'The foundation of endurance training. Should be conversational pace. Builds mitochondrial density and fat oxidation.'
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

  endurance_with_bursts: {
    id: 'endurance_with_bursts',
    name: 'Endurance with Neuromuscular Bursts',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 85,
    targetTSS: 70,
    intensityFactor: 0.68,
    description: 'Zone 2 endurance ride with periodic 15-second bursts for neuromuscular activation.',
    focusArea: 'mixed',
    tags: ['endurance', 'z2', 'bursts', 'neuromuscular'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: 1, powerPctFTP: 55 },
      main: [
        {
          type: 'repeat',
          sets: 10,
          work: { duration: 0.25, zone: 7, powerPctFTP: 200, description: '15sec burst' },
          rest: { duration: 5.75, zone: 2, powerPctFTP: 65, description: 'Easy Zone 2' }
        }
      ],
      cooldown: { duration: 15, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Maintains neuromuscular power during base phase. Bursts should be high cadence (110+ rpm), not max effort.'
  },

  // ============================================================
  // TEMPO / ZONE 3 (76-90% FTP)
  // ============================================================
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
    coachNotes: 'Should feel "moderately hard." Good for building aerobic power without threshold fatigue.'
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
        {
          type: 'repeat',
          sets: 2,
          work: { duration: 20, zone: 3, powerPctFTP: 85, description: '20min tempo' },
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Easy recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Classic workout for building aerobic power. Maintain consistent power throughout each interval.'
  },

  tempo_bursts: {
    id: 'tempo_bursts',
    name: 'Tempo Bursts',
    category: 'tempo',
    difficulty: 'advanced',
    duration: 75,
    targetTSS: 95,
    intensityFactor: 0.90,
    description: 'Tempo intervals with 5-second sprints. Simulates race dynamics.',
    focusArea: 'mixed',
    tags: ['tempo', 'threshold', 'sprints', 'race-simulation'],
    terrainType: 'rolling',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        {
          type: 'repeat',
          sets: 3,
          work: [
            {
              type: 'repeat',
              sets: 4,
              work: [
                { duration: 2, zone: 3, powerPctFTP: 90, description: 'Tempo' },
                { duration: 0.08, zone: 7, powerPctFTP: 250, description: '5sec sprint' }
              ],
              rest: { duration: 0, zone: null }
            }
          ],
          rest: { duration: 4, zone: 1, powerPctFTP: 50, description: 'Recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Advanced workout combining threshold with neuromuscular power. Simulates race surges.'
  },

  // ============================================================
  // SWEET SPOT (88-94% FTP)
  // ============================================================
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
    coachNotes: 'Most time-efficient training zone. Builds FTP without excessive fatigue. Maintain steady power.'
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
        {
          type: 'repeat',
          sets: 3,
          work: { duration: 10, zone: 3.5, powerPctFTP: 90, description: 'Sweet Spot' },
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Easy recovery' }
        }
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
        {
          type: 'repeat',
          sets: 4,
          work: { duration: 12, zone: 3.5, powerPctFTP: 90, description: 'Sweet Spot' },
          rest: { duration: 3, zone: 1, powerPctFTP: 50, description: 'Short recovery' }
        }
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
        { duration: 20, zone: 3.5, powerPctFTP: 90, description: '20min SST' },
        { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
        { duration: 15, zone: 3.5, powerPctFTP: 91, description: '15min SST' },
        { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
        { duration: 10, zone: 3.5, powerPctFTP: 92, description: '10min SST' }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Descending duration with slight power increase. Tests mental toughness and pacing.'
  },

  // ============================================================
  // THRESHOLD / FTP (95-105% FTP)
  // ============================================================
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
        {
          type: 'repeat',
          sets: 2,
          work: { duration: 20, zone: 4, powerPctFTP: 100, description: '20min at FTP' },
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Easy recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'The classic FTP builder. Should feel hard but sustainable. If you can\'t complete both intervals, FTP may be too high.'
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
        {
          type: 'repeat',
          sets: 3,
          work: [
            {
              type: 'repeat',
              sets: 5,
              work: [
                { duration: 2, zone: 4, powerPctFTP: 95, description: 'Under FTP' },
                { duration: 1, zone: 4, powerPctFTP: 105, description: 'Over FTP' }
              ],
              rest: { duration: 0, zone: null }
            }
          ],
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Teaches body to clear lactate while maintaining threshold power. Key workout for racing.'
  },

  threshold_pyramid: {
    id: 'threshold_pyramid',
    name: 'Threshold Pyramid',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 70,
    targetTSS: 105,
    intensityFactor: 0.98,
    description: 'Descending pyramid: 20min + 10min + 5min at 98% FTP.',
    focusArea: 'threshold',
    tags: ['threshold', 'ftp', 'pyramid', 'lactate-threshold'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        { duration: 20, zone: 4, powerPctFTP: 98, description: '20min threshold' },
        { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
        { duration: 10, zone: 4, powerPctFTP: 98, description: '10min threshold' },
        { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
        { duration: 5, zone: 4, powerPctFTP: 98, description: '5min threshold' }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Descending intervals feel mentally easier. Great for building threshold confidence.'
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
        {
          type: 'repeat',
          sets: 3,
          work: { duration: 12, zone: 4, powerPctFTP: 98, description: '12min threshold' },
          rest: { duration: 4, zone: 1, powerPctFTP: 50, description: 'Recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Alternative to 2x20 with slightly shorter intervals. Good progression workout.'
  },

  // ============================================================
  // VO2 MAX (106-120% FTP)
  // ============================================================
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
        {
          type: 'repeat',
          sets: 3,
          work: [
            {
              type: 'repeat',
              sets: 8,
              work: [
                { duration: 0.5, zone: 5, powerPctFTP: 130, description: '30sec hard' },
                { duration: 0.5, zone: 2, powerPctFTP: 60, description: '30sec easy' }
              ],
              rest: { duration: 0, zone: null }
            }
          ],
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery between sets' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Based on 2025 research. Maximizes time at VO2max. Keep the "hard" efforts truly hard!'
  },

  forty_twenty_intervals: {
    id: 'forty_twenty_intervals',
    name: '40/20 Intervals',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 55,
    targetTSS: 80,
    intensityFactor: 0.93,
    description: '40 seconds on, 20 seconds off. High-intensity VO2max work.',
    focusArea: 'vo2max',
    tags: ['vo2max', '40-20', 'intervals', 'high-intensity'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        {
          type: 'repeat',
          sets: 3,
          work: [
            {
              type: 'repeat',
              sets: 6,
              work: [
                { duration: 0.67, zone: 5, powerPctFTP: 125, description: '40sec hard' },
                { duration: 0.33, zone: 2, powerPctFTP: 55, description: '20sec easy' }
              ],
              rest: { duration: 0, zone: null }
            }
          ],
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery between sets' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Harder than 30/30 with less recovery. Great for building VO2max quickly.'
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
        {
          type: 'repeat',
          sets: 5,
          work: { duration: 4, zone: 5, powerPctFTP: 115, description: '4min VO2' },
          rest: { duration: 4, zone: 1, powerPctFTP: 50, description: 'Easy recovery' }
        }
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
        {
          type: 'repeat',
          sets: 4,
          work: { duration: 8, zone: 5, powerPctFTP: 110, description: '8min VO2' },
          rest: { duration: 4, zone: 1, powerPctFTP: 50, description: 'Recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: '2025 research shows 4x8 intervals are optimal for VO2max gains. Slightly lower power than shorter intervals.'
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
        {
          type: 'repeat',
          sets: 5,
          work: [
            { duration: 0.5, zone: 5, powerPctFTP: 120, description: '30sec surge' },
            { duration: 1, zone: 4, powerPctFTP: 95, description: '1min threshold' },
            { duration: 0.5, zone: 5, powerPctFTP: 120, description: '30sec surge' },
            { duration: 1, zone: 4, powerPctFTP: 95, description: '1min threshold' },
            { duration: 0.5, zone: 5, powerPctFTP: 120, description: '30sec surge' },
            { duration: 1.5, zone: 4, powerPctFTP: 95, description: '90sec threshold' }
          ],
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Advanced VO2max workout. Surges cause faster ramp to VO2max. More time above 90% VO2max than traditional intervals.'
  },

  // ============================================================
  // CLIMBING / HILL REPEATS
  // ============================================================
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
        {
          type: 'repeat',
          sets: 6,
          work: { duration: 3, zone: 4, powerPctFTP: 95, cadence: '60-70', description: '3min climb' },
          rest: { duration: 3, zone: 1, powerPctFTP: 50, description: 'Easy descent/recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Best done on actual climbs. Low cadence (60-70rpm) builds climbing-specific strength.'
  },

  climbing_repeats_long: {
    id: 'climbing_repeats_long',
    name: 'Long Climbing Repeats',
    category: 'climbing',
    difficulty: 'advanced',
    duration: 85,
    targetTSS: 90,
    intensityFactor: 0.90,
    description: '6x5-minute climbing intervals at 95% FTP with low cadence.',
    focusArea: 'muscular_endurance',
    tags: ['climbing', 'hill-repeats', 'threshold', 'low-cadence'],
    terrainType: 'hilly',
    structure: {
      warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
      main: [
        {
          type: 'repeat',
          sets: 6,
          work: { duration: 5, zone: 4, powerPctFTP: 95, cadence: '65', description: '5min climb' },
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Low cadence (65rpm) builds climbing-specific muscular endurance. Great for gran fondos.'
  },

  // ============================================================
  // ANAEROBIC / SPRINT WORKOUTS
  // ============================================================
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
        {
          type: 'repeat',
          sets: 10,
          work: { duration: 0.5, zone: 7, powerPctFTP: 300, description: '30sec max sprint' },
          rest: { duration: 4.5, zone: 1, powerPctFTP: 50, description: 'Full recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Builds neuromuscular power. Each sprint should be MAX effort. Full recovery between sprints.'
  },

  // ============================================================
  // POLARIZED TRAINING WORKOUTS
  // ============================================================
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
    coachNotes: 'Core of polarized training (80% low intensity). Stay disciplined in Zone 2 - no surges!'
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
        {
          type: 'repeat',
          sets: 4,
          work: { duration: 8, zone: 5, powerPctFTP: 110, description: '8min VO2' },
          rest: { duration: 4, zone: 1, powerPctFTP: 50, description: 'Easy recovery' }
        }
      ],
      cooldown: { duration: 20, zone: 2, powerPctFTP: 65 }
    },
    coachNotes: 'The "hard day" in polarized training (20% high intensity). Go HARD on intervals, stay easy on recovery.'
  },

  // ============================================================
  // RACE SIMULATION / MIXED WORKOUTS
  // ============================================================
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
        { duration: 20, zone: 3, powerPctFTP: 85, description: 'Tempo pace' },
        { duration: 5, zone: 4, powerPctFTP: 100, description: 'Attack!' },
        { duration: 5, zone: 2, powerPctFTP: 70, description: 'Recover in group' },
        {
          type: 'repeat',
          sets: 4,
          work: [
            { duration: 1, zone: 5, powerPctFTP: 120, description: 'Surge' },
            { duration: 4, zone: 3, powerPctFTP: 85, description: 'Settle' }
          ],
          rest: { duration: 0, zone: null }
        },
        { duration: 10, zone: 4, powerPctFTP: 100, description: 'Chase effort' }
      ],
      cooldown: { duration: 15, zone: 1, powerPctFTP: 50 }
    },
    coachNotes: 'Practices race efforts: tempo, attacks, surges, and chases. Great pre-race workout.'
  }
};

// ============================================================
// TRAINING METHODOLOGIES
// ============================================================
export const TRAINING_METHODOLOGIES = {
  polarized: {
    name: 'Polarized Training',
    description: '80% low intensity (Zone 1-2), 20% high intensity (Zone 5+). Minimal time in tempo/threshold.',
    weeklyDistribution: {
      zone1_2: 0.80,  // 80% in Z1-Z2
      zone3_4: 0.05,  // 5% in Z3-Z4 (minimal)
      zone5_plus: 0.15 // 15% in Z5+
    },
    bestFor: ['endurance events', 'time-constrained athletes', 'recovery-focused'],
    researchBasis: '2024-2025 polarized training research, Norwegian endurance studies',
    sampleWeek: [
      { day: 'Monday', workout: 'polarized_long_ride' },
      { day: 'Tuesday', workout: 'easy_recovery_ride' },
      { day: 'Wednesday', workout: 'polarized_intensity_day' },
      { day: 'Thursday', workout: 'recovery_spin' },
      { day: 'Friday', workout: 'foundation_miles' },
      { day: 'Saturday', workout: 'long_endurance_ride' },
      { day: 'Sunday', workout: null } // Rest
    ]
  },

  sweet_spot_base: {
    name: 'Sweet Spot Base',
    description: 'Emphasizes 88-94% FTP work for time-efficient FTP gains.',
    weeklyDistribution: {
      zone1_2: 0.50,  // 50% in Z1-Z2
      zone3_sst: 0.35, // 35% in Z3-SST
      zone4_plus: 0.15 // 15% in Z4+
    },
    bestFor: ['FTP improvement', 'time-constrained athletes', 'century/gran fondo'],
    researchBasis: '2024-2025 sweet spot methodology: Time-efficient FTP gains, proven effective for sustained power development',
    sampleWeek: [
      { day: 'Monday', workout: 'recovery_spin' },
      { day: 'Tuesday', workout: 'traditional_sst' },
      { day: 'Wednesday', workout: 'endurance_base_build' },
      { day: 'Thursday', workout: 'three_by_ten_sst' },
      { day: 'Friday', workout: 'recovery_spin' },
      { day: 'Saturday', workout: 'long_endurance_ride' },
      { day: 'Sunday', workout: null } // Rest
    ]
  },

  pyramidal: {
    name: 'Pyramidal Training',
    description: 'Balanced approach: 67.5% low, 23.4% moderate, 9.1% high intensity. Proven effective for recreational cyclists.',
    weeklyDistribution: {
      zone1_2: 0.675,  // 67.5% in Z1-Z2
      zone3_4: 0.234,  // 23.4% in Z3-Z4
      zone5_plus: 0.091 // 9.1% in Z5+
    },
    bestFor: ['general fitness', 'varied events', 'sustainable long-term', 'recreational cyclists'],
    researchBasis: '2024 meta-analysis: Effective for recreational cyclists, balanced stress distribution for long-term sustainability',
    sampleWeek: [
      { day: 'Monday', workout: 'recovery_spin' },
      { day: 'Tuesday', workout: 'tempo_ride' },
      { day: 'Wednesday', workout: 'endurance_base_build' },
      { day: 'Thursday', workout: 'threshold_pyramid' },
      { day: 'Friday', workout: 'recovery_spin' },
      { day: 'Saturday', workout: 'long_endurance_ride' },
      { day: 'Sunday', workout: null } // Rest
    ]
  },

  threshold_focused: {
    name: 'Threshold-Focused',
    description: 'Classic FTP-building approach with frequent threshold intervals.',
    weeklyDistribution: {
      zone1_2: 0.60,  // 60% in Z1-Z2
      zone3_4: 0.30,  // 30% in Z3-Z4
      zone5_plus: 0.10 // 10% in Z5+
    },
    bestFor: ['road racing', 'time trials', 'FTP development'],
    researchBasis: 'Coggan/Allen power-based training methodology: Proven race-specific FTP development and lactate threshold improvement',
    sampleWeek: [
      { day: 'Monday', workout: 'recovery_spin' },
      { day: 'Tuesday', workout: 'over_under_intervals' },
      { day: 'Wednesday', workout: 'endurance_base_build' },
      { day: 'Thursday', workout: 'two_by_twenty_ftp' },
      { day: 'Friday', workout: 'recovery_spin' },
      { day: 'Saturday', workout: 'long_endurance_ride' },
      { day: 'Sunday', workout: null } // Rest
    ]
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get workouts by category
 */
export function getWorkoutsByCategory(category) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.category === category);
}

/**
 * Get workouts by difficulty
 */
export function getWorkoutsByDifficulty(difficulty) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.difficulty === difficulty);
}

/**
 * Get workouts by TSS range
 */
export function getWorkoutsByTSS(minTSS, maxTSS) {
  return Object.values(WORKOUT_LIBRARY).filter(
    w => w.targetTSS >= minTSS && w.targetTSS <= maxTSS
  );
}

/**
 * Get workouts by duration range (in minutes)
 */
export function getWorkoutsByDuration(minDuration, maxDuration) {
  return Object.values(WORKOUT_LIBRARY).filter(
    w => w.duration >= minDuration && w.duration <= maxDuration
  );
}

/**
 * Get a workout by its ID
 */
export function getWorkoutById(id) {
  return WORKOUT_LIBRARY[id] || null;
}

/**
 * Search workouts by tags
 */
export function searchWorkoutsByTag(tag) {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.tags.includes(tag));
}

/**
 * Get recommended workouts for training phase
 */
export function getWorkoutsForPhase(phase, fitnessLevel) {
  const phaseWorkouts = {
    base: ['recovery', 'endurance', 'tempo'],
    build: ['sweet_spot', 'tempo', 'threshold'],
    peak: ['threshold', 'vo2max', 'racing'],
    taper: ['recovery', 'endurance'],
    recovery: ['recovery']
  };

  const categories = phaseWorkouts[phase] || ['endurance'];

  return Object.values(WORKOUT_LIBRARY).filter(w =>
    categories.includes(w.category) &&
    (fitnessLevel ? w.difficulty === fitnessLevel || w.difficulty === 'beginner' : true)
  );
}

export default WORKOUT_LIBRARY;
