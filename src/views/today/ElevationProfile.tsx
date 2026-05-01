/**
 * ElevationProfile — small recharts-based elevation chart
 *
 * Reads elevation values from a route's geometry. The audit notes
 * recharts is already a dependency and no standalone elevation chart
 * component exists outside the route builder, so this is a fresh,
 * minimal version sized for a Today card.
 *
 * Pulls the third coordinate (elevation in meters) from each [lng, lat,
 * ele] tuple. If the geometry has no elevation data, returns null so
 * the parent can collapse the row.
 */

import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface ElevationProfileProps {
  geometry: unknown;
  height?: number;
}

interface SamplePoint {
  index: number;
  elevation: number;
}

function extractElevationSamples(geometry: unknown): SamplePoint[] {
  if (!geometry || typeof geometry !== 'object') return [];
  const g = geometry as { type?: string; coordinates?: unknown };

  let coords: number[][] = [];
  if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
    coords = g.coordinates as number[][];
  } else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
    coords = (g.coordinates as number[][][]).flat();
  } else {
    return [];
  }

  // Downsample to ~120 points for the small preview
  const step = Math.max(1, Math.floor(coords.length / 120));
  const samples: SamplePoint[] = [];
  for (let i = 0; i < coords.length; i += step) {
    const c = coords[i];
    if (Array.isArray(c) && c.length >= 3 && typeof c[2] === 'number') {
      samples.push({ index: i, elevation: c[2] });
    }
  }
  return samples;
}

function ElevationProfile({ geometry, height = 60 }: ElevationProfileProps) {
  const samples = useMemo(() => extractElevationSamples(geometry), [geometry]);
  if (samples.length < 4) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={samples} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area
          type="monotone"
          dataKey="elevation"
          stroke="var(--color-orange, #D4600A)"
          strokeWidth={1.5}
          fill="var(--color-orange-subtle, rgba(212, 96, 10, 0.10))"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default ElevationProfile;
