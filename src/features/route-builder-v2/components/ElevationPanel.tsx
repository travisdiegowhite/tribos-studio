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
import { detectClimbs, climbLabel, type RouteClimb } from '../../../utils/climbs';
import { MAP_PALETTE } from '../../../utils/mapPalette';

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
  /** Picking a climb in the list (km along the route), e.g. to fit the map to it. */
  onSelectClimb?: (start_km: number, end_km: number) => void;
  /** "Show on map" for a stretch dragged out on the chart (km along the route). */
  onSelectRange?: (start_km: number, end_km: number) => void;
}

export interface SectionMetrics {
  start_km: number;
  end_km: number;
  distance_km: number;
  gain_m: number;
  loss_m: number;
  avg_grade_pct: number;
  max_grade_pct: number;
}

/** Metrics for the part of the profile between two distances (km). */
export function sectionMetrics(
  profile: ElevationPoint[],
  gradesPct: number[] | null,
  start_km: number,
  end_km: number,
): SectionMetrics | null {
  const lo_km = Math.min(start_km, end_km);
  const hi_km = Math.max(start_km, end_km);
  if (!(hi_km > lo_km) || profile.length < 2) return null;
  const elevAt = (km: number) => {
    let i = 1;
    while (i < profile.length - 1 && profile[i].distance_km < km) i++;
    const a = profile[i - 1];
    const b = profile[i];
    const span = b.distance_km - a.distance_km;
    const t = span > 0 ? Math.min(1, Math.max(0, (km - a.distance_km) / span)) : 0;
    return a.elevation_m + t * (b.elevation_m - a.elevation_m);
  };
  const pts: number[] = [elevAt(lo_km)];
  let maxGrade = 0;
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (p.distance_km > lo_km && p.distance_km < hi_km) {
      pts.push(p.elevation_m);
      const g = gradesPct?.[i];
      if (typeof g === 'number' && Number.isFinite(g)) maxGrade = Math.max(maxGrade, g);
    }
  }
  pts.push(elevAt(hi_km));
  let gain_m = 0;
  let loss_m = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i] - pts[i - 1];
    if (d > 0) gain_m += d;
    else loss_m -= d;
  }
  const distance_km = hi_km - lo_km;
  return {
    start_km: lo_km,
    end_km: hi_km,
    distance_km,
    gain_m,
    loss_m,
    avg_grade_pct: ((pts[pts.length - 1] - pts[0]) / (distance_km * 1000)) * 100,
    max_grade_pct: maxGrade,
  };
}

/** Climbs listed under the chart before "and N more". */
const MAX_LISTED_CLIMBS = 5;

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
  onSelectClimb,
  onSelectRange,
}: ElevationPanelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const scales = useMemo(
    () => (profile && profile.length >= 2 ? buildScales(profile) : null),
    [profile],
  );

  // Climbs (climbs.ts): magenta bars over the chart and a short list below,
  // biggest first; the same detection marks them on exported courses.
  const climbs = useMemo<RouteClimb[]>(() => detectClimbs(profile), [profile]);
  const listedClimbs = useMemo(
    () => [...climbs].sort((a, b) => b.score - a.score).slice(0, MAX_LISTED_CLIMBS),
    [climbs],
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

  // Drag on the chart to select a stretch (section metrics + "Show on map").
  // A press without movement selects nothing, so a tap stays a tap.
  const [selection, setSelection] = useState<{ start_km: number; end_km: number } | null>(null);
  const dragRef = useRef<{ startKm: number; moved: boolean } | null>(null);
  const kmAtClientX = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg || !scales) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return null;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * scales.totalKm;
    },
    [scales],
  );
  // A new route clears a selection made on the old one.
  useEffect(() => setSelection(null), [profile]);

  const handlePointerDown = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>) => {
      const km = kmAtClientX(evt.clientX);
      if (km == null) return;
      dragRef.current = { startKm: km, moved: false };
      try {
        svgRef.current?.setPointerCapture?.(evt.pointerId);
      } catch {
        // pointer capture is a nicety (keeps the drag when leaving the chart)
      }
    },
    [kmAtClientX],
  );

  const handlePointerUp = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || !drag.moved) return;
      const km = kmAtClientX(evt.clientX);
      if (km == null) return;
      setSelection({ start_km: Math.min(drag.startKm, km), end_km: Math.max(drag.startKm, km) });
    },
    [kmAtClientX],
  );

  const handlePointerMove = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>) => {
      if (!profile || !scales || !svgRef.current) return;
      const drag = dragRef.current;
      if (drag) {
        const km = kmAtClientX(evt.clientX);
        // More than 1% of the route counts as a drag, not a wobbly tap.
        if (km != null && (drag.moved || Math.abs(km - drag.startKm) > scales.totalKm * 0.01)) {
          drag.moved = true;
          setSelection({ start_km: Math.min(drag.startKm, km), end_km: Math.max(drag.startKm, km) });
        }
      }
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
    [profile, scales, onHoverKm, kmAtClientX],
  );

  const section = useMemo(
    () => (selection && profile ? sectionMetrics(profile, segmentation?.gradesPct ?? null, selection.start_km, selection.end_km) : null),
    [selection, profile, segmentation],
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
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
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
          {climbs.length > 0 && (
            <g data-testid="rb2-elevation-climb-bars">
              {climbs.map((c, i) => {
                const x1 = scales.toX(Math.max(0, Math.min(c.start_km, scales.totalKm)));
                const x2 = scales.toX(Math.max(0, Math.min(c.end_km, scales.totalKm)));
                if (x2 - x1 <= 0) return null;
                return (
                  <rect
                    key={i}
                    x={x1}
                    y={0}
                    width={x2 - x1}
                    height={c.category ? 6 : 3}
                    fill={MAP_PALETTE.route}
                    stroke="none"
                  />
                );
              })}
            </g>
          )}
          {section && (
            <rect
              data-testid="rb2-elevation-selection"
              x={scales.toX(section.start_km)}
              y={0}
              width={Math.max(1, scales.toX(section.end_km) - scales.toX(section.start_km))}
              height={VIEW_H}
              fill={RB2.textPrimary}
              fillOpacity={0.12}
              stroke="none"
            />
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
              <circle cx={hoverX} cy={hoverY} r={4} fill={RB2.cardBg} stroke={RB2.textSecondary} strokeWidth={2} />
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

      {section && (
        <Box
          data-testid="rb2-elevation-section"
          style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <Text component="span" style={{ ...AXIS_LABEL_STYLE, fontSize: 11, color: RB2.textPrimary }}>
            {distLabel(section.start_km, isImperial)}–{distLabel(section.end_km, isImperial)} ·{' '}
            {distLabel(section.distance_km, isImperial)} · ↑ {elevLabel(section.gain_m, isImperial)} · ↓{' '}
            {elevLabel(section.loss_m, isImperial)} · avg {section.avg_grade_pct.toFixed(1)}%
            {section.max_grade_pct >= 1 ? ` · max ${Math.round(section.max_grade_pct)}%` : ''}
          </Text>
          {onSelectRange && (
            <Box
              component="button"
              type="button"
              onClick={() => onSelectRange(section.start_km, section.end_km)}
              style={{ ...AXIS_LABEL_STYLE, fontSize: 11, background: 'none', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer', color: RB2.textPrimary }}
            >
              Show on map
            </Box>
          )}
          <Box
            component="button"
            type="button"
            aria-label="Clear selection"
            onClick={() => setSelection(null)}
            style={{ ...AXIS_LABEL_STYLE, fontSize: 12, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
          >
            ✕
          </Box>
        </Box>
      )}

      {listedClimbs.length > 0 && (
        <Box data-testid="rb2-elevation-climbs" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {listedClimbs.map((c) => {
            const label = `${climbLabel(c.category)} · ${distLabel(c.length_km, isImperial)} at ${c.avg_grade_pct.toFixed(1)}% · ↑ ${elevLabel(c.gain_m, isImperial)} · from ${distLabel(c.start_km, isImperial)}`;
            return (
              <Box
                key={`${c.start_km}-${c.end_km}`}
                component={onSelectClimb ? 'button' : 'div'}
                type={onSelectClimb ? 'button' : undefined}
                onClick={onSelectClimb ? () => onSelectClimb(c.start_km, c.end_km) : undefined}
                onMouseEnter={() => onHoverKm?.(c.start_km)}
                onMouseLeave={() => onHoverKm?.(null)}
                style={{
                  ...AXIS_LABEL_STYLE,
                  fontSize: 11,
                  color: RB2.textSecondary,
                  textAlign: 'left',
                  background: 'none',
                  border: 0,
                  padding: '1px 0',
                  cursor: onSelectClimb ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 8, height: 8, background: MAP_PALETTE.route, display: 'inline-block', flexShrink: 0 }}
                />
                {label}
              </Box>
            );
          })}
          {climbs.length > listedClimbs.length && (
            <Text component="span" style={{ ...AXIS_LABEL_STYLE, fontSize: 10 }}>
              and {climbs.length - listedClimbs.length} smaller
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

export default ElevationPanel;
