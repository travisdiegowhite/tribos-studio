/**
 * RepeatsStrip — several efforts' traces of one metric against distance
 * along the anchor, one line per effort in its identity colour, with the
 * anchor's elevation faint behind. The sibling of RideMetricStrip: same
 * hand-rolled SVG, same scrub contract (pointer position reported as km so
 * the map markers and the list readouts key off one number), but many lines
 * instead of one zone-coloured fill.
 */
import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Text } from '@mantine/core';
import type { StreamRow } from '../../utils/streamChartData';
import { niceTicks } from '../../utils/streamChartData';

export type RepeatMetric = 'power' | 'heartRate' | 'speed';

const ROW_KEY: Record<RepeatMetric, keyof StreamRow> = {
  power: 'power',
  heartRate: 'heartRate',
  speed: 'speed_kmh',
};

export interface RepeatSeries {
  id: string;
  color: string;
  rows: StreamRow[];
}

export interface RepeatsStripProps {
  series: RepeatSeries[];
  metric: RepeatMetric;
  /** Distance domain end, km (the anchor's length). */
  xMaxKm: number;
  /** Rows carrying the anchor's elevation, drawn faint as the ground. */
  elevationRows?: StreamRow[] | null;
  hoverX: number | null;
  onHoverX: (x: number | null) => void;
  height?: number;
}

const VIEW_W = 1000;
const VIEW_H = 100;
const TOP_PAD = 0.1;
const ELEVATION_BAND = 0.34;
const ELEVATION_FILL = 'var(--tribos-text-muted, #8a8f8a)';

/** Contiguous non-null runs projected to view space, as one path string. */
function pathFor(
  rows: StreamRow[],
  key: keyof StreamRow,
  xToView: (x: number) => number,
  yToView: (v: number) => number,
): string {
  const parts: string[] = [];
  let penDown = false;
  for (const row of rows) {
    const v = row[key];
    if (v == null) {
      penDown = false;
      continue;
    }
    parts.push(`${penDown ? 'L' : 'M'}${xToView(row.x).toFixed(1)} ${yToView(v as number).toFixed(1)}`);
    penDown = true;
  }
  return parts.join(' ');
}

function areaFor(rows: StreamRow[], xToView: (x: number) => number, yToView: (v: number) => number): string {
  const pts: Array<[number, number]> = [];
  for (const row of rows) {
    if (row.elevation_m == null) continue;
    pts.push([xToView(row.x), yToView(row.elevation_m)]);
  }
  if (pts.length < 2) return '';
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return `${line} L${pts[pts.length - 1][0].toFixed(1)} ${VIEW_H} L${pts[0][0].toFixed(1)} ${VIEW_H} Z`;
}

export default function RepeatsStrip({
  series,
  metric,
  xMaxKm,
  elevationRows = null,
  hoverX,
  onHoverX,
  height = 132,
}: RepeatsStripProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const key = ROW_KEY[metric];

  const model = useMemo(() => {
    const xMax = Math.max(xMaxKm, 0.01);
    const xToView = (x: number) => (Math.min(Math.max(x, 0), xMax) / xMax) * VIEW_W;

    let elevationArea = '';
    if (elevationRows && elevationRows.length > 1) {
      const elevs = elevationRows.map((r) => r.elevation_m).filter((v): v is number => v != null);
      if (elevs.length > 1) {
        const eMin = Math.min(...elevs);
        const eMax = Math.max(...elevs);
        const eSpan = eMax - eMin || 1;
        const bandTop = VIEW_H * (1 - ELEVATION_BAND);
        const eToView = (v: number) => VIEW_H - ((v - eMin) / eSpan) * (VIEW_H - bandTop);
        elevationArea = areaFor(elevationRows, xToView, eToView);
      }
    }

    const values: number[] = [];
    for (const s of series) for (const r of s.rows) if (r[key] != null) values.push(r[key] as number);
    if (values.length < 2) {
      return { xMax, xToView, yToView: null as ((v: number) => number) | null, paths: [] as Array<{ id: string; color: string; d: string }>, elevationArea, xTicks: niceTicks(0, xMax, 6) };
    }
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const yMin = metric === 'heartRate' ? dataMin - (dataMax - dataMin) * 0.08 : 0;
    const ySpan = dataMax - yMin || 1;
    const yToView = (v: number) => VIEW_H * (1 - TOP_PAD) - ((v - yMin) / ySpan) * VIEW_H * (1 - TOP_PAD);
    const paths = series
      .map((s) => ({ id: s.id, color: s.color, d: pathFor(s.rows, key, xToView, yToView) }))
      .filter((p) => p.d.length > 0);
    const xTicks = niceTicks(0, xMax, 6).filter((t) => t >= 0 && t <= xMax);
    return { xMax, xToView, yToView, paths, elevationArea, xTicks };
  }, [series, key, metric, xMaxKm, elevationRows]);

  const xFromClientX = useCallback(
    (clientX: number) => {
      const el = boxRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return frac * model.xMax;
    },
    [model.xMax],
  );

  const handlePointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => onHoverX(xFromClientX(e.clientX)),
    [xFromClientX, onHoverX],
  );
  const handleLeave = useCallback(() => onHoverX(null), [onHoverX]);

  const cursorX = hoverX != null && Number.isFinite(hoverX) ? model.xToView(hoverX) : null;

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
      data-testid="repeats-strip"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        aria-hidden="true"
      >
        {model.elevationArea && <path d={model.elevationArea} fill={ELEVATION_FILL} fillOpacity={0.18} />}
        {model.paths.map((p) => (
          <path
            key={p.id}
            data-testid={`repeat-trace-${p.id}`}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={1.6}
            strokeOpacity={0.9}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
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

      {model.paths.length === 0 && (
        <Text
          size="xs"
          c="dimmed"
          ff="monospace"
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
        >
          No measured traces to draw
        </Text>
      )}

      {model.xTicks.map((t) => (
        <Text
          key={t}
          size="10px"
          ff="monospace"
          c="dimmed"
          style={{
            position: 'absolute',
            bottom: 2,
            left: `${(t / model.xMax) * 100}%`,
            transform: t === 0 ? 'none' : 'translateX(-50%)',
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
