/**
 * Canvas series renderer for the activity chart. Draws one thin vertical
 * column per horizontal pixel from the per-column aggregation, so render
 * cost is bounded by plot width, not ride length.
 *
 * Zone-colored power uses the band-clip technique: all columns are built
 * into a single Path2D, which is filled once per zone band under a
 * horizontal clip rect (≤ 7 fills + clips per frame — exact per-sample zone
 * coloring with no per-sample branching).
 *
 * All geometry comes from the pure model layer; this component only issues
 * draw commands. Colors arrive as resolved hex strings from the caller
 * (useThemeTokens at render time — never module-scope tokens).
 */

import { useEffect, useRef } from 'react';
import { aggregateColumns } from '../model/columnAggregate';
import { zoneBandRects } from '../model/zoneBands';
import type { PowerZone } from '../../../utils/powerZones';

export interface OverlayLine {
  values: (number | null)[];
  yMin: number;
  yMax: number;
  color: string;
}

export interface ChartCanvasProps {
  xs: number[];
  values: (number | null)[];
  i0: number;
  i1: number;
  x0: number;
  x1: number;
  yMax: number;
  widthPx: number;
  heightPx: number;
  /** Zone definitions in watts; null → flat fill. Only sane for power. */
  zones: PowerZone[] | null;
  /** Zone colors z1..z7 (parallel to zones). */
  zoneColors: string[];
  /** Flat series color (no-zones fallback, HR, speed). */
  seriesColor: string;
  /** Baseline color. */
  baselineColor: string;
  /** Elevation silhouette drawn behind the series (bottom 35% of the plot). */
  silhouette?: { values: (number | null)[]; color: string } | null;
  /** Thin normalized overlay lines drawn above the series (W'bal, speed). */
  overlayLines?: OverlayLine[];
}

const SILHOUETTE_FRACTION = 0.35;

export function ChartCanvas({
  xs,
  values,
  i0,
  i1,
  x0,
  x1,
  yMax,
  widthPx,
  heightPx,
  zones,
  zoneColors,
  seriesColor,
  baselineColor,
  silhouette,
  overlayLines,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || widthPx <= 0 || heightPx <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // jsdom / test environments

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = Math.round(widthPx * dpr);
    const h = Math.round(heightPx * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    // Elevation silhouette — behind everything, own scale in the bottom
    // fraction of the plot, muted fill.
    if (silhouette) {
      const agg = aggregateColumns(xs, silhouette.values, i0, i1, x0, x1, w);
      let eMin = Infinity;
      let eMax = -Infinity;
      for (const v of agg.means) {
        if (v == null) continue;
        if (v < eMin) eMin = v;
        if (v > eMax) eMax = v;
      }
      if (eMax > eMin) {
        const bandTop = h * (1 - SILHOUETTE_FRACTION);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = silhouette.color;
        for (let c = 0; c < w; c++) {
          const v = agg.means[c];
          if (v == null) continue;
          const yTop = h - ((v - eMin) / (eMax - eMin)) * (h - bandTop);
          ctx.fillRect(c, yTop, 1, h - yTop);
        }
        ctx.globalAlpha = 1;
      }
    }

    const { maxs } = aggregateColumns(xs, values, i0, i1, x0, x1, w);

    // One sub-rect per column with data → a single fillable path.
    const path = new Path2D();
    let hasData = false;
    for (let c = 0; c < w; c++) {
      const v = maxs[c];
      if (v == null) continue;
      hasData = true;
      const yTop = h - (Math.min(v, yMax) / yMax) * h;
      path.rect(c, yTop, 1, h - yTop);
    }

    if (hasData) {
      if (zones && zones.length > 0) {
        const bands = zoneBandRects(zones, yMax, h);
        for (const band of bands) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, band.yTopPx, w, band.yBottomPx - band.yTopPx);
          ctx.clip();
          ctx.fillStyle = zoneColors[band.zoneIndex] ?? seriesColor;
          ctx.fill(path);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = seriesColor;
        ctx.fill(path);
      }
    }

    // Thin overlay lines (W'bal, speed) — normalized to their own domain,
    // drawn from per-column means with gaps preserved.
    if (overlayLines) {
      for (const line of overlayLines) {
        const span = line.yMax - line.yMin;
        if (span <= 0) continue;
        const agg = aggregateColumns(xs, line.values, i0, i1, x0, x1, w);
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        let penDown = false;
        for (let c = 0; c < w; c++) {
          const v = agg.means[c];
          if (v == null) {
            penDown = false;
            continue;
          }
          const y = h - ((Math.min(v, line.yMax) - line.yMin) / span) * h;
          if (penDown) ctx.lineTo(c, y);
          else {
            ctx.moveTo(c, y);
            penDown = true;
          }
        }
        ctx.stroke();
      }
    }

    // Recessive baseline
    ctx.fillStyle = baselineColor;
    ctx.fillRect(0, h - dpr, w, dpr);
  }, [xs, values, i0, i1, x0, x1, yMax, widthPx, heightPx, zones, zoneColors, seriesColor, baselineColor, silhouette, overlayLines]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}
