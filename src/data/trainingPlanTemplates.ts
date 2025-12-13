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
  PlanCategory,
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
    category: 'foundation',
    hoursPerWeek: { min: 6, max: 10 },
    weeklyTSS: { min: 300, max: 500 },
    researchBasis: [
      'Seiler, S. (2010). What is Best Practice for Training Intensity and Duration Distribution in Endurance Athletes? IJSPP',
      'Stöggl & Sperlich (2014). Polarized training has greater impact on key endurance variables. Frontiers in Physiology'
    ],
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
    category: 'time_crunched',
    hoursPerWeek: { min: 6, max: 8 },
    weeklyTSS: { min: 300, max: 450 },
    researchBasis: [
      'Neal et al. (2013). Six weeks of polarized vs threshold training in trained cyclists. J Sports Sci',
      'Seiler & Tønnessen (2009). Training intensity distribution: Performance outcomes. IJSPP'
    ],
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
    category: 'endurance_events',
    hoursPerWeek: { min: 6, max: 12 },
    weeklyTSS: { min: 300, max: 600 },
    researchBasis: [
      'Seiler (2010). Pyramidal intensity distribution in elite endurance athletes. IJSPP',
      'Esteve-Lanao et al. (2005). Impact of training intensity distribution on performance. Med Sci Sports Exerc'
    ],
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
    category: 'road_racing',
    hoursPerWeek: { min: 6, max: 10 },
    weeklyTSS: { min: 300, max: 500 },
    researchBasis: [
      'Padilla et al. (1999). Exercise intensity during competition time trials in professional road cycling. Med Sci Sports Exerc',
      'Rønnestad et al. (2010). Short intervals induce superior training adaptations. Scand J Med Sci Sports'
    ],
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
    category: 'road_racing',
    hoursPerWeek: { min: 8, max: 12 },
    weeklyTSS: { min: 400, max: 650 },
    researchBasis: [
      'Laursen & Jenkins (2002). Scientific basis for high-intensity interval training. Sports Med',
      'Seiler (2010). Training intensity distribution in elite endurance athletes. IJSPP',
      'Billat (2001). Interval training at VO2max: effects on aerobic performance. Med Sci Sports Exerc'
    ],
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
    category: 'foundation',
    hoursPerWeek: { min: 3, max: 5 },
    weeklyTSS: { min: 150, max: 250 },
    researchBasis: [
      'American College of Sports Medicine (2018). Guidelines for exercise prescription',
      'Seiler (2010). The importance of progressive training overload. IJSPP'
    ],
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
  },

  // ============================================================
  // MASTERS (35+) PLANS
  // ============================================================
  masters_endurance_12_week: {
    id: 'masters_endurance_12_week',
    name: '12-Week Masters Performance',
    description: 'Age-appropriate training for cyclists 35+ with extended recovery periods and strength integration. Based on research showing masters athletes need more recovery but can maintain high performance.',
    duration: 12,
    methodology: 'polarized',
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    category: 'masters',
    hoursPerWeek: { min: 6, max: 9 },
    weeklyTSS: { min: 300, max: 450 },
    researchBasis: [
      'Tanaka & Seals (2008). Endurance exercise performance in Masters athletes. J Physiology',
      'Louis et al. (2012). Strength training improves cycling efficiency in master endurance athletes. Scand J Med Sci Sports',
      'Peiffer et al. (2008). Age-related decline in VO2max and impact of training. Eur Rev Aging Phys Act'
    ],
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Aerobic foundation with strength' },
      { weeks: [4], phase: 'recovery', focus: 'Extended recovery week' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Add intensity with extra rest' },
      { weeks: [8], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [9, 10, 11], phase: 'build', focus: 'Peak performance phase' },
      { weeks: [12], phase: 'taper', focus: 'Taper and test' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength training day (off-bike)' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        friday: { workout: null, notes: 'Rest or strength' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long Zone 2' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength training day' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'polarized_intensity_day', notes: 'Hard day - VO2 intervals' },
        friday: { workout: null, notes: 'Complete rest (48h before next hard session)' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long Zone 2' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength training day' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Easy recovery' },
        thursday: { workout: 'four_by_eight_vo2', notes: 'VO2max intervals' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'polarized_long_ride', notes: 'Extended endurance' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Optional light strength' },
        tuesday: { workout: 'recovery_spin', notes: 'Very easy' },
        wednesday: { workout: null, notes: 'Complete rest' },
        thursday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength training' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'thirty_thirty_intervals', notes: '30/30 intervals' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength training' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        thursday: { workout: 'bossi_intervals', notes: 'Advanced VO2' },
        friday: { workout: null, notes: 'Rest (72h recovery)' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength maintenance' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'four_by_eight_vo2', notes: 'VO2max' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Peak long ride' }
      },
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Light strength only' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: null, notes: 'Complete rest' },
        thursday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' }
      },
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength maintenance' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'polarized_intensity_day', notes: 'Hard VO2 session' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Strength maintenance' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'thirty_thirty_intervals', notes: '30/30 intervals' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2' }
      },
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Light strength' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        thursday: { workout: 'bossi_intervals', notes: 'Final hard session' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Last long ride' }
      },
      12: {
        sunday: { workout: null, notes: 'FTP Test day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Light openers' },
        thursday: { workout: null, notes: 'Rest' },
        friday: { workout: 'easy_recovery_ride', notes: 'Short spin' },
        saturday: { workout: null, notes: 'Rest before test' }
      }
    },
    expectedGains: {
      ftp: '8-12% (age-appropriate)',
      strength: 'Improved muscular efficiency (+15-18%)',
      endurance: 'Better fatigue resistance'
    },
    targetAudience: 'Cyclists age 35+ looking to maximize performance with appropriate recovery'
  },

  // ============================================================
  // INDOOR / TRAINER FOCUSED PLANS
  // ============================================================
  indoor_winter_base_12_week: {
    id: 'indoor_winter_base_12_week',
    name: '12-Week Indoor Season Builder',
    description: 'Structured trainer plan optimized for ERG mode and indoor training. Shorter, more intense sessions designed for the indoor environment where every pedal stroke counts.',
    duration: 12,
    methodology: 'sweet_spot',
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    category: 'indoor_focused',
    hoursPerWeek: { min: 5, max: 7 },
    weeklyTSS: { min: 300, max: 450 },
    researchBasis: [
      'Seiler (2010). Training intensity distribution in endurance athletes. IJSPP',
      'Indoor training efficiency: 1 hour indoor = 1.25-1.5 hours outdoor due to constant load'
    ],
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Build indoor base + sweet spot intro' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Sweet spot progression' },
      { weeks: [8], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [9, 10, 11], phase: 'build', focus: 'Peak indoor fitness' },
      { weeks: [12], phase: 'taper', focus: 'Test week' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: '30min easy spin' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Sweet Spot intro' },
        wednesday: { workout: null, notes: 'Rest or cross-training' },
        thursday: { workout: 'foundation_miles', notes: '60min Zone 2' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'endurance_base_build', notes: '75min Zone 2' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Easy spin' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'recovery_spin', notes: '30min recovery' },
        thursday: { workout: 'traditional_sst', notes: 'Sustained Sweet Spot' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: '90min Zone 2' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'Extended SST' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'foundation_miles', notes: 'Zone 2' },
        friday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long Zone 2' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: null, notes: 'Rest' },
        friday: { workout: 'easy_recovery_ride', notes: 'Light spin' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'polarized_long_ride', notes: 'Extended ride' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Peak SST' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'thirty_thirty_intervals', notes: '30/30 VO2 intro' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long Zone 2' }
      },
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: null, notes: 'Rest' },
        friday: { workout: 'three_by_ten_sst', notes: 'Light SST' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate' }
      },
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'four_by_eight_vo2', notes: 'VO2max work' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride' }
      },
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Easy spin' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'thirty_thirty_intervals', notes: '30/30 intervals' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'polarized_long_ride', notes: 'Peak volume' }
      },
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'Final SST block' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'bossi_intervals', notes: 'Peak VO2 session' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: 'Final long ride' }
      },
      12: {
        sunday: { workout: null, notes: 'FTP Test day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'three_by_ten_sst', notes: 'Openers' },
        thursday: { workout: null, notes: 'Rest' },
        friday: { workout: 'recovery_spin', notes: 'Light spin' },
        saturday: { workout: null, notes: 'Rest before test' }
      }
    },
    expectedGains: {
      ftp: '10-15%',
      muscular_endurance: 'Significant improvement',
      efficiency: 'Better power transfer'
    },
    targetAudience: 'Cyclists doing most training indoors on smart trainers'
  },

  // ============================================================
  // GRAVEL / ENDURANCE EVENTS
  // ============================================================
  gravel_endurance_16_week: {
    id: 'gravel_endurance_16_week',
    name: '16-Week Gravel Endurance',
    description: 'Prepare for 50-100 mile gravel events with focus on sustained power, muscular endurance, and fatigue resistance. Designed for mixed terrain racing demands.',
    duration: 16,
    methodology: 'pyramidal',
    goal: 'gravel',
    fitnessLevel: 'intermediate',
    category: 'endurance_events',
    hoursPerWeek: { min: 7, max: 12 },
    weeklyTSS: { min: 350, max: 600 },
    researchBasis: [
      'Seiler (2010). Pyramidal intensity distribution in endurance athletes. IJSPP',
      'Gravel racing demands: 50-70% FTP for 4-15 hours with intermittent surges'
    ],
    phases: [
      { weeks: [1, 2, 3, 4], phase: 'base', focus: 'Build aerobic base and volume' },
      { weeks: [5], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [6, 7, 8, 9], phase: 'build', focus: 'Add muscular endurance' },
      { weeks: [10], phase: 'recovery', focus: 'Recovery week' },
      { weeks: [11, 12, 13, 14], phase: 'peak', focus: 'Race-specific preparation' },
      { weeks: [15, 16], phase: 'taper', focus: 'Taper for event' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'endurance_base_build', notes: 'Build base' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '2-2.5hr endurance' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'tempo_ride', notes: 'Intro tempo' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '2.5hr endurance' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        wednesday: { workout: 'two_by_twenty_tempo', notes: 'Tempo intervals' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        saturday: { workout: 'long_endurance_ride', notes: '3hr endurance' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        wednesday: { workout: 'tempo_ride', notes: 'Tempo' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: '3.5hr endurance' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: null, notes: 'Rest' },
        friday: { workout: 'easy_recovery_ride', notes: 'Light spin' },
        saturday: { workout: 'endurance_base_build', notes: '90min easy' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'three_by_ten_sst', notes: 'Sweet Spot intro' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'long_endurance_ride', notes: '3hr with tempo bursts' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'two_by_twenty_tempo', notes: 'Tempo intervals' },
        saturday: { workout: 'polarized_long_ride', notes: '3.5hr endurance' }
      },
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'Extended SST' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'long_endurance_ride', notes: '4hr with SST efforts' }
      },
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'two_by_twenty_tempo', notes: 'Tempo' },
        saturday: { workout: 'polarized_long_ride', notes: '4hr endurance' }
      },
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: null, notes: 'Rest' },
        friday: { workout: 'three_by_ten_sst', notes: 'Light SST' },
        saturday: { workout: 'endurance_base_build', notes: '2hr moderate' }
      },
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'over_under_intervals', notes: 'Over-unders (surge practice)' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'four_by_twelve_sst', notes: 'SST intervals' },
        saturday: { workout: 'long_endurance_ride', notes: '4hr gravel simulation' }
      },
      12: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'sweet_spot_progression', notes: 'Peak SST' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'three_by_twelve_threshold', notes: 'Threshold work' },
        saturday: { workout: 'polarized_long_ride', notes: '4.5hr endurance' }
      },
      13: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'over_under_intervals', notes: 'Race simulation' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'traditional_sst', notes: 'Sweet Spot' },
        saturday: { workout: 'long_endurance_ride', notes: '5hr dress rehearsal' }
      },
      14: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'four_by_twelve_sst', notes: 'Final SST block' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'tempo_ride', notes: 'Tempo' },
        saturday: { workout: 'long_endurance_ride', notes: '3.5hr moderate' }
      },
      15: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'three_by_ten_sst', notes: 'Light SST' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: '2hr easy' }
      },
      16: {
        sunday: { workout: null, notes: 'RACE DAY!' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Openers - 3x30s' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: null, notes: 'Complete rest' }
      }
    },
    expectedGains: {
      endurance: '4-6 hour sustained effort capacity',
      muscular_endurance: 'High fatigue resistance',
      efficiency: 'Improved fat oxidation'
    },
    targetAudience: 'Cyclists preparing for gravel races like Unbound, Belgian Waffle Ride, etc.'
  },

  // ============================================================
  // CRITERIUM / SHORT CIRCUIT RACING
  // ============================================================
  criterium_race_8_week: {
    id: 'criterium_race_8_week',
    name: '8-Week Criterium Specialist',
    description: 'Prepare for criterium racing with focus on anaerobic capacity, sprint power, and repeated surge ability. Designed for the demands of 30-60 minute high-intensity races.',
    duration: 8,
    methodology: 'threshold',
    goal: 'criterium',
    fitnessLevel: 'advanced',
    category: 'road_racing',
    hoursPerWeek: { min: 7, max: 10 },
    weeklyTSS: { min: 400, max: 550 },
    researchBasis: [
      'Tabata et al. (1996). Effects of high-intensity intermittent training on anaerobic capacity. Med Sci Sports Exerc',
      'Billat (2001). 30/30 intervals for VO2max development. Med Sci Sports Exerc',
      'Criterium power profiles: 10-80 power spikes per race above threshold'
    ],
    phases: [
      { weeks: [1, 2], phase: 'base', focus: 'Build race fitness foundation' },
      { weeks: [3, 4, 5], phase: 'build', focus: 'VO2max and anaerobic work' },
      { weeks: [6, 7], phase: 'peak', focus: 'Race simulation and sprints' },
      { weeks: [8], phase: 'taper', focus: 'Race week' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'over_under_intervals', notes: 'Lactate clearance' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'two_by_twenty_ftp', notes: 'Threshold work' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long ride with sprints' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'three_by_twelve_threshold', notes: 'Threshold intervals' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'thirty_thirty_intervals', notes: '30/30 VO2max' },
        saturday: { workout: 'endurance_base_build', notes: 'Group ride pace' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'four_by_eight_vo2', notes: 'Long VO2 intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'over_under_intervals', notes: 'Over-unders' },
        saturday: { workout: 'long_endurance_ride', notes: 'Hard group ride' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'forty_twenty_intervals', notes: '40/20 anaerobic' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'bossi_intervals', notes: 'Surging VO2' },
        saturday: { workout: 'endurance_base_build', notes: 'Race pace efforts' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'thirty_thirty_intervals', notes: '30/30 intervals' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'sprint_intervals', notes: 'Sprint work' },
        saturday: { workout: 'long_endurance_ride', notes: 'Race simulation' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'recovery_spin', notes: 'Recovery' },
        tuesday: { workout: 'race_simulation', notes: 'Full race simulation' },
        wednesday: { workout: 'foundation_miles', notes: 'Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'forty_twenty_intervals', notes: '40/20 sharpening' },
        saturday: { workout: 'endurance_base_build', notes: 'Race tactics practice' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        tuesday: { workout: 'sprint_intervals', notes: 'Sprint power' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'race_simulation', notes: 'Final race sim' },
        saturday: { workout: 'foundation_miles', notes: 'Easy with openers' }
      },
      8: {
        sunday: { workout: null, notes: 'RACE DAY!' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Light spin' },
        thursday: { workout: 'sprint_intervals', notes: 'Short openers' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: null, notes: 'Complete rest' }
      }
    },
    expectedGains: {
      anaerobic_capacity: 'Significant improvement in sprint repeatability',
      vo2max: '8-12% improvement',
      race_fitness: 'Peak criterium form'
    },
    targetAudience: 'Competitive cyclists preparing for criterium racing'
  },

  // ============================================================
  // TIME CRUNCHED / HIGH INTENSITY
  // ============================================================
  time_crunched_hiit_8_week: {
    id: 'time_crunched_hiit_8_week',
    name: '8-Week Maximum Impact (6 hrs/wk)',
    description: 'Research-backed plan for cyclists with 6 hours or less per week. High-intensity intervals produce similar VO2max gains as traditional high-volume training.',
    duration: 8,
    methodology: 'polarized',
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    category: 'time_crunched',
    hoursPerWeek: { min: 4, max: 6 },
    weeklyTSS: { min: 250, max: 400 },
    researchBasis: [
      'Laursen & Jenkins (2002). The scientific basis for high-intensity interval training. Sports Med',
      'Helgerud et al. (2007). Aerobic high-intensity intervals improve VO2max. Med Sci Sports Exerc',
      'Carmichael CTS Time-Crunched methodology: 2-3 HIIT sessions per week optimal'
    ],
    phases: [
      { weeks: [1, 2], phase: 'base', focus: 'Foundation with HIIT intro' },
      { weeks: [3, 4, 5], phase: 'build', focus: 'HIIT progression' },
      { weeks: [6, 7], phase: 'peak', focus: 'Peak intensity' },
      { weeks: [8], phase: 'taper', focus: 'Test and recover' }
    ],
    weekTemplates: {
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest or cross-training' },
        tuesday: { workout: 'thirty_thirty_intervals', notes: '45min: 30/30 VO2 intervals' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'traditional_sst', notes: '60min: Sweet Spot work' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: '90min: Weekend endurance' }
      },
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'four_by_eight_vo2', notes: '50min: VO2max intervals' },
        wednesday: { workout: 'recovery_spin', notes: '30min: Easy spin' },
        thursday: { workout: 'three_by_ten_sst', notes: '55min: Sweet Spot' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: '2hr: Long ride' }
      },
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'bossi_intervals', notes: '50min: Surging VO2' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'four_by_twelve_sst', notes: '60min: Extended SST' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: '90min: Endurance' }
      },
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'thirty_thirty_intervals', notes: '45min: 30/30 intervals' },
        wednesday: { workout: 'recovery_spin', notes: '30min: Easy spin' },
        thursday: { workout: 'over_under_intervals', notes: '55min: Over-unders' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: '2hr: Long ride' }
      },
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'four_by_eight_vo2', notes: '55min: VO2max peak' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'sweet_spot_progression', notes: '60min: Progressive SST' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'polarized_long_ride', notes: '2.5hr: Extended ride' }
      },
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'bossi_intervals', notes: '55min: Peak VO2' },
        wednesday: { workout: 'recovery_spin', notes: '30min: Easy spin' },
        thursday: { workout: 'four_by_twelve_sst', notes: '60min: SST' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_endurance_ride', notes: '2hr: Long ride' }
      },
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'forty_twenty_intervals', notes: '50min: 40/20 anaerobic' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'traditional_sst', notes: '55min: Sweet Spot' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: '90min: Endurance' }
      },
      8: {
        sunday: { workout: null, notes: 'FTP Test day' },
        monday: { workout: null, notes: 'Rest' },
        tuesday: { workout: 'recovery_spin', notes: '30min: Easy' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'thirty_thirty_intervals', notes: '40min: Openers' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: null, notes: 'Rest before test' }
      }
    },
    expectedGains: {
      ftp: '8-12%',
      vo2max: '5-10%',
      efficiency: 'Maximum gains per hour invested'
    },
    targetAudience: 'Busy cyclists with 6 hours or less per week to train'
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
 * Get plans by category
 */
export function getPlansByCategory(category: PlanCategory): TrainingPlanTemplate[] {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.category === category);
}

/**
 * Get all unique categories from plans
 */
export function getAllCategories(): PlanCategory[] {
  const categories = new Set<PlanCategory>();
  Object.values(TRAINING_PLAN_TEMPLATES).forEach(plan => {
    if (plan.category) {
      categories.add(plan.category);
    }
  });
  return Array.from(categories);
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
