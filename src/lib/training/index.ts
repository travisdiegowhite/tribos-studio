/**
 * Training Load & Deviation Adjustment System
 *
 * TSS estimation, TSB projection, deviation detection,
 * and coach persona-based adjustment ranking.
 */

// Fatigue estimation
export { estimateTSS, updateCalibration, computeTRIMP } from './fatigue-estimation';

// Form Score projection
export {
  stepDay,
  projectSchedule,
  classifyFS,
  projectAdjustmentOptions,
  assessDeviationImpact,
} from './tsb-projection';

// Coach persona ranking
export { rankOptions } from './coach-personas';

// Deviation detection
export { analyzeDeviation } from './deviation-detection';

// Constants
export {
  TFI_TIME_CONSTANT,
  AFI_TIME_CONSTANT,
  QUALITY_FS_THRESHOLD,
  RACE_FS_TARGET_LOW,
  RACE_FS_TARGET_HIGH,
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
  FSZone,
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
