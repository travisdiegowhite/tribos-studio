/**
 * ElevationPanel — Route Builder 2.0 elevation profile chart.
 *
 * Purpose-built SVG area chart fed by `useRouteAnalysis.elevationProfile`
 * (`{ distance_km, elevation_m }[]`). Styled with RB2 brand tokens.
 *
 * The area under the terrain line is painted as grade bands — contiguous
 * runs of climbing steepness on the Tribos earth ramp (pale sage flat →
 * deep clay 10%+, see `elevationGrade.ts`), with altitude gridlines/ticks,
 * distance-axis ticks, and a grade legend. Internal hover surfaces a
 * vertical scrubber + distance/elevation/grade readout. Hidden when
 * there's no usable profile.
 *
 * Designed as the foundation for two follow-ups:
 *  - 1.5 map ↔ chart hover sync (an external `highlightKm` prop will
 *    drive the scrubber from the map side; internal hover takes priority).
 *  - 2.2 elevation zoom + section metrics (drag-select over the SVG).
 * The hover geometry is factored so those extensions slot in without a
 * rewrite.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { convertDistance } from '../../../utils/units.jsx';
import { cueColor, type WorkoutCue } from '../overlay/intervalOverlay';
import {
  GRADE_RAMP,
  GRADE_RAMP_MAX_PCT,
  computeGradeSegmentation,
  gradeToColor,
  niceTicks,
} from './elevationGrade';
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

// Display-unit factors for axis tick generation (labels are formatted with
// the same tick value, so a tick is always internally consistent).
const FT_PER_M = 3.28084;
const MI_PER_KM = 0.621371;

interface Scales {
  minElev: number;
  maxElev: number;
  totalKm: number;
  gainM: number;
  /** distance_km → svg x */
  toX: (km: number) => number;
  /** elevation_m → svg y */
  toY: (m: number) => number;
}

function buildScales(profile: ElevationPoint[]): Scales {
  let minElev = Infinity;
  let maxElev = -Infinity;
  let gainM = 0;
  for (let i = 0; i < profile.length; i++) {
    const e = profile[i].elevation_m;
    if (e < minElev) minElev = e;
    if (e > maxElev) maxElev = e;
    if (i > 0) {
      const delta = e - profile[i - 1].elevation_m;
      if (delta > 0) gainM += delta;
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
  return { minElev, maxElev, totalKm, gainM, toX, toY };
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

// Bare tick number ("15" / "22.5") — the axis-end label carries the unit.
function tickNum(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

const AXIS_LABEL_STYLE = {
  fontFamily: RB2_FONT.mono,
  fontSize: 9,
  color: RB2.textTertiary,
} as const;

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

  const segmentation = useMemo(
    () => (profile && profile.length >= 2 ? computeGradeSegmentation(profile) : null),
    [profile],
  );

  const linePath = useMemo(() => {
    if (!profile || !scales) return null;
    const { toX, toY } = scales;
    let line = '';
    for (let i = 0; i < profile.length; i++) {
      const x = toX(profile[i].distance_km);
      const y = toY(profile[i].elevation_m);
      line += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return line;
  }, [profile, scales]);

  // One closed polygon per grade run: along the terrain line, then down to
  // the baseline. Adjacent runs share their boundary point, so the bands
  // butt cleanly with no seams.
  const gradeBands = useMemo(() => {
    if (!profile || !scales || !segmentation) return null;
    const { toX, toY } = scales;
    return segmentation.runs.map((run) => {
      let d = '';
      for (let i = run.startIdx; i <= run.endIdx; i++) {
        const x = toX(profile[i].distance_km);
        const y = toY(profile[i].elevation_m);
        d += `${i === run.startIdx ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      }
      const x1 = toX(profile[run.endIdx].distance_km);
      const x0 = toX(profile[run.startIdx].distance_km);
      d += `L${x1.toFixed(2)},${VIEW_H}L${x0.toFixed(2)},${VIEW_H}Z`;
      return { d, color: gradeToColor(run.gradePct) };
    });
  }, [profile, scales, segmentation]);

  const chartHeightPx = isMobile ? 72 : 112;

  // Altitude gridlines/labels at clean values in the display unit. Every
  // tick draws a gridline, but labels thin out when the rendered gap gets
  // too tight to read (flat routes produce closely spaced clean values).
  const yTicks = useMemo(() => {
    if (!scales) return [];
    const f = isImperial ? FT_PER_M : 1;
    const ticks = niceTicks(scales.minElev * f, scales.maxElev * f, 3).map((t) => ({
      label: tickNum(t),
      y: scales.toY(t / f),
      showLabel: true,
    }));
    if (ticks.length >= 2) {
      const gapPx = (Math.abs(ticks[0].y - ticks[1].y) / VIEW_H) * chartHeightPx;
      if (gapPx < 16) {
        // Keep every other label, counting down from the top (last) tick so
        // the unit-bearing label always survives.
        for (let i = 0; i < ticks.length; i++) {
          ticks[i].showLabel = (ticks.length - 1 - i) % 2 === 0;
        }
      }
    }
    return ticks;
  }, [scales, isImperial, chartHeightPx]);

  // Distance-axis ticks at clean values in the display unit. Ends are
  // labeled separately ("0" and the total), so drop ticks that would
  // collide with them.
  const xTicks = useMemo(() => {
    if (!scales) return [];
    const f = isImperial ? MI_PER_KM : 1;
    return niceTicks(0, scales.totalKm * f, 4)
      .map((t) => ({ label: tickNum(t), pct: (t / f / scales.totalKm) * 100 }))
      .filter((t) => t.pct > 8 && t.pct < 90);
  }, [scales, isImperial]);

  // Pointer moves arrive faster than frames render; coalesce to one
  // update per animation frame so scrubbing stays smooth on long profiles.
  const rafRef = useRef<number | null>(null);
  const pendingClientXRef = useRef<number>(0);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>) => {
      if (!profile || !scales || !svgRef.current) return;
      pendingClientXRef.current = evt.clientX;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0) return;
        const ratio = Math.min(
          1,
          Math.max(0, (pendingClientXRef.current - rect.left) / rect.width),
        );
        const km = ratio * scales.totalKm;
        setHoverIdx(nearestIndexForKm(profile, km));
        // Report the continuous km (not the snapped index) so the map dot
        // tracks the cursor smoothly even on a sparsely sampled profile.
        onHoverKm?.(km);
      });
    },
    [profile, scales, onHoverKm],
  );

  const handlePointerLeave = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoverIdx(null);
    onHoverKm?.(null);
  }, [onHoverKm]);

  if (!profile || profile.length < 2 || !scales || !linePath || !gradeBands) return null;

  const hoverPoint = hoverIdx != null ? profile[hoverIdx] : null;
  const hoverX = hoverPoint ? scales.toX(hoverPoint.distance_km) : 0;
  const hoverY = hoverPoint ? scales.toY(hoverPoint.elevation_m) : 0;
  const hoverGradePct = hoverIdx != null && segmentation ? segmentation.gradesPct[hoverIdx] : null;
  const maxGradePct = segmentation ? segmentation.maxPct : 0;

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
            ? `${distLabel(hoverPoint.distance_km, isImperial)} · ${elevLabel(hoverPoint.elevation_m, isImperial)}${hoverGradePct != null ? ` · ${hoverGradePct.toFixed(1)}%` : ''}`
            : `↑ ${elevLabel(scales.gainM, isImperial)}${maxGradePct >= 1 ? ` · max ${Math.round(maxGradePct)}%` : ''}`}
        </Text>
      </Box>

      <Box style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          width="100%"
          height={chartHeightPx}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          role="img"
          aria-label={`Elevation profile, ${Math.round(isImperial ? convertDistance.mToFt(scales.gainM) : scales.gainM)} ${isImperial ? 'feet' : 'meters'} of climbing over ${isImperial ? convertDistance.kmToMiles(scales.totalKm).toFixed(1) : formatKm(scales.totalKm)} ${isImperial ? 'miles' : 'kilometers'}`}
        >
          <g data-testid="rb2-elevation-grade-bands">
            {gradeBands.map((band, i) => (
              <path key={i} d={band.d} fill={band.color} stroke="none" />
            ))}
          </g>
          {/* Hairline altitude gridlines, over the bands so they read on any fill. */}
          <g>
            {yTicks.map((t, i) => (
              <line
                key={i}
                x1={0}
                y1={t.y}
                x2={VIEW_W}
                y2={t.y}
                stroke="rgba(20, 20, 16, 0.10)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
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
          <path
            d={linePath}
            fill="none"
            stroke={RB2.textSecondary}
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
                stroke={RB2.textSecondary}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={hoverX} cy={hoverY} r={4} fill={RB2.teal} stroke={RB2.cardBg} strokeWidth={1.5} />
            </g>
          )}
        </svg>

        {/* Altitude tick labels — HTML overlay (SVG text would stretch with
            preserveAspectRatio="none"). Sit just above their gridline. */}
        {yTicks.map((t, i) =>
          t.showLabel ? (
            <Text
              key={i}
              component="span"
              style={{
                ...AXIS_LABEL_STYLE,
                fontSize: 8,
                position: 'absolute',
                left: 3,
                top: `${(t.y / VIEW_H) * 100}%`,
                transform: 'translateY(-100%)',
                lineHeight: 1.2,
                padding: '0 3px',
                backgroundColor: 'rgba(255, 255, 255, 0.55)',
                pointerEvents: 'none',
              }}
            >
              {i === yTicks.length - 1 ? `${t.label}${isImperial ? 'ft' : 'm'}` : t.label}
            </Text>
          ) : null,
        )}
      </Box>

      {/* Distance axis. */}
      <Box style={{ position: 'relative', height: 12, marginTop: 2 }}>
        <Text component="span" style={{ ...AXIS_LABEL_STYLE, position: 'absolute', left: 0 }}>
          0
        </Text>
        {xTicks.map((t, i) => (
          <Text
            key={i}
            component="span"
            style={{
              ...AXIS_LABEL_STYLE,
              position: 'absolute',
              left: `${t.pct}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {t.label}
          </Text>
        ))}
        <Text component="span" style={{ ...AXIS_LABEL_STYLE, position: 'absolute', right: 0 }}>
          {distLabel(scales.totalKm, isImperial)}
        </Text>
      </Box>

      {/* Grade scale legend (desktop only — the hover readout carries grade
          on mobile). */}
      {!isMobile && (
        <Box
          data-testid="rb2-elevation-grade-legend"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 3,
          }}
        >
          <Text
            component="span"
            style={{ ...AXIS_LABEL_STYLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            Grade %
          </Text>
          <Text component="span" style={AXIS_LABEL_STYLE}>
            0
          </Text>
          <Box
            style={{
              width: 110,
              height: 7,
              border: '1px solid rgba(20, 20, 16, 0.12)',
              background: `linear-gradient(to right, ${GRADE_RAMP.map(
                (s) => `${s.color} ${(s.pct / GRADE_RAMP_MAX_PCT) * 100}%`,
              ).join(', ')})`,
            }}
          />
          <Text component="span" style={AXIS_LABEL_STYLE}>
            {GRADE_RAMP_MAX_PCT}+
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default ElevationPanel;
