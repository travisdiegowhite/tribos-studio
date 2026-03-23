/**
 * Training Load & Deviation Adjustment System
 *
 * TSS estimation, TSB projection, deviation detection,
 * and coach persona-based adjustment ranking.
 */

// Fatigue estimation
export { estimateTSS, updateCalibration, computeTRIMP } from './fatigue-estimation';

// TSB projection
export {
  stepDay,
  projectSchedule,
  classifyTSB,
  projectAdjustmentOptions,
  assessDeviationImpact,
} from './tsb-projection';

// Coach persona ranking
export { rankOptions } from './coach-personas';

// Deviation detection
export { analyzeDeviation } from './deviation-detection';

// Constants
export {
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  QUALITY_TSB_THRESHOLD,
  RACE_TSB_TARGET_LOW,
  RACE_TSB_TARGET_HIGH,
  DEVIATION_MIN_DELTA,
  DEVIATION_MIN_RATIO,
  MODIFY_FACTOR,
  EASY_DAY_DEFAULT_TSS,
  DEFAULT_CALIBRATION,
  TYPE_TSS_PER_HOUR,
} from './constants';

// Types
export type {
  TSSSource,
  TSSEstimate,
  ActivityData,
  CalibrationFactors,
  DailyLoad,
  ProjectionState,
  ProjectionResult,
  TSBZone,
  AdjustmentProjections,
  AdjustmentOption,
  DeviationType,
  PlannedWorkoutRef,
  DeviationImpact,
  DeviationAnalysis,
  CoachPersona,
  RankedOption,
  RankingContext,
  FatigueCheckin,
  TrainingLoadDailyRow,
  PlanDeviationRow,
  FatigueCalibrationRow,
} from './types';
