/**
 * Training Plan Templates
 * Pre-built structured training plans with complete week-by-week workout schedules
 *
 * Each plan includes:
 * - Goal-specific periodization (Base -> Build -> Peak -> Taper)
 * - Progressive overload with recovery weeks every 3-4 weeks
 * - Complete weekTemplates with specific workouts for each day
 */

import type {
  TrainingPlanTemplate,
  TrainingPlanTemplatesMap,
  TrainingGoal,
  FitnessLevel,
  TrainingMethodology,
} from '../types/training';

export const TRAINING_PLAN_TEMPLATES: TrainingPlanTemplatesMap = {
  // ============================================================
  // POLARIZED TRAINING PLANS
  // ============================================================
  polarized_8_week: {
    id: 'polarized_8_week',
    name: '8-Week Polarized FTP Builder',
    description: 'Build FTP and endurance using polarized training methodology. 80% low intensity, 20% high intensity.',
    duration: 8,
    methodology: 'polarized',
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    hoursPerWeek: { min: 6, max: 10 },
    weeklyTSS: { min: 300, max: 500 },
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Build aerobic base with Zone 2' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Add VO2max intensity' },
      { weeks: [8], phase: 'taper', focus: 'Freshen up and test gains' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'endurance_base_build', notes: 'Longer Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'polarized_intensity_day', notes: 'Hard day - VO2max intervals' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'foundation_miles', notes: 'Mid-week endurance' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Easy recovery' },
        friday: { workout: 'four_by_eight_vo2', notes: 'Hard day - Long VO2 intervals' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'foundation_miles', notes: 'Mid-week endurance' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'thirty_thirty_intervals', notes: 'Hard day - 30/30 intervals' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride (increase duration)' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'bossi_intervals', notes: 'Hard day - Advanced VO2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Easy recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'four_by_eight_vo2', notes: 'Hard day - VO2 intervals' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'polarized_intensity_day', notes: 'Hard day - Max effort VO2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride (peak volume)' }
      },
      8: {
        sunday: { workout: null, notes: 'FTP Test or Goal Event' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'thirty_thirty_intervals', notes: 'Short intensity to maintain sharpness' },
        thursday: { workout: 'recovery_spin', notes: 'Very easy' },
        friday: { workout: 'easy_recovery_ride', notes: 'Easy spin' },
        saturday: { workout: null, notes: 'Rest - prepare for FTP test' }
      }
    },
    expectedGains: {
      ftp: '8-12%',
      vo2max: '5-8%',
      endurance: 'Significant improvement in aerobic base'
    },
    targetAudience: 'Intermediate cyclists looking for time-efficient FTP gains with minimal recovery issues'
  },

  // ============================================================
  // SWEET SPOT BASE PLANS
  // ============================================================
  sweet_spot_12_week: {
    id: 'sweet_spot_12_week',
    name: '12-Week Sweet Spot Base',
    description: 'Build FTP efficiently with Sweet Spot training. Time-efficient approach for busy athletes.',
    duration: 12,
    methodology: 'sweet_spot',
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    hoursPerWeek: { min: 6, max: 8 },
    weeklyTSS: { min: 300, max: 450 },
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Base + intro to SST' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'SST volume increase' },
      { weeks: [8], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [9, 10, 11], phase: 'build', focus: 'Peak SST load' },
      { weeks: [12], phase: 'taper', focus: 'Taper and test' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Intro to Sweet Spot' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2 endurance' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: 'Long Zone 2' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Sweet Spot intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'traditional_sst', notes: 'Sustained Sweet Spot' },
        saturday: { workout: 'long_endurance_ride', notes: 'Weekend long ride' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'Extended SST intervals' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate endurance' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        saturday: { workout: 'long_endurance_ride', notes: 'Peak long ride' }
      },
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'three_by_ten_sst', notes: 'Light SST' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Peak SST workout' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Peak SST' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'four_by_twelve_sst', notes: 'Final hard SST' },
        saturday: { workout: 'long_endurance_ride', notes: 'Last long ride' }
      },
      12: {
        sunday: { workout: null, notes: 'FTP Test day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'three_by_ten_sst', notes: 'Light opener' },
        thursday: { workout: 'recovery_spin', notes: 'Very easy' },
        friday: { workout: 'easy_recovery_ride', notes: 'Legs up' },
        saturday: { workout: null, notes: 'Rest before test' }
      }
    },
    expectedGains: {
      ftp: '10-15%',
      muscular_endurance: 'Significant improvement',
      time_to_exhaustion: '15-20% improvement at threshold'
    },
    targetAudience: 'Time-constrained athletes seeking maximum FTP gains with limited training time'
  },

  // ============================================================
  // CENTURY / GRAN FONDO PLANS
  // ============================================================
  century_16_week: {
    id: 'century_16_week',
    name: '16-Week Century Ride Preparation',
    description: 'Progressive training plan to prepare for 100-mile cycling event.',
    duration: 16,
    methodology: 'pyramidal',
    goal: 'century',
    fitnessLevel: 'intermediate',
    hoursPerWeek: { min: 6, max: 12 },
    weeklyTSS: { min: 300, max: 600 },
    phases: [
      { weeks: [1, 2, 3, 4], phase: 'base', focus: 'Build aerobic base' },
      { weeks: [5, 6, 7, 8], phase: 'base', focus: 'Increase endurance volume' },
      { weeks: [9], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [10, 11, 12], phase: 'build', focus: 'Add intensity and volume' },
      { weeks: [13], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [14, 15], phase: 'peak', focus: 'Final long rides' },
      { weeks: [16], phase: 'taper', focus: 'Taper for event' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        wednesday: { workout: 'endurance_base_build', notes: 'Build base' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: '90min endurance' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'foundation_miles', notes: 'Endurance' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '2hr endurance' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'tempo_ride', notes: 'Intro tempo' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '2.5hr endurance' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'foundation_miles', notes: 'Endurance' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'long_endurance_ride', notes: '3hr endurance' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'two_by_twenty_tempo', notes: 'Tempo intervals' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '3hr endurance' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'tempo_ride', notes: 'Tempo' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '3.5hr endurance' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'two_by_twenty_tempo', notes: 'Tempo intervals' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '3.5hr endurance' }
      },
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'tempo_ride', notes: 'Tempo' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: '4hr endurance' }
      },
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: '90min recovery ride' }
      },
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'polarized_long_ride', notes: '4hr endurance' }
      },
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'two_by_twenty_tempo', notes: 'Tempo' },
        saturday: { workout: 'polarized_long_ride', notes: '4.5hr endurance' }
      },
      12: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'polarized_long_ride', notes: '4.5hr endurance' }
      },
      13: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: '2hr moderate' }
      },
      14: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'polarized_long_ride', notes: '5hr - dress rehearsal' }
      },
      15: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '3hr moderate' }
      },
      16: {
        sunday: { workout: null, notes: 'CENTURY EVENT DAY!' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Light spin' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Easy legs' },
        friday: { workout: 'recovery_spin', notes: 'Openers - 2x30sec' },
        saturday: { workout: null, notes: 'Complete rest' }
      }
    },
    expectedGains: {
      endurance: 'Ability to complete 100-mile rides comfortably',
      aerobic_capacity: 'Large aerobic base',
      efficiency: 'Improved fat oxidation and metabolic efficiency'
    },
    targetAudience: 'Cyclists preparing for first century ride or gran fondo event'
  },

  // ============================================================
  // CLIMBING / HILL TRAINING PLANS
  // ============================================================
  climbing_improvement_8_week: {
    id: 'climbing_improvement_8_week',
    name: '8-Week Climbing Performance Plan',
    description: 'Improve power-to-weight ratio and climbing-specific fitness.',
    duration: 8,
    methodology: 'threshold',
    goal: 'climbing',
    fitnessLevel: 'intermediate',
    hoursPerWeek: { min: 6, max: 10 },
    weeklyTSS: { min: 300, max: 500 },
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Build climbing endurance' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Climbing-specific intervals' },
      { weeks: [8], phase: 'peak', focus: 'Final climbing test' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'tempo_ride', notes: 'Tempo - simulate climb pace' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2 with hills' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'hill_repeats', notes: 'Hill repeats intro' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride with climbing' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'two_by_twenty_tempo', notes: 'Tempo intervals' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'hill_repeats', notes: '6x3min hill repeats' },
        saturday: { workout: 'long_endurance_ride', notes: 'Hilly long ride' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'climbing_repeats_long', notes: '6x5min climbs' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'long_endurance_ride', notes: 'Mountainous route' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'three_by_twelve_threshold', notes: 'Threshold intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'climbing_repeats_long', notes: '6x5min climbs' },
        saturday: { workout: 'long_endurance_ride', notes: 'Hilly long ride' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'over_under_intervals', notes: 'Over-unders' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'hill_repeats', notes: 'Hard hill repeats' },
        saturday: { workout: 'long_endurance_ride', notes: 'KOM hunting' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'climbing_repeats_long', notes: 'Peak climbing workout' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'three_by_twelve_threshold', notes: 'Threshold' },
        saturday: { workout: 'long_endurance_ride', notes: 'Epic climb day' }
      },
      8: {
        sunday: { workout: null, notes: 'Climbing Test - KOM attempt!' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'hill_repeats', notes: 'Short sharp openers' },
        thursday: { workout: 'recovery_spin', notes: 'Very easy' },
        friday: { workout: 'easy_recovery_ride', notes: 'Legs fresh' },
        saturday: { workout: null, notes: 'Rest before test' }
      }
    },
    expectedGains: {
      climbing_power: '8-12% improvement in sustained climbing power',
      power_to_weight: 'Improved through training and weight management',
      muscular_endurance: 'Significant gains in climbing-specific endurance'
    },
    targetAudience: 'Cyclists looking to improve climbing performance for hilly events'
  },

  // ============================================================
  // RACE PREPARATION PLANS
  // ============================================================
  road_race_12_week: {
    id: 'road_race_12_week',
    name: '12-Week Road Race Preparation',
    description: 'Build race-specific fitness with threshold, VO2max, and anaerobic work.',
    duration: 12,
    methodology: 'threshold',
    goal: 'racing',
    fitnessLevel: 'advanced',
    hoursPerWeek: { min: 8, max: 12 },
    weeklyTSS: { min: 400, max: 650 },
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Aerobic base with some intensity' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Threshold and VO2max focus' },
      { weeks: [8], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [9, 10, 11], phase: 'peak', focus: 'Race simulation and intensity' },
      { weeks: [12], phase: 'taper', focus: 'Taper for race' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'two_by_twenty_ftp', notes: 'Threshold intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'over_under_intervals', notes: 'Over-unders' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'three_by_twelve_threshold', notes: 'Threshold' },
        saturday: { workout: 'long_endurance_ride', notes: 'Group ride pace' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'five_by_four_vo2', notes: 'VO2max intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'two_by_twenty_ftp', notes: 'Threshold' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride with efforts' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'tempo_ride', notes: 'Light tempo' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'four_by_eight_vo2', notes: 'Long VO2 intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'over_under_intervals', notes: 'Over-unders' },
        saturday: { workout: 'long_endurance_ride', notes: 'Race pace simulation' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'bossi_intervals', notes: 'Advanced VO2' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'three_by_twelve_threshold', notes: 'Threshold' },
        saturday: { workout: 'long_endurance_ride', notes: 'Attacks practice' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'thirty_thirty_intervals', notes: '30/30s' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'four_by_eight_vo2', notes: 'VO2max' },
        saturday: { workout: 'long_endurance_ride', notes: 'Hard group ride' }
      },
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'tempo_ride', notes: 'Light tempo' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'race_simulation', notes: 'Race simulation' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'forty_twenty_intervals', notes: '40/20s' },
        saturday: { workout: 'long_endurance_ride', notes: 'Race pace' }
      },
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'bossi_intervals', notes: 'Surging VO2' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'race_simulation', notes: 'Race simulation' },
        saturday: { workout: 'long_endurance_ride', notes: 'Practice race tactics' }
      },
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'sprint_intervals', notes: 'Sprint practice' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'thirty_thirty_intervals', notes: '30/30 sharpening' },
        saturday: { workout: 'long_endurance_ride', notes: 'Final hard ride' }
      },
      12: {
        sunday: { workout: null, notes: 'RACE DAY!' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Light spin' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Openers workout' },
        friday: { workout: 'recovery_spin', notes: 'Spin out legs' },
        saturday: { workout: null, notes: 'Complete rest' }
      }
    },
    expectedGains: {
      ftp: '12-18%',
      vo2max: '8-12%',
      anaerobic_capacity: 'Significant improvement in race-specific power',
      repeatability: 'Improved ability to repeat hard efforts'
    },
    targetAudience: 'Competitive cyclists preparing for road racing season'
  },

  // ============================================================
  // BEGINNER PLANS
  // ============================================================
  beginner_6_week: {
    id: 'beginner_6_week',
    name: '6-Week Beginner Foundation',
    description: 'Perfect introduction to structured training for new cyclists.',
    duration: 6,
    methodology: 'endurance',
    goal: 'general_fitness',
    fitnessLevel: 'beginner',
    hoursPerWeek: { min: 3, max: 5 },
    weeklyTSS: { min: 150, max: 250 },
    phases: [
      { weeks: [1, 2], phase: 'base', focus: 'Easy rides to build habit' },
      { weeks: [3, 4], phase: 'base', focus: 'Increase ride duration' },
      { weeks: [5, 6], phase: 'build', focus: 'Add gentle intensity' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: '30min easy spin' },
        wednesday: { workout: null, notes: 'Rest or walk' },
        thursday: { workout: 'recovery_spin', notes: '30min easy' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'easy_recovery_ride', notes: '45min easy ride' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'easy_recovery_ride', notes: '45min easy' },
        wednesday: { workout: 'recovery_spin', notes: '30min spin' },
        thursday: { workout: null, notes: 'Rest day' },
        friday: { workout: 'easy_recovery_ride', notes: '45min easy' },
        saturday: { workout: 'foundation_miles', notes: '60min Zone 2' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'foundation_miles', notes: '60min Zone 2' },
        wednesday: { workout: null, notes: 'Rest day' },
        thursday: { workout: 'easy_recovery_ride', notes: '45min easy' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'foundation_miles', notes: '60min Zone 2' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'foundation_miles', notes: '60min Zone 2' },
        wednesday: { workout: 'easy_recovery_ride', notes: '45min easy' },
        thursday: { workout: null, notes: 'Rest day' },
        friday: { workout: 'foundation_miles', notes: '60min Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: '75min easy' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'foundation_miles', notes: '60min Zone 2' },
        wednesday: { workout: 'tempo_ride', notes: 'Intro tempo - stay easy!' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'endurance_base_build', notes: '90min Zone 2' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'foundation_miles', notes: '60min Zone 2' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'tempo_ride', notes: 'Gentle tempo' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'endurance_base_build', notes: '90min celebratory ride!' }
      }
    },
    expectedGains: {
      endurance: 'Ability to ride 1-2 hours comfortably',
      aerobic_capacity: 'Foundation aerobic fitness',
      consistency: 'Establish training routine'
    },
    targetAudience: 'New cyclists or those returning after a long break'
  }
};

/**
 * Get plan template by ID
 */
export function getPlanTemplate(id: string): TrainingPlanTemplate | undefined {
  return TRAINING_PLAN_TEMPLATES[id];
}

/**
 * Get all plan templates
 */
export function getAllPlans(): TrainingPlanTemplate[] {
  return Object.values(TRAINING_PLAN_TEMPLATES);
}

/**
 * Get plans by goal
 */
export function getPlansByGoal(goal: TrainingGoal): TrainingPlanTemplate[] {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.goal === goal);
}

/**
 * Get plans by fitness level
 */
export function getPlansByFitnessLevel(level: FitnessLevel): TrainingPlanTemplate[] {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.fitnessLevel === level);
}

/**
 * Get plans by duration
 */
export function getPlansByDuration(weeks: number): TrainingPlanTemplate[] {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.duration === weeks);
}

/**
 * Get plans by methodology
 */
export function getPlansByMethodology(methodology: TrainingMethodology): TrainingPlanTemplate[] {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.methodology === methodology);
}

/**
 * Get all workout IDs used in templates (for validation)
 */
export function getAllWorkoutIdsFromTemplates(): Set<string> {
  const workoutIds = new Set<string>();

  for (const plan of Object.values(TRAINING_PLAN_TEMPLATES)) {
    for (const week of Object.values(plan.weekTemplates)) {
      for (const day of Object.values(week)) {
        if (day.workout) {
          workoutIds.add(day.workout);
        }
      }
    }
  }

  return workoutIds;
}

export default TRAINING_PLAN_TEMPLATES;
