import { useMemo, useState } from 'react';
import { Box, Group, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { PHASE_COLOR } from '../../../hooks/useTodayChart';
import { METRIC_DESCRIPTIONS } from '../../../lib/fitness/metricDescriptions';
import type { RangeKey, BanisterDay, BanisterRide, BanisterRace, BanisterPhase, BanisterKpi } from '../../../hooks/useBanisterChart';

/**
 * BanisterChart — relocated and expanded from FitnessCurveChart.jsx.
 *
 * Renders on /progress. 400px tall, configurable time range (6w–all),
 * Y-axis gridlines, race markers, TFI peak callout. Bible §3 governs
 * metric definitions; §9 governs acronym-labeling discipline.
 *
 * Header "FITNESS · FATIGUE · FORM" satisfies §9 full-name-first requirement.
 * Axis labels (TFI/AFI/FS) are acceptable because the header introduced them.
 */

const VIEW = { w: 960, h: 430 };
const PLOT = { left: 52, right: 24, top: 34, bottom: 30 };
const PLOT_W = VIEW.w - PLOT.left - PLOT.right;
const PLOT_H = VIEW.h - PLOT.top - PLOT.bottom;
const PLOT_RIGHT = VIEW.w - PLOT.right;
const PLOT_BOTTOM = VIEW.h - PLOT.bottom;

const COLOR = {
  fitness: '#2A8C82',
  fatigue: '#C43C2A',
  form: '#C49A0A',
  ink: '#141410',
  muted: '#7A7970',
  border: '#DDDDD8',
  card: '#FFFFFF',
  bg: '#F4F4F2',
  race: '#C43C2A',
};

const STROKE = { fitness: 2.5, fatigue: 1.5, form: 1.5 };
const DOT_RADIUS = { small: 3, medium: 4.5, large: 6 };

const RANGE_LABELS: Record<RangeKey, string> = {
  '6w': '6W',
  '3m': '3M',
  '6m': '6M',
  '1y': '1Y',
  'all': 'ALL',
};

export interface BanisterChartProps {
  series: BanisterDay[];
  rides: BanisterRide[];
  races?: BanisterRace[];
  phases: BanisterPhase[];
  kpi: BanisterKpi;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  loading: boolean;
  error?: string | null;
}

function xFor(index: number, total: number): number {
  if (total <= 1) return PLOT.left;
  return PLOT.left + (index * PLOT_W) / (total - 1);
}

function buildLinePath(values: (number | null)[], yScale: (v: number) => number): string {
  let d = '';
  let penDown = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) { penDown = false; continue; }
    const x = xFor(i, values.length);
    const y = yScale(v);
    d += penDown ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
    penDown = true;
  }
  return d.trim();
}

function makeYScale(values: (number | null)[], padding = 0.1): (v: number) => number {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return () => PLOT.top + PLOT_H / 2;
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const paddedMin = min - span * padding;
  const paddedMax = max + span * padding;
  const paddedSpan = paddedMax - paddedMin;
  return (v) => PLOT.top + PLOT_H - ((v - paddedMin) / paddedSpan) * PLOT_H;
}

/** Y-axis tick values every 10 units inside the visible range. */
function yAxisTicks(values: (number | null)[]): number[] {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return [];
  const min = Math.floor(Math.min(...nums) / 10) * 10;
  const max = Math.ceil(Math.max(...nums) / 10) * 10;
  const ticks: number[] = [];
  for (let v = min; v <= max; v += 10) ticks.push(v);
  return ticks;
}

const DM_MONO = "'JetBrains Mono', 'DM Mono', monospace";
const BARLOW_CONDENSED = "'Barlow Condensed', sans-serif";

function LineToggle({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: DM_MONO,
        fontSize: 10,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        padding: '4px 8px',
        border: `1px solid ${active ? color : COLOR.border}`,
        backgroundColor: active ? COLOR.card : 'transparent',
        color: active ? color : COLOR.muted,
        cursor: 'pointer',
        fontWeight: 600,
        borderRadius: 0,
      }}
      aria-pressed={active}
    >
      <span style={{ display: 'inline-block', width: 8, height: 8, marginRight: 6, backgroundColor: active ? color : 'transparent', border: `1px solid ${color}` }} />
      {label}
    </button>
  );
}

function RangeSelector({ range, onRangeChange }: { range: RangeKey; onRangeChange: (r: RangeKey) => void }) {
  const ranges = Object.keys(RANGE_LABELS) as RangeKey[];
  return (
    <Group gap={0} wrap="nowrap">
      {ranges.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRangeChange(r)}
          style={{
            fontFamily: DM_MONO,
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            border: `1px solid ${r === range ? COLOR.ink : COLOR.border}`,
            borderRight: r !== 'all' ? 'none' : `1px solid ${r === range ? COLOR.ink : COLOR.border}`,
            backgroundColor: r === range ? COLOR.ink : 'transparent',
            color: r === range ? COLOR.card : COLOR.muted,
            cursor: 'pointer',
            fontWeight: 700,
            borderRadius: 0,
          }}
          aria-pressed={r === range}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </Group>
  );
}

function PhaseBand({ phases, days }: { phases: BanisterPhase[]; days: BanisterDay[] }) {
  if (!phases.length || !days.length) return null;
  const dateToIndex = new Map(days.map((d, i) => [d.date, i]));
  const n = days.length;
  return (
    <g>
      {phases.map((p, i) => {
        const startIdx = dateToIndex.get(p.startDate);
        const endIdx = dateToIndex.get(p.endDate);
        if (startIdx == null || endIdx == null) return null;
        const x0 = xFor(startIdx, n);
        const x1 = xFor(endIdx, n);
        const width = Math.max(1, x1 - x0);
        const color = PHASE_COLOR[p.phase as keyof typeof PHASE_COLOR] || COLOR.muted;
        return (
          <g key={`${p.phase}-${i}`}>
            <rect x={x0} y={0} width={width} height={4} fill={color} />
            <text x={x0 + 2} y={16} fontFamily={DM_MONO} fontSize={9} letterSpacing="1.2" fontWeight={700} fill={color} textTransform="uppercase">
              {p.phase.toUpperCase()}
            </text>
            {i < phases.length - 1 && (
              <line x1={x1} x2={x1} y1={4} y2={PLOT_BOTTOM} stroke={COLOR.border} strokeWidth={1} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function WeekGrid({ days }: { days: BanisterDay[] }) {
  const n = days.length;
  const step = n > 180 ? 30 : n > 90 ? 14 : 7;
  const gridlines = [];
  for (let i = 0; i < n; i += step) {
    gridlines.push(
      <line key={i} x1={xFor(i, n)} x2={xFor(i, n)} y1={PLOT.top} y2={PLOT_BOTTOM} stroke={COLOR.border} strokeWidth={0.5} opacity={0.6} />,
    );
  }
  return <g>{gridlines}</g>;
}

function YAxisGridlines({ ticks, yScale }: { ticks: number[]; yScale: (v: number) => number }) {
  return (
    <g>
      {ticks.map((v) => {
        const y = yScale(v);
        if (y < PLOT.top || y > PLOT_BOTTOM) return null;
        return (
          <g key={v}>
            <line x1={PLOT.left} x2={PLOT_RIGHT} y1={y} y2={y} stroke={COLOR.border} strokeWidth={0.5} opacity={0.7} />
            <text x={PLOT.left - 4} y={y + 4} fontFamily={DM_MONO} fontSize={9} letterSpacing="0.5" fill={COLOR.muted} textAnchor="end">
              {v}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function TodayMarker({ xPos, tfiY }: { xPos: number; tfiY: number | null }) {
  return (
    <g>
      <line x1={xPos} x2={xPos} y1={PLOT.top} y2={PLOT_BOTTOM} stroke={COLOR.ink} strokeWidth={1} />
      {tfiY != null && (
        <>
          <circle cx={xPos} cy={tfiY} r={11} fill={COLOR.fitness} opacity={0.18} />
          <circle cx={xPos} cy={tfiY} r={5.5} fill={COLOR.fitness} stroke={COLOR.card} strokeWidth={2} />
        </>
      )}
      <rect x={xPos - 22} y={PLOT.top - 22} width={44} height={18} fill={COLOR.ink} />
      <text x={xPos} y={PLOT.top - 9} fontFamily={DM_MONO} fontSize={10} letterSpacing="1.2" fontWeight={700} fill={COLOR.card} textAnchor="middle">
        TODAY
      </text>
    </g>
  );
}

function RaceMarkers({ races, days, yScale }: { races: BanisterRace[]; days: BanisterDay[]; yScale: (v: number) => number }) {
  if (!races.length || !days.length) return null;
  const dateToIndex = new Map(days.map((d, i) => [d.date, i]));
  const n = days.length;
  return (
    <g>
      {races.map((race) => {
        const idx = dateToIndex.get(race.date);
        if (idx == null) return null;
        const x = xFor(idx, n);
        return (
          <g key={race.date}>
            <line
              x1={x} x2={x}
              y1={PLOT.top} y2={PLOT_BOTTOM}
              stroke={COLOR.race}
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.7}
            />
            <circle cx={x} cy={PLOT.top + 6} r={4} fill={COLOR.race} opacity={0.85} />
            <title>{race.name} — {race.date}</title>
          </g>
        );
      })}
    </g>
  );
}

function PeakCallout({ days, yScale }: { days: BanisterDay[]; yScale: (v: number) => number }) {
  const peakDay = useMemo(() => {
    let max = -Infinity;
    let peak: BanisterDay | null = null;
    for (const d of days) {
      if (d.tfi != null && d.tfi > max) { max = d.tfi; peak = d; }
    }
    return peak;
  }, [days]);

  if (!peakDay) return null;
  const n = days.length;
  const idx = days.indexOf(peakDay);
  const x = xFor(idx, n);
  const y = yScale(peakDay.tfi);
  const labelX = idx > n * 0.85 ? x - 4 : x + 4;
  const anchor = idx > n * 0.85 ? 'end' : 'start';

  return (
    <g>
      <circle cx={x} cy={y} r={5} fill={COLOR.fitness} stroke={COLOR.card} strokeWidth={2} />
      <text x={labelX} y={y - 8} fontFamily={DM_MONO} fontSize={9} letterSpacing="0.8" fontWeight={700} fill={COLOR.fitness} textAnchor={anchor}>
        PEAK {Math.round(peakDay.tfi)}
      </text>
    </g>
  );
}

function DateAxis({ days }: { days: BanisterDay[] }) {
  const n = days.length;
  const step = n > 300 ? 60 : n > 150 ? 30 : n > 60 ? 14 : 7;
  return (
    <g>
      {Array.from({ length: Math.ceil(n / step) + 1 }, (_, i) => {
        const idx = Math.min(i * step, n - 1);
        const x = xFor(idx, n);
        return (
          <text key={idx} x={x} y={PLOT_BOTTOM + 18} fontFamily={DM_MONO} fontSize={9} letterSpacing="1.1" fill={COLOR.muted} textAnchor="middle">
            {days[idx]?.date?.slice(5) || ''}
          </text>
        );
      })}
    </g>
  );
}

function KpiStrip({ kpi }: { kpi: BanisterKpi }) {
  const fmt = (n: number | null) => n == null ? '—' : String(Math.round(n));
  const fs = kpi.fs == null ? '—' : kpi.fs > 0 ? `+${Math.round(kpi.fs)}` : String(Math.round(kpi.fs));
  const dp = kpi.deltaPct28d;
  let deltaLabel = '—';
  let deltaColor = COLOR.muted;
  if (dp != null && Number.isFinite(dp)) {
    const r = Math.round(dp);
    deltaLabel = r > 0 ? `+${r}%` : r < 0 ? `${r}%` : '0%';
    deltaColor = r > 0 ? COLOR.fitness : r < 0 ? COLOR.fatigue : COLOR.muted;
  }
  const cell = { fontFamily: DM_MONO, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' as const };
  return (
    <Group justify="space-between" wrap="wrap" gap={16} mt={4}>
      <Group gap={20} wrap="wrap">
        <Tooltip label={METRIC_DESCRIPTIONS.TFI.definition} multiline w={220} withArrow>
          <Text span style={{ ...cell, color: COLOR.muted }}>
            TFI <span style={{ color: COLOR.fitness, fontWeight: 700 }}>{fmt(kpi.tfi)}</span>
          </Text>
        </Tooltip>
        <Tooltip label={METRIC_DESCRIPTIONS.AFI.definition} multiline w={220} withArrow>
          <Text span style={{ ...cell, color: COLOR.muted }}>
            AFI <span style={{ color: COLOR.fatigue, fontWeight: 700 }}>{fmt(kpi.afi)}</span>
          </Text>
        </Tooltip>
        <Tooltip label={METRIC_DESCRIPTIONS.FS.definition} multiline w={220} withArrow>
          <Text span style={{ ...cell, color: COLOR.muted }}>
            FS <span style={{ color: COLOR.ink, fontWeight: 700 }}>{fs}</span>
          </Text>
        </Tooltip>
      </Group>
      <Text span style={{ ...cell, color: deltaColor, fontWeight: 700 }}>
        {deltaLabel} <span style={{ color: COLOR.muted, fontWeight: 400 }}>/ 28D</span>
      </Text>
    </Group>
  );
}

function Legend() {
  const items = [
    { label: 'Recovery / easy', color: '#639922' },
    { label: 'Tempo / long', color: '#C49A0A' },
    { label: 'Sweet spot / threshold', color: '#D4600A' },
    { label: 'VO2 / anaerobic / race', color: '#7A1A22' },
  ];
  return (
    <Group gap={14} wrap="wrap">
      {items.map((item) => (
        <Group key={item.label} gap={6} wrap="nowrap">
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
          <Text style={{ fontFamily: DM_MONO, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: COLOR.muted }}>
            {item.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export default function BanisterChart({ series, rides, races = [], phases, kpi, range, onRangeChange, loading, error }: BanisterChartProps) {
  const [showFatigue, setShowFatigue] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const yScale = useMemo(() => {
    const pool: (number | null)[] = [];
    for (const d of series) {
      if (d.tfi != null) pool.push(d.tfi);
      if (showFatigue && d.afi != null) pool.push(d.afi);
      if (showForm && d.fs != null) pool.push(d.fs);
    }
    return makeYScale(pool);
  }, [series, showFatigue, showForm]);

  const yTicks = useMemo(() => {
    const pool: (number | null)[] = series.map((d) => d.tfi);
    if (showFatigue) series.forEach((d) => pool.push(d.afi));
    if (showForm) series.forEach((d) => pool.push(d.fs));
    return yAxisTicks(pool);
  }, [series, showFatigue, showForm]);

  const n = series.length;
  const fitnessPath = buildLinePath(series.map((d) => d.tfi), yScale);
  const fatiguePath = showFatigue ? buildLinePath(series.map((d) => d.afi), yScale) : '';
  const formPath = showForm ? buildLinePath(series.map((d) => d.fs), yScale) : '';

  const latestDay = series.length ? series[series.length - 1] : null;
  const todayX = n > 0 ? xFor(n - 1, n) : PLOT_RIGHT;
  const todayFitnessY = latestDay?.tfi != null ? yScale(latestDay.tfi) : null;

  const dateToIndex = useMemo(() => new Map(series.map((d, i) => [d.date, i])), [series]);

  return (
    <Box style={{ border: '1px solid var(--color-border, #DDDDD8)', backgroundColor: 'var(--color-card, #FFFFFF)', padding: '14px 16px 16px' }}>
      {/* Header — §9: full names on first mention */}
      <Group justify="space-between" mb={10} wrap="wrap" gap={8}>
        <div>
          <Text fw={700} style={{ fontFamily: BARLOW_CONDENSED, fontSize: 13, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-primary, #141410)' }}>
            FITNESS · FATIGUE · FORM
          </Text>
          <Text style={{ fontFamily: DM_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR.muted, marginTop: 2 }}>
            Training Fitness Index · Acute Fatigue Index · Form Score
          </Text>
        </div>
        <RangeSelector range={range} onRangeChange={onRangeChange} />
      </Group>

      <Group justify="flex-end" mb={6} gap={6} wrap="nowrap">
        <LineToggle label="TFI" color={COLOR.fitness} active onClick={() => {}} />
        <LineToggle label="AFI" color={COLOR.fatigue} active={showFatigue} onClick={() => setShowFatigue((v) => !v)} />
        <LineToggle label="FS" color={COLOR.form} active={showForm} onClick={() => setShowForm((v) => !v)} />
      </Group>

      {loading ? (
        <Skeleton height={400} />
      ) : error ? (
        <Text style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, color: COLOR.muted, fontStyle: 'italic' }}>
          Fitness chart is unavailable right now.
        </Text>
      ) : n === 0 ? (
        <Text style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, color: COLOR.muted, fontStyle: 'italic' }}>
          No fitness data yet — the chart will fill in as rides land.
        </Text>
      ) : (
        <svg
          role="img"
          aria-label="Fitness, fatigue, and form chart"
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <PhaseBand phases={phases} days={series} />
          <YAxisGridlines ticks={yTicks} yScale={yScale} />
          <WeekGrid days={series} />

          {fatiguePath && (
            <path d={fatiguePath} fill="none" stroke={COLOR.fatigue} strokeWidth={STROKE.fatigue} strokeDasharray="4,3" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {formPath && (
            <path d={formPath} fill="none" stroke={COLOR.form} strokeWidth={STROKE.form} opacity={0.85} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {fitnessPath && (
            <path d={fitnessPath} fill="none" stroke={COLOR.fitness} strokeWidth={STROKE.fitness} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {rides.map((ride) => {
            const idx = dateToIndex.get(ride.date);
            if (idx == null) return null;
            const day = series[idx];
            if (!day || day.tfi == null) return null;
            const cx = xFor(idx, n);
            const cy = yScale(day.tfi);
            const r = DOT_RADIUS[ride.size as keyof typeof DOT_RADIUS] || DOT_RADIUS.medium;
            return ride.hollow
              ? <circle key={ride.date} cx={cx} cy={cy} r={r} fill={COLOR.card} stroke={COLOR.muted} strokeWidth={1} />
              : <circle key={ride.date} cx={cx} cy={cy} r={r} fill={ride.color} stroke={COLOR.card} strokeWidth={1} />;
          })}

          <RaceMarkers races={races} days={series} yScale={yScale} />
          <PeakCallout days={series} yScale={yScale} />
          <TodayMarker xPos={todayX} tfiY={todayFitnessY} />
          <DateAxis days={series} />
        </svg>
      )}

      <Stack gap={6} mt={6}>
        <Legend />
        <KpiStrip kpi={kpi} />
      </Stack>
    </Box>
  );
}
