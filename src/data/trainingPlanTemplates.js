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
export function getPlanTemplate(id) {
  return TRAINING_PLAN_TEMPLATES[id];
}

/**
 * Get all plan templates
 */
export function getAllPlans() {
  return Object.values(TRAINING_PLAN_TEMPLATES);
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
