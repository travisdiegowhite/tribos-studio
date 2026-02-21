/**
 * Comprehensive Running Workout Library
 * Based on proven running training methodologies and coaching science
 *
 * Sources:
 * - Jack Daniels' Running Formula (VDOT-based training zones)
 * - Pfitzinger & Douglas: Advanced Marathoning
 * - Steve Magness: Science of Running
 * - Canova marathon training methodology
 * - Norwegian threshold training research (2024-2025)
 * - Polarized training for runners (Seiler et al.)
 *
 * Pace zone mapping:
 * Zone 1 = Recovery (very easy, conversational)
 * Zone 2 = Easy/Aerobic (comfortable, sustainable)
 * Zone 3 = Tempo / Marathon pace (comfortably hard)
 * Zone 4 = Threshold / Lactate threshold pace
 * Zone 5 = VO2max (hard, 3-8 min sustainable)
 * Zone 6 = Anaerobic / Speed (near sprint)
 *
 * For the generic `structure` field, running pace zones map to cycling TrainingZones:
 * Running Z1 -> Cycling Z1, Running Z2 -> Cycling Z2, etc.
 * powerPctFTP is left undefined; cadence represents running cadence (spm).
 */

import type {
  WorkoutDefinition,
  WorkoutLibrary as WorkoutLibraryType,
  WorkoutCategory,
  FitnessLevel,
  TrainingPhase,
} from '../types/training';

export const RUNNING_WORKOUT_LIBRARY: WorkoutLibraryType = {
  // ============================================================
  // RECOVERY (Zone 1)
  // ============================================================
  run_recovery_jog: {
    id: 'run_recovery_jog',
    name: 'Recovery Jog',
    sportType: 'running',
    category: 'recovery',
    difficulty: 'beginner',
    duration: 25,
    targetTSS: 18,
    intensityFactor: 0.55,
    description: 'Very easy 20-25 minute recovery jog. Focus on relaxed form and gentle movement to promote blood flow and recovery.',
    focusArea: 'recovery',
    tags: ['recovery', 'z1', 'easy', 'jog', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 4,
    structure: {
      warmup: null,
      main: [
        { duration: 25, zone: 1, cadence: '160-170 spm', description: 'Very easy jog, conversational pace' }
      ],
      cooldown: null
    },
    runningStructure: {
      warmup: null,
      main: [
        {
          duration: 25,
          paceZone: 1,
          pacePctThreshold: 130,
          targetPace: '6:30-7:30/km',
          heartRateZone: 1,
          cadence: '160-170',
          description: 'Very easy jog, conversational pace throughout'
        }
      ],
      cooldown: null,
      totalDistance: 4,
      terrain: 'road'
    },
    coachNotes: 'This should feel almost effortless. If you cannot hold a full conversation, slow down. Keep your shoulders relaxed, arms swinging naturally. Short, light steps. Purpose is recovery - resist the urge to pick up the pace. Heart rate should stay below 65% max HR.'
  },

  run_easy_recovery: {
    id: 'run_easy_recovery',
    name: 'Easy Recovery Run with Strides',
    sportType: 'running',
    category: 'recovery',
    difficulty: 'beginner',
    duration: 30,
    targetTSS: 28,
    intensityFactor: 0.60,
    description: '30-minute easy run finishing with 4 strides to maintain neuromuscular coordination without adding fatigue.',
    focusArea: 'recovery',
    tags: ['recovery', 'z1', 'z2', 'easy', 'strides', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 5,
    structure: {
      warmup: null,
      main: [
        { duration: 26, zone: 1, cadence: '165-175 spm', description: 'Easy run' },
        { duration: 4, zone: 3, cadence: '180-190 spm', description: '4x20sec strides with walk recovery' }
      ],
      cooldown: null
    },
    runningStructure: {
      warmup: null,
      main: [
        {
          duration: 26,
          paceZone: 1,
          pacePctThreshold: 125,
          targetPace: '6:00-7:00/km',
          heartRateZone: 1,
          cadence: '165-175',
          description: 'Easy relaxed running'
        },
        {
          type: 'repeat',
          sets: 4,
          work: {
            distance: 80,
            paceZone: 5,
            cadence: '185-195',
            description: '20sec stride: smooth acceleration to fast but controlled pace'
          },
          rest: { duration: 1, paceZone: null }
        }
      ],
      cooldown: null,
      totalDistance: 5,
      terrain: 'road',
      strides: 4
    },
    coachNotes: 'Run the main portion very easy. Strides are NOT sprints - accelerate smoothly to about 90% effort over 20 seconds, focusing on quick turnover and tall posture. Walk 60 seconds between strides. These maintain running economy without adding training stress.'
  },

  // ============================================================
  // EASY / AEROBIC (Zone 2)
  // ============================================================
  run_easy_aerobic: {
    id: 'run_easy_aerobic',
    name: 'Easy Aerobic Run',
    sportType: 'running',
    category: 'endurance',
    difficulty: 'beginner',
    duration: 40,
    targetTSS: 40,
    intensityFactor: 0.65,
    description: '40-minute easy aerobic run. The bread and butter of any running program - building aerobic capacity at a comfortable effort.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'easy', 'aerobic', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 7,
    structure: {
      warmup: { duration: 5, zone: 1, description: 'Walk to easy jog' },
      main: [
        { duration: 30, zone: 2, cadence: '170-180 spm', description: 'Steady easy aerobic running' }
      ],
      cooldown: { duration: 5, zone: 1, description: 'Easy jog to walk' }
    },
    runningStructure: {
      warmup: {
        duration: 5,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Walk 2min then easy jog'
      },
      main: [
        {
          duration: 30,
          paceZone: 2,
          pacePctThreshold: 115,
          targetPace: '5:30-6:15/km',
          heartRateZone: 2,
          cadence: '170-180',
          description: 'Steady Zone 2 aerobic running'
        }
      ],
      cooldown: {
        duration: 5,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy jog winding down to walk'
      },
      totalDistance: 7,
      terrain: 'road'
    },
    coachNotes: 'This is your daily easy run. You should be able to speak in full sentences. Focus on relaxed form: upright posture, slight forward lean from ankles, arms at 90 degrees swinging forward/back (not across body). Breathe naturally through mouth and nose. Heart rate 65-75% max.'
  },

  run_easy_long: {
    id: 'run_easy_long',
    name: 'Easy Hour Run',
    sportType: 'running',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 60,
    targetTSS: 55,
    intensityFactor: 0.68,
    description: '60-minute easy run for building aerobic endurance. A staple midweek run for intermediate runners.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'base', 'running', 'midweek'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 10,
    structure: {
      warmup: { duration: 5, zone: 1, description: 'Easy jog warmup' },
      main: [
        { duration: 50, zone: 2, cadence: '170-180 spm', description: 'Steady Zone 2 running' }
      ],
      cooldown: { duration: 5, zone: 1, description: 'Easy jog cooldown' }
    },
    runningStructure: {
      warmup: {
        duration: 5,
        paceZone: 1,
        targetPace: '6:15-6:45/km',
        cadence: '165-170',
        description: 'Easy jog to settle into rhythm'
      },
      main: [
        {
          duration: 50,
          paceZone: 2,
          pacePctThreshold: 115,
          targetPace: '5:30-6:15/km',
          heartRateZone: 2,
          cadence: '170-180',
          description: 'Steady easy aerobic pace'
        }
      ],
      cooldown: {
        duration: 5,
        paceZone: 1,
        targetPace: '6:15-7:00/km',
        cadence: '165-170',
        description: 'Easy jog, then walk to cool down'
      },
      totalDistance: 10,
      terrain: 'road'
    },
    coachNotes: 'A solid midweek volume run. Resist the temptation to push the pace - save intensity for quality sessions. Even splits or slightly negative (second half marginally faster) is ideal. Stay hydrated, especially in warm conditions.'
  },

  run_long_run: {
    id: 'run_long_run',
    name: 'Long Run',
    sportType: 'running',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 90,
    targetTSS: 90,
    intensityFactor: 0.70,
    description: '90-minute long run building endurance and fat oxidation. The cornerstone weekend run for distance runners.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'long-run', 'weekend', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 16,
    structure: {
      warmup: { duration: 10, zone: 1, description: 'Easy jog warmup' },
      main: [
        { duration: 70, zone: 2, cadence: '170-180 spm', description: 'Steady long run pace' }
      ],
      cooldown: { duration: 10, zone: 1, description: 'Easy jog to walk' }
    },
    runningStructure: {
      warmup: {
        duration: 10,
        paceZone: 1,
        targetPace: '6:15-6:45/km',
        cadence: '165-175',
        description: 'Gentle warmup jog, find your rhythm'
      },
      main: [
        {
          duration: 70,
          paceZone: 2,
          pacePctThreshold: 118,
          targetPace: '5:20-6:00/km',
          heartRateZone: 2,
          cadence: '170-180',
          description: 'Steady long run at easy aerobic pace'
        }
      ],
      cooldown: {
        duration: 10,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-175',
        description: 'Easy jog winding down, finish with walk'
      },
      totalDistance: 16,
      terrain: 'road'
    },
    coachNotes: 'The long run builds endurance, mental toughness, and fat-burning capacity. Start conservatively - the first few km should feel easy. Practice your race-day nutrition: take water every 20-30 min and fuel (gel/chews) after 60 min. Focus on maintaining form as fatigue builds: keep hips high, avoid overstriding.'
  },

  run_long_run_extended: {
    id: 'run_long_run_extended',
    name: 'Extended Long Run',
    sportType: 'running',
    category: 'endurance',
    difficulty: 'advanced',
    duration: 120,
    targetTSS: 130,
    intensityFactor: 0.72,
    description: '2-hour long run for marathon and half-marathon preparation. Builds muscular endurance and mental resilience.',
    focusArea: 'aerobic_base',
    tags: ['endurance', 'z2', 'long-run', 'marathon-prep', 'running', 'weekend'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 20,
    structure: {
      warmup: { duration: 10, zone: 1, description: 'Easy jog warmup' },
      main: [
        { duration: 100, zone: 2, cadence: '170-180 spm', description: 'Steady long run pace' }
      ],
      cooldown: { duration: 10, zone: 1, description: 'Easy jog to walk' }
    },
    runningStructure: {
      warmup: {
        duration: 10,
        paceZone: 1,
        targetPace: '6:15-6:45/km',
        cadence: '165-175',
        description: 'Very easy warmup jog'
      },
      main: [
        {
          duration: 100,
          paceZone: 2,
          pacePctThreshold: 118,
          targetPace: '5:30-6:15/km',
          heartRateZone: 2,
          cadence: '170-180',
          description: 'Steady long run, maintain even effort'
        }
      ],
      cooldown: {
        duration: 10,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Gentle cooldown jog and walk'
      },
      totalDistance: 20,
      terrain: 'road'
    },
    coachNotes: 'This is a key marathon-prep workout. Pre-run: eat a light meal 2-3 hours before. During: take 150-250ml water every 15-20 min and a gel/energy chews every 30-45 min after the first hour. Practice the exact nutrition you plan to use on race day. If form breaks down significantly in the final 20 min, that is a sign to improve fueling strategy. Post-run: prioritize protein + carbs within 30 min.'
  },

  // ============================================================
  // TEMPO (Zone 3)
  // ============================================================
  run_tempo_continuous: {
    id: 'run_tempo_continuous',
    name: 'Continuous Tempo Run',
    sportType: 'running',
    category: 'tempo',
    difficulty: 'intermediate',
    duration: 45,
    targetTSS: 65,
    intensityFactor: 0.83,
    description: '45-minute run with a sustained 20-minute tempo block. Builds lactate clearance and mental toughness at comfortably hard effort.',
    focusArea: 'muscular_endurance',
    tags: ['tempo', 'z3', 'threshold-building', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 8,
    structure: {
      warmup: { duration: 10, zone: 1, description: 'Easy warmup jog' },
      main: [
        { duration: 20, zone: 3, cadence: '175-185 spm', description: '20min continuous tempo' }
      ],
      cooldown: { duration: 15, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 10,
        paceZone: 2,
        targetPace: '5:45-6:15/km',
        heartRateZone: 2,
        cadence: '170-175',
        description: 'Easy warmup with a few pickups in the last 2 min'
      },
      main: [
        {
          duration: 20,
          paceZone: 3,
          pacePctThreshold: 108,
          targetPace: '4:45-5:15/km',
          heartRateZone: 3,
          cadence: '175-185',
          description: 'Continuous tempo - comfortably hard, could speak short phrases'
        }
      ],
      cooldown: {
        duration: 15,
        paceZone: 1,
        targetPace: '6:00-6:45/km',
        cadence: '165-175',
        description: 'Easy jog to bring heart rate down gradually'
      },
      totalDistance: 8,
      terrain: 'road'
    },
    coachNotes: 'Tempo pace should feel "comfortably hard" - you can speak in short phrases but not hold a conversation. Settle into the effort within the first 2 minutes; avoid starting too fast. Maintain steady breathing rhythm (e.g., 3:2 in:out pattern). Keep your hands relaxed - no clenching fists.'
  },

  run_tempo_cruise: {
    id: 'run_tempo_cruise',
    name: 'Cruise Tempo Intervals',
    sportType: 'running',
    category: 'tempo',
    difficulty: 'intermediate',
    duration: 50,
    targetTSS: 72,
    intensityFactor: 0.85,
    description: '50-minute session with 2x15-minute tempo intervals. The short recovery allows you to accumulate more quality time at tempo than a single continuous block.',
    focusArea: 'muscular_endurance',
    tags: ['tempo', 'z3', 'intervals', 'cruise', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 9,
    structure: {
      warmup: { duration: 10, zone: 1, description: 'Easy warmup jog' },
      main: [
        {
          type: 'repeat',
          sets: 2,
          work: { duration: 15, zone: 3, cadence: '175-185 spm', description: '15min tempo effort' },
          rest: { duration: 3, zone: 1, description: 'Easy jog recovery' }
        }
      ],
      cooldown: { duration: 7, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 10,
        paceZone: 2,
        targetPace: '5:45-6:15/km',
        heartRateZone: 2,
        cadence: '170-175',
        description: 'Easy warmup jog with dynamic stretches'
      },
      main: [
        {
          type: 'repeat',
          sets: 2,
          work: {
            duration: 15,
            paceZone: 3,
            pacePctThreshold: 107,
            targetPace: '4:45-5:10/km',
            heartRateZone: 3,
            cadence: '175-185',
            description: 'Tempo cruise interval'
          },
          rest: {
            duration: 3,
            paceZone: 1,
            targetPace: '6:00-6:30/km',
            cadence: '165-170',
            description: 'Easy jog recovery'
          }
        }
      ],
      cooldown: {
        duration: 7,
        paceZone: 1,
        targetPace: '6:15-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog'
      },
      totalDistance: 9,
      terrain: 'road'
    },
    coachNotes: 'Cruise intervals (Daniels\' term) let you accumulate more tempo-pace running than a single block. Both intervals should be at the same pace - if the second feels much harder, you started the first too fast. Use the 3-min jog recovery to reset breathing but keep moving. Great workout for half-marathon preparation.'
  },

  run_progression_run: {
    id: 'run_progression_run',
    name: 'Progression Run',
    sportType: 'running',
    category: 'tempo',
    difficulty: 'intermediate',
    duration: 50,
    targetTSS: 68,
    intensityFactor: 0.82,
    description: '50-minute progression run that starts easy and finishes at tempo pace. Teaches pace discipline and builds finishing speed under fatigue.',
    focusArea: 'muscular_endurance',
    tags: ['tempo', 'z2', 'z3', 'progression', 'negative-split', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 9,
    structure: {
      warmup: null,
      main: [
        { duration: 20, zone: 2, cadence: '170-175 spm', description: 'Easy pace - first third' },
        { duration: 15, zone: 2, cadence: '175-180 spm', description: 'Moderate pace - middle third' },
        { duration: 15, zone: 3, cadence: '178-185 spm', description: 'Tempo pace - final third' }
      ],
      cooldown: null
    },
    runningStructure: {
      warmup: null,
      main: [
        {
          duration: 20,
          paceZone: 2,
          pacePctThreshold: 120,
          targetPace: '5:45-6:15/km',
          heartRateZone: 2,
          cadence: '170-175',
          description: 'Easy pace, settle into rhythm'
        },
        {
          duration: 15,
          paceZone: 2,
          pacePctThreshold: 112,
          targetPace: '5:15-5:45/km',
          heartRateZone: 2,
          cadence: '175-180',
          description: 'Moderate aerobic - pick up the pace slightly'
        },
        {
          duration: 15,
          paceZone: 3,
          pacePctThreshold: 106,
          targetPace: '4:45-5:15/km',
          heartRateZone: 3,
          cadence: '178-185',
          description: 'Tempo effort to finish - comfortably hard'
        }
      ],
      cooldown: null,
      totalDistance: 9,
      terrain: 'road'
    },
    coachNotes: 'The progression run is one of the most race-specific workouts. The key is patience early on: the first 20 minutes should feel genuinely easy. Let the pace come to you naturally as you warm up. The final 15 minutes at tempo should feel controlled, not desperate. This teaches you to finish strong in races. Great for building confidence.'
  },

  // ============================================================
  // THRESHOLD (Zone 4)
  // ============================================================
  run_threshold_intervals: {
    id: 'run_threshold_intervals',
    name: 'Threshold Intervals',
    sportType: 'running',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 50,
    targetTSS: 78,
    intensityFactor: 0.92,
    description: '50-minute session with 4x5-minute intervals at lactate threshold pace. Builds the ability to sustain hard efforts and raises lactate threshold.',
    focusArea: 'threshold',
    tags: ['threshold', 'z4', 'intervals', 'lactate-threshold', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 9,
    structure: {
      warmup: { duration: 12, zone: 2, description: 'Progressive warmup' },
      main: [
        {
          type: 'repeat',
          sets: 4,
          work: { duration: 5, zone: 4, cadence: '180-188 spm', description: '5min at threshold' },
          rest: { duration: 2.5, zone: 1, description: 'Easy jog recovery' }
        }
      ],
      cooldown: { duration: 8, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 12,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Progressive warmup with 2-3 short pickups'
      },
      main: [
        {
          type: 'repeat',
          sets: 4,
          work: {
            duration: 5,
            paceZone: 4,
            pacePctThreshold: 100,
            targetPace: '4:15-4:45/km',
            heartRateZone: 4,
            cadence: '180-188',
            description: 'Threshold pace - hard but controlled'
          },
          rest: {
            duration: 2.5,
            paceZone: 1,
            targetPace: '6:00-6:30/km',
            cadence: '165-170',
            description: 'Easy jog recovery'
          }
        }
      ],
      cooldown: {
        duration: 8,
        paceZone: 1,
        targetPace: '6:15-7:00/km',
        cadence: '165-170',
        description: 'Easy jog cooldown'
      },
      totalDistance: 9,
      terrain: 'road'
    },
    coachNotes: 'Threshold intervals are the most efficient way to raise your lactate threshold. Each interval should be at the pace you could sustain for about 60 minutes in a race. All 4 reps should be at the same pace - if you are slowing on the 4th, start more conservatively. Focus on steady breathing (2:2 in:out ratio) and relaxed upper body. Avoid clenching jaw or hunching shoulders.'
  },

  run_threshold_continuous: {
    id: 'run_threshold_continuous',
    name: 'Continuous Threshold Run',
    sportType: 'running',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 45,
    targetTSS: 75,
    intensityFactor: 0.95,
    description: '45-minute session with 20 minutes continuous at threshold pace. A challenging workout that builds mental and physical capacity to sustain hard effort.',
    focusArea: 'threshold',
    tags: ['threshold', 'z4', 'continuous', 'lactate-threshold', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 8.5,
    structure: {
      warmup: { duration: 12, zone: 2, description: 'Progressive warmup with pickups' },
      main: [
        { duration: 20, zone: 4, cadence: '180-188 spm', description: '20min continuous threshold' }
      ],
      cooldown: { duration: 13, zone: 1, description: 'Extended cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 12,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Gradual warmup, include 3x20sec pickups in last 3 min'
      },
      main: [
        {
          duration: 20,
          paceZone: 4,
          pacePctThreshold: 100,
          targetPace: '4:15-4:45/km',
          heartRateZone: 4,
          cadence: '180-188',
          description: '20 minutes continuous at lactate threshold pace'
        }
      ],
      cooldown: {
        duration: 13,
        paceZone: 1,
        targetPace: '6:15-7:00/km',
        cadence: '165-170',
        description: 'Extended cooldown jog to clear lactate'
      },
      totalDistance: 8.5,
      terrain: 'road'
    },
    coachNotes: 'This is a demanding workout - 20 continuous minutes at threshold requires focus. Start at the low end of your threshold pace range and hold steady. Break the effort mentally into 4x5-minute blocks. Breathing will be labored but rhythmic. If you cannot maintain pace in the final 5 minutes, target 15-18 minutes next time and build up. Ensure at least 48 hours recovery before the next hard session.'
  },

  run_tempo_threshold_combo: {
    id: 'run_tempo_threshold_combo',
    name: 'Tempo-Threshold Combo',
    sportType: 'running',
    category: 'threshold',
    difficulty: 'advanced',
    duration: 55,
    targetTSS: 82,
    intensityFactor: 0.93,
    description: '55-minute session mixing tempo and threshold efforts. Builds the ability to change gears within a run - essential for racing.',
    focusArea: 'threshold',
    tags: ['tempo', 'threshold', 'z3', 'z4', 'mixed', 'race-prep', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 10,
    structure: {
      warmup: { duration: 10, zone: 2, description: 'Easy warmup jog' },
      main: [
        { duration: 10, zone: 3, cadence: '175-183 spm', description: '10min tempo' },
        { duration: 3, zone: 1, description: 'Easy jog recovery' },
        { duration: 8, zone: 4, cadence: '180-188 spm', description: '8min threshold' },
        { duration: 3, zone: 1, description: 'Easy jog recovery' },
        { duration: 8, zone: 3, cadence: '175-183 spm', description: '8min tempo' },
        { duration: 3, zone: 1, description: 'Easy jog recovery' },
        { duration: 5, zone: 4, cadence: '180-188 spm', description: '5min threshold finish' }
      ],
      cooldown: { duration: 5, zone: 1, description: 'Easy cooldown' }
    },
    runningStructure: {
      warmup: {
        duration: 10,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-175',
        description: 'Easy warmup jog with light strides at end'
      },
      main: [
        {
          duration: 10,
          paceZone: 3,
          pacePctThreshold: 107,
          targetPace: '4:45-5:10/km',
          heartRateZone: 3,
          cadence: '175-183',
          description: 'Tempo block - settle into comfortably hard effort'
        },
        {
          duration: 3,
          paceZone: 1,
          targetPace: '6:00-6:30/km',
          cadence: '165-170',
          description: 'Easy jog recovery'
        },
        {
          duration: 8,
          paceZone: 4,
          pacePctThreshold: 100,
          targetPace: '4:15-4:45/km',
          heartRateZone: 4,
          cadence: '180-188',
          description: 'Threshold - controlled hard effort'
        },
        {
          duration: 3,
          paceZone: 1,
          targetPace: '6:00-6:30/km',
          cadence: '165-170',
          description: 'Easy jog recovery'
        },
        {
          duration: 8,
          paceZone: 3,
          pacePctThreshold: 107,
          targetPace: '4:45-5:10/km',
          heartRateZone: 3,
          cadence: '175-183',
          description: 'Back to tempo - focus on rhythm'
        },
        {
          duration: 3,
          paceZone: 1,
          targetPace: '6:00-6:30/km',
          cadence: '165-170',
          description: 'Easy jog recovery'
        },
        {
          duration: 5,
          paceZone: 4,
          pacePctThreshold: 100,
          targetPace: '4:15-4:45/km',
          heartRateZone: 4,
          cadence: '180-188',
          description: 'Threshold finish - strong and controlled'
        }
      ],
      cooldown: {
        duration: 5,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog'
      },
      totalDistance: 10,
      terrain: 'road'
    },
    coachNotes: 'This workout simulates the surging demands of racing. The tempo sections should feel controlled; the threshold sections are where you are working. The ability to shift between efforts and recover while still running is a critical race skill. Stay mentally engaged during recovery jogs - use them to reset breathing, not zone out.'
  },

  // ============================================================
  // VO2MAX (Zone 5)
  // ============================================================
  run_vo2max_800s: {
    id: 'run_vo2max_800s',
    name: '5x800m VO2max Repeats',
    sportType: 'running',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 50,
    targetTSS: 78,
    intensityFactor: 1.05,
    description: 'Track workout: 5x800m at VO2max pace with 400m jog recovery. The classic VO2max stimulus - hard enough to drive adaptation, with adequate recovery.',
    focusArea: 'vo2max',
    tags: ['vo2max', 'z5', 'track', '800m', 'intervals', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'track',
    targetDistance: 8,
    structure: {
      warmup: { duration: 12, zone: 2, description: 'Easy warmup with strides' },
      main: [
        {
          type: 'repeat',
          sets: 5,
          work: { duration: 3, zone: 5, cadence: '185-195 spm', description: '800m at VO2max pace' },
          rest: { duration: 2.5, zone: 1, description: '400m jog recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 12,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Easy jog, dynamic drills, 4x100m strides'
      },
      main: [
        {
          type: 'repeat',
          sets: 5,
          work: {
            distance: 800,
            paceZone: 5,
            pacePctThreshold: 92,
            targetPace: '3:40-4:10/km',
            heartRateZone: 5,
            cadence: '185-195',
            description: '800m at VO2max pace - hard but controlled'
          },
          rest: {
            distance: 400,
            paceZone: 1,
            targetPace: '6:30-7:00/km',
            cadence: '160-170',
            description: '400m jog recovery'
          }
        }
      ],
      cooldown: {
        duration: 10,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog, finish with light stretching'
      },
      totalDistance: 8,
      terrain: 'track',
      strides: 4
    },
    coachNotes: 'VO2max intervals are the most potent stimulus for aerobic capacity. Run each 800m at your current 3K-5K race pace. The key is even pacing within each repeat: first 400m should equal second 400m. If reps 4-5 slow by more than 5 seconds, reduce to 4 reps next time. Full warmup is critical - include drills (high knees, butt kicks, A-skips) and strides before starting.'
  },

  run_vo2max_1000s: {
    id: 'run_vo2max_1000s',
    name: '4x1000m VO2max Intervals',
    sportType: 'running',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 50,
    targetTSS: 80,
    intensityFactor: 1.08,
    description: '4x1000m at VO2max effort with 3-minute recovery jog. Longer VO2max intervals that develop the ability to sustain high aerobic output.',
    focusArea: 'vo2max',
    tags: ['vo2max', 'z5', '1000m', 'intervals', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'track',
    targetDistance: 9,
    structure: {
      warmup: { duration: 12, zone: 2, description: 'Easy warmup with drills and strides' },
      main: [
        {
          type: 'repeat',
          sets: 4,
          work: { duration: 4, zone: 5, cadence: '185-195 spm', description: '1000m at VO2max pace' },
          rest: { duration: 3, zone: 1, description: '3min jog recovery' }
        }
      ],
      cooldown: { duration: 10, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 12,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Easy jog, dynamic drills, 3x100m strides'
      },
      main: [
        {
          type: 'repeat',
          sets: 4,
          work: {
            distance: 1000,
            paceZone: 5,
            pacePctThreshold: 93,
            targetPace: '3:45-4:15/km',
            heartRateZone: 5,
            cadence: '185-195',
            description: '1000m at VO2max pace - strong, controlled effort'
          },
          rest: {
            duration: 3,
            paceZone: 1,
            targetPace: '6:30-7:00/km',
            cadence: '160-170',
            description: '3-minute jog recovery'
          }
        }
      ],
      cooldown: {
        duration: 10,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog'
      },
      totalDistance: 9,
      terrain: 'track'
    },
    coachNotes: 'Longer VO2max reps accumulate more time at peak oxygen uptake. Pace should be close to your 5K race pace. Even splits within each 1000m are essential - going out too fast causes excessive lactate that compromises later reps. Use the 3-min jog to genuinely recover: shake out your arms, reset your breathing. Heart rate should drop to ~70% max before starting the next rep.'
  },

  run_vo2max_hills: {
    id: 'run_vo2max_hills',
    name: 'VO2max Hill Repeats',
    sportType: 'running',
    category: 'vo2max',
    difficulty: 'advanced',
    duration: 50,
    targetTSS: 75,
    intensityFactor: 1.02,
    description: '8x90-second uphill repeats at hard effort with jog-down recovery. Hills provide VO2max stimulus with reduced impact and lower injury risk.',
    focusArea: 'vo2max',
    tags: ['vo2max', 'z5', 'hills', 'strength', 'running'],
    terrainType: 'hilly',
    runningTerrainType: 'road',
    targetDistance: 7,
    structure: {
      warmup: { duration: 12, zone: 2, description: 'Easy warmup on flat terrain' },
      main: [
        {
          type: 'repeat',
          sets: 8,
          work: { duration: 1.5, zone: 5, cadence: '175-185 spm', description: '90sec uphill at VO2max effort' },
          rest: { duration: 2.5, zone: 1, description: 'Easy jog downhill recovery' }
        }
      ],
      cooldown: { duration: 6, zone: 1, description: 'Easy cooldown jog on flat' }
    },
    runningStructure: {
      warmup: {
        duration: 12,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Easy warmup jog on flat ground, include 2-3 short pickups'
      },
      main: [
        {
          type: 'repeat',
          sets: 8,
          work: {
            duration: 1.5,
            paceZone: 5,
            heartRateZone: 5,
            cadence: '175-185',
            description: '90sec hard uphill - drive knees, pump arms, VO2max effort'
          },
          rest: {
            duration: 2.5,
            paceZone: 1,
            cadence: '155-165',
            description: 'Easy jog back down the hill'
          }
        }
      ],
      cooldown: {
        duration: 6,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog on flat terrain'
      },
      totalDistance: 7,
      terrain: 'mixed'
    },
    coachNotes: 'Hill repeats are a fantastic VO2max stimulus with lower injury risk than flat intervals because the incline reduces impact forces. Find a 5-7% grade hill. Focus on driving your knees up, pumping your arms powerfully, and maintaining a short, quick stride. Do NOT look down - keep your gaze 10-15m ahead up the hill. Jog down slowly and carefully for recovery. If you have access to only a short hill, reduce rep duration to 60 seconds and add 2 more reps.'
  },

  // ============================================================
  // SPEED / ANAEROBIC (Zone 6)
  // ============================================================
  run_speed_200s: {
    id: 'run_speed_200s',
    name: '8x200m Speed Repeats',
    sportType: 'running',
    category: 'anaerobic',
    difficulty: 'advanced',
    duration: 40,
    targetTSS: 55,
    intensityFactor: 1.10,
    description: 'Track workout: 8x200m fast with 200m jog recovery. Develops raw speed, neuromuscular power, and running economy at high velocities.',
    focusArea: 'speed',
    tags: ['speed', 'z6', 'track', '200m', 'anaerobic', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'track',
    targetDistance: 6,
    structure: {
      warmup: { duration: 15, zone: 2, description: 'Thorough warmup with drills and strides' },
      main: [
        {
          type: 'repeat',
          sets: 8,
          work: { duration: 0.6, zone: 6, cadence: '195-210 spm', description: '200m fast' },
          rest: { duration: 1.5, zone: 1, description: '200m jog recovery' }
        }
      ],
      cooldown: { duration: 8, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 15,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Easy jog 10min, then dynamic drills and 4x80m strides building to fast pace'
      },
      main: [
        {
          type: 'repeat',
          sets: 8,
          work: {
            distance: 200,
            paceZone: 6,
            pacePctThreshold: 82,
            targetPace: '3:00-3:30/km',
            cadence: '195-210',
            description: '200m at near-sprint - fast and smooth'
          },
          rest: {
            distance: 200,
            paceZone: 1,
            cadence: '155-165',
            description: '200m easy jog recovery'
          }
        }
      ],
      cooldown: {
        duration: 8,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog, finish with gentle stretching'
      },
      totalDistance: 6,
      terrain: 'track'
    },
    coachNotes: 'Short speed work develops your neuromuscular system and running economy. These are fast but NOT all-out sprints - aim for about 95% effort with controlled, powerful form. Focus on driving knees high, powerful arm swing, and landing under your center of mass. Stay relaxed through the face, neck, and shoulders. A thorough warmup is absolutely essential to prevent injury. If you feel any twinges, stop immediately.'
  },

  run_speed_400s: {
    id: 'run_speed_400s',
    name: '6x400m at 5K Pace',
    sportType: 'running',
    category: 'anaerobic',
    difficulty: 'advanced',
    duration: 45,
    targetTSS: 65,
    intensityFactor: 1.12,
    description: 'Track workout: 6x400m at 5K race pace with 400m jog recovery. Develops speed endurance and the ability to sustain fast turnover.',
    focusArea: 'speed',
    tags: ['speed', 'z5', 'z6', 'track', '400m', '5k-pace', 'running'],
    terrainType: 'flat',
    runningTerrainType: 'track',
    targetDistance: 8,
    structure: {
      warmup: { duration: 15, zone: 2, description: 'Thorough warmup with drills and strides' },
      main: [
        {
          type: 'repeat',
          sets: 6,
          work: { duration: 1.5, zone: 6, cadence: '190-200 spm', description: '400m at 5K pace' },
          rest: { duration: 2.5, zone: 1, description: '400m jog recovery' }
        }
      ],
      cooldown: { duration: 6, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 15,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Easy jog 10min, dynamic drills, 4x100m strides'
      },
      main: [
        {
          type: 'repeat',
          sets: 6,
          work: {
            distance: 400,
            paceZone: 6,
            pacePctThreshold: 88,
            targetPace: '3:20-3:50/km',
            cadence: '190-200',
            description: '400m at 5K race pace'
          },
          rest: {
            distance: 400,
            paceZone: 1,
            targetPace: '6:30-7:00/km',
            cadence: '155-165',
            description: '400m easy jog recovery'
          }
        }
      ],
      cooldown: {
        duration: 6,
        paceZone: 1,
        targetPace: '6:30-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog'
      },
      totalDistance: 8,
      terrain: 'track'
    },
    coachNotes: '400m repeats at 5K pace develop the specific speed endurance needed for racing. All 6 reps should be within 2-3 seconds of each other. If you are slowing significantly on the last 2 reps, you started too fast. Focus on maintaining form as you fatigue: keep hips forward, shoulders back and relaxed, quick arm drive. Time your recoveries - do not rush them, the quality of each rep matters more than total time.'
  },

  // ============================================================
  // RACE-SPECIFIC
  // ============================================================
  run_race_pace_half: {
    id: 'run_race_pace_half',
    name: 'Half Marathon Pace Run',
    sportType: 'running',
    category: 'tempo',
    difficulty: 'advanced',
    duration: 60,
    targetTSS: 85,
    intensityFactor: 0.87,
    description: '60-minute session with 30 minutes at half marathon goal pace. The key race-specific workout for half marathon preparation.',
    focusArea: 'race_specific',
    tags: ['race-pace', 'half-marathon', 'z3', 'z4', 'running', 'race-prep'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 11,
    structure: {
      warmup: { duration: 15, zone: 2, description: 'Progressive warmup' },
      main: [
        { duration: 30, zone: 3, cadence: '178-186 spm', description: '30min at half marathon pace' }
      ],
      cooldown: { duration: 15, zone: 1, description: 'Easy cooldown' }
    },
    runningStructure: {
      warmup: {
        duration: 15,
        paceZone: 2,
        targetPace: '5:30-6:00/km',
        heartRateZone: 2,
        cadence: '170-178',
        description: 'Easy warmup building from jog to moderate pace, include 3 strides'
      },
      main: [
        {
          duration: 30,
          paceZone: 3,
          pacePctThreshold: 105,
          targetPace: '4:30-5:00/km',
          heartRateZone: 3,
          cadence: '178-186',
          description: '30 minutes at half marathon goal pace'
        }
      ],
      cooldown: {
        duration: 15,
        paceZone: 1,
        targetPace: '6:15-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog'
      },
      totalDistance: 11,
      terrain: 'road'
    },
    coachNotes: 'This workout teaches your body and mind what race pace feels like. The effort should feel controlled but purposeful - harder than tempo but not as intense as threshold. Lock into your goal pace within the first kilometer and hold steady. Practice your planned race-day breathing pattern. Run on terrain similar to your goal race. If you cannot hold pace for the full 30 minutes, your goal time may need adjustment.'
  },

  run_race_pace_marathon: {
    id: 'run_race_pace_marathon',
    name: 'Marathon Pace Long Run',
    sportType: 'running',
    category: 'endurance',
    difficulty: 'advanced',
    duration: 90,
    targetTSS: 110,
    intensityFactor: 0.80,
    description: '90-minute run with 60 minutes at marathon goal pace. The most important marathon-specific workout - teaches pacing, fueling, and mental endurance.',
    focusArea: 'race_specific',
    tags: ['race-pace', 'marathon', 'z2', 'z3', 'long-run', 'running', 'race-prep'],
    terrainType: 'flat',
    runningTerrainType: 'road',
    targetDistance: 16,
    structure: {
      warmup: { duration: 15, zone: 1, description: 'Easy warmup jog' },
      main: [
        { duration: 60, zone: 3, cadence: '175-183 spm', description: '60min at marathon pace' }
      ],
      cooldown: { duration: 15, zone: 1, description: 'Easy cooldown jog' }
    },
    runningStructure: {
      warmup: {
        duration: 15,
        paceZone: 2,
        targetPace: '5:45-6:15/km',
        heartRateZone: 2,
        cadence: '168-175',
        description: 'Easy warmup jog, settle into rhythm'
      },
      main: [
        {
          duration: 60,
          paceZone: 3,
          pacePctThreshold: 110,
          targetPace: '4:50-5:20/km',
          heartRateZone: 3,
          cadence: '175-183',
          description: '60 minutes at marathon goal pace - locked in'
        }
      ],
      cooldown: {
        duration: 15,
        paceZone: 1,
        targetPace: '6:15-7:00/km',
        cadence: '165-170',
        description: 'Easy cooldown jog, then walk'
      },
      totalDistance: 16,
      terrain: 'road'
    },
    coachNotes: 'This is the single most important workout in marathon preparation. The 60-minute block at goal pace teaches your body to burn fuel efficiently at race effort. CRITICAL: practice your exact race-day nutrition during this run (same gels, same timing, same fluids). Take fuel every 30-45 minutes during the marathon pace section. Start the marathon pace conservatively - the first 15 minutes should feel almost easy. If you struggle in the final 15 minutes, either your fueling needs work or your goal pace needs to be adjusted. Run this workout no more than once every 2 weeks.'
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get running workouts by category
 */
export function getRunningWorkoutsByCategory(category: WorkoutCategory): WorkoutDefinition[] {
  return Object.values(RUNNING_WORKOUT_LIBRARY).filter(w => w.category === category);
}

/**
 * Get running workouts recommended for a training phase
 */
export function getRunningWorkoutsForPhase(phase: TrainingPhase, fitnessLevel?: FitnessLevel): WorkoutDefinition[] {
  const phaseWorkouts: Record<TrainingPhase, WorkoutCategory[]> = {
    base: ['recovery', 'endurance', 'tempo'],
    build: ['tempo', 'threshold', 'vo2max'],
    peak: ['threshold', 'vo2max', 'anaerobic'],
    taper: ['recovery', 'endurance'],
    recovery: ['recovery']
  };

  const categories = phaseWorkouts[phase] || ['endurance'];

  return Object.values(RUNNING_WORKOUT_LIBRARY).filter(w =>
    categories.includes(w.category) &&
    (fitnessLevel ? w.difficulty === fitnessLevel || w.difficulty === 'beginner' : true)
  );
}

/**
 * Get all running workout IDs in the library
 */
export function getAllRunningWorkoutIds(): string[] {
  return Object.keys(RUNNING_WORKOUT_LIBRARY);
}

export default RUNNING_WORKOUT_LIBRARY;
