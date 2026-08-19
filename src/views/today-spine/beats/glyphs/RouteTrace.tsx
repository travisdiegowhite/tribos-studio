/**
 * RouteTrace — the shape of the ride that opens the page.
 *
 * The actual polyline, simplified, with no tiles, labels, axis or scale. It is
 * a projection of real data, not an illustration: two riders never get the
 * same mark, and a rider whose ride carried no geometry gets nothing at all
 * rather than a placeholder.
 *
 * No map library — the geometry is decoded with the shared decoder and drawn
 * as one SVG path, which is what keeps mapbox-gl off the mobile critical path.
 */

import { useMemo } from 'react';
import { Box } from '@mantine/core';
import { decodePolyline } from '../../../today/shared/decodePolyline';
import { C } from '../../tokens';
import { tierColor } from '../effortColor';
import type { EffortTier } from '../types';

interface RouteTraceProps {
  polyline: string | null;
  tier: EffortTier | null;
  height?: number;
}

/** Cap the point count — a 3-hour ride's polyline is far more than a 72px glyph needs. */
const MAX_POINTS = 400;

interface Geometry {
  d: string;
  start: { x: number; y: number };
  viewBox: string;
  /** Start-dot radius in viewBox units — a px radius would be meaningless
   *  when the coordinate space spans hundredths of a degree. */
  dotR: number;
}

export function buildTraceGeometry(coords: Array<[number, number]>): Geometry | null {
  if (coords.length < 2) return null;

  const step = Math.max(1, Math.ceil(coords.length / MAX_POINTS));
  const sampled = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);

  // Longitude degrees shrink with latitude; without the correction a trace at
  // 40°N renders ~30% too wide and stops looking like the road it was.
  const midLat = sampled.reduce((sum, [, lat]) => sum + lat, 0) / sampled.length;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;

  const pts = sampled.map(([lng, lat]) => ({ x: lng * kx, y: -lat }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // An out-and-back on one road has zero width in one axis; give it something
  // to render into rather than dividing by zero.
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const pad = Math.max(w, h) * 0.06;

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(' ');

  return {
    d,
    start: pts[0],
    viewBox: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`,
    dotR: Math.max(w, h) * 0.035,
  };
}

export function RouteTrace({ polyline, tier, height = 76 }: RouteTraceProps) {
  const geometry = useMemo(() => buildTraceGeometry(decodePolyline(polyline)), [polyline]);
  if (!geometry) return null;

  const stroke = tierColor(tier);
  return (
    <Box style={{ height, width: '100%' }} data-testid="route-trace">
      <svg
        width="100%"
        height={height}
        viewBox={geometry.viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Shape of your last ride"
      >
        <path
          d={geometry.d}
          fill="none"
          stroke={stroke}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={geometry.start.x} cy={geometry.start.y} r={geometry.dotR} fill={C.navy} />
      </svg>
    </Box>
  );
}
