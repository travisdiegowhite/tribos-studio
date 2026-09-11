/**
 * RideMetricStrip — the scrubber under the ride map.
 *
 * One metric against distance, colored per sample by the same colorizer the
 * map uses (zones or ramp), with the elevation profile faint behind it.
 * Pointer position is reported as a distance along the ride so the map
 * marker, the readout and this cursor all key off one number. Touch drags
 * scrub too (touch-action pan-y keeps vertical page scroll working).
 *
 * Deliberately not recharts: a hand-rolled SVG gives per-sample coloring
 * and a scrub cursor without fighting a charting library's hit-testing.
 */
import { useCallback, useId, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Text } from '@mantine/core';
import type { StreamRow } from '../utils/streamChartData';
import { niceTicks } from '../utils/streamChartData';

export type StripMetric = 'power' | 'heartRate' | 'speed' | 'elevation' | null;

const ROW_KEY: Record<Exclude<StripMetric, null>, keyof StreamRow> = {
  power: 'power',
  heartRate: 'heartRate',
  speed: 'speed_kmh',
  elevation: 'elevation_m',
};

const VIEW_W = 1000;
const VIEW_H = 100;
/** Fraction of the height reserved above the metric's maximum. */
const TOP_PAD = 0.1;
/** Elevation sits in the bottom third so it reads as ground, not as data. */
const ELEVATION_BAND = 0.34;

const ELEVATION_FILL = 'var(--tribos-text-muted, #8a8f8a)';

export interface RideMetricStripProps {
  rows: StreamRow[];
  metric: StripMetric;
  /** Color for a value in the ROW's unit (km/h for speed). */
  colorForValue: (value: number) => string;
  hoverX: number | null;
  onHoverX: (x: number | null) => void;
  height?: number;
}

interface Run {
  points: Array<[number, number]>;
}

/** Split rows into contiguous non-null runs, projected to view coordinates. */
function buildRuns(
  rows: StreamRow[],
  key: keyof StreamRow,
  xToView: (x: number) => number,
  yToView: (v: number) => number,
): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  for (const row of rows) {
    const v = row[key];
    if (v == null) {
      current = null;
      continue;
    }
    if (!current) {
      current = { points: [] };
      runs.push(current);
    }
    current.points.push([xToView(row.x), yToView(v as number)]);
  }
  return runs.filter((r) => r.points.length > 0);
}

function linePath(runs: Run[]): string {
  return runs
    .map((r) => r.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '))
    .join(' ');
}

function areaPath(runs: Run[], baseline: number): string {
  return runs
    .map((r) => {
      const first = r.points[0];
      const last = r.points[r.points.length - 1];
      const line = r.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      return `${line} L${last[0].toFixed(1)} ${baseline} L${first[0].toFixed(1)} ${baseline} Z`;
    })
    .join(' ');
}

export default function RideMetricStrip({
  rows,
  metric,
  colorForValue,
  hoverX,
  onHoverX,
  height = 112,
}: RideMetricStripProps) {
  const gradientId = useId();
  const boxRef = useRef<HTMLDivElement | null>(null);

  const key = metric ? ROW_KEY[metric] : null;

  const model = useMemo(() => {
    if (rows.length < 2) return null;
    const xMin = rows[0].x;
    const xMax = rows[rows.length - 1].x;
    const xSpan = xMax - xMin || 1;
    const xToView = (x: number) => ((x - xMin) / xSpan) * VIEW_W;

    // Elevation band (always drawn when present)
    let elevationArea: string | null = null;
    const elevs = rows.map((r) => r.elevation_m).filter((v): v is number => v != null);
    if (elevs.length > 1) {
      const eMin = Math.min(...elevs);
      const eMax = Math.max(...elevs);
      const eSpan = eMax - eMin || 1;
      const bandTop = VIEW_H * (1 - ELEVATION_BAND);
      const eToView = (v: number) => VIEW_H - ((v - eMin) / eSpan) * (VIEW_H - bandTop);
      elevationArea = areaPath(buildRuns(rows, 'elevation_m', xToView, eToView), VIEW_H);
    }

    // Metric
    let metricArea: string | null = null;
    let metricLine: string | null = null;
    let stops: Array<{ offset: number; color: string }> = [];
    let yMin = 0;
    let yMax = 1;
    let yToView: ((v: number) => number) | null = null;
    if (key && metric) {
      const values = rows.map((r) => r[key]).filter((v): v is number => v != null);
      if (values.length > 1) {
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        // Power and speed read from zero; HR and elevation from their floor.
        yMin = metric === 'power' || metric === 'speed' ? 0 : dataMin - (dataMax - dataMin) * 0.08;
        yMax = dataMax;
        const ySpan = yMax - yMin || 1;
        yToView = (v: number) => VIEW_H * (1 - TOP_PAD) - ((v - yMin) / ySpan) * VIEW_H * (1 - TOP_PAD);
        const runs = buildRuns(rows, key, xToView, yToView);
        metricArea = areaPath(runs, VIEW_H);
        metricLine = linePath(runs);

        // Gradient stops: one per color change, doubled for a hard edge, so
        // zone coloring shows crisp bands and a ramp stays smooth.
        let lastColor: string | null = null;
        for (const row of rows) {
          const v = row[key];
          if (v == null) continue;
          const color = colorForValue(v as number);
          const offset = (row.x - xMin) / xSpan;
          if (color !== lastColor) {
            if (lastColor) stops.push({ offset, color: lastColor });
            stops.push({ offset, color });
            lastColor = color;
          }
        }
        if (lastColor) stops.push({ offset: 1, color: lastColor });
        if (stops.length > 1200) {
          // Extremely noisy ramps: thin to keep the DOM light.
          const step = Math.ceil(stops.length / 1200);
          stops = stops.filter((_, i) => i % step === 0 || i === stops.length - 1);
        }
      }
    }

    const xTicks = niceTicks(xMin, xMax, 6).filter((t) => t >= xMin && t <= xMax);

    return { xMin, xMax, xSpan, xToView, yToView, yMin, yMax, elevationArea, metricArea, metricLine, stops, xTicks };
  }, [rows, key, metric, colorForValue]);

  const xFromClientX = useCallback(
    (clientX: number) => {
      const el = boxRef.current;
      if (!el || !model) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return model.xMin + frac * model.xSpan;
    },
    [model],
  );

  const handlePointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const x = xFromClientX(e.clientX);
      onHoverX(x);
    },
    [xFromClientX, onHoverX],
  );
  const handleLeave = useCallback(() => onHoverX(null), [onHoverX]);

  if (!model) return null;

  // Cursor + dot for the hovered distance
  let cursorX: number | null = null;
  let dot: { x: number; y: number; color: string } | null = null;
  if (hoverX != null && Number.isFinite(hoverX)) {
    cursorX = model.xToView(Math.min(model.xMax, Math.max(model.xMin, hoverX)));
    if (key && model.yToView) {
      // Nearest row by x for the dot
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < rows.length; i++) {
        const d = Math.abs(rows[i].x - hoverX);
        if (d < bestD) {
          bestD = d;
          best = i;
        } else if (rows[i].x > hoverX) {
          break;
        }
      }
      const v = best >= 0 ? rows[best][key] : null;
      if (v != null) dot = { x: model.xToView(rows[best].x), y: model.yToView(v as number), color: colorForValue(v as number) };
    }
  }

  return (
    <Box
      ref={boxRef}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
      style={{
        position: 'relative',
        height,
        touchAction: 'pan-y',
        cursor: 'crosshair',
        userSelect: 'none',
        backgroundColor: 'var(--tribos-card, var(--color-card))',
        borderTop: '1px solid var(--tribos-border, var(--color-border))',
      }}
      data-testid="ride-metric-strip"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        aria-hidden="true"
      >
        {model.stops.length > 0 && (
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              {model.stops.map((s, i) => (
                <stop key={i} offset={`${(s.offset * 100).toFixed(3)}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
        )}
        {model.elevationArea && (
          <path d={model.elevationArea} fill={ELEVATION_FILL} fillOpacity={0.18} />
        )}
        {model.metricArea && (
          <path d={model.metricArea} fill={`url(#${gradientId})`} fillOpacity={0.55} />
        )}
        {model.metricLine && (
          <path
            d={model.metricLine}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        )}
        {cursorX != null && (
          <line
            x1={cursorX}
            x2={cursorX}
            y1={0}
            y2={VIEW_H}
            stroke="var(--tribos-text-primary, #222)"
            strokeOpacity={0.6}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Dot is HTML so it stays round under preserveAspectRatio="none" */}
      {dot && (
        <Box
          style={{
            position: 'absolute',
            left: `${(dot.x / VIEW_W) * 100}%`,
            top: `${(dot.y / VIEW_H) * 100}%`,
            width: 10,
            height: 10,
            marginLeft: -5,
            marginTop: -5,
            borderRadius: '50%',
            backgroundColor: dot.color,
            border: '2px solid var(--tribos-card, #fff)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Distance ticks */}
      {model.xTicks.map((t) => (
        <Text
          key={t}
          size="10px"
          ff="monospace"
          c="dimmed"
          style={{
            position: 'absolute',
            bottom: 2,
            left: `${((t - model.xMin) / model.xSpan) * 100}%`,
            transform: t === model.xTicks[0] ? 'none' : 'translateX(-50%)',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {t} km
        </Text>
      ))}
    </Box>
  );
}
