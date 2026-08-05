/**
 * ActivityChart — the flagship activity time-series chart.
 *
 * Zone-colored primary metric on canvas, metric chips, overlay toggles
 * (elevation silhouette / W'Balance / speed), crosshair with value pill,
 * bottom brush for zoom (touch-first) plus mouse drag-select on the plot,
 * and a floating stat card whose NP / Avg / Max recompute live for the
 * zoomed window. Honest tier rendering: real time axis when the payload
 * has one, distance axis for the simplified tier, captions for reduced
 * fidelity.
 */

import { useMemo, useState } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { useThemeTokens } from '../../../hooks/useThemeTokens';
import {
  resolvePowerZones,
  zoneColorsFromTokens,
  type ProfilePowerZones,
} from '../../../utils/powerZones';
import type { CPEstimate } from '../../../utils/criticalPower';
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
  formatXTick,
  type LinearScale,
} from '../model/chartScales';
import { computeSelectionStats } from '../model/selectionStats';
import { computeWBalSeries } from '../model/wbal';
import { clampBrushWindow, minBrushSpan, type BrushWindow } from '../model/brushState';
import { ChartCanvas, type OverlayLine } from './ChartCanvas';
import { CrosshairLayer } from './CrosshairLayer';
import { MetricChips, METRIC_OPTIONS } from './MetricChips';
import { OverlayToggles, type OverlayKey } from './OverlayToggles';
import { SelectionStatCard, type StatEntry } from './SelectionStatCard';
import { BrushStrip } from './BrushStrip';
import { useElementWidth } from '../hooks/useElementWidth';

const PLOT_HEIGHT = 280;
const TICK_STRIP_HEIGHT = 20;

interface MetricDisplay {
  unit: string;
  decimals: number;
}

const METRIC_DISPLAY: Record<MetricKey, MetricDisplay> = {
  power: { unit: 'W', decimals: 0 },
  hr: { unit: 'bpm', decimals: 0 },
  speed_mps: { unit: 'km/h', decimals: 1 },
};

export interface ActivityChartProps {
  streams: NormalizedStreams;
  ftp: number | null;
  profileZones?: ProfilePowerZones | null;
  /** CP/W' model for the W'Balance overlay; null hides the overlay. */
  cpEstimate?: CPEstimate | null;
}

export function ActivityChart({ streams, ftp, profileZones, cpEstimate }: ActivityChartProps) {
  const { tokens } = useThemeTokens();

  const axis = useMemo(() => xAxisFor(streams), [streams]);

  const availableMetrics = useMemo(
    () => METRIC_OPTIONS.map((o) => o.key).filter((key) => seriesFor(streams, key) !== null),
    [streams]
  );

  const [metricState, setMetricState] = useState<MetricKey | null>(null);
  const metric = metricState ?? availableMetrics[0] ?? 'power';

  const [brushWindow, setBrushWindow] = useState<BrushWindow | null>(null);
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);
  const [overlayState, setOverlayState] = useState<Set<OverlayKey>>(() => new Set(['elevation']));

  const [plotRef, plotWidth] = useElementWidth<HTMLDivElement>();

  const rawSeries = useMemo(() => seriesFor(streams, metric), [streams, metric]);
  const display = METRIC_DISPLAY[metric];
  const series = useMemo(() => {
    if (!rawSeries) return null;
    if (metric !== 'speed_mps') return rawSeries;
    return rawSeries.map((v) => (v == null ? null : v * 3.6));
  }, [rawSeries, metric]);

  const domain = useMemo(() => {
    if (!axis) return null;
    return { min: axis.xs[0], max: axis.xs[axis.xs.length - 1] };
  }, [axis]);

  const windowData = useMemo(() => {
    if (!axis || !series || !domain) return null;
    const xs = axis.xs;
    const x0 = brushWindow?.x0 ?? domain.min;
    const x1 = brushWindow?.x1 ?? domain.max;
    const idx = windowIndices(xs, x0, x1);
    if (!idx) return null;
    const [i0, i1] = idx;
    const dataMax = windowMax(series, i0, i1);
    if (dataMax == null) return null;
    return { xs, x0, x1, i0, i1, yMax: yDomainMax(dataMax) };
  }, [axis, series, domain, brushWindow]);

  const zones = useMemo(
    () => (metric === 'power' ? resolvePowerZones(ftp, profileZones) : null),
    [metric, ftp, profileZones]
  );
  const zoneColors = useMemo(() => zoneColorsFromTokens(tokens), [tokens]);

  // ── Overlays ─────────────────────────────────────────────────────────────
  const hasElevation = useMemo(
    () => Array.isArray(streams.elevation_m) && streams.elevation_m.some((v) => v != null),
    [streams]
  );
  const hasSpeedOverlay = metric !== 'speed_mps' && seriesFor(streams, 'speed_mps') !== null;
  const wbalEligible = Boolean(
    metric === 'power' && cpEstimate && axis && streams.t && seriesFor(streams, 'power')
  );

  const availableOverlays = useMemo(() => {
    const list: OverlayKey[] = [];
    if (hasElevation) list.push('elevation');
    if (wbalEligible) list.push('wbal');
    if (hasSpeedOverlay) list.push('speed');
    return list;
  }, [hasElevation, wbalEligible, hasSpeedOverlay]);

  const toggleOverlay = (key: OverlayKey) => {
    setOverlayState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const overlayOn = (key: OverlayKey) => overlayState.has(key) && availableOverlays.includes(key);

  const wbal = useMemo(() => {
    if (!wbalEligible || !overlayState.has('wbal') || !cpEstimate) return null;
    const power = seriesFor(streams, 'power');
    if (!power || !streams.t) return null;
    return computeWBalSeries(power, streams.t, cpEstimate.cp, cpEstimate.wPrime);
  }, [wbalEligible, overlayState, cpEstimate, streams]);

  const overlayLines = useMemo(() => {
    const lines: OverlayLine[] = [];
    if (wbal && cpEstimate) {
      lines.push({
        values: wbal.values,
        yMin: 0,
        yMax: cpEstimate.wPrime,
        color: tokens.colors.zone7,
      });
    }
    if (overlayOn('speed')) {
      const speed = seriesFor(streams, 'speed_mps');
      if (speed) {
        const kmh = speed.map((v) => (v == null ? null : v * 3.6));
        let max = 0;
        for (const v of kmh) if (v != null && v > max) max = v;
        if (max > 0) {
          lines.push({ values: kmh, yMin: 0, yMax: max * 1.1, color: tokens.colors.orange });
        }
      }
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wbal, cpEstimate, overlayState, availableOverlays, streams, tokens]);

  // ── Selection stats (live, recomputed per window) ────────────────────────
  const stats = useMemo(() => {
    if (!windowData || !series) return null;
    return computeSelectionStats(series, streams.t ?? null, windowData.i0, windowData.i1, {
      isPower: metric === 'power',
      sampleSeconds: streams.sample_seconds,
    });
  }, [windowData, series, streams, metric]);

  const statEntries = useMemo<StatEntry[]>(() => {
    if (!stats) return [];
    const entries: StatEntry[] = [];
    if (stats.np != null) entries.push({ label: 'NP', value: String(stats.np), unit: 'W' });
    if (stats.avg != null)
      entries.push({ label: 'Avg', value: stats.avg.toFixed(display.decimals), unit: display.unit });
    if (stats.max != null)
      entries.push({ label: 'Max', value: stats.max.toFixed(display.decimals), unit: display.unit });
    if (wbal) entries.push({ label: "W' min", value: (wbal.minJ / 1000).toFixed(1), unit: 'kJ' });
    return entries;
  }, [stats, display, wbal]);

  const statCaption = useMemo(() => {
    if (!wbal || !cpEstimate) return null;
    return `CP ${cpEstimate.cp}W · ${cpEstimate.model === 'calculated' ? 'modeled from best efforts' : 'estimated from FTP'}`;
  }, [wbal, cpEstimate]);

  const metricColor: string =
    metric === 'power'
      ? tokens.colors.teal
      : metric === 'hr'
        ? tokens.colors.coral
        : tokens.colors.orange;

  if (!axis || !series || !windowData || !domain) return null;

  const { xs, x0, x1, i0, i1, yMax } = windowData;
  const xScale: LinearScale = { domainMin: x0, domainMax: x1, rangeMin: 0, rangeMax: plotWidth };
  const ticks = xAxisTicks(x0, x1, axis.xMode);
  const isTimeAxis = axis.xMode === 'time_s';
  const minSpan = minBrushSpan(domain.min, domain.max, isTimeAxis);

  const tierCaption =
    streams.tier === 'coach_ts'
      ? `${streams.sample_seconds ?? '—'}s samples${streams.tier_degraded ? ' — full detail unavailable' : ''}`
      : streams.tier === 'simplified'
        ? 'Reduced detail — map-resolution samples on a distance axis'
        : null;

  const valueLabel = (v: number) => `${v.toFixed(display.decimals)} ${display.unit}`;

  const handleWindowSelect = (sx0: number, sx1: number) => {
    setBrushWindow(clampBrushWindow(sx0, sx1, domain.min, domain.max, minSpan));
  };

  // W'bal end-of-line label (reference design: direct value label at the
  // window's right edge).
  const wbalLabel = wbal
    ? (() => {
        const value = wbal.values[i1];
        if (value == null || !cpEstimate) return null;
        const yFrac = Math.min(value, cpEstimate.wPrime) / cpEstimate.wPrime;
        return { text: `${(value / 1000).toFixed(1)} kJ`, top: (1 - yFrac) * PLOT_HEIGHT };
      })()
    : null;

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <MetricChips available={availableMetrics} active={metric} onChange={setMetricState} />
        <OverlayToggles available={availableOverlays} active={overlayState} onToggle={toggleOverlay} />
      </Group>

      <Box
        ref={plotRef}
        onDoubleClick={() => setBrushWindow(null)}
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
              silhouette={
                overlayOn('elevation') && streams.elevation_m
                  ? { values: streams.elevation_m, color: tokens.colors.textMuted }
                  : null
              }
              overlayLines={overlayLines}
            />
            {statEntries.length > 0 && <SelectionStatCard entries={statEntries} caption={statCaption} />}
            <CrosshairLayer
              xs={xs}
              values={series}
              crosshairIndex={crosshairIdx}
              onCrosshairChange={setCrosshairIdx}
              onWindowSelect={handleWindowSelect}
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
            {wbalLabel && (
              <Text
                size="xs"
                ff="monospace"
                fw={600}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: Math.min(Math.max(wbalLabel.top - 8, 20), PLOT_HEIGHT - 24),
                  color: tokens.colors.zone7,
                  pointerEvents: 'none',
                }}
              >
                {wbalLabel.text}
              </Text>
            )}
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

      {/* Brush / zoom scrubber */}
      <BrushStrip
        xs={xs}
        values={series}
        domainMin={domain.min}
        domainMax={domain.max}
        window={brushWindow}
        onWindowChange={setBrushWindow}
        minSpan={minSpan}
        seriesColor={metricColor}
        accentColor={tokens.colors.teal}
        dimColor={tokens.colors.bgPrimary}
      />
      {brushWindow && (
        <Text size="xs" c="var(--color-text-muted)" ta="right" ff="monospace">
          {formatXTick(x0, axis.xMode)} – {formatXTick(x1, axis.xMode)}
          {axis.xMode === 'distance_km' ? ' km' : ''} · double-click to reset
        </Text>
      )}
      {tierCaption && (
        <Text size="xs" c="var(--color-text-muted)">
          {tierCaption}
        </Text>
      )}
    </Stack>
  );
}
