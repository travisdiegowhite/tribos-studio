/**
 * Real Normalized Power for client-side live recomputation (the activity
 * chart's selection stat card).
 *
 * Keep in sync with calculateNormalizedPower in api/utils/fitParser.js:397
 * — the algorithm is duplicated across the serverless/browser runtime split
 * on purpose (same precedent as the haversine copy flagged in CLAUDE.md).
 * At sampleSeconds = 1 the two produce identical results for the same
 * input; this version additionally supports coarser regular sampling
 * (coach_ts tiers) by shrinking the rolling window to ~30 s of samples.
 *
 * Matching production semantics: callers pass a power sequence with nulls
 * and zeros already removed (api/utils/fitParser.js extractPowerStream
 * drops them before NP), so stored effective_power and this recomputation
 * agree on the same ride.
 */

export function normalizedPowerFromSamples(
  powerValues: number[],
  sampleSeconds = 1
): number | null {
  if (!powerValues || sampleSeconds <= 0) return null;
  const windowSamples = Math.max(1, Math.round(30 / sampleSeconds));
  if (powerValues.length < windowSamples) return null;

  // Rolling sum instead of the api's nested loop — same values, O(n).
  let sum = 0;
  let sumFourth = 0;
  let count = 0;
  for (let i = 0; i < powerValues.length; i++) {
    sum += powerValues[i] || 0;
    if (i >= windowSamples) sum -= powerValues[i - windowSamples] || 0;
    if (i >= windowSamples - 1) {
      const avg = sum / windowSamples;
      sumFourth += avg ** 4;
      count++;
    }
  }
  if (count === 0) return null;
  return Math.round((sumFourth / count) ** 0.25);
}
