/**
 * RepeatsStrip — several efforts' traces of one metric against distance
 * along the anchor, with the anchor's elevation faint behind. The sibling of
 * RideMetricStrip: same hand-rolled SVG, same scrub contract (pointer
 * position reported as km so the map markers and the list readouts key off
 * one number), but many lines instead of one zone-coloured fill.
 *
 * The stored streams are RDP-simplified (a long straight can be two
 * instantaneous samples), so each trace is binned into short stretches and
 * drawn as flat steps — never a line interpolated between far-apart samples.
 * One effort is drawn in its colour; the rest sit muted behind it, with the
 * median of the efforts as a dashed step.
 */
import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Box, Text } from "@mantine/core";
import type { StreamRow } from "../../utils/streamChartData";
import { niceTicks } from "../../utils/streamChartData";
import {
  binEffort,
  lineBinCount,
  sectorBounds,
  sectorMedians,
  type SectorBin,
  type SectorKey,
} from "../../utils/repeatSectors";

export type RepeatMetric = "power" | "heartRate" | "speed";

const ROW_KEY: Record<RepeatMetric, SectorKey> = {
  power: "power",
  heartRate: "heartRate",
  speed: "speed_kmh",
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
  /** Unit printed at the top of the value axis ("W", "bpm", "km/h"). */
  unit?: string;
  /** The effort drawn in its colour; others are muted. Defaults to the first. */
  focusId?: string | null;
}

/** Width of the value-axis gutter, px. */
const AXIS_W = 44;

const VIEW_W = 1000;
const VIEW_H = 100;
const TOP_PAD = 0.1;
const ELEVATION_BAND = 0.34;
const ELEVATION_FILL = "var(--tribos-text-muted, #8a8f8a)";
const MUTED_STROKE = "var(--tribos-text-muted, #8a8f8a)";
/** Samples a bin needs before it is drawn. */
const MIN_BIN_SAMPLES = 2;

/**
 * Binned values as flat steps: each filled bin is a horizontal run across
 * its stretch, joined vertically to a filled neighbour; a blank bin lifts
 * the pen.
 */
function stepPathFor(
  means: Array<number | null>,
  edges: number[],
  xToView: (x: number) => number,
  yToView: (v: number) => number,
): string {
  const parts: string[] = [];
  let penDown = false;
  means.forEach((v, i) => {
    if (v == null) {
      penDown = false;
      return;
    }
    const y = yToView(v).toFixed(1);
    if (penDown) parts.push(`V${y}`);
    else parts.push(`M${xToView(edges[i]).toFixed(1)} ${y}`);
    parts.push(`H${xToView(edges[i + 1]).toFixed(1)}`);
    penDown = true;
  });
  return parts.join(" ");
}

const meansOf = (bins: SectorBin[]) => bins.map((b) => b.mean);

function areaFor(
  rows: StreamRow[],
  xToView: (x: number) => number,
  yToView: (v: number) => number,
): string {
  const pts: Array<[number, number]> = [];
  for (const row of rows) {
    if (row.elevation_m == null) continue;
    pts.push([xToView(row.x), yToView(row.elevation_m)]);
  }
  if (pts.length < 2) return "";
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
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
  unit = "",
  focusId = null,
}: RepeatsStripProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const key = ROW_KEY[metric];

  const model = useMemo(() => {
    const xMax = Math.max(xMaxKm, 0.01);
    const xToView = (x: number) =>
      (Math.min(Math.max(x, 0), xMax) / xMax) * VIEW_W;

    let elevationArea = "";
    if (elevationRows && elevationRows.length > 1) {
      const elevs = elevationRows
        .map((r) => r.elevation_m)
        .filter((v): v is number => v != null);
      if (elevs.length > 1) {
        const eMin = Math.min(...elevs);
        const eMax = Math.max(...elevs);
        const eSpan = eMax - eMin || 1;
        const bandTop = VIEW_H * (1 - ELEVATION_BAND);
        const eToView = (v: number) =>
          VIEW_H - ((v - eMin) / eSpan) * (VIEW_H - bandTop);
        elevationArea = areaFor(elevationRows, xToView, eToView);
      }
    }

    const edges = sectorBounds(xMax, lineBinCount(xMax));
    const binned = series.map((s) => ({
      id: s.id,
      color: s.color,
      means: meansOf(binEffort(s.rows, key, edges, MIN_BIN_SAMPLES)),
    }));
    const values = binned.flatMap((b) =>
      b.means.filter((v): v is number => v != null),
    );
    if (values.length < 2) {
      return {
        xMax,
        xToView,
        yToView: null as ((v: number) => number) | null,
        paths: [] as Array<{ id: string; color: string; d: string }>,
        medianPath: "",
        elevationArea,
        xTicks: niceTicks(0, xMax, 6),
        yTicks: [] as Array<{ value: number; top: number }>,
      };
    }
    const dataMin = Math.min(...values);
    let dataMax = Math.max(...values);
    if (dataMax === dataMin) dataMax = dataMin + 1;
    const yMin =
      metric === "heartRate" ? dataMin - (dataMax - dataMin) * 0.08 : 0;
    const ySpan = dataMax - yMin || 1;
    const yToView = (v: number) =>
      VIEW_H * (1 - TOP_PAD) - ((v - yMin) / ySpan) * VIEW_H * (1 - TOP_PAD);
    const paths = binned
      .map((b) => ({
        id: b.id,
        color: b.color,
        d: stepPathFor(b.means, edges, xToView, yToView),
      }))
      .filter((p) => p.d.length > 0);
    const medianPath =
      paths.length > 2
        ? stepPathFor(
            sectorMedians(
              binned.map((b) => b.means.map((mean) => ({ mean, n: 0 }))),
            ),
            edges,
            xToView,
            yToView,
          )
        : "";
    const xTicks = niceTicks(0, xMax, 6).filter((t) => t >= 0 && t <= xMax);
    // Value-axis ticks as a fraction of the height from the top, so the
    // labels sit where the lines are whatever the box's pixel height.
    const yTicks = niceTicks(yMin, dataMax, 4)
      .filter((t) => t >= yMin && t <= dataMax)
      .map((t) => ({ value: t, top: yToView(t) / VIEW_H }));
    return { xMax, xToView, yToView, paths, medianPath, elevationArea, xTicks, yTicks };
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

  const focus =
    focusId != null && model.paths.some((p) => p.id === focusId)
      ? focusId
      : (model.paths[0]?.id ?? null);

  const cursorX =
    hoverX != null && Number.isFinite(hoverX) ? model.xToView(hoverX) : null;

  return (
    <Box
      style={{
        display: "flex",
        height,
        backgroundColor: "var(--tribos-card, var(--color-card))",
        borderTop: "1px solid var(--tribos-border, var(--color-border))",
      }}
      data-testid="repeats-strip-frame"
    >
      <Box
        style={{
          position: "relative",
          width: AXIS_W,
          flexShrink: 0,
          borderRight: "1px solid var(--tribos-border, var(--color-border))",
        }}
        aria-hidden="true"
      >
        {unit && (
          <Text
            size="9px"
            ff="monospace"
            c="dimmed"
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              letterSpacing: "1px",
              lineHeight: 1,
            }}
          >
            {unit}
          </Text>
        )}
        {model.yTicks.map((t) => (
          <Text
            key={t.value}
            size="10px"
            ff="monospace"
            c="dimmed"
            data-testid="repeats-y-tick"
            style={{
              position: "absolute",
              right: 6,
              top: `${t.top * 100}%`,
              transform: "translateY(-50%)",
              lineHeight: 1,
            }}
          >
            {t.value}
          </Text>
        ))}
      </Box>
      <Box
        ref={boxRef}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={handleLeave}
        onPointerCancel={handleLeave}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          touchAction: "pan-y",
          cursor: "crosshair",
          userSelect: "none",
        }}
        data-testid="repeats-strip"
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          style={{ display: "block" }}
          aria-hidden="true"
        >
          {model.yTicks.map((t) => (
            <line
              key={t.value}
              x1={0}
              x2={VIEW_W}
              y1={t.top * VIEW_H}
              y2={t.top * VIEW_H}
              stroke="var(--tribos-border, var(--color-border))"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {model.elevationArea && (
            <path
              d={model.elevationArea}
              fill={ELEVATION_FILL}
              fillOpacity={0.18}
            />
          )}
          {model.medianPath && (
            <path
              data-testid="repeat-trace-median"
              d={model.medianPath}
              fill="none"
              stroke="var(--tribos-text-primary, #222)"
              strokeWidth={1}
              strokeOpacity={0.45}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Focused trace last, so it sits on top of the muted ones. */}
          {[...model.paths]
            .sort((a, b) => Number(a.id === focus) - Number(b.id === focus))
            .map((p) => {
              const focused = p.id === focus;
              return (
                <path
                  key={p.id}
                  data-testid={`repeat-trace-${p.id}`}
                  d={p.d}
                  fill="none"
                  stroke={focused ? p.color : MUTED_STROKE}
                  strokeWidth={focused ? 2.2 : 1.2}
                  strokeOpacity={focused ? 1 : 0.4}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="miter"
                />
              );
            })}
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
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
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
              position: "absolute",
              bottom: 2,
              left: `${(t / model.xMax) * 100}%`,
              transform: t === 0 ? "none" : "translateX(-50%)",
              pointerEvents: "none",
              lineHeight: 1,
            }}
          >
            {t} km
          </Text>
        ))}
      </Box>
    </Box>
  );
}
