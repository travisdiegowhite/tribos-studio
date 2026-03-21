/**
 * TWL — Terrain-Weighted Load
 *
 * TSS adjusted for gradient, climbing rate, and altitude.
 * TWL = TSS × M_terrain
 * M_terrain = 1 + (α × VAM_norm) + (β × GVI) + (γ × ALT)
 */
import type { TWLInputs, TWLResult } from './types';

const ALPHA = 0.10;  // climbing rate coefficient
const BETA  = 0.03;  // gradient variability coefficient
const GAMMA = 0.05;  // altitude coefficient
const VAM_CAP = 1.5; // cap on VAM_norm

export function computeTWL(inputs: TWLInputs): TWLResult {
  const { baseTSS, elevationGainM, rideDurationHours, gvi, meanElevationM } = inputs;

  // VAM
  const vam = rideDurationHours > 0 ? elevationGainM / rideDurationHours : 0;
  const vamNorm = Math.min(VAM_CAP, vam / 1000);

  // Altitude
  const altTerm = Math.max(0, (meanElevationM - 1000) / 1000);

  // Components
  const alphaComponent = ALPHA * vamNorm;
  const betaComponent  = BETA  * gvi;
  const gammaComponent = GAMMA * altTerm;

  const mTerrain = 1 + alphaComponent + betaComponent + gammaComponent;
  const twl = Math.round(baseTSS * mTerrain * 10) / 10;

  return {
    twl,
    baseTSS,
    mTerrain,
    vam: Math.round(vam),
    vamNorm: Math.round(vamNorm * 1000) / 1000,
    alphaComponent,
    betaComponent,
    gammaComponent,
    overagePercent: Math.round((mTerrain - 1) * 100),
  };
}

/**
 * Compute Gradient Variability Index from elevation and distance streams.
 * Returns the population standard deviation of gradient values (%).
 * Applies a 30-second rolling mean to elevation before computing grades
 * to remove GPS noise.
 */
export function computeGVI(
  elevationStream: number[],
  distanceStream: number[],
  sampleIntervalSec: number = 1,
): number {
  if (elevationStream.length < 2) return 0;

  // 30-second rolling mean on elevation to reduce GPS noise
  const windowSize = Math.max(1, Math.round(30 / sampleIntervalSec));
  const smoothed: number[] = [];
  for (let i = 0; i < elevationStream.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(elevationStream.length, i + Math.ceil(windowSize / 2));
    let sum = 0;
    for (let j = start; j < end; j++) sum += elevationStream[j];
    smoothed.push(sum / (end - start));
  }

  // Compute grades from smoothed elevation
  const grades: number[] = [];
  for (let i = 1; i < smoothed.length; i++) {
    const dElev = smoothed[i] - smoothed[i - 1];
    const dDist = distanceStream[i] - distanceStream[i - 1];
    if (dDist > 0.5) { // filter noise — only compute grade over segments > 0.5m
      grades.push((dElev / dDist) * 100);
    }
  }

  if (grades.length === 0) return 0;

  // Population standard deviation
  const mean = grades.reduce((a, b) => a + b, 0) / grades.length;
  const variance = grades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / grades.length;
  return Math.sqrt(variance);
}

/**
 * Project TWL for a planned route before it is ridden.
 * Used by the route builder to show expected load alongside standard TSS.
 */
export function projectTWLForRoute(
  estimatedTSS: number,
  routeElevationGainM: number,
  estimatedDurationHours: number,
  routeGVI: number,
  routeMeanElevationM: number,
): TWLResult {
  return computeTWL({
    baseTSS: estimatedTSS,
    elevationGainM: routeElevationGainM,
    rideDurationHours: estimatedDurationHours,
    gvi: routeGVI,
    meanElevationM: routeMeanElevationM,
  });
}
