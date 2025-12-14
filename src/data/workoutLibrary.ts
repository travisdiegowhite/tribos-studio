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

import type {
  WorkoutDefinition,
  WorkoutLibrary as WorkoutLibraryType,
  WorkoutCategory,
  FitnessLevel,
  TrainingPhase,
  TrainingMethodologyDefinition,
} from '../types/training';

export const WORKOUT_LIBRARY: WorkoutLibraryType = {
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
    coachNotes: 'Most time-efficient training zone. Builds FTP without excessive fatigue. Maintain steady power.',
    exportable: true,
    exportFormats: ['zwo', 'mrc', 'json'],
    cyclingStructure: {
      totalDuration: 65,
      steps: [
        { name: 'Warmup', type: 'warmup', duration: 600, power: { type: 'percent_ftp', value: 65 }, cadence: { min: 85, max: 95 }, instructions: 'Easy spinning, gradually build power' },
        { name: 'Sweet Spot Block', type: 'work', duration: 2700, power: { type: 'percent_ftp', value: 90 }, cadence: { min: 85, max: 95 }, instructions: '45 minutes at Sweet Spot. Stay smooth and steady. This is hard but sustainable.' },
        { name: 'Cooldown', type: 'cooldown', duration: 600, power: { type: 'percent_ftp', value: 50 }, instructions: 'Easy spinning, let heart rate come down' }
      ],
      terrain: { type: 'flat', suggestedRoute: 'Find a flat road or path with minimal stops. Time trial bike or aero position recommended.' }
    }
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
    coachNotes: 'Great introduction to Sweet Spot training. Builds threshold power progressively.',
    exportable: true,
    exportFormats: ['zwo', 'mrc', 'json'],
    cyclingStructure: {
      totalDuration: 60,
      steps: [
        { name: 'Warmup', type: 'warmup', duration: 900, power: { type: 'percent_ftp', value: 65 }, cadence: { min: 85, max: 95 }, instructions: 'Easy spinning, include a few 30-second pickups to 90%' },
        {
          type: 'repeat',
          name: '3x10 Sweet Spot Intervals',
          iterations: 3,
          steps: [
            { name: 'Sweet Spot', type: 'work', duration: 600, power: { type: 'percent_ftp', value: 90 }, cadence: { min: 85, max: 95 }, instructions: '10 minutes at Sweet Spot. Steady effort, focus on smooth pedaling.' },
            { name: 'Recovery', type: 'recovery', duration: 300, power: { type: 'percent_ftp', value: 50 }, instructions: 'Easy spinning. Catch your breath but stay moving.' }
          ]
        },
        { name: 'Cooldown', type: 'cooldown', duration: 600, power: { type: 'percent_ftp', value: 50 }, instructions: 'Easy spinning' }
      ],
      terrain: { type: 'flat', suggestedRoute: 'Flat road or trainer. Minimal stops needed.' }
    }
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
  },

  // ============================================================
  // STRENGTH TRAINING (Off-Bike)
  // Based on research: Rønnestad, Stöggl, Louis et al.
  // ============================================================
  strength_anatomical_adaptation: {
    id: 'strength_anatomical_adaptation',
    name: 'Anatomical Adaptation Strength',
    category: 'strength',
    difficulty: 'beginner',
    duration: 45,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Foundation strength phase: high reps, low weight to prepare tissues and learn movement patterns.',
    focusArea: 'strength',
    tags: ['strength', 'off-bike', 'gym', 'foundation', 'beginner'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: null, description: '5min cardio + dynamic stretches' },
      main: [
        { duration: 30, zone: null, description: 'Goblet Squat: 3x15 | Single-Leg Press: 3x12 each | Romanian Deadlift: 3x15 | Lunges: 3x12 each | Glute Bridge: 3x15 | Calf Raises: 3x15' }
      ],
      cooldown: { duration: 5, zone: null, description: 'Light stretching' }
    },
    coachNotes: 'Phase 1 (weeks 1-4): 20-30 reps, 2-3 sets, 60-90s rest. Focus on form, not weight. 2-3x/week.',
    exercises: {
      warmup: {
        duration: 10,
        description: '5 minutes light cardio followed by dynamic stretches',
        exercises: [
          { name: 'Light Cardio', duration: 300, equipment: ['none'], muscleGroups: ['full_body'], instructions: 'Walk briskly, light jog, or use rowing machine. Get heart rate up and blood flowing to muscles.' },
          { name: 'Leg Swings', duration: 60, sides: 'left_then_right', reps: 10, equipment: ['none'], muscleGroups: ['hip_flexors', 'hamstrings'], instructions: 'Hold wall for balance. Swing leg forward and back in controlled motion, gradually increasing range.' },
          { name: 'Hip Circles', duration: 60, sides: 'left_then_right', reps: 10, equipment: ['none'], muscleGroups: ['hip_flexors', 'glutes'], instructions: 'Stand on one leg, draw large circles with knee of other leg. 10 clockwise, 10 counter-clockwise each side.' },
          { name: 'Bodyweight Squats', duration: 60, reps: 10, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Slow controlled squats to warm up movement pattern. Focus on depth and keeping heels down.' }
        ]
      },
      main: [
        { name: 'Goblet Squat', sets: 3, reps: 15, weight: 'light dumbbell or kettlebell', restSeconds: 60, equipment: ['dumbbells', 'kettlebell'], muscleGroups: ['quadriceps', 'glutes', 'core'], instructions: 'Hold weight at chest with elbows tucked. Feet shoulder-width, toes slightly out. Squat deep, keeping chest up and heels down. Drive through whole foot to stand.', alternatives: ['Bodyweight Squat', 'TRX Squat'] },
        { name: 'Single-Leg Press', sets: 3, reps: '12 each leg', weight: 'light (30-40% normal)', restSeconds: 60, equipment: ['cable_machine'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Use leg press machine with one leg. Keep non-working foot on floor. Press through heel, don\'t lock knee at top. Lower slowly with control.', alternatives: ['Step-Ups to Low Box'] },
        { name: 'Romanian Deadlift', sets: 3, reps: 15, weight: 'light dumbbells or barbell', restSeconds: 60, tempo: '3-0-1', equipment: ['barbell', 'dumbbells'], muscleGroups: ['hamstrings', 'glutes', 'lower_back'], instructions: 'Stand with soft knees. Hinge at hips, pushing butt back. Lower weight along thighs until hamstring stretch. Keep back flat, core braced. Squeeze glutes to return.', alternatives: ['Kettlebell Deadlift'] },
        { name: 'Walking Lunges', sets: 3, reps: '12 each leg', weight: 'bodyweight', restSeconds: 60, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes', 'hip_flexors'], instructions: 'Step forward into lunge, back knee nearly touching ground. Front knee tracks over toes. Push through front heel to step forward into next lunge. Keep torso upright.', alternatives: ['Static Lunges', 'Reverse Lunges'] },
        { name: 'Glute Bridge', sets: 3, reps: 15, weight: 'bodyweight', restSeconds: 45, equipment: ['yoga_mat'], muscleGroups: ['glutes', 'hamstrings', 'core'], instructions: 'Lie on back, knees bent, feet flat on floor hip-width. Press through heels, squeeze glutes to lift hips until body is straight from shoulders to knees. Hold 1 second at top, lower slowly.', alternatives: ['Hip Thrust off Bench'] },
        { name: 'Standing Calf Raises', sets: 3, reps: 15, weight: 'bodyweight or light dumbbells', restSeconds: 45, equipment: ['none'], muscleGroups: ['calves'], instructions: 'Stand on edge of step or flat ground. Rise onto balls of feet, squeezing calves at top. Lower slowly until heels are below toes (if on step) for full stretch. Control the movement.', alternatives: ['Seated Calf Raises'] }
      ],
      cooldown: {
        duration: 5,
        description: 'Light static stretching for worked muscles',
        exercises: [
          { name: 'Quad Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['quadriceps'], instructions: 'Stand on one leg, pull opposite heel to glute. Keep knees together, push hip forward slightly.', breathingCue: 'Breathe deeply, exhale to relax into stretch' },
          { name: 'Hamstring Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hamstrings'], instructions: 'Place heel on low surface, leg straight. Hinge forward at hips keeping back flat until stretch felt.', breathingCue: 'Exhale as you lean forward' },
          { name: 'Hip Flexor Stretch', duration: 30, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['hip_flexors'], instructions: 'Half-kneeling position. Push hips forward, squeeze glute of back leg. Keep torso upright.', breathingCue: 'Breathe into the stretch, avoid arching back' }
        ]
      }
    }
  },

  strength_muscle_endurance: {
    id: 'strength_muscle_endurance',
    name: 'Muscle Endurance Strength',
    category: 'strength',
    difficulty: 'intermediate',
    duration: 50,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Build muscular endurance with moderate weight and high reps. Key phase for cyclists.',
    focusArea: 'strength',
    tags: ['strength', 'off-bike', 'gym', 'endurance', 'intermediate'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: null, description: '5min bike/row + leg swings + hip circles' },
      main: [
        { duration: 35, zone: null, description: 'Back Squat: 3x20 @30-50% 1RM | Single-Leg Deadlift: 3x15 each | Step-Ups: 3x15 each | Leg Press: 3x20 | Hip Flexor March: 3x12 each | Plank: 3x45s' }
      ],
      cooldown: { duration: 5, zone: null, description: 'Static stretching - quads, hamstrings, hip flexors' }
    },
    coachNotes: 'Phase 2 (weeks 5-10): 20-30 reps, 30-50% 1RM, 60-90s rest. Most important phase for cycling-specific endurance. 2-3x/week.',
    exercises: {
      warmup: {
        duration: 10,
        description: '5 minutes cardio then dynamic movement prep',
        exercises: [
          { name: 'Stationary Bike or Rowing', duration: 300, equipment: ['none'], muscleGroups: ['full_body'], instructions: 'Light effort to increase body temperature and blood flow. Should be easy conversation pace.' },
          { name: 'Leg Swings', duration: 60, sides: 'left_then_right', reps: 15, equipment: ['none'], muscleGroups: ['hip_flexors', 'hamstrings'], instructions: 'Forward/back and side-to-side. Gradually increase range of motion.' },
          { name: 'Hip Circles', duration: 60, sides: 'left_then_right', reps: 10, equipment: ['none'], muscleGroups: ['hip_flexors', 'glutes'], instructions: 'Large circles with raised knee. Open up hip joint in all directions.' },
          { name: 'Warm-up Squats', duration: 60, reps: 10, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Empty barbell or bodyweight. Focus on perfect form and full depth.' }
        ]
      },
      main: [
        { name: 'Back Squat', sets: 3, reps: 20, weight: '30-50% 1RM', restSeconds: 90, tempo: '2-0-2', equipment: ['barbell', 'squat_rack'], muscleGroups: ['quadriceps', 'glutes', 'core'], instructions: 'Bar on upper back (high bar) or across rear delts (low bar). Feet shoulder-width or slightly wider. Squat to at least parallel, keeping chest up and knees tracking over toes. Drive up through heels. 20 reps should burn but be completable.', alternatives: ['Goblet Squat', 'Leg Press'] },
        { name: 'Single-Leg Romanian Deadlift', sets: 3, reps: '15 each leg', weight: 'light dumbbell', restSeconds: 60, equipment: ['dumbbells'], muscleGroups: ['hamstrings', 'glutes', 'core'], instructions: 'Hold dumbbell in opposite hand to standing leg. Hinge forward, extending free leg behind for balance. Keep hips square, slight bend in standing knee. Feel stretch in hamstring, return by squeezing glute.', alternatives: ['Two-Leg RDL'] },
        { name: 'Step-Ups', sets: 3, reps: '15 each leg', weight: 'bodyweight or light dumbbells', restSeconds: 60, equipment: ['bench'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Use box/bench at knee height. Step up driving through heel of top foot. Don\'t push off back foot. Control the descent. Keep torso upright throughout.', alternatives: ['Box Step-Ups', 'Reverse Lunges'] },
        { name: 'Leg Press', sets: 3, reps: 20, weight: '40-50% normal', restSeconds: 90, equipment: ['cable_machine'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Feet shoulder-width on platform. Lower weight until knees at 90 degrees. Press through whole foot, don\'t lock out at top. Maintain lower back contact with seat throughout.', alternatives: ['Hack Squat', 'Goblet Squat'] },
        { name: 'Standing Hip Flexor March', sets: 3, reps: '12 each leg', weight: 'ankle weights optional', restSeconds: 45, equipment: ['none'], muscleGroups: ['hip_flexors', 'core'], instructions: 'Stand tall, drive knee up to hip height with control. Hold briefly at top, lower with control. Alternate legs. Keep standing leg straight, core tight. This directly mimics pedal stroke top.', alternatives: ['Seated Knee Raises'] },
        { name: 'Plank', sets: 3, reps: '45 seconds', restSeconds: 45, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Forearms on ground, body in straight line from head to heels. Don\'t let hips sag or pike up. Squeeze glutes, brace core as if expecting a punch. Breathe steadily.', progression: 'Add 10 seconds per week', regression: 'Knees on ground' }
      ],
      cooldown: {
        duration: 5,
        description: 'Static stretching focusing on worked muscles',
        exercises: [
          { name: 'Quad Stretch', duration: 45, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['quadriceps'], instructions: 'Stand, grab ankle behind you, pull heel toward glute. Push hip forward for deeper stretch.' },
          { name: 'Hamstring Stretch', duration: 45, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hamstrings'], instructions: 'Seated or standing, straighten leg and hinge forward at hips. Keep back flat.' },
          { name: 'Hip Flexor Stretch', duration: 45, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['hip_flexors'], instructions: 'Half-kneeling, back knee on ground. Tuck pelvis and push hips forward gently.' }
        ]
      }
    }
  },

  strength_max_lower: {
    id: 'strength_max_lower',
    name: 'Max Strength - Lower Body',
    category: 'strength',
    difficulty: 'advanced',
    duration: 55,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Heavy lower body work for maximum power development. Research shows 6.5% TT power improvement.',
    focusArea: 'strength',
    tags: ['strength', 'off-bike', 'gym', 'max-strength', 'power', 'advanced'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 15, zone: null, description: '5min cardio + dynamic stretches + warm-up sets' },
      main: [
        { duration: 35, zone: null, description: 'Back Squat: 4x5 @80-90% 1RM | Romanian Deadlift: 4x5 @80% 1RM | Bulgarian Split Squat: 3x6 each | Single-Leg Press: 3x6 each | Standing Calf Raise: 4x8' }
      ],
      cooldown: { duration: 5, zone: null, description: 'Foam rolling + stretching' }
    },
    coachNotes: 'Phase 3 (weeks 11-16): 4-6 reps, 80-90% 1RM, 3-5 min rest. 2x/week max. Allow 48-72h before hard bike sessions.',
    exercises: {
      warmup: {
        duration: 15,
        description: 'Thorough warm-up including progressive loading',
        exercises: [
          { name: 'Light Cardio', duration: 300, equipment: ['none'], muscleGroups: ['full_body'], instructions: 'Bike or row at easy pace to increase core temperature and blood flow.' },
          { name: 'Dynamic Leg Swings', duration: 60, reps: 15, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hip_flexors', 'hamstrings'], instructions: 'Front-to-back and side-to-side. Progressively increase range.' },
          { name: 'Bodyweight Squat', duration: 60, reps: 10, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Full depth, controlled pace. Wake up movement pattern.' },
          { name: 'Empty Bar Squat', duration: 60, reps: 10, equipment: ['barbell'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Just the bar. Perfect form, feel the groove.' },
          { name: 'Warm-up Set 1 (50%)', duration: 90, reps: 8, equipment: ['barbell'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Load bar to ~50% of working weight. 8 easy reps.' },
          { name: 'Warm-up Set 2 (70%)', duration: 90, reps: 5, equipment: ['barbell'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Load to ~70%. 5 controlled reps. Start feeling resistance.' },
          { name: 'Warm-up Set 3 (85%)', duration: 90, reps: 2, equipment: ['barbell'], muscleGroups: ['quadriceps', 'glutes'], instructions: '2 reps at ~85%. Groove the movement before working sets.' }
        ]
      },
      main: [
        { name: 'Back Squat', sets: 4, reps: 5, weight: '80-90% 1RM', restSeconds: 240, tempo: '2-1-X', equipment: ['barbell', 'squat_rack'], muscleGroups: ['quadriceps', 'glutes', 'core'], instructions: 'HEAVY. Unrack with confidence, brace hard. Controlled descent to parallel or below. Drive up explosively but controlled. If form breaks, reduce weight. Full 3-4 minute rest between sets. Spotter recommended.', alternatives: ['Front Squat', 'Safety Bar Squat'] },
        { name: 'Romanian Deadlift', sets: 4, reps: 5, weight: '80% 1RM', restSeconds: 180, tempo: '3-0-1', equipment: ['barbell'], muscleGroups: ['hamstrings', 'glutes', 'lower_back'], instructions: 'Stand with bar at hip level. Soft knees, hinge at hips, push butt back. Lower bar along thighs until strong hamstring stretch. Keep back flat, core braced. Drive hips forward to return. Focus on hamstring loading.', alternatives: ['Trap Bar Deadlift'] },
        { name: 'Bulgarian Split Squat', sets: 3, reps: '6 each leg', weight: 'dumbbells or barbell', restSeconds: 90, equipment: ['dumbbells', 'bench'], muscleGroups: ['quadriceps', 'glutes', 'hip_flexors'], instructions: 'Rear foot elevated on bench behind you. Front foot 2-3 feet ahead. Lower until back knee nearly touches ground, front thigh parallel. Drive through front heel. Keep torso upright. This builds single-leg strength critical for cycling.', alternatives: ['Rear Foot Elevated Split Squat with Barbell'] },
        { name: 'Single-Leg Press', sets: 3, reps: '6 each leg', weight: '70-80% two-leg weight', restSeconds: 90, equipment: ['cable_machine'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'One foot on platform, other on floor. Press through whole foot. Control the descent. Don\'t let knee collapse inward. Builds unilateral strength matching cycling\'s single-leg demands.', alternatives: ['Single-Leg Squat to Box'] },
        { name: 'Standing Calf Raise', sets: 4, reps: 8, weight: 'heavy', restSeconds: 90, equipment: ['squat_rack'], muscleGroups: ['calves'], instructions: 'Bar on back or machine. Rise onto balls of feet, squeeze hard at top for 1 second. Lower slowly for full stretch. Calves respond well to heavy loading and time under tension.' }
      ],
      cooldown: {
        duration: 5,
        description: 'Foam rolling and static stretching',
        exercises: [
          { name: 'Foam Roll Quads', duration: 60, equipment: ['foam_roller'], muscleGroups: ['quadriceps'], instructions: 'Roll entire quad, pausing on tight spots. Moderate pressure.' },
          { name: 'Foam Roll Glutes', duration: 60, equipment: ['foam_roller'], muscleGroups: ['glutes'], instructions: 'Sit on roller, cross ankle over knee, roll each side.' },
          { name: 'Hip Flexor Stretch', duration: 45, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['hip_flexors'], instructions: 'Half-kneeling, squeeze glute of back leg, push hips forward gently.' },
          { name: 'Hamstring Stretch', duration: 45, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hamstrings'], instructions: 'Prop leg on low surface, hinge forward at hips.' }
        ]
      }
    }
  },

  strength_maintenance: {
    id: 'strength_maintenance',
    name: 'Strength Maintenance',
    category: 'strength',
    difficulty: 'intermediate',
    duration: 40,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Maintain strength gains during race season with reduced volume.',
    focusArea: 'strength',
    tags: ['strength', 'off-bike', 'gym', 'maintenance', 'in-season'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: null, description: 'Light cardio + dynamic movement prep' },
      main: [
        { duration: 25, zone: null, description: 'Squat or Leg Press: 2x10 @50% 1RM | Deadlift or Hip Hinge: 2x10 | Single-Leg Work: 2x8 each | Core Circuit: 2 rounds' }
      ],
      cooldown: { duration: 5, zone: null, description: 'Light stretching' }
    },
    coachNotes: 'In-season: 1x/week, skip race weeks. 10-15 reps, 30-60% 1RM. Maintain, don\'t build.',
    exercises: {
      warmup: {
        duration: 10,
        description: 'Quick movement prep - don\'t fatigue yourself',
        exercises: [
          { name: 'Light Bike or Walk', duration: 300, equipment: ['none'], muscleGroups: ['full_body'], instructions: 'Easy effort to get blood flowing. This is maintenance, not a hard session.' },
          { name: 'Leg Swings', duration: 60, reps: 10, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hip_flexors', 'hamstrings'], instructions: 'Wake up the hips with controlled swings.' },
          { name: 'Bodyweight Squats', duration: 60, reps: 8, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Easy warm-up squats to prime movement pattern.' }
        ]
      },
      main: [
        { name: 'Goblet Squat or Leg Press', sets: 2, reps: 10, weight: '50% 1RM', restSeconds: 90, equipment: ['dumbbells', 'kettlebell'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Choose based on what you have access to. Moderate weight, focus on quality movement. This maintains neural pathways and strength without building fatigue.', alternatives: ['Back Squat at light weight'] },
        { name: 'Romanian Deadlift', sets: 2, reps: 10, weight: '50% 1RM', restSeconds: 90, equipment: ['barbell', 'dumbbells'], muscleGroups: ['hamstrings', 'glutes'], instructions: 'Hip hinge pattern maintenance. Keep it light and controlled.', alternatives: ['Kettlebell Deadlift', 'Good Mornings'] },
        { name: 'Walking Lunges', sets: 2, reps: '8 each leg', weight: 'bodyweight', restSeconds: 60, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Single-leg work to maintain balance and unilateral strength. Keep torso upright.', alternatives: ['Step-Ups', 'Split Squats'] },
        { name: 'Plank Hold', sets: 2, reps: '30 seconds', restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Maintain core stability. Don\'t go to failure.' },
        { name: 'Side Plank', sets: 2, reps: '20 seconds each side', restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Brief hold on each side. Keep hips stacked.' }
      ],
      cooldown: {
        duration: 5,
        description: 'Light stretching only',
        exercises: [
          { name: 'Quad Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['quadriceps'], instructions: 'Brief stretch, nothing intense.' },
          { name: 'Hip Flexor Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hip_flexors'], instructions: 'Half-kneeling, gentle forward lean.' }
        ]
      }
    }
  },

  strength_explosive_power: {
    id: 'strength_explosive_power',
    name: 'Explosive Power Training',
    category: 'strength',
    difficulty: 'advanced',
    duration: 45,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Develop explosive power for sprints and attacks. Based on plyometric principles.',
    focusArea: 'strength',
    tags: ['strength', 'off-bike', 'gym', 'explosive', 'power', 'sprinting'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: null, description: 'Light jog + dynamic stretches + activation' },
      main: [
        { duration: 30, zone: null, description: 'Jump Squats: 4x6 | Box Jumps: 4x5 | Kettlebell Swings: 4x10 | Med Ball Slams: 3x8 | Single-Leg Bounds: 3x6 each' }
      ],
      cooldown: { duration: 5, zone: null, description: 'Walking + light stretching' }
    },
    coachNotes: 'For sprint specialists. Focus on speed of movement, not fatigue. Full recovery between sets. 1-2x/week max.',
    exercises: {
      warmup: {
        duration: 10,
        description: 'Thorough activation before explosive work',
        exercises: [
          { name: 'Light Jog', duration: 180, equipment: ['none'], muscleGroups: ['full_body'], instructions: 'Easy jog to increase body temperature. Not too fast.' },
          { name: 'Leg Swings', duration: 60, reps: 15, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hip_flexors', 'hamstrings'], instructions: 'Dynamic swings front-back and side-to-side. Build range gradually.' },
          { name: 'High Knees', duration: 30, equipment: ['none'], muscleGroups: ['hip_flexors', 'core'], instructions: '30 seconds of quick high knees to activate hip flexors.' },
          { name: 'Butt Kicks', duration: 30, equipment: ['none'], muscleGroups: ['hamstrings', 'quadriceps'], instructions: 'Quick heel-to-glute contacts while jogging in place.' },
          { name: 'Squat Jumps (submaximal)', duration: 60, reps: 5, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes'], instructions: 'Easy jump squats at 70% effort to prime explosive pattern.' },
          { name: 'Ankle Bounces', duration: 30, equipment: ['none'], muscleGroups: ['calves'], instructions: 'Small quick bounces on balls of feet. Wake up calf springs.' }
        ]
      },
      main: [
        { name: 'Jump Squats', sets: 4, reps: 6, weight: 'bodyweight', restSeconds: 120, tempo: 'explosive', equipment: ['none'], muscleGroups: ['quadriceps', 'glutes', 'calves'], instructions: 'Squat to parallel then EXPLODE upward, leaving the ground. Land softly with bent knees, immediately descend into next rep. Focus on height and speed, not grinding through fatigue. Full recovery between sets.', alternatives: ['Squat Jumps with light dumbbells'] },
        { name: 'Box Jumps', sets: 4, reps: 5, weight: 'bodyweight', restSeconds: 120, equipment: ['bench'], muscleGroups: ['quadriceps', 'glutes', 'calves'], instructions: 'Stand facing sturdy box (18-24"). Swing arms, explode upward, land softly on top with full foot contact. Step down (don\'t jump down). Reset fully between reps. Height matters less than explosive intent.', alternatives: ['Broad Jumps', 'Tuck Jumps'] },
        { name: 'Kettlebell Swings', sets: 4, reps: 10, weight: 'moderate kettlebell', restSeconds: 90, equipment: ['kettlebell'], muscleGroups: ['glutes', 'hamstrings', 'core'], instructions: 'Stand with feet shoulder-width. Hinge at hips, swing bell between legs. Explosively drive hips forward, squeezing glutes hard. Arms guide but don\'t lift—power comes from hips. Bell should reach chest height.', alternatives: ['Dumbbell Swings', 'Hip Thrusts'] },
        { name: 'Medicine Ball Slams', sets: 3, reps: 8, weight: '10-15 lb med ball', restSeconds: 90, equipment: ['medicine_ball'], muscleGroups: ['full_body', 'core'], instructions: 'Hold ball overhead. Brace core, slam ball into ground with maximum force. Catch on bounce (or pick up) and immediately repeat. This builds explosive power and core stability. Controlled violence.', alternatives: ['Squat to Press Throw'] },
        { name: 'Single-Leg Bounds', sets: 3, reps: '6 each leg', weight: 'bodyweight', restSeconds: 90, equipment: ['none'], muscleGroups: ['quadriceps', 'glutes', 'calves'], instructions: 'From standing, push off one leg and land on the same leg 3-4 feet forward. Immediately bound again. 6 total per leg. Focus on distance and power. This directly translates to pedal stroke force.', alternatives: ['Skipping for Height'] }
      ],
      cooldown: {
        duration: 5,
        description: 'Walking and light stretching',
        exercises: [
          { name: 'Walking', duration: 120, equipment: ['none'], muscleGroups: ['full_body'], instructions: 'Easy walking to bring heart rate down.' },
          { name: 'Quad Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['quadriceps'], instructions: 'Gentle stretch, muscles may be fatigued.' },
          { name: 'Hamstring Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hamstrings'], instructions: 'Easy hamstring stretch.' },
          { name: 'Calf Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['calves'], instructions: 'Lean against wall, back leg straight, heel down.' }
        ]
      }
    }
  },

  // ============================================================
  // CORE TRAINING
  // Based on research: McGill, Penn State 2013
  // ============================================================
  core_foundation: {
    id: 'core_foundation',
    name: 'Core Foundation',
    category: 'core',
    difficulty: 'beginner',
    duration: 20,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Basic core stability work for cycling efficiency. Integration exercises beat isolation.',
    focusArea: 'core',
    tags: ['core', 'off-bike', 'stability', 'beginner', 'foundation'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 3, zone: null, description: 'Cat-cow stretches + gentle twists' },
      main: [
        { duration: 15, zone: null, description: 'Plank: 3x30s | Side Plank: 2x20s each | Bird-Dog: 3x8 each | Dead Bug: 3x8 each | Glute Bridge: 3x12' }
      ],
      cooldown: { duration: 2, zone: null, description: 'Child\'s pose + gentle stretching' }
    },
    coachNotes: 'Perform before rides for better activation (McGill research). Focus on bracing, not just holding.',
    exercises: {
      warmup: {
        duration: 3,
        description: 'Gentle spine mobilization',
        exercises: [
          { name: 'Cat-Cow', duration: 60, reps: 10, equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'On hands and knees. Arch back up like a cat (exhale), then drop belly and look up like a cow (inhale). Move slowly between positions, feeling each vertebra.', breathingCue: 'Exhale on cat, inhale on cow' },
          { name: 'Supine Twist', duration: 60, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'Lie on back, knees bent. Drop both knees to one side while keeping shoulders flat. Hold 30 seconds each side.', breathingCue: 'Deep breaths, relax into twist' }
        ]
      },
      main: [
        { name: 'Forearm Plank', sets: 3, duration: 30, restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Forearms on ground, elbows under shoulders. Body in straight line from head to heels. Squeeze glutes, brace abs as if expecting a punch. Keep breathing! Don\'t let hips sag or pike.', progression: 'Add 5 seconds per week', regression: 'Knees on ground' },
        { name: 'Side Plank', sets: 2, duration: 20, sides: 'left_then_right', restSeconds: 20, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Lie on side, prop up on forearm. Lift hips so body forms straight line. Stack feet or stagger for balance. Keep top hip directly over bottom hip—don\'t let it drop back.', progression: 'Add leg lifts', regression: 'Bottom knee on ground' },
        { name: 'Bird-Dog', sets: 3, reps: '8 each side', restSeconds: 20, equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back', 'glutes'], instructions: 'On hands and knees. Extend right arm forward and left leg back simultaneously. Hold 2 seconds at top, keeping hips square and back flat. Return and switch sides. Minimizes movement in spine—that\'s the goal.', progression: 'Add 2-second holds', regression: 'Arm only, then leg only' },
        { name: 'Dead Bug', sets: 3, reps: '8 each side', restSeconds: 20, equipment: ['yoga_mat'], muscleGroups: ['core', 'hip_flexors'], instructions: 'Lie on back, arms pointing at ceiling, knees bent 90° above hips. Press lower back into floor. Slowly extend opposite arm and leg toward floor without losing back contact. Return and switch. Low back MUST stay flat.', progression: 'Straighten extending leg fully', regression: 'Smaller range of motion' },
        { name: 'Glute Bridge', sets: 3, reps: 12, restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['glutes', 'hamstrings', 'core'], instructions: 'Lie on back, knees bent, feet flat. Press through heels and squeeze glutes to lift hips until body is straight from shoulders to knees. Hold 1 second at top. Don\'t hyperextend—squeeze glutes, not back.', progression: 'Single-leg version', regression: 'Smaller range' }
      ],
      cooldown: {
        duration: 2,
        description: 'Gentle relaxation',
        exercises: [
          { name: 'Child\'s Pose', duration: 60, equipment: ['yoga_mat'], muscleGroups: ['lower_back', 'hip_flexors'], instructions: 'Kneel, sit back on heels, reach arms forward on floor. Relax and breathe deeply. Let spine decompress.', breathingCue: 'Slow deep breaths' },
          { name: 'Supine Spinal Twist', duration: 30, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'Lie on back, drop knees to one side, look opposite direction. Relax completely.' }
        ]
      }
    }
  },

  core_stability: {
    id: 'core_stability',
    name: 'Core Stability Circuit',
    category: 'core',
    difficulty: 'intermediate',
    duration: 25,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Intermediate core work with anti-rotation and dynamic stability challenges.',
    focusArea: 'core',
    tags: ['core', 'off-bike', 'stability', 'intermediate', 'anti-rotation'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 3, zone: null, description: 'Light movement + hip circles' },
      main: [
        { duration: 20, zone: null, description: 'Plank: 3x45s | Side Plank with Hip Dip: 3x10 each | Pallof Press: 3x10 each | Swiss Ball Plank: 3x30s | Single-Leg Glute Bridge: 3x10 each | Mountain Climbers: 3x20' }
      ],
      cooldown: { duration: 2, zone: null, description: 'Supine twist + relaxation' }
    },
    coachNotes: 'Swiss ball adds instability, replicating road dynamics. 2-3x/week ideal.',
    exercises: {
      warmup: {
        duration: 3,
        description: 'Light movement to activate core',
        exercises: [
          { name: 'Cat-Cow', duration: 60, reps: 8, equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'Flow between cat and cow positions to mobilize spine.' },
          { name: 'Hip Circles', duration: 60, reps: 10, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hip_flexors', 'glutes'], instructions: 'Standing on one leg, make large circles with raised knee. 10 each direction, each leg.' }
        ]
      },
      main: [
        { name: 'Forearm Plank', sets: 3, duration: 45, restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Perfect form: straight line, glutes squeezed, abs braced. Hold strong for full 45 seconds. If form breaks, take a break.', progression: 'Add arm or leg lifts', regression: 'Reduce to 30 seconds' },
        { name: 'Side Plank with Hip Dip', sets: 3, reps: '10 each side', restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Side plank position. Lower hip toward ground then lift back to straight line. Control the movement—don\'t just drop and bounce. This targets obliques dynamically.', progression: 'Hold dumbbell on hip', regression: 'Bottom knee down' },
        { name: 'Pallof Press', sets: 3, reps: '10 each side', restSeconds: 30, equipment: ['resistance_band', 'cable_machine'], muscleGroups: ['core'], instructions: 'Stand sideways to cable/band anchor at chest height. Hold handle at chest. Press straight out in front of you and hold 2 seconds. Resist the rotation—don\'t let cable pull you around. Return to chest. This anti-rotation directly helps power transfer on bike.', alternatives: ['Band Pull-Apart with Rotation'] },
        { name: 'Swiss Ball Plank', sets: 3, duration: 30, restSeconds: 30, equipment: ['stability_ball'], muscleGroups: ['core'], instructions: 'Forearms on stability ball, feet on ground. Hold plank position while ball tries to move. Keep everything still. This mimics stabilizing on rough roads—your core learns to react to instability.', regression: 'Knees on ground' },
        { name: 'Single-Leg Glute Bridge', sets: 3, reps: '10 each leg', restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['glutes', 'core', 'hamstrings'], instructions: 'Same as regular bridge but one leg extended off ground. Press through planted heel, squeeze glute, keep hips level—don\'t let raised side drop. Directly mimics single-leg power demand of cycling.', regression: 'Two-leg bridge with march' },
        { name: 'Mountain Climbers', sets: 3, reps: 20, restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core', 'hip_flexors'], instructions: 'High plank position. Drive one knee toward chest, quickly switch legs. Keep hips down, core tight. Move quickly but maintain form. 20 total (10 each leg).', regression: 'Slower pace' }
      ],
      cooldown: {
        duration: 2,
        description: 'Relaxation stretches',
        exercises: [
          { name: 'Supine Twist', duration: 30, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'Lie on back, drop knees to side, breathe deeply.' },
          { name: 'Child\'s Pose', duration: 30, equipment: ['yoga_mat'], muscleGroups: ['lower_back'], instructions: 'Sit back on heels, arms extended forward. Relax.' }
        ]
      }
    }
  },

  core_power: {
    id: 'core_power',
    name: 'Core Power & Anti-Rotation',
    category: 'core',
    difficulty: 'advanced',
    duration: 25,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Advanced core training for power transfer and pelvic stability during hard efforts.',
    focusArea: 'core',
    tags: ['core', 'off-bike', 'power', 'advanced', 'anti-rotation'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 3, zone: null, description: 'Dynamic warmup' },
      main: [
        { duration: 20, zone: null, description: 'Plank with Arm/Leg Lift: 3x8 each | Cable Wood Chop: 3x10 each | Hanging Knee Raise: 3x10 | Renegade Row: 3x8 each | Ab Wheel Rollout: 3x8 | Bicycle Crunches: 3x20' }
      ],
      cooldown: { duration: 2, zone: null, description: 'Spinal decompression stretches' }
    },
    coachNotes: 'For riders needing max power transfer. Prevents energy leakage during sprints and climbs.',
    exercises: {
      warmup: {
        duration: 3,
        description: 'Dynamic movement prep',
        exercises: [
          { name: 'Cat-Cow', duration: 45, reps: 8, equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'Quick spine mobilization.' },
          { name: 'Plank to Down Dog', duration: 45, reps: 6, equipment: ['yoga_mat'], muscleGroups: ['core', 'shoulders'], instructions: 'From high plank, push hips up and back into down dog. Return to plank. Flow smoothly.' },
          { name: 'Dead Bug Slow', duration: 60, reps: 6, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Slow controlled dead bugs to wake up deep stabilizers.' }
        ]
      },
      main: [
        { name: 'Plank with Arm/Leg Lift', sets: 3, reps: '8 each side', restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core', 'glutes'], instructions: 'High plank. Lift opposite arm and leg simultaneously, hold 2 seconds, return. Keep hips completely still—no rotation allowed. Switch sides. Much harder than it looks.', regression: 'Arm only, then leg only' },
        { name: 'Cable Wood Chop', sets: 3, reps: '10 each side', restSeconds: 45, equipment: ['cable_machine'], muscleGroups: ['core'], instructions: 'Stand sideways to cable set high. Feet wider than shoulders. Pull handle diagonally across body from high to low, rotating through core. Control the return—don\'t let cable yank you back. This builds rotational power for climbing and sprinting.', alternatives: ['Band Wood Chop', 'Medicine Ball Rotation Throw'] },
        { name: 'Hanging Knee Raise', sets: 3, reps: 10, restSeconds: 45, equipment: ['pull_up_bar'], muscleGroups: ['core', 'hip_flexors'], instructions: 'Hang from pull-up bar. Raise knees to chest by curling pelvis up—not just lifting legs. Lower with control. Don\'t swing. This builds the hip flexor strength critical for high-cadence cycling.', alternatives: ['Captain\'s Chair Knee Raise', 'Lying Leg Raise'] },
        { name: 'Renegade Row', sets: 3, reps: '8 each side', restSeconds: 45, equipment: ['dumbbells'], muscleGroups: ['core', 'upper_back'], instructions: 'High plank with hands on dumbbells. Row one dumbbell to hip while keeping hips square—zero rotation. Lower and switch. Core must fight rotation while back works. Use moderate weight.', regression: 'Wider foot stance' },
        { name: 'Ab Wheel Rollout', sets: 3, reps: 8, restSeconds: 45, equipment: ['none'], muscleGroups: ['core'], instructions: 'Kneel with ab wheel (or barbell with plates). Roll forward, extending body. Go as far as you can while maintaining flat back—stop before back arches! Roll back by squeezing abs. This is an advanced move.', regression: 'Partial range', alternatives: ['Stability Ball Rollout'] },
        { name: 'Bicycle Crunches', sets: 3, reps: 20, restSeconds: 30, equipment: ['yoga_mat'], muscleGroups: ['core'], instructions: 'Lie on back, hands behind head. Bring knee to opposite elbow while other leg extends. Alternate with control—not speed. Focus on the twist and full extension. 20 total reps.', regression: 'Slower pace' }
      ],
      cooldown: {
        duration: 2,
        description: 'Spinal decompression',
        exercises: [
          { name: 'Child\'s Pose', duration: 45, equipment: ['yoga_mat'], muscleGroups: ['lower_back'], instructions: 'Deep relaxation, let spine decompress.' },
          { name: 'Supine Knee Hug', duration: 30, equipment: ['yoga_mat'], muscleGroups: ['lower_back'], instructions: 'Lie on back, hug both knees to chest. Rock gently side to side.' }
        ]
      }
    }
  },

  // ============================================================
  // FLEXIBILITY & RECOVERY
  // Based on research: Yoga Journal, BikeRadar studies
  // ============================================================
  flexibility_post_ride: {
    id: 'flexibility_post_ride',
    name: 'Post-Ride Stretch Routine',
    category: 'flexibility',
    difficulty: 'beginner',
    duration: 15,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Essential post-ride stretching targeting cycling-specific tight areas.',
    focusArea: 'flexibility',
    tags: ['stretching', 'flexibility', 'recovery', 'post-ride', 'beginner'],
    terrainType: 'flat',
    structure: {
      warmup: null,
      main: [
        { duration: 15, zone: null, description: 'Hip Flexor Stretch: 45s each | Quad Stretch: 30s each | Hamstring Stretch: 45s each | Pigeon Pose: 60s each | Figure-4 Stretch: 45s each | Cat-Cow: 10 cycles' }
      ],
      cooldown: null
    },
    coachNotes: 'Perform after every ride while muscles are warm. Prevents adaptive shortening of hip flexors.',
    exercises: {
      warmup: { duration: 0, description: 'Muscles are already warm from riding' },
      main: [
        { name: 'Hip Flexor Stretch', duration: 45, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['hip_flexors'], instructions: 'Half-kneeling position, back knee on mat/towel. Tuck pelvis under (posterior tilt), then push hips forward until you feel stretch in front of back hip. Keep torso upright, don\'t arch lower back. Squeeze glute of back leg for deeper stretch.', breathingCue: 'Exhale as you push hips forward', modifications: 'Place hand on wall for balance' },
        { name: 'Standing Quad Stretch', duration: 30, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['quadriceps'], instructions: 'Stand on one leg (use wall for balance). Grab opposite ankle and pull heel toward glute. Keep knees together, push hip forward slightly. You should feel stretch in front of thigh.', breathingCue: 'Breathe normally', modifications: 'Use strap around ankle if hard to reach' },
        { name: 'Standing Hamstring Stretch', duration: 45, sides: 'left_then_right', equipment: ['none'], muscleGroups: ['hamstrings'], instructions: 'Place heel on low surface (step, curb, bench). Keep leg straight, flex foot toward you. Hinge forward at hips with flat back until stretch felt in back of thigh. Don\'t round back to get lower—keep spine neutral.', breathingCue: 'Exhale to fold deeper', modifications: 'Lower surface for less stretch' },
        { name: 'Pigeon Pose', duration: 60, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['glutes', 'hip_flexors'], instructions: 'From hands and knees, bring right knee forward and out, shin angled across mat. Extend left leg straight back. Walk hands forward to lower chest toward floor. Feel deep stretch in right glute/hip. Keep hips square—don\'t let right hip drop.', breathingCue: 'Deep slow breaths, relax into stretch', modifications: 'Place cushion under hip for support, or do figure-4 on back instead' },
        { name: 'Figure-4 Stretch (Supine Piriformis)', duration: 45, sides: 'left_then_right', equipment: ['yoga_mat'], muscleGroups: ['glutes', 'hip_flexors'], instructions: 'Lie on back. Cross right ankle over left knee (making a 4 shape). Grab behind left thigh and pull toward chest. You\'ll feel stretch in right glute. Keep right knee open.', breathingCue: 'Breathe deeply, relax glutes', modifications: 'Use strap around thigh if hard to reach' },
        { name: 'Cat-Cow Flow', duration: 60, reps: 10, equipment: ['yoga_mat'], muscleGroups: ['core', 'lower_back'], instructions: 'On hands and knees. Inhale: drop belly, lift head and tailbone (Cow). Exhale: round spine toward ceiling, tuck chin and pelvis (Cat). Flow smoothly between positions, moving with breath. Releases lower back tension from riding position.', breathingCue: 'Inhale Cow, Exhale Cat' }
      ],
      cooldown: { duration: 0, description: 'This routine is itself a cooldown' }
    }
  },

  flexibility_hip_mobility: {
    id: 'flexibility_hip_mobility',
    name: 'Hip Mobility Flow',
    category: 'flexibility',
    difficulty: 'intermediate',
    duration: 20,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Deep hip mobility work to counter cycling\'s limited range of motion.',
    focusArea: 'flexibility',
    tags: ['stretching', 'flexibility', 'mobility', 'hips', 'intermediate'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 3, zone: null, description: 'Light walking + leg swings' },
      main: [
        { duration: 15, zone: null, description: '90/90 Hip Stretch: 60s each | Couch Stretch: 60s each | Deep Squat Hold: 60s | Frog Stretch: 60s | World\'s Greatest Stretch: 5 each | Hip Circles: 10 each direction' }
      ],
      cooldown: { duration: 2, zone: null, description: 'Relaxed breathing in child\'s pose' }
    },
    coachNotes: 'Mobile hip flexors = more power, better position. Do 2-3x/week, especially if desk-bound.'
  },

  flexibility_yoga_cyclist: {
    id: 'flexibility_yoga_cyclist',
    name: 'Yoga for Cyclists',
    category: 'flexibility',
    difficulty: 'intermediate',
    duration: 30,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Cyclist-specific yoga routine addressing all common tight areas.',
    focusArea: 'flexibility',
    tags: ['yoga', 'flexibility', 'recovery', 'full-body', 'intermediate'],
    terrainType: 'flat',
    structure: {
      warmup: { duration: 5, zone: null, description: 'Cat-Cow flow + gentle twists' },
      main: [
        { duration: 22, zone: null, description: 'Downward Dog: 60s | Runner\'s Lunge: 60s each | Pigeon Pose: 90s each | Reclined Twist: 60s each | Supine Figure-4: 60s each | Bridge Pose: 45s x2 | Forward Fold: 60s' }
      ],
      cooldown: { duration: 3, zone: null, description: 'Savasana - full body relaxation' }
    },
    coachNotes: 'Best on rest days or after rides. Research shows improved functional movement and reduced injury rates.'
  },

  flexibility_full_body_recovery: {
    id: 'flexibility_full_body_recovery',
    name: 'Full Body Recovery Session',
    category: 'flexibility',
    difficulty: 'beginner',
    duration: 25,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Complete recovery session including foam rolling and stretching.',
    focusArea: 'flexibility',
    tags: ['recovery', 'flexibility', 'foam-rolling', 'full-body', 'beginner'],
    terrainType: 'flat',
    structure: {
      warmup: null,
      main: [
        { duration: 25, zone: null, description: 'Foam Roll Quads: 2min | Foam Roll IT Band: 2min each | Foam Roll Glutes: 2min each | Hip Flexor Stretch: 60s each | Hamstring Stretch: 60s each | Chest Opener: 60s | Neck Rolls: 30s each direction | Child\'s Pose: 60s' }
      ],
      cooldown: null
    },
    coachNotes: 'Ideal after long/hard rides or on rest days. Foam rolling before stretching increases effectiveness.'
  },

  flexibility_dynamic_warmup: {
    id: 'flexibility_dynamic_warmup',
    name: 'Dynamic Pre-Ride Warmup',
    category: 'flexibility',
    difficulty: 'beginner',
    duration: 10,
    targetTSS: 0,
    intensityFactor: 0,
    description: 'Dynamic stretching before rides. Prepares muscles without reducing power output.',
    focusArea: 'flexibility',
    tags: ['warmup', 'dynamic', 'pre-ride', 'activation', 'beginner'],
    terrainType: 'flat',
    structure: {
      warmup: null,
      main: [
        { duration: 10, zone: null, description: 'Leg Swings Front-Back: 10 each | Leg Swings Side-Side: 10 each | Walking Lunges: 10 each | High Knees: 30s | Butt Kicks: 30s | Hip Circles: 10 each | Arm Circles: 10 each' }
      ],
      cooldown: null
    },
    coachNotes: 'Do BEFORE rides. Static stretching before exercise reduces power for up to 1 hour. Dynamic is safe and beneficial.'
  }
};

// ============================================================
// TRAINING METHODOLOGIES
// ============================================================
export const TRAINING_METHODOLOGIES: Record<string, TrainingMethodologyDefinition> = {
  polarized: {
    name: 'Polarized Training',
    description: '80% low intensity (Zone 1-2), 20% high intensity (Zone 5+). Minimal time in tempo/threshold.',
    weeklyDistribution: {
      zone1_2: 0.80,
      zone3_4: 0.05,
      zone5_plus: 0.15
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
      { day: 'Sunday', workout: null }
    ]
  },

  sweet_spot_base: {
    name: 'Sweet Spot Base',
    description: 'Emphasizes 88-94% FTP work for time-efficient FTP gains.',
    weeklyDistribution: {
      zone1_2: 0.50,
      zone3_sst: 0.35,
      zone4_plus: 0.15
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
      { day: 'Sunday', workout: null }
    ]
  },

  pyramidal: {
    name: 'Pyramidal Training',
    description: 'Balanced approach: 67.5% low, 23.4% moderate, 9.1% high intensity. Proven effective for recreational cyclists.',
    weeklyDistribution: {
      zone1_2: 0.675,
      zone3_4: 0.234,
      zone5_plus: 0.091
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
      { day: 'Sunday', workout: null }
    ]
  },

  threshold_focused: {
    name: 'Threshold-Focused',
    description: 'Classic FTP-building approach with frequent threshold intervals.',
    weeklyDistribution: {
      zone1_2: 0.60,
      zone3_4: 0.30,
      zone5_plus: 0.10
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
      { day: 'Sunday', workout: null }
    ]
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get workouts by category
 */
export function getWorkoutsByCategory(category: WorkoutCategory): WorkoutDefinition[] {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.category === category);
}

/**
 * Get workouts by difficulty
 */
export function getWorkoutsByDifficulty(difficulty: FitnessLevel): WorkoutDefinition[] {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.difficulty === difficulty);
}

/**
 * Get workouts by TSS range
 */
export function getWorkoutsByTSS(minTSS: number, maxTSS: number): WorkoutDefinition[] {
  return Object.values(WORKOUT_LIBRARY).filter(
    w => w.targetTSS >= minTSS && w.targetTSS <= maxTSS
  );
}

/**
 * Get workouts by duration range (in minutes)
 */
export function getWorkoutsByDuration(minDuration: number, maxDuration: number): WorkoutDefinition[] {
  return Object.values(WORKOUT_LIBRARY).filter(
    w => w.duration >= minDuration && w.duration <= maxDuration
  );
}

/**
 * Get a workout by its ID
 */
export function getWorkoutById(id: string): WorkoutDefinition | null {
  return WORKOUT_LIBRARY[id] || null;
}

/**
 * Search workouts by tags
 */
export function searchWorkoutsByTag(tag: string): WorkoutDefinition[] {
  return Object.values(WORKOUT_LIBRARY).filter(w => w.tags.includes(tag));
}

/**
 * Get recommended workouts for training phase
 */
export function getWorkoutsForPhase(phase: TrainingPhase, fitnessLevel?: FitnessLevel): WorkoutDefinition[] {
  const phaseWorkouts: Record<TrainingPhase, WorkoutCategory[]> = {
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

/**
 * Get all workout IDs in the library
 */
export function getAllWorkoutIds(): string[] {
  return Object.keys(WORKOUT_LIBRARY);
}

/**
 * Check if a workout ID exists in the library
 */
export function workoutExists(id: string): boolean {
  return id in WORKOUT_LIBRARY;
}

export default WORKOUT_LIBRARY;
