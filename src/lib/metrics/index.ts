/**
 * Tribos Proprietary Metrics
 *
 * EFI  — Execution Fidelity Index
 * TWL  — Terrain-Weighted Load
 * TCAS — Training Capacity Acquisition Score
 * FAR  — Fitness Acquisition Rate
 */

// Computation functions
export { computeEFI, efiCoachInsight } from './efi';
export { computeTWL, computeGVI, projectTWLForRoute } from './twl';
export { computeTCAS, tcasCoachInsight } from './tcas';
export {
  computeFAR,
  computeFARMomentum,
  computeMomentumFlag,
  assessFARGaps,
  computeFARFromSeries,
} from './far';

// Zone classification
export { classifyFARZone, getFARStatusLabel, FAR_ZONE_COLORS } from './farZones';

// Translation layer
export { translateEFI, translateTWL, translateTCAS, translateFAR, METRICS_TOOLTIPS } from './translate';

// Types
export type {
  ZoneDistribution,
  EFIInputs, EFIResult,
  TWLInputs, TWLResult,
  TCASSixWeekWindow, TCASResult,
  ScoreBand,
  FARGapAssessment,
  FARResult,
  FARZone,
  FARTreatment,
  FARMomentumFlag,
  TrainingLoadDailyRow,
} from './types';
export { SCORE_COLORS, scoreBand } from './types';
