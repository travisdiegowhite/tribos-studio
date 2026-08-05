/**
 * Crosshair sample lookup: nearest sample index for an x value, by binary
 * search over the monotonic xs array.
 */

export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  if (x <= xs[0]) return 0;
  if (x >= xs[xs.length - 1]) return xs.length - 1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return x - xs[lo] <= xs[hi] - x ? lo : hi;
}
