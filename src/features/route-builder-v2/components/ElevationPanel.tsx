/**
 * ElevationPanel — Route Builder 2.0 elevation profile chart.
 *
 * Purpose-built SVG area chart fed by `useRouteAnalysis.elevationProfile`
 * (`{ distance_km, elevation_m }[]`). Styled with RB2 brand tokens.
 * Internal hover surfaces a vertical scrubber + distance/elevation
 * readout. Hidden when there's no usable profile.
 *
 * Designed as the foundation for two follow-ups:
 *  - 1.5 map ↔ chart hover sync (an external `highlightKm` prop will
 *    drive the scrubber from the map side; internal hover takes priority).
 *  - 2.2 elevation zoom + section metrics (drag-select over the SVG).
 * The hover geometry is factored so those extensions slot in without a
 * rewrite.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { convertDistance } from '../../../utils/units.jsx';
import { cueColor, type WorkoutCue } from '../overlay/intervalOverlay';
import type { ElevationPoint } from '../../../hooks/route-builder';

export interface ElevationPanelProps {
  profile: ElevationPoint[] | null;
  isMobile?: boolean;
  /**
   * Fired with the hovered distance-along-route in km (continuous, not
   * snapped to a profile point) while the pointer is over the chart, and
   * `null` on leave. Drives the map scrubber marker.
   */
  onHoverKm?: (km: number | null) => void;
  /** When true, the card fills its container width (desktop bottom strip). */
  fillWidth?: boolean;
  isImperial?: boolean;
  /** Workout interval cues (km along route) to paint as colored bands. */
  cues?: WorkoutCue[] | null;
}

// Resolution-independent viewBox; the SVG scales to the card width via
// width:100% + preserveAspectRatio="none". Strokes use
// vector-effect:non-scaling-stroke so they stay crisp when stretched.
const VIEW_W = 1000;
const VIEW_H = 200;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

interface Scales {
  minElev: number;
  maxElev: number;
  totalKm: number;
  gainM: number;
  /** Steepest segment grade along the route, in % (absolute). */
  maxGradePct: number;
  /** distance_km → svg x */
  toX: (km: number) => number;
  /** elevation_m → svg y */
  toY: (m: number) => number;
}

function buildScales(profile: ElevationPoint[]): Scales {
  let minElev = Infinity;
  let maxElev = -Infinity;
  let gainM = 0;
  let maxGradePct = 0;
  for (let i = 0; i < profile.length; i++) {
    const e = profile[i].elevation_m;
    if (e < minElev) minElev = e;
    if (e > maxElev) maxElev = e;
    if (i > 0) {
      const delta = e - profile[i - 1].elevation_m;
      if (delta > 0) gainM += delta;
      const runM = (profile[i].distance_km - profile[i - 1].distance_km) * 1000;
      if (runM > 20) {
        const grade = Math.abs(delta / runM) * 100;
        if (grade > maxGradePct) maxGradePct = grade;
      }
    }
  }
  const totalKm = profile[profile.length - 1].distance_km || 1;
  // Pad the elevation band a little so the line never hugs the edges.
  const span = Math.max(maxElev - minElev, 1);
  const lo = minElev - span * 0.08;
  const hi = maxElev + span * 0.08;
  const toX = (km: number) => (km / totalKm) * VIEW_W;
  const toY = (m: number) =>
    PAD_TOP + (1 - (m - lo) / (hi - lo)) * (VIEW_H - PAD_TOP - PAD_BOTTOM);
  return { minElev, maxElev, totalKm, gainM, maxGradePct, toX, toY };
}

/** Nearest profile index for a distance-along-route in km (binary search). */
function nearestIndexForKm(profile: ElevationPoint[], km: number): number {
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].distance_km < km) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first point >= km; pick the closer of lo / lo-1.
  if (lo > 0) {
    const prev = profile[lo - 1];
    const cur = profile[lo];
    if (Math.abs(prev.distance_km - km) <= Math.abs(cur.distance_km - km)) {
      return lo - 1;
    }
  }
  return lo;
}

function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
}

// Distance label respecting units; mirrors formatKm's compact style.
function distLabel(km: number, isImperial: boolean): string {
  const value = isImperial ? convertDistance.kmToMiles(km) : km;
  const num = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${num}${isImperial ? 'mi' : 'km'}`;
}

function elevLabel(m: number, isImperial: boolean): string {
  const value = isImperial ? convertDistance.mToFt(m) : m;
  return `${Math.round(value)}${isImperial ? 'ft' : 'm'}`;
}

export function ElevationPanel({
  profile,
  isMobile = false,
  onHoverKm,
  fillWidth = false,
  isImperial = false,
  cues = null,
}: ElevationPanelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const scales = useMemo(
    () => (profile && profile.length >= 2 ? buildScales(profile) : null),
    [profile],
  );

  const paths = useMemo(() => {
    if (!profile || !scales) return null;
    const { toX, toY } = scales;
    let line = '';
    for (let i = 0; i < profile.length; i++) {
      const x = toX(profile[i].distance_km);
      const y = toY(profile[i].elevation_m);
      line += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }
    const first = toX(profile[0].distance_km);
    const last = toX(profile[profile.length - 1].distance_km);
    const area = `${line}L${last.toFixed(2)},${VIEW_H}L${first.toFixed(2)},${VIEW_H}Z`;
    return { line, area };
  }, [profile, scales]);

  const handlePointerMove = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>) => {
      if (!profile || !scales || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width));
      const km = ratio * scales.totalKm;
      setHoverIdx(nearestIndexForKm(profile, km));
      // Report the continuous km (not the snapped index) so the map dot
      // tracks the cursor smoothly even on a sparsely sampled profile.
      onHoverKm?.(km);
    },
    [profile, scales, onHoverKm],
  );

  const handlePointerLeave = useCallback(() => {
    setHoverIdx(null);
    onHoverKm?.(null);
  }, [onHoverKm]);

  if (!profile || profile.length < 2 || !scales || !paths) return null;

  const hoverPoint = hoverIdx != null ? profile[hoverIdx] : null;
  const hoverX = hoverPoint ? scales.toX(hoverPoint.distance_km) : 0;
  const hoverY = hoverPoint ? scales.toY(hoverPoint.elevation_m) : 0;

  return (
    <Box
      data-testid="rb2-elevation-panel"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '10px 12px 6px',
        boxShadow: RB2.shadowCard,
        width: isMobile || fillWidth ? '100%' : 320,
      }}
    >
      <Box
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: RB2.textTertiary,
          }}
        >
          Elevation
        </Text>
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.08em',
            color: RB2.textSecondary,
          }}
        >
          {hoverPoint
            ? `${distLabel(hoverPoint.distance_km, isImperial)} · ${elevLabel(hoverPoint.elevation_m, isImperial)}`
            : `↑ ${elevLabel(scales.gainM, isImperial)}${scales.maxGradePct >= 1 ? ` · max ${Math.round(scales.maxGradePct)}%` : ''}`}
        </Text>
      </Box>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        width="100%"
        height={isMobile ? 64 : 80}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        role="img"
        aria-label={`Elevation profile, ${Math.round(isImperial ? convertDistance.mToFt(scales.gainM) : scales.gainM)} ${isImperial ? 'feet' : 'meters'} of climbing over ${isImperial ? convertDistance.kmToMiles(scales.totalKm).toFixed(1) : formatKm(scales.totalKm)} ${isImperial ? 'miles' : 'kilometers'}`}
      >
        {cues && cues.length > 0 && (
          <g data-testid="rb2-elevation-interval-bands">
            {cues.map((cue, i) => {
              const x1 = scales.toX(Math.max(0, Math.min(cue.startDistance, scales.totalKm)));
              const x2 = scales.toX(Math.max(0, Math.min(cue.endDistance, scales.totalKm)));
              const w = x2 - x1;
              if (w <= 0) return null;
              return (
                <rect
                  key={i}
                  x={x1}
                  y={0}
                  width={w}
                  height={VIEW_H}
                  fill={cueColor(cue.zone)}
                  fillOpacity={0.18}
                  stroke="none"
                />
              );
            })}
          </g>
        )}
        <path d={paths.area} fill={RB2.teal} fillOpacity={0.12} stroke="none" />
        <path
          d={paths.line}
          fill="none"
          stroke={RB2.teal}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hoverPoint && (
          <g>
            <line
              x1={hoverX}
              y1={0}
              x2={hoverX}
              y2={VIEW_H}
              stroke={RB2.textTertiary}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hoverX} cy={hoverY} r={4} fill={RB2.orange} stroke={RB2.cardBg} strokeWidth={1.5} />
          </g>
        )}
      </svg>

      <Box style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 9, color: RB2.textTertiary }}>0</Text>
        <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 9, color: RB2.textTertiary }}>
          {distLabel(scales.totalKm, isImperial)}
        </Text>
      </Box>
    </Box>
  );
}

export default ElevationPanel;
