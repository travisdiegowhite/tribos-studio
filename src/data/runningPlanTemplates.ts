/**
 * Running Training Plan Templates
 * Pre-built structured running plans with complete week-by-week workout schedules
 *
 * Each plan includes:
 * - Goal-specific periodization (Base -> Build -> Peak -> Taper)
 * - Progressive overload with recovery weeks
 * - Complete weekTemplates with specific workouts for each day
 * - Cross-training with strength/core/flexibility work
 *
 * Workout IDs reference the running workout library (runningWorkoutLibrary.ts)
 * and shared strength/core/flexibility workouts from the cycling workout library.
 */

import type {
  TrainingPlanTemplate,
  TrainingPlanTemplatesMap,
  TrainingGoal,
  PlanCategory,
} from '../types/training';

// ============================================================
// RUNNING PLAN TEMPLATES
// ============================================================

export const RUNNING_PLAN_TEMPLATES: TrainingPlanTemplatesMap = {

  // ============================================================
  // 5K BEGINNER - 8 WEEKS
  // ============================================================
  run_5k_beginner_8_week: {
    id: 'run_5k_beginner_8_week',
    name: '8-Week 5K Beginner Plan',
    sportType: 'running',
    description:
      'A progressive 8-week plan designed for new runners targeting their first 5K. ' +
      'Builds gradually from walk/run intervals to continuous running, with a focus on ' +
      'developing aerobic base, running economy, and injury prevention. Includes ' +
      'strength and mobility work to support the transition to running.',
    duration: 8,
    methodology: 'endurance',
    goal: '5k' as TrainingGoal,
    fitnessLevel: 'beginner',
    category: 'race_distance' as PlanCategory,
    hoursPerWeek: { min: 3, max: 5 },
    weeklyTSS: { min: 100, max: 200 },
    weeklyDistance: { min: 15, max: 30 },
    researchBasis: [
      'Buist, I. et al. (2010). Incidence and risk factors of running-related injuries during preparation for a 4-mile recreational running event. British Journal of Sports Medicine, 44(8), 598-604.',
      'Nielsen, R.O. et al. (2014). A prospective study on time to recovery in 254 injured novice runners. PLoS ONE, 9(6), e99877.',
      'Damsted, C. et al. (2019). Is There Evidence for an Association Between Changes in Training Load and Running-Related Injuries? IJSPP, 13(8), 931-938.',
    ],
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Build walk/run base and running habit' },
      { weeks: [4, 5, 6], phase: 'build', focus: 'Transition to continuous running, add short tempo' },
      { weeks: [7], phase: 'peak', focus: 'Longest continuous run and race pace practice' },
      { weeks: [8], phase: 'taper', focus: 'Reduce volume, maintain intensity, race prep' },
    ],
    weekTemplates: {
      // Week 1 - Base: Introduce running with walk/run, low volume
      1: {
        sunday: { workout: null, notes: 'Rest day - complete rest or gentle walking' },
        monday: { workout: 'run_easy_aerobic', notes: 'Walk/run intervals: 1 min run / 2 min walk x 8' },
        tuesday: { workout: 'cyclist_core_stability', notes: 'Core stability and bodyweight strength' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy walk/run: 1 min run / 2 min walk x 6' },
        thursday: { workout: null, notes: 'Rest day' },
        friday: { workout: 'run_easy_aerobic', notes: 'Walk/run intervals: 1 min run / 2 min walk x 8' },
        saturday: { workout: 'hip_mobility_routine', notes: 'Hip mobility and flexibility work' },
      },
      // Week 2 - Base: Increase run intervals
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Walk/run: 2 min run / 1 min walk x 7' },
        tuesday: { workout: 'cyclist_strength_foundation', notes: 'Foundation strength: squats, lunges, planks' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Very easy jog/walk 20 min' },
        thursday: { workout: null, notes: 'Rest day' },
        friday: { workout: 'run_easy_aerobic', notes: 'Walk/run: 2 min run / 1 min walk x 8' },
        saturday: { workout: 'yoga_for_cyclists', notes: 'Yoga for runners - flexibility and balance' },
      },
      // Week 3 - Base: Longer run intervals, introduce easy long effort
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Walk/run: 3 min run / 1 min walk x 6' },
        tuesday: { workout: 'cyclist_core_stability', notes: 'Core stability work' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Easy recovery jog 20 min' },
        thursday: { workout: null, notes: 'Rest day' },
        friday: { workout: 'run_easy_aerobic', notes: 'Walk/run: 3 min run / 1 min walk x 7' },
        saturday: { workout: 'run_easy_long', notes: 'Long walk/run: 4 min run / 1 min walk x 6' },
      },
      // Week 4 - Build: Continuous running begins, first quality session
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Continuous easy run 20 min' },
        tuesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 15-20 min' },
        thursday: { workout: 'run_tempo_continuous', notes: 'Quality session: 5 min warm up, 8 min tempo effort, 5 min cool down' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'run_easy_long', notes: 'Easy long run 30 min continuous' },
      },
      // Week 5 - Build: Extend continuous runs
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 25 min continuous' },
        tuesday: { workout: 'cyclist_core_stability', notes: 'Core stability and hip strength' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 20 min' },
        thursday: { workout: 'run_tempo_continuous', notes: 'Quality: 10 min warm up, 10 min tempo, 5 min cool down' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'run_easy_long', notes: 'Easy long run 35 min' },
      },
      // Week 6 - Build: Increase intensity of quality session
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 25 min' },
        tuesday: { workout: 'cyclist_strength_foundation', notes: 'Strength work - focus on single-leg exercises' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 20 min' },
        thursday: { workout: 'run_progression_run', notes: 'Quality: progression run - start easy, finish at tempo' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'run_easy_long', notes: 'Long run 40 min at conversational pace' },
      },
      // Week 7 - Peak: Highest volume week, race-like efforts
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 30 min' },
        tuesday: { workout: 'cyclist_core_stability', notes: 'Core and mobility' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 20 min' },
        thursday: { workout: 'run_tempo_continuous', notes: 'Quality: 10 min warm up, 12 min at 5K effort, 8 min cool down' },
        friday: { workout: null, notes: 'Rest day' },
        saturday: { workout: 'run_long_run', notes: 'Longest run: 45 min easy effort' },
      },
      // Week 8 - Taper: Reduce volume, stay sharp, race day
      8: {
        sunday: { workout: null, notes: 'RACE DAY - 5K! Warm up well, start conservatively' },
        monday: { workout: null, notes: 'Rest day - celebrate your achievement' },
        tuesday: { workout: 'run_easy_aerobic', notes: 'Easy shakeout run 20 min' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Very easy jog 15 min with 4x20s strides' },
        thursday: { workout: 'run_tempo_continuous', notes: 'Short tempo: 5 min warm up, 5 min at race pace, 5 min cool down' },
        friday: { workout: null, notes: 'Rest day - hydrate and prepare' },
        saturday: { workout: 'run_easy_recovery', notes: 'Easy 15 min shakeout jog + strides' },
      },
    },
    expectedGains: {
      endurance: 'Ability to run 5K continuously',
      aerobicBase: 'Foundational aerobic fitness established',
      runningEconomy: 'Improved running form and efficiency',
      confidence: 'Race-day readiness and pacing awareness',
    },
    targetAudience:
      'New runners or returning runners who want to complete their first 5K. ' +
      'No prior running experience required. Suitable for those who can walk briskly for 30 minutes.',
  },

  // ============================================================
  // 10K INTERMEDIATE - 10 WEEKS
  // ============================================================
  run_10k_intermediate_10_week: {
    id: 'run_10k_intermediate_10_week',
    name: '10-Week 10K Performance Plan',
    sportType: 'running',
    description:
      'A structured 10-week plan for intermediate runners aiming to improve their 10K performance. ' +
      'Uses polarized training with 80% easy / 20% hard intensity distribution. ' +
      'Develops tempo endurance and lactate threshold through targeted interval sessions ' +
      'while building a robust aerobic base with progressive long runs.',
    duration: 10,
    methodology: 'polarized',
    goal: '10k' as TrainingGoal,
    fitnessLevel: 'intermediate',
    category: 'race_distance' as PlanCategory,
    hoursPerWeek: { min: 4, max: 7 },
    weeklyTSS: { min: 200, max: 350 },
    weeklyDistance: { min: 30, max: 50 },
    researchBasis: [
      'Seiler, S. (2010). What is Best Practice for Training Intensity and Duration Distribution in Endurance Athletes? IJSPP, 5(3), 276-291.',
      'Stöggl, T. & Sperlich, B. (2014). Polarized training has greater impact on key endurance variables than threshold, high-intensity, or high-volume training. Frontiers in Physiology, 5, 33.',
      'Billat, V.L. et al. (2001). Interval training at VO2max: effects on aerobic performance and overtraining markers. Medicine & Science in Sports & Exercise, 33(1), 130-137.',
    ],
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Build aerobic base with easy volume and strides' },
      { weeks: [4, 5, 6], phase: 'build', focus: 'Introduce threshold intervals and tempo runs' },
      { weeks: [7, 8], phase: 'build', focus: 'Peak intensity with VO2max and race-pace work' },
      { weeks: [9], phase: 'peak', focus: 'Highest quality sessions, maintain volume' },
      { weeks: [10], phase: 'taper', focus: 'Reduce volume, sharpen with short speed, race' },
    ],
    weekTemplates: {
      // Week 1 - Base: Establish running rhythm, easy volume
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 35-40 min' },
        tuesday: { workout: 'cyclist_strength_foundation', notes: 'Foundation strength training' },
        wednesday: { workout: 'run_easy_aerobic', notes: 'Easy run 30-35 min with 4x100m strides' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        friday: { workout: 'cyclist_core_stability', notes: 'Core stability session' },
        saturday: { workout: 'run_long_run', notes: 'Long run 50-55 min easy' },
      },
      // Week 2 - Base: Slight volume increase
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min' },
        wednesday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min with 6x100m strides' },
        thursday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        friday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 55-60 min easy' },
      },
      // Week 3 - Base: Peak base volume, introduce fartlek
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'cyclist_core_stability', notes: 'Core stability' },
        wednesday: { workout: 'run_progression_run', notes: 'Progression run: 30 min easy to moderate' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 60 min easy' },
      },
      // Week 4 - Build: Introduce threshold work
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_threshold_intervals', notes: 'Quality: threshold intervals - 4x5 min at threshold with 2 min jog recovery' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min with strides' },
        saturday: { workout: 'run_long_run', notes: 'Long run 60-65 min with last 10 min at marathon pace' },
      },
      // Week 5 - Build: Tempo runs introduced
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: continuous tempo - 20 min at tempo pace' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Core and hip stability' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 65 min easy' },
      },
      // Week 6 - Build: Combined quality, peak build volume
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_tempo_threshold_combo', notes: 'Quality: tempo + threshold combo session' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min with 6x100m strides' },
        friday: { workout: 'cyclist_strength_foundation', notes: 'Strength - reduce load, maintain frequency' },
        saturday: { workout: 'run_long_run', notes: 'Long run 70 min with middle 15 min at tempo' },
      },
      // Week 7 - Build 2: Introduce VO2max
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_vo2max_1000s', notes: 'Quality: 5x1000m at VO2max pace with 3 min jog recovery' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_tempo_cruise', notes: 'Quality: cruise intervals - 3x8 min at tempo' },
        friday: { workout: 'cyclist_core_stability', notes: 'Core stability' },
        saturday: { workout: 'run_long_run', notes: 'Long run 65 min easy' },
      },
      // Week 8 - Build 2: VO2max + race pace practice
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_vo2max_800s', notes: 'Quality: 6x800m at VO2max with 2.5 min recovery' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min with strides' },
        friday: { workout: 'hip_mobility_routine', notes: 'Hip mobility and flexibility' },
        saturday: { workout: 'run_long_run', notes: 'Long run 65 min with last 20 min at 10K race effort' },
      },
      // Week 9 - Peak: Highest quality, sharpening
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 35 min' },
        tuesday: { workout: 'run_vo2max_1000s', notes: 'Quality: 5x1000m at VO2max pace - aim for fastest average' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_tempo_continuous', notes: 'Quality: 25 min continuous tempo' },
        friday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 20 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 60 min with 15 min at 10K pace' },
      },
      // Week 10 - Taper: Reduce volume, stay sharp, race
      10: {
        sunday: { workout: null, notes: 'RACE DAY - 10K! Execute race plan, even pace or slight negative split' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'run_easy_aerobic', notes: 'Easy run 30 min' },
        wednesday: { workout: 'run_speed_400s', notes: 'Sharpening: 4x400m at slightly faster than race pace, full recovery' },
        thursday: { workout: 'run_recovery_jog', notes: 'Easy jog 20 min' },
        friday: { workout: 'run_easy_recovery', notes: 'Shakeout jog 15 min + 4 strides' },
        saturday: { workout: null, notes: 'Rest - pre-race prep, hydrate, lay out gear' },
      },
    },
    expectedGains: {
      threshold: '5-10% improvement in lactate threshold pace',
      vo2max: '3-5% improvement in VO2max',
      raceTime: '2-5 minute improvement in 10K time',
      endurance: 'Extended ability to hold race pace',
      runningEconomy: 'Improved efficiency at all paces',
    },
    targetAudience:
      'Intermediate runners who can currently run 30-40 min continuously and have completed ' +
      'at least one 5K or 10K. Looking to improve 10K performance through structured training.',
  },

  // ============================================================
  // HALF MARATHON INTERMEDIATE - 12 WEEKS
  // ============================================================
  run_half_marathon_12_week: {
    id: 'run_half_marathon_12_week',
    name: '12-Week Half Marathon Plan',
    sportType: 'running',
    description:
      'A comprehensive 12-week half marathon preparation plan using pyramidal intensity distribution. ' +
      'Progressively builds long run endurance to 18-20km while developing tempo and threshold fitness. ' +
      'Features recovery weeks every 4th week to allow adaptation and reduce injury risk. ' +
      'Balances running volume with strength training and mobility work.',
    duration: 12,
    methodology: 'pyramidal',
    goal: 'half_marathon' as TrainingGoal,
    fitnessLevel: 'intermediate',
    category: 'race_distance' as PlanCategory,
    hoursPerWeek: { min: 5, max: 8 },
    weeklyTSS: { min: 250, max: 450 },
    weeklyDistance: { min: 35, max: 65 },
    researchBasis: [
      'Esteve-Lanao, J. et al. (2007). How do endurance runners actually train? Relationship with competition performance. Medicine & Science in Sports & Exercise, 39(3), 496-504.',
      'Munoz, I. et al. (2014). Does Polarized Training Improve Performance in Recreational Runners? IJSPP, 9(2), 265-272.',
      'Haugen, T. et al. (2022). The Training Characteristics of World-Class Distance Runners: An Integration of Scientific Literature and Results-Proven Practice. Sports Medicine - Open, 8, 46.',
    ],
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Build aerobic base and weekly mileage' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week - reduce volume 30-40%' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Build long run, introduce tempo and threshold' },
      { weeks: [8], phase: 'recovery', focus: 'Recovery week - absorb training' },
      { weeks: [9, 10], phase: 'peak', focus: 'Peak mileage and quality, race-specific sessions' },
      { weeks: [11, 12], phase: 'taper', focus: 'Progressive taper, maintain intensity, race' },
    ],
    weekTemplates: {
      // Week 1 - Base: Establish weekly structure
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min with 6x100m strides' },
        wednesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training - squats, lunges, deadlifts' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 60 min (approx 10-11 km) easy pace' },
      },
      // Week 2 - Base: Increase volume slightly
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 40 min' },
        tuesday: { workout: 'run_progression_run', notes: 'Progression run: 35 min, last 10 min at tempo feel' },
        wednesday: { workout: 'cyclist_core_stability', notes: 'Core stability session' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 70 min (approx 12 km) easy pace' },
      },
      // Week 3 - Base: Peak base volume
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: 15 min warm up, 15 min tempo, 10 min cool down' },
        wednesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 75 min (approx 13 km) easy pace' },
      },
      // Week 4 - Recovery: Reduce volume 30-40%
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 30 min' },
        tuesday: { workout: 'yoga_for_cyclists', notes: 'Yoga for runners - active recovery' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min with strides' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Light core work' },
        friday: { workout: 'run_recovery_jog', notes: 'Recovery jog 20 min' },
        saturday: { workout: 'run_easy_long', notes: 'Reduced long run 50 min easy' },
      },
      // Week 5 - Build: Introduce threshold, grow long run
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_threshold_intervals', notes: 'Quality: 4x5 min at threshold with 2 min jog recovery' },
        wednesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 80 min (approx 14 km) easy pace' },
      },
      // Week 6 - Build: Tempo development
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: continuous tempo - 25 min at tempo pace' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Core stability and hip strength' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min with 6x100m strides' },
        saturday: { workout: 'run_long_run', notes: 'Long run 85 min (approx 15 km) with middle 15 min at marathon pace' },
      },
      // Week 7 - Build: Combined quality
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_tempo_threshold_combo', notes: 'Quality: tempo + threshold combination session' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'cyclist_strength_foundation', notes: 'Strength - maintain, moderate load' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 90 min (approx 16 km) easy pace' },
      },
      // Week 8 - Recovery: Absorb training
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 30 min' },
        tuesday: { workout: 'hip_mobility_routine', notes: 'Hip mobility and flexibility' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min with strides' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Light core work' },
        friday: { workout: 'run_recovery_jog', notes: 'Recovery jog 20 min' },
        saturday: { workout: 'run_easy_long', notes: 'Reduced long run 55 min easy' },
      },
      // Week 9 - Peak: Race-specific work, long run with pace practice
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_threshold_continuous', notes: 'Quality: 20 min continuous threshold effort' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'run_race_pace_half', notes: 'Quality: half marathon race pace practice - 30 min at goal HM pace' },
        friday: { workout: 'cyclist_core_stability', notes: 'Core stability' },
        saturday: { workout: 'run_long_run_extended', notes: 'Peak long run 100 min (approx 18 km) with last 20 min at HM pace' },
      },
      // Week 10 - Peak: Highest quality week
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_vo2max_1000s', notes: 'Quality: 5x1000m at VO2max to sharpen speed' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_race_pace_half', notes: 'Quality: HM race pace practice - 35 min at goal pace' },
        friday: { workout: 'run_easy_recovery', notes: 'Easy recovery 20 min' },
        saturday: { workout: 'run_long_run_extended', notes: 'Long run 105 min (approx 19-20 km) easy with final 25 min at HM effort' },
      },
      // Week 11 - Taper: Reduce volume, keep quality
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: 20 min tempo - crisp but not exhausting' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 20 min' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Light core stability' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 30 min with 4 strides' },
        saturday: { workout: 'run_long_run', notes: 'Reduced long run 70 min easy with 10 min at HM pace' },
      },
      // Week 12 - Taper: Race week
      12: {
        sunday: { workout: null, notes: 'RACE DAY - Half Marathon! Start controlled, negative split the second half' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'run_easy_aerobic', notes: 'Easy run 25 min' },
        wednesday: { workout: 'run_speed_400s', notes: 'Sharpening: 3x400m at HM pace, full recovery' },
        thursday: { workout: 'run_recovery_jog', notes: 'Easy jog 20 min' },
        friday: { workout: 'run_easy_recovery', notes: 'Shakeout jog 15 min + 4 strides' },
        saturday: { workout: null, notes: 'Rest - pre-race prep, carb load, hydrate' },
      },
    },
    expectedGains: {
      endurance: 'Ability to sustain race pace for 21.1km',
      threshold: '6-10% improvement in threshold pace',
      longRunCapacity: 'Comfortable running 18-20km',
      raceTime: '3-8 minute improvement in half marathon time',
      aerobicBase: 'Significantly expanded aerobic capacity',
    },
    targetAudience:
      'Intermediate runners who can run 10K comfortably and have been running consistently for at least ' +
      '3-6 months. Targeting a strong half marathon performance with structured periodization.',
  },

  // ============================================================
  // MARATHON INTERMEDIATE - 16 WEEKS
  // ============================================================
  run_marathon_16_week: {
    id: 'run_marathon_16_week',
    name: '16-Week Marathon Plan',
    sportType: 'running',
    description:
      'A thorough 16-week marathon preparation plan using pyramidal intensity distribution. ' +
      'Systematically builds long run distance to 32km while developing the aerobic engine, ' +
      'lactate threshold, and marathon-specific pace endurance. Features recovery weeks every ' +
      '4th week and a comprehensive 2-week taper. Includes strength and mobility work to ' +
      'maintain structural integrity over high training volumes.',
    duration: 16,
    methodology: 'pyramidal',
    goal: 'marathon' as TrainingGoal,
    fitnessLevel: 'intermediate',
    category: 'race_distance' as PlanCategory,
    hoursPerWeek: { min: 6, max: 10 },
    weeklyTSS: { min: 300, max: 550 },
    weeklyDistance: { min: 40, max: 80 },
    researchBasis: [
      'Haugen, T. et al. (2022). The Training Characteristics of World-Class Distance Runners: An Integration of Scientific Literature and Results-Proven Practice. Sports Medicine - Open, 8, 46.',
      'Tjelta, L.I. (2016). The Training of International Level Distance Runners. International Journal of Sports Science & Coaching, 11(1), 122-134.',
      'Enoksen, E. et al. (2011). Performance-Related Predictors in Half Marathon Running. Journal of Sports Sciences, 29(13), 1429-1436.',
      'Mujika, I. (2010). Intense training: the key to optimal performance before and during the taper. Scandinavian Journal of Medicine & Science in Sports, 20(s2), 24-31.',
    ],
    phases: [
      { weeks: [1, 2, 3], phase: 'base', focus: 'Establish weekly mileage and aerobic foundation' },
      { weeks: [4], phase: 'recovery', focus: 'Recovery week - absorb base training' },
      { weeks: [5, 6, 7], phase: 'build', focus: 'Introduce tempo/threshold work, extend long run' },
      { weeks: [8], phase: 'recovery', focus: 'Recovery week - mid-plan reset' },
      { weeks: [9, 10, 11], phase: 'build', focus: 'Marathon pace practice, peak long run distance' },
      { weeks: [12], phase: 'recovery', focus: 'Recovery week before peak phase' },
      { weeks: [13, 14], phase: 'peak', focus: 'Highest quality marathon-specific sessions' },
      { weeks: [15, 16], phase: 'taper', focus: 'Progressive taper, maintain sharpness, race' },
    ],
    weekTemplates: {
      // Week 1 - Base: Build weekly structure
      1: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min with 6x100m strides' },
        wednesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training - squats, deadlifts, lunges' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 70 min (approx 12 km) easy conversational pace' },
      },
      // Week 2 - Base: Volume increase
      2: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_progression_run', notes: 'Progression run: 40 min, last 10 min at moderate effort' },
        wednesday: { workout: 'cyclist_core_stability', notes: 'Core stability session' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 80 min (approx 14 km) easy pace' },
      },
      // Week 3 - Base: Peak base volume
      3: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: 10 min warm up, 15 min tempo, 10 min cool down' },
        wednesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 85 min (approx 15 km) easy pace' },
      },
      // Week 4 - Recovery: Absorb base work
      4: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        tuesday: { workout: 'yoga_for_cyclists', notes: 'Yoga for runners - active recovery and mobility' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min with strides' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Light core work' },
        friday: { workout: 'run_recovery_jog', notes: 'Recovery jog 20 min' },
        saturday: { workout: 'run_easy_long', notes: 'Reduced long run 55 min easy' },
      },
      // Week 5 - Build 1: Threshold work begins, long run grows
      5: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_threshold_intervals', notes: 'Quality: 4x6 min at threshold with 2 min jog recovery' },
        wednesday: { workout: 'cyclist_strength_foundation', notes: 'Strength training' },
        thursday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 45 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 90 min (approx 16 km) easy pace' },
      },
      // Week 6 - Build 1: Tempo endurance
      6: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: continuous tempo - 25 min at tempo pace' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Core stability and hip strength' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 45 min with strides' },
        saturday: { workout: 'run_long_run', notes: 'Long run 95 min (approx 17 km) with middle 15 min at marathon pace' },
      },
      // Week 7 - Build 1: Combined quality
      7: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_tempo_threshold_combo', notes: 'Quality: tempo + threshold combination' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'cyclist_strength_foundation', notes: 'Strength - moderate load' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 45 min' },
        saturday: { workout: 'run_long_run', notes: 'Long run 100 min (approx 18 km) easy pace' },
      },
      // Week 8 - Recovery: Mid-plan reset
      8: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        tuesday: { workout: 'hip_mobility_routine', notes: 'Hip mobility and flexibility' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min with strides' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Light core work' },
        friday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        saturday: { workout: 'run_easy_long', notes: 'Reduced long run 60 min easy' },
      },
      // Week 9 - Build 2: Marathon pace sessions begin
      9: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_race_pace_marathon', notes: 'Quality: marathon pace session - 30 min at goal marathon pace' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'cyclist_strength_foundation', notes: 'Strength - maintain, moderate load' },
        friday: { workout: 'run_easy_aerobic', notes: 'Easy run 45 min' },
        saturday: { workout: 'run_long_run_extended', notes: 'Long run 110 min (approx 20 km) easy with last 20 min at marathon pace' },
      },
      // Week 10 - Build 2: Longer marathon pace
      10: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_threshold_continuous', notes: 'Quality: 25 min continuous threshold' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'run_race_pace_marathon', notes: 'Quality: marathon pace - 40 min at goal pace' },
        friday: { workout: 'cyclist_core_stability', notes: 'Core stability' },
        saturday: { workout: 'run_long_run_extended', notes: 'Long run 120 min (approx 22 km) easy with marathon pace segments' },
      },
      // Week 11 - Build 2: Peak long run distance
      11: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_tempo_cruise', notes: 'Quality: cruise intervals - 3x10 min at tempo' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'run_race_pace_marathon', notes: 'Quality: marathon pace - 45 min at goal pace' },
        friday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min' },
        saturday: { workout: 'run_long_run_extended', notes: 'PEAK long run 140 min (approx 25-26 km) mostly easy with 30 min at marathon pace' },
      },
      // Week 12 - Recovery: Pre-peak recovery
      12: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 35 min' },
        tuesday: { workout: 'yoga_for_cyclists', notes: 'Yoga for runners - recovery and mobility' },
        wednesday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min with strides' },
        thursday: { workout: 'cyclist_core_stability', notes: 'Light core work' },
        friday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        saturday: { workout: 'run_easy_long', notes: 'Reduced long run 65 min easy' },
      },
      // Week 13 - Peak: Longest marathon-specific long run
      13: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 50 min' },
        tuesday: { workout: 'run_race_pace_marathon', notes: 'Quality: marathon pace - 50 min at goal pace' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 30 min' },
        thursday: { workout: 'run_vo2max_1000s', notes: 'Quality: 4x1000m at VO2max to sharpen top end' },
        friday: { workout: 'run_easy_recovery', notes: 'Easy recovery run 25 min' },
        saturday: { workout: 'run_long_run_extended', notes: 'PEAK long run 160 min (approx 29-32 km) easy with 40 min at marathon pace' },
      },
      // Week 14 - Peak: Last hard week
      14: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy aerobic run 45 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: 30 min continuous tempo' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_race_pace_marathon', notes: 'Quality: marathon pace dress rehearsal - 40 min in race gear and nutrition' },
        friday: { workout: 'cyclist_core_stability', notes: 'Light core stability' },
        saturday: { workout: 'run_long_run', notes: 'Long run 90 min easy - beginning of taper' },
      },
      // Week 15 - Taper: Reduce volume significantly
      15: {
        sunday: { workout: null, notes: 'Rest day' },
        monday: { workout: 'run_easy_aerobic', notes: 'Easy run 40 min' },
        tuesday: { workout: 'run_tempo_continuous', notes: 'Quality: 20 min tempo - crisp, controlled' },
        wednesday: { workout: 'run_recovery_jog', notes: 'Recovery jog 25 min' },
        thursday: { workout: 'run_race_pace_marathon', notes: 'Marathon pace: 20 min at race pace to stay calibrated' },
        friday: { workout: 'hip_mobility_routine', notes: 'Mobility and flexibility' },
        saturday: { workout: 'run_long_run', notes: 'Reduced long run 70 min easy' },
      },
      // Week 16 - Taper: Race week
      16: {
        sunday: { workout: null, notes: 'RACE DAY - Marathon! Start conservative, fuel early and often, trust your training' },
        monday: { workout: null, notes: 'Rest day' },
        tuesday: { workout: 'run_easy_aerobic', notes: 'Easy run 30 min' },
        wednesday: { workout: 'run_speed_200s', notes: 'Sharpening: 4x200m at slightly faster than race pace, full recovery' },
        thursday: { workout: 'run_recovery_jog', notes: 'Easy jog 20 min' },
        friday: { workout: 'run_easy_recovery', notes: 'Shakeout jog 15 min + 4 strides' },
        saturday: { workout: null, notes: 'Rest - pre-race prep, carb load, hydrate, visualize' },
      },
    },
    expectedGains: {
      endurance: 'Ability to complete a marathon with strong finish',
      marathonPace: 'Dialed-in marathon race pace and fueling strategy',
      threshold: '8-12% improvement in lactate threshold pace',
      longRunCapacity: 'Comfortable running 29-32km in training',
      aerobicBase: 'Massive expansion of aerobic capacity and fat oxidation',
      resilience: 'Musculoskeletal durability for 42.2km',
    },
    targetAudience:
      'Intermediate runners who have completed at least one half marathon and have been running ' +
      'consistently for 6+ months with 30-40km weekly mileage. Targeting a strong marathon ' +
      'performance with disciplined pacing and nutrition.',
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get running plan template by ID
 */
export function getRunningPlanTemplate(id: string): TrainingPlanTemplate | undefined {
  return RUNNING_PLAN_TEMPLATES[id];
}

/**
 * Get all running plan templates
 */
export function getAllRunningPlans(): TrainingPlanTemplate[] {
  return Object.values(RUNNING_PLAN_TEMPLATES);
}

/**
 * Get running plans filtered by goal
 */
export function getRunningPlansByGoal(goal: TrainingGoal): TrainingPlanTemplate[] {
  return Object.values(RUNNING_PLAN_TEMPLATES).filter(plan => plan.goal === goal);
}

/**
 * Get running plans filtered by category
 */
export function getRunningPlansByCategory(category: PlanCategory): TrainingPlanTemplate[] {
  return Object.values(RUNNING_PLAN_TEMPLATES).filter(plan => plan.category === category);
}

/**
 * Get running plans filtered by fitness level
 */
export function getRunningPlansByFitnessLevel(level: string): TrainingPlanTemplate[] {
  return Object.values(RUNNING_PLAN_TEMPLATES).filter(plan => plan.fitnessLevel === level);
}

/**
 * Get running plans filtered by duration range
 */
export function getRunningPlansByDuration(minWeeks: number, maxWeeks: number): TrainingPlanTemplate[] {
  return Object.values(RUNNING_PLAN_TEMPLATES).filter(
    plan => plan.duration >= minWeeks && plan.duration <= maxWeeks
  );
}

/**
 * Get all unique goals across running plans
 */
export function getAllRunningGoals(): TrainingGoal[] {
  const goals = new Set<TrainingGoal>();
  Object.values(RUNNING_PLAN_TEMPLATES).forEach(plan => {
    goals.add(plan.goal);
  });
  return Array.from(goals);
}

/**
 * Get all workout IDs used across running plan templates (for validation)
 */
export function getAllRunningWorkoutIdsFromTemplates(): Set<string> {
  const workoutIds = new Set<string>();

  for (const plan of Object.values(RUNNING_PLAN_TEMPLATES)) {
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
