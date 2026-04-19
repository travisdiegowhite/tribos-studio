import { useMemo, useState } from 'react';
import { Box, Group, Skeleton, Stack, Text } from '@mantine/core';
import useTodayChart, { PHASE_COLOR } from '../../hooks/useTodayChart';

/**
 * FitnessCurveChart — spec §3 (past-only v1).
 *
 * SVG chart rendering the rider's last 6 weeks of TFI / AFI / FS plus phase
 * bands, ride dots, a today marker, and a KPI strip. Future projection is
 * intentionally omitted — it lands in spec §13 step 5 with the projection
 * engine. Toggle state is local for this slice; server-side persistence
 * per spec §7 is step 6.
 */

const VIEW = { w: 960, h: 260 };
const PLOT = { left: 36, right: 24, top: 30, bottom: 30 };
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
};

const DOT_RADIUS = { small: 4, medium: 5, large: 7 };

function xFor(index, total) {
  if (total <= 1) return PLOT.left;
  return PLOT.left + (index * PLOT_W) / (total - 1);
}

/**
 * Build a single polyline path. Null values break the line — we emit a
 * fresh `M` when the next non-null point appears so gaps stay honest.
 */
function buildLinePath(values, yScale) {
  let d = '';
  let penDown = false;
  const n = values.length;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) {
      penDown = false;
      continue;
    }
    const x = xFor(i, n);
    const y = yScale(v);
    d += penDown ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
    penDown = true;
  }
  return d.trim();
}

function makeYScale(values, padding = 0.1) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return () => PLOT.top + PLOT_H / 2;
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const paddedMin = min - span * padding;
  const paddedMax = max + span * padding;
  const paddedSpan = paddedMax - paddedMin;
  return (v) => PLOT.top + PLOT_H - ((v - paddedMin) / paddedSpan) * PLOT_H;
}

function LineToggle({ label, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
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

function PhaseBand({ phases, days }) {
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
        const color = PHASE_COLOR[p.phase] || COLOR.muted;
        return (
          <g key={`${p.phase}-${i}`}>
            <rect x={x0} y={0} width={width} height={4} fill={color} />
            <text
              x={x0 + 2}
              y={16}
              fontFamily="'JetBrains Mono', 'DM Mono', monospace"
              fontSize={9}
              letterSpacing="1.2"
              fontWeight={700}
              fill={color}
              style={{ textTransform: 'uppercase' }}
            >
              {p.phase.toUpperCase()}
            </text>
            {/* Divider to the right of each segment except the last. */}
            {i < phases.length - 1 ? (
              <line x1={x1} x2={x1} y1={4} y2={PLOT_BOTTOM} stroke={COLOR.border} strokeWidth={1} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function WeekGrid({ days }) {
  // Light vertical gridline every 7 days — helps the rider track week
  // position across the 6-week window.
  const gridlines = [];
  for (let i = 0; i < days.length; i += 7) {
    const x = xFor(i, days.length);
    gridlines.push(
      <line key={i} x1={x} x2={x} y1={PLOT.top} y2={PLOT_BOTTOM} stroke={COLOR.border} strokeWidth={0.5} opacity={0.6} />,
    );
  }
  return <g>{gridlines}</g>;
}

function TodayMarker({ xPos, tfiY }) {
  return (
    <g>
      <line x1={xPos} x2={xPos} y1={PLOT.top} y2={PLOT_BOTTOM} stroke={COLOR.ink} strokeWidth={1.5} />
      {tfiY != null ? (
        <>
          <circle cx={xPos} cy={tfiY} r={14} fill={COLOR.fitness} opacity={0.25} />
          <circle cx={xPos} cy={tfiY} r={8} fill={COLOR.fitness} stroke={COLOR.card} strokeWidth={3} />
        </>
      ) : null}
      <g>
        <rect x={xPos - 22} y={PLOT.top - 22} width={44} height={18} fill={COLOR.ink} />
        <text
          x={xPos}
          y={PLOT.top - 9}
          fontFamily="'JetBrains Mono', 'DM Mono', monospace"
          fontSize={10}
          letterSpacing="1.2"
          fontWeight={700}
          fill={COLOR.card}
          textAnchor="middle"
          style={{ textTransform: 'uppercase' }}
        >
          Today
        </text>
      </g>
    </g>
  );
}

function RideDot({ cx, cy, color, size, hollow }) {
  const r = DOT_RADIUS[size] || DOT_RADIUS.medium;
  if (hollow) {
    return <circle cx={cx} cy={cy} r={r} fill={COLOR.card} stroke={COLOR.muted} strokeWidth={1.5} />;
  }
  return <circle cx={cx} cy={cy} r={r} fill={color} stroke={COLOR.card} strokeWidth={1.5} />;
}

function Legend() {
  const items = [
    { label: 'Recovery / easy', color: '#639922' },
    { label: 'Tempo / long', color: '#C49A0A' },
    { label: 'Sweet spot / threshold', color: '#D4600A' },
    { label: 'VO2 / anaerobic / race', color: '#C43C2A' },
  ];
  return (
    <Group gap={14} wrap="wrap">
      {items.map((item) => (
        <Group key={item.label} gap={6} wrap="nowrap">
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
          <Text
            style={{
              fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
              fontSize: 9,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: COLOR.muted,
            }}
          >
            {item.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

function KpiStrip({ kpi }) {
  const fmt = (n) => (n == null ? '—' : String(Math.round(n)));
  const fs = kpi.fs == null ? '—' : (kpi.fs > 0 ? `+${Math.round(kpi.fs)}` : String(Math.round(kpi.fs)));
  const deltaPct = kpi.deltaPct28d;
  let deltaLabel = '—';
  let deltaArrow = '';
  let deltaColor = COLOR.muted;
  if (deltaPct != null && Number.isFinite(deltaPct)) {
    const rounded = Math.round(deltaPct);
    if (rounded > 0) {
      deltaLabel = `+${rounded}`;
      deltaArrow = '↑';
      deltaColor = COLOR.fitness;
    } else if (rounded < 0) {
      deltaLabel = String(rounded);
      deltaArrow = '↓';
      deltaColor = COLOR.fatigue;
    } else {
      deltaLabel = '0';
    }
  }

  const cellStyle = {
    fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
  };

  return (
    <Group justify="space-between" wrap="wrap" gap={16} mt={4}>
      <Group gap={20} wrap="wrap">
        <Text span style={{ ...cellStyle, color: COLOR.muted }}>
          Fit <span style={{ color: COLOR.fitness, fontWeight: 700 }}>{fmt(kpi.tfi)}</span>
        </Text>
        <Text span style={{ ...cellStyle, color: COLOR.muted }}>
          Fat <span style={{ color: COLOR.fatigue, fontWeight: 700 }}>{fmt(kpi.afi)}</span>
        </Text>
        <Text span style={{ ...cellStyle, color: COLOR.muted }}>
          Form <span style={{ color: COLOR.ink, fontWeight: 700 }}>{fs}</span>
        </Text>
      </Group>
      <Text span style={{ ...cellStyle, color: deltaColor, fontWeight: 700 }}>
        {deltaLabel}{deltaArrow ? ` ${deltaArrow}` : ''} <span style={{ color: COLOR.muted, fontWeight: 400 }}> / 28D</span>
      </Text>
    </Group>
  );
}

export default function FitnessCurveChart({ userId, activities, userFtp }) {
  const data = useTodayChart(userId, { activities, userFtp });
  const [showFatigue, setShowFatigue] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // yScale derived from the series currently visible so the fitness line
  // never gets squished by an extreme form-score day the rider has hidden.
  const yScale = useMemo(() => {
    const pool = [];
    for (const d of data.days) {
      if (d.tfi != null) pool.push(d.tfi);
      if (showFatigue && d.afi != null) pool.push(d.afi);
      if (showForm && d.fs != null) pool.push(d.fs);
    }
    return makeYScale(pool);
  }, [data.days, showFatigue, showForm]);

  const n = data.days.length;
  const fitnessPath = buildLinePath(data.days.map((d) => d.tfi), yScale);
  const fatiguePath = showFatigue ? buildLinePath(data.days.map((d) => d.afi), yScale) : '';
  const formPath = showForm ? buildLinePath(data.days.map((d) => d.fs), yScale) : '';

  const latestDay = data.days.length ? data.days[data.days.length - 1] : null;
  const todayX = n > 0 ? xFor(n - 1, n) : PLOT_RIGHT;
  const todayFitnessY = latestDay?.tfi != null ? yScale(latestDay.tfi) : null;

  const dateToIndex = useMemo(
    () => new Map(data.days.map((d, i) => [d.date, i])),
    [data.days],
  );

  return (
    <Box
      style={{
        border: '1px solid var(--color-border, #DDDDD8)',
        backgroundColor: 'var(--color-card, #FFFFFF)',
        padding: '14px 16px 16px',
      }}
    >
      <Group justify="space-between" mb={8} wrap="wrap">
        <Text
          fw={600}
          style={{
            fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: COLOR.muted,
          }}
        >
          Fitness curve · last 6 weeks
        </Text>
        <Group gap={6} wrap="nowrap">
          <LineToggle label="Fitness" color={COLOR.fitness} active onClick={() => {}} />
          <LineToggle label="Fatigue" color={COLOR.fatigue} active={showFatigue} onClick={() => setShowFatigue((v) => !v)} />
          <LineToggle label="Form" color={COLOR.form} active={showForm} onClick={() => setShowForm((v) => !v)} />
        </Group>
      </Group>

      {data.loading ? (
        <Stack gap={8}>
          <Skeleton height={240} />
        </Stack>
      ) : data.error ? (
        <Text style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, color: COLOR.muted, fontStyle: 'italic' }}>
          Fitness curve is unavailable right now.
        </Text>
      ) : n === 0 ? (
        <Text style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, color: COLOR.muted, fontStyle: 'italic' }}>
          No fitness data yet — the curve will fill in as rides land.
        </Text>
      ) : (
        <svg
          role="img"
          aria-label="Fitness curve — last six weeks"
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <PhaseBand phases={data.phases} days={data.days} />
          <WeekGrid days={data.days} />

          {/* Axis ticks along the bottom — one per week */}
          {Array.from({ length: Math.ceil(n / 7) + 1 }, (_, i) => {
            const idx = Math.min(i * 7, n - 1);
            const x = xFor(idx, n);
            return (
              <text
                key={idx}
                x={x}
                y={PLOT_BOTTOM + 18}
                fontFamily="'JetBrains Mono', 'DM Mono', monospace"
                fontSize={9}
                letterSpacing="1.1"
                fill={COLOR.muted}
                textAnchor="middle"
                style={{ textTransform: 'uppercase' }}
              >
                {data.days[idx]?.date?.slice(5) || ''}
              </text>
            );
          })}

          {/* Lines — fitness last so it sits on top */}
          {fatiguePath ? (
            <path d={fatiguePath} fill="none" stroke={COLOR.fatigue} strokeWidth={2} strokeDasharray="5,3" />
          ) : null}
          {formPath ? (
            <path d={formPath} fill="none" stroke={COLOR.form} strokeWidth={1.5} opacity={0.9} />
          ) : null}
          {fitnessPath ? (
            <path d={fitnessPath} fill="none" stroke={COLOR.fitness} strokeWidth={3} />
          ) : null}

          {/* Ride dots sit on the fitness line */}
          {data.rides.map((ride) => {
            const idx = dateToIndex.get(ride.date);
            if (idx == null) return null;
            const day = data.days[idx];
            if (!day || day.tfi == null) return null;
            const cx = xFor(idx, n);
            const cy = yScale(day.tfi);
            return (
              <RideDot
                key={ride.date}
                cx={cx}
                cy={cy}
                color={ride.color}
                size={ride.size}
                hollow={ride.hollow}
              />
            );
          })}

          <TodayMarker xPos={todayX} tfiY={todayFitnessY} />
        </svg>
      )}

      <Stack gap={6} mt={6}>
        <Legend />
        <KpiStrip kpi={data.kpi} />
      </Stack>
    </Box>
  );
}
