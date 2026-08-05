/**
 * Zone band geometry for the zone-colored power area. The canvas paints the
 * power area path once per band under a horizontal clip rect — exact
 * per-sample zone coloring at the cost of ≤ 7 fills per frame.
 */

import type { PowerZone } from '../../../utils/powerZones';

export interface ZoneBandRect {
  /** 0-based zone index (color lookup). */
  zoneIndex: number;
  /** Clip rect top edge in plot px (y grows downward). */
  yTopPx: number;
  /** Clip rect bottom edge in plot px. */
  yBottomPx: number;
}

/**
 * Clip rects (in plot pixels) for every zone band that intersects the
 * y-domain [0, yMaxWatts]. plotHeightPx maps watts→px linearly with 0 at
 * the bottom. Bands are returned bottom-up (z1 first); adjacent rects share
 * edges exactly, so the union covers the plot with no seams.
 */
export function zoneBandRects(
  zones: PowerZone[],
  yMaxWatts: number,
  plotHeightPx: number
): ZoneBandRect[] {
  if (yMaxWatts <= 0 || plotHeightPx <= 0) return [];
  const yFor = (watts: number) =>
    plotHeightPx - (Math.min(watts, yMaxWatts) / yMaxWatts) * plotHeightPx;

  const rects: ZoneBandRect[] = [];
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.minWatts >= yMaxWatts) break; // band entirely above the plot
    const upper = z.maxWatts == null ? yMaxWatts : Math.min(z.maxWatts, yMaxWatts);
    if (upper <= z.minWatts) continue;
    rects.push({
      zoneIndex: i,
      yTopPx: yFor(upper),
      yBottomPx: yFor(z.minWatts),
    });
  }
  return rects;
}
