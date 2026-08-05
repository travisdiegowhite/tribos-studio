/**
 * ActivityChart — the flagship activity time-series chart.
 *
 * Phase B core: zone-colored primary metric (power) rendered on canvas,
 * metric chips, crosshair with value pill, minimal axes (single y-max
 * label + x ticks), and honest tier rendering (time axis when the payload
 * has one, distance axis for the simplified tier, caption for reduced
 * fidelity). Brush zoom, overlays, and live selection stats land in
 * Phase C — the window state is already the single source the brush will
 * drive.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { useThemeTokens } from '../../../hooks/useThemeTokens';
import {
  resolvePowerZones,
  zoneColorsFromTokens,
  type ProfilePowerZones,
} from '../../../utils/powerZones';
import {
  xAxisFor,
  seriesFor,
  type MetricKey,
  type NormalizedStreams,
} from '../model/streamTypes';
import {
  windowIndices,
  windowMax,
  yDomainMax,
  xAxisTicks,
  scaleValue,
  type LinearScale,
} from '../model/chartScales';
import { ChartCanvas } from './ChartCanvas';
import { CrosshairLayer } from './CrosshairLayer';
import { MetricChips, METRIC_OPTIONS } from './MetricChips';

const PLOT_HEIGHT = 280;
const TICK_STRIP_HEIGHT = 20;

interface MetricDisplay {
  unit: string;
  decimals: number;
  /** Transform stored value → display value (speed m/s → km/h). */
  toDisplay: (v: number) => number;
}

const METRIC_DISPLAY: Record<MetricKey, MetricDisplay> = {
  power: { unit: 'W', decimals: 0, toDisplay: (v) => v },
  hr: { unit: 'bpm', decimals: 0, toDisplay: (v) => v },
  speed_mps: { unit: 'km/h', decimals: 1, toDisplay: (v) => v * 3.6 },
};

const TIER_CAPTIONS: Record<string, string | null> = {
  per_second: null,
  streams_1hz: null,
  coach_ts: null, // caption built dynamically with the interval
  simplified: 'Reduced detail — map-resolution samples on a distance axis',
  summary: null,
};

export interface ActivityChartProps {
  streams: NormalizedStreams;
  ftp: number | null;
  profileZones?: ProfilePowerZones | null;
}

export function ActivityChart({ streams, ftp, profileZones }: ActivityChartProps) {
  const { tokens } = useThemeTokens();

  const axis = useMemo(() => xAxisFor(streams), [streams]);

  const availableMetrics = useMemo(
    () => METRIC_OPTIONS.map((o) => o.key).filter((key) => seriesFor(streams, key) !== null),
    [streams]
  );

  const [metricState, setMetricState] = useState<MetricKey | null>(null);
  const metric = metricState ?? availableMetrics[0] ?? 'power';

  // Zoom window in x units — null = full ride. Phase C's brush drives this.
  const [windowRange] = useState<[number, number] | null>(null);
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);

  // Plot width tracks the container
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      setPlotWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rawSeries = useMemo(() => seriesFor(streams, metric), [streams, metric]);
  const display = METRIC_DISPLAY[metric];
  const series = useMemo(() => {
    if (!rawSeries) return null;
    if (metric !== 'speed_mps') return rawSeries;
    return rawSeries.map((v) => (v == null ? null : v * 3.6));
  }, [rawSeries, metric]);

  const windowData = useMemo(() => {
    if (!axis || !series) return null;
    const xs = axis.xs;
    const [x0, x1] = windowRange ?? [xs[0], xs[xs.length - 1]];
    const idx = windowIndices(xs, x0, x1);
    if (!idx) return null;
    const [i0, i1] = idx;
    const dataMax = windowMax(series, i0, i1);
    if (dataMax == null) return null;
    return { xs, x0, x1, i0, i1, yMax: yDomainMax(dataMax) };
  }, [axis, series, windowRange]);

  const zones = useMemo(
    () => (metric === 'power' ? resolvePowerZones(ftp, profileZones) : null),
    [metric, ftp, profileZones]
  );
  const zoneColors = useMemo(() => zoneColorsFromTokens(tokens), [tokens]);

  const metricColor: string =
    metric === 'power'
      ? tokens.colors.teal
      : metric === 'hr'
        ? tokens.colors.coral
        : tokens.colors.orange;

  if (!axis || !series || !windowData) return null;

  const { xs, x0, x1, i0, i1, yMax } = windowData;
  const xScale: LinearScale = { domainMin: x0, domainMax: x1, rangeMin: 0, rangeMax: plotWidth };
  const ticks = xAxisTicks(x0, x1, axis.xMode);

  const tierCaption =
    streams.tier === 'coach_ts'
      ? `${streams.sample_seconds ?? '—'}s samples${streams.tier_degraded ? ' — full detail unavailable' : ''}`
      : TIER_CAPTIONS[streams.tier] ?? null;

  const valueLabel = (v: number) => `${v.toFixed(display.decimals)} ${display.unit}`;

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <MetricChips available={availableMetrics} active={metric} onChange={setMetricState} />
        {tierCaption && (
          <Text size="xs" c="var(--color-text-muted)">
            {tierCaption}
          </Text>
        )}
      </Group>

      <Box
        ref={plotRef}
        style={{
          position: 'relative',
          height: PLOT_HEIGHT,
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {plotWidth > 0 && (
          <>
            <ChartCanvas
              xs={xs}
              values={series}
              i0={i0}
              i1={i1}
              x0={x0}
              x1={x1}
              yMax={yMax}
              widthPx={plotWidth}
              heightPx={PLOT_HEIGHT}
              zones={zones}
              zoneColors={zoneColors}
              seriesColor={metricColor}
              baselineColor={tokens.colors.border}
            />
            <CrosshairLayer
              xs={xs}
              values={series}
              crosshairIndex={crosshairIdx}
              onCrosshairChange={setCrosshairIdx}
              xScale={xScale}
              xMode={axis.xMode}
              widthPx={plotWidth}
              heightPx={PLOT_HEIGHT}
              valueLabel={valueLabel}
              accentColor={metricColor}
              hairlineColor={tokens.colors.textMuted}
            />
            {/* Single y-max label — minimal axes by design */}
            <Text
              size="xs"
              ff="monospace"
              c="var(--color-text-muted)"
              style={{ position: 'absolute', top: 4, right: 6, pointerEvents: 'none' }}
            >
              {yMax} {display.unit}
            </Text>
          </>
        )}
      </Box>

      {/* X tick strip */}
      <Box style={{ position: 'relative', height: TICK_STRIP_HEIGHT }}>
        {plotWidth > 0 &&
          ticks.map((tick) => {
            const px = scaleValue(tick.value, xScale);
            return (
              <Text
                key={tick.value}
                size="xs"
                ff="monospace"
                c="var(--color-text-muted)"
                style={{
                  position: 'absolute',
                  left: Math.min(Math.max(px, 14), Math.max(plotWidth - 24, 14)),
                  transform: 'translateX(-50%)',
                }}
              >
                {tick.label}
              </Text>
            );
          })}
      </Box>
    </Stack>
  );
}
