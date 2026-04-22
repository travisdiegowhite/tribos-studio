/**
 * Tribos Proprietary Metrics
 *
 * EFI — Execution Fidelity Index
 * TWL — Terrain-Weighted Load
 * TCAS — Time-Constrained Adaptation Score
 */

// Computation functions
export { computeEFI, efiCoachInsight } from './efi';
export { computeTWL, computeGVI, projectTWLForRoute } from './twl';
export { computeTCAS, tcasCoachInsight } from './tcas';

// Translation layer
export { translateEFI, translateTWL, translateTCAS, METRICS_TOOLTIPS } from './translate';

// Types
export type {
  ZoneDistribution,
  EFIInputs, EFIResult,
  TWLInputs, TWLResult,
  TCASSixWeekWindow, TCASResult,
  ScoreBand,
} from './types';
export { SCORE_COLORS, scoreBand } from './types';
