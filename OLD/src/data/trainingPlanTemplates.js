/**
 * Training Plan Templates
 * Pre-built structured training plans based on 2024-2025 research and proven methodologies
 *
 * Each plan includes:
 * - Goal-specific periodization (Base → Build → Peak → Taper)
 * - Progressive overload with recovery weeks every 3-4 weeks
 * - Evidence-based training distribution (Polarized, Pyramidal, Sweet Spot, Threshold-focused)
 * - Research-backed intensity distributions
 */

import { WORKOUT_LIBRARY, TRAINING_METHODOLOGIES } from './workoutLibrary.js';

export const TRAINING_PLAN_TEMPLATES = {
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
      // Weeks 1-3: Base Phase
      1: {
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'foundation_miles', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'endurance_base_build', notes: 'Longer Zone 2' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'polarized_intensity_day', notes: 'Hard day - VO2max intervals' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      2: {
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'foundation_miles', notes: 'Mid-week endurance' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Easy recovery' },
        friday: { workout: 'four_by_eight_vo2', notes: 'Hard day - Long VO2 intervals' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      3: {
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'foundation_miles', notes: 'Mid-week endurance' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'thirty_thirty_intervals', notes: 'Hard day - 30/30 intervals' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride (increase duration)' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      // Week 4: Recovery
      4: {
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'recovery_spin', notes: 'Easy spin' },
        wednesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      // Weeks 5-7: Build Phase
      5: {
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'bossi_intervals', notes: 'Hard day - Advanced VO2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Easy recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      6: {
        monday: { workout: 'easy_recovery_ride', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'four_by_eight_vo2', notes: 'Hard day - VO2 intervals' },
        thursday: { workout: 'recovery_spin', notes: 'Easy spin' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      7: {
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        wednesday: { workout: 'polarized_intensity_day', notes: 'Hard day - Max effort VO2' },
        thursday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        friday: { workout: 'foundation_miles', notes: 'Zone 2' },
        saturday: { workout: 'polarized_long_ride', notes: 'Long Zone 2 ride (peak volume)' },
        sunday: { workout: null, notes: 'Rest day' }
      },
      // Week 8: Taper
      8: {
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'thirty_thirty_intervals', notes: 'Short intensity to maintain sharpness' },
        thursday: { workout: 'recovery_spin', notes: 'Very easy' },
        friday: { workout: 'easy_recovery_ride', notes: 'Easy spin' },
        saturday: { workout: null, notes: 'Rest - prepare for FTP test' },
        sunday: { workout: null, notes: 'FTP Test or Goal Event' }
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
    methodology: 'sweet_spot_base',
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
      // Weeks 1-3: Base with SST intro
      1: {
        tuesday: { workout: 'three_by_ten_sst', notes: 'Introduction to Sweet Spot' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long weekend ride' },
        sunday: { workout: null, notes: 'Rest' }
      },
      2: {
        tuesday: { workout: 'traditional_sst', notes: 'Sustained SST' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        friday: { workout: 'easy_recovery_ride', notes: 'Easy recovery' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long weekend ride' },
        sunday: { workout: null, notes: 'Rest' }
      },
      3: {
        tuesday: { workout: 'three_by_ten_sst', notes: 'SST intervals' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'two_by_twenty_tempo', notes: 'Tempo work' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'long_endurance_ride', notes: 'Long weekend ride' },
        sunday: { workout: null, notes: 'Rest' }
      },
      // Week 4: Recovery
      4: {
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' },
        sunday: { workout: null, notes: 'Rest' }
      },
      // Weeks 5-7: Build SST volume
      5: {
        tuesday: { workout: 'four_by_twelve_sst', notes: 'Increased SST volume' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        sunday: { workout: 'foundation_miles', notes: 'Easy Zone 2 or rest' }
      },
      6: {
        tuesday: { workout: 'traditional_sst', notes: 'Sustained SST' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'two_by_twenty_tempo', notes: 'Tempo intervals' },
        friday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        saturday: { workout: 'four_by_twelve_sst', notes: 'High SST volume' },
        sunday: { workout: 'foundation_miles', notes: 'Easy Zone 2' }
      },
      7: {
        tuesday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'four_by_twelve_sst', notes: 'Peak SST workout' },
        sunday: { workout: 'foundation_miles', notes: 'Easy Zone 2' }
      },
      // Week 8: Recovery
      8: {
        tuesday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Zone 2' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'endurance_base_build', notes: 'Moderate ride' },
        sunday: { workout: null, notes: 'Rest' }
      },
      // Weeks 9-11: Peak SST load
      9: {
        tuesday: { workout: 'four_by_twelve_sst', notes: 'High SST volume' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'over_under_intervals', notes: 'Over-under threshold' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'sweet_spot_progression', notes: 'SST progression' },
        sunday: { workout: 'foundation_miles', notes: 'Easy Zone 2' }
      },
      10: {
        tuesday: { workout: 'traditional_sst', notes: 'Sustained SST' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'three_by_twelve_threshold', notes: 'Threshold intervals' },
        friday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        saturday: { workout: 'four_by_twelve_sst', notes: 'Peak SST volume' },
        sunday: { workout: 'foundation_miles', notes: 'Easy Zone 2' }
      },
      11: {
        tuesday: { workout: 'sweet_spot_progression', notes: 'Progressive SST' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'two_by_twenty_ftp', notes: 'Classic 2x20 FTP' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'four_by_twelve_sst', notes: 'Final peak SST workout' },
        sunday: { workout: 'foundation_miles', notes: 'Easy Zone 2' }
      },
      // Week 12: Taper
      12: {
        tuesday: { workout: 'three_by_ten_sst', notes: 'Reduced volume SST' },
        wednesday: { workout: 'recovery_spin', notes: 'Recovery' },
        thursday: { workout: 'foundation_miles', notes: 'Easy Zone 2' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'easy_recovery_ride', notes: 'Very easy' },
        sunday: { workout: null, notes: 'FTP Test or Goal Event' }
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
    progressionNotes: {
      longRide: 'Progress from 2 hours to 5+ hours over 16 weeks',
      intensity: 'Minimal intensity until week 10, then add tempo/SST',
      volume: 'Peak volume in week 14-15, reduce by 40% in week 16'
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
    methodology: 'threshold_focused',
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
        tuesday: { workout: 'hill_repeats', notes: 'Introduction to climbing intervals' },
        wednesday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        thursday: { workout: 'endurance_base_build', notes: 'Rolling terrain preferred' },
        friday: { workout: 'recovery_spin', notes: 'Easy spin' },
        saturday: { workout: 'long_endurance_ride', notes: 'Include climbing if possible' },
        sunday: { workout: null, notes: 'Rest' }
      },
      // Weeks 2-8 would follow similar pattern with progressive intensity
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
    methodology: 'threshold_focused',
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
      // Build phase example (weeks 5-7)
      5: {
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'over_under_intervals', notes: 'Over-under threshold' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        thursday: { workout: 'five_by_four_vo2', notes: 'VO2max intervals' },
        friday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        saturday: { workout: 'race_simulation', notes: 'Race simulation workout' },
        sunday: { workout: 'long_endurance_ride', notes: 'Long endurance ride' }
      },
      // Peak phase example (weeks 9-11)
      9: {
        monday: { workout: 'recovery_spin', notes: 'Active recovery' },
        tuesday: { workout: 'sprint_intervals', notes: 'Sprint power' },
        wednesday: { workout: 'endurance_base_build', notes: 'Zone 2 endurance' },
        thursday: { workout: 'bossi_intervals', notes: 'Advanced VO2max' },
        friday: { workout: 'easy_recovery_ride', notes: 'Recovery' },
        saturday: { workout: 'race_simulation', notes: 'Full race simulation' },
        sunday: { workout: 'long_endurance_ride', notes: 'Long ride with tempo sections' }
      }
    },
    expectedGains: {
      ftp: '12-18%',
      vo2max: '8-12%',
      anaerobic_capacity: 'Significant improvement in race-specific power',
      repeatability: 'Improved ability to repeat hard efforts'
    },
    targetAudience: 'Competitive cyclists preparing for road racing season'
  }
};

/**
 * Get plan template by ID
 */
export function getPlanTemplate(id) {
  return TRAINING_PLAN_TEMPLATES[id];
}

/**
 * Get plans by goal
 */
export function getPlansByGoal(goal) {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.goal === goal);
}

/**
 * Get plans by fitness level
 */
export function getPlansByFitnessLevel(level) {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.fitnessLevel === level);
}

/**
 * Get plans by duration
 */
export function getPlansByDuration(weeks) {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.duration === weeks);
}

/**
 * Get plans by methodology
 */
export function getPlansByMethodology(methodology) {
  return Object.values(TRAINING_PLAN_TEMPLATES).filter(plan => plan.methodology === methodology);
}

export default TRAINING_PLAN_TEMPLATES;
