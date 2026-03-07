import { useState, useEffect, useRef } from 'react';
import { Container, Text, Paper, SimpleGrid, Box, Stack, Group } from '@mantine/core';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

// ===== Chart colors — match actual app components =====
// From TrainingLoadChart.jsx: CTL=#3A5A8C, ATL=#D4820A, TSB=#3D8B50
// From PowerDurationCurve.jsx: current line=#D4820A, FTP ref=#3A5A8C
const COLORS = {
  ctl: '#3A5A8C',    // Steel blue — Chronic Training Load (Fitness)
  atl: '#D4820A',    // Amber — Acute Training Load (Fatigue)
  tsb: '#3D8B50',    // Green — Training Stress Balance (Form)
  pdc: '#D4820A',    // Amber — Power curve primary
  pdcFill: '#D4820A',
  zone1: '#3D8B50',  // Recovery — Green
  zone2: '#3D8B50',  // Endurance — Green
  zone3: '#D4820A',  // Tempo — Amber
  zone4: '#3A5A8C',  // Threshold — Steel blue
  zone5: '#6B7F94',  // VO2max — Slate
  zone6: '#8B6B5A',  // Anaerobic — Iron
};

// ===== Realistic data — FTP ~295W rider (~4.0 W/kg), 90-day training block =====
// Above-average Cat 2-3, 3:1 build/recovery periodization

// CTL/ATL over 30 data points (~90 days, sampled every 3 days)
// 3-week build + 1-week recovery × 3 cycles, ending with taper
const fitnessData = [
  // Block 1 — base build (CTL 72→83)
  { ctl: 72, atl: 68 }, { ctl: 74, atl: 90 }, { ctl: 76, atl: 96 },
  { ctl: 78, atl: 102 }, { ctl: 80, atl: 95 }, { ctl: 83, atl: 108 },
  { ctl: 82, atl: 98 }, { ctl: 80, atl: 62 }, // Recovery week — ATL crashes
  // Block 2 — threshold build (CTL 81→95)
  { ctl: 81, atl: 72 }, { ctl: 83, atl: 94 }, { ctl: 86, atl: 102 },
  { ctl: 88, atl: 110 }, { ctl: 91, atl: 105 }, { ctl: 93, atl: 118 },
  { ctl: 95, atl: 112 }, { ctl: 93, atl: 65 }, // Recovery week
  // Block 3 — race-specificity build (CTL 93→105) + taper
  { ctl: 93, atl: 78 }, { ctl: 95, atl: 98 }, { ctl: 97, atl: 110 },
  { ctl: 99, atl: 118 }, { ctl: 101, atl: 122 }, { ctl: 103, atl: 128 },
  { ctl: 105, atl: 120 }, { ctl: 104, atl: 95 }, // Start taper
  // Taper — CTL holds, ATL drops, TSB goes positive
  { ctl: 103, atl: 82 }, { ctl: 102, atl: 75 }, { ctl: 101, atl: 80 },
  { ctl: 100, atl: 72 }, { ctl: 99, atl: 78 }, { ctl: 98, atl: 74 },
];

// Power duration curve — FTP ~295W, weight ~74kg (4.0 W/kg)
// Best efforts from 90-day window, above-average Cat 2-3
const pdcData = [
  { sec: 1, watts: 1280 },
  { sec: 5, watts: 1120 },
  { sec: 15, watts: 820 },
  { sec: 30, watts: 630 },
  { sec: 60, watts: 465 },
  { sec: 120, watts: 385 },
  { sec: 300, watts: 345 },
  { sec: 480, watts: 320 },
  { sec: 600, watts: 310 },
  { sec: 1200, watts: 300 },
  { sec: 1800, watts: 295 },
  { sec: 3600, watts: 280 },
  { sec: 5400, watts: 260 },
  { sec: 7200, watts: 245 },
];

// Zone distribution — 90-day, polarized training (Cat 2-3 racer)
// Heavy Z2 base, limited Z3 "junk miles", targeted high-intensity
const zoneData = [
  { zone: 'Z1', label: 'Recovery', pct: 10, color: COLORS.zone1 },
  { zone: 'Z2', label: 'Endurance', pct: 50, color: COLORS.zone2 },
  { zone: 'Z3', label: 'Tempo', pct: 10, color: COLORS.zone3 },
  { zone: 'Z4', label: 'Threshold', pct: 15, color: COLORS.zone4 },
  { zone: 'Z5', label: 'VO2max', pct: 11, color: COLORS.zone5 },
  { zone: 'Z6', label: 'Anaerobic', pct: 4, color: COLORS.zone6 },
];

// ===== SVG Chart Components =====

function FitnessChart({ animate }) {
  const width = 400;
  const height = 180;
  const padding = { top: 20, right: 10, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = 138;
  const minVal = 52;

  const toX = (i) => padding.left + (i / (fitnessData.length - 1)) * chartW;
  const toY = (val) => padding.top + ((maxVal - val) / (maxVal - minVal)) * chartH;

  const ctlPath = fitnessData.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.ctl)}`).join(' ');
  const atlPath = fitnessData.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.atl)}`).join(' ');

  // TSB shaded area between CTL and ATL
  const tsbPath = fitnessData.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.ctl)}`).join(' ')
    + fitnessData.slice().reverse().map((d, i) => `L${toX(fitnessData.length - 1 - i)},${toY(d.atl)}`).join(' ')
    + 'Z';

  const ctlRef = useRef(null);
  const atlRef = useRef(null);
  const [ctlLength, setCtlLength] = useState(1000);
  const [atlLength, setAtlLength] = useState(1000);

  useEffect(() => {
    if (ctlRef.current) setCtlLength(ctlRef.current.getTotalLength());
    if (atlRef.current) setAtlLength(atlRef.current.getTotalLength());
  }, []);

  return (
    <Paper p="sm" style={{ overflow: 'hidden' }}>
      <Group justify="space-between" mb="xs">
        <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Training Load
        </Text>
        <Group gap="md">
          <Group gap={4}>
            <Box style={{ width: 10, height: 2, background: COLORS.ctl }} />
            <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)' }}>CTL</Text>
          </Group>
          <Group gap={4}>
            <Box style={{ width: 10, height: 2, background: COLORS.atl }} />
            <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)' }}>ATL</Text>
          </Group>
          <Group gap={4}>
            <Box style={{ width: 10, height: 2, background: COLORS.tsb, opacity: 0.3 }} />
            <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)' }}>TSB</Text>
          </Group>
        </Group>
      </Group>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[60, 80, 100, 120].map(v => (
          <g key={v}>
            <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)}
              stroke="var(--tribos-border-default)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
            <text x={padding.left - 6} y={toY(v) + 3} textAnchor="end"
              style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
              {v}
            </text>
          </g>
        ))}

        {/* TSB fill area */}
        <path d={tsbPath} fill={COLORS.tsb} className={`chart-area-fill ${animate ? 'animate' : ''}`}
          opacity="0.08" />

        {/* CTL line (Fitness) */}
        <path ref={ctlRef} d={ctlPath} fill="none" stroke={COLORS.ctl} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            strokeDasharray: ctlLength,
            strokeDashoffset: animate ? 0 : ctlLength,
            transition: animate ? 'stroke-dashoffset 2s ease-out' : 'none',
          }}
        />

        {/* ATL line (Fatigue) */}
        <path ref={atlRef} d={atlPath} fill="none" stroke={COLORS.atl} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            strokeDasharray: atlLength,
            strokeDashoffset: animate ? 0 : atlLength,
            transition: animate ? 'stroke-dashoffset 2s ease-out 0.3s' : 'none',
          }}
        />
      </svg>
    </Paper>
  );
}

function PowerDurationCurve({ animate }) {
  const width = 400;
  const height = 180;
  const padding = { top: 20, right: 10, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxWatts = 1400;
  const minWatts = 180;
  const ftp = 295;

  // Log scale for x-axis
  const logMin = Math.log10(1);
  const logMax = Math.log10(7200);
  const toX = (sec) => padding.left + ((Math.log10(sec) - logMin) / (logMax - logMin)) * chartW;
  const toY = (watts) => padding.top + ((maxWatts - watts) / (maxWatts - minWatts)) * chartH;

  const linePath = pdcData.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(d.sec)},${toY(d.watts)}`).join(' ');
  const areaPath = linePath
    + `L${toX(pdcData[pdcData.length - 1].sec)},${padding.top + chartH}`
    + `L${toX(pdcData[0].sec)},${padding.top + chartH}Z`;

  const pathRef = useRef(null);
  const [pathLength, setPathLength] = useState(1000);

  useEffect(() => {
    if (pathRef.current) setPathLength(pathRef.current.getTotalLength());
  }, []);

  const xLabels = [
    { sec: 1, label: '1s' }, { sec: 60, label: '1m' }, { sec: 300, label: '5m' },
    { sec: 1200, label: '20m' }, { sec: 3600, label: '1h' },
  ];

  return (
    <Paper p="sm" style={{ overflow: 'hidden' }}>
      <Text size="xs" fw={600} mb="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Power Duration Curve
      </Text>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[400, 600, 800, 1000, 1200].map(v => (
          <g key={v}>
            <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)}
              stroke="var(--tribos-border-default)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
            <text x={padding.left - 6} y={toY(v) + 3} textAnchor="end"
              style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
              {v}w
            </text>
          </g>
        ))}

        {/* FTP reference line — matches actual PowerDurationCurve.jsx */}
        <line
          x1={padding.left} y1={toY(ftp)} x2={width - padding.right} y2={toY(ftp)}
          stroke={COLORS.zone4} strokeWidth="1" strokeDasharray="5,5" opacity="0.6"
        />
        <text x={width - padding.right + 2} y={toY(ftp) + 3}
          style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", fill: COLORS.zone4 }}>
          FTP
        </text>

        {/* X-axis labels */}
        {xLabels.map(({ sec, label }) => (
          <text key={sec} x={toX(sec)} y={height - 6} textAnchor="middle"
            style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
            {label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={COLORS.pdcFill} className={`chart-area-fill ${animate ? 'animate' : ''}`}
          opacity="0.08" />

        {/* Line */}
        <path ref={pathRef} d={linePath} fill="none" stroke={COLORS.pdc} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            strokeDasharray: pathLength,
            strokeDashoffset: animate ? 0 : pathLength,
            transition: animate ? 'stroke-dashoffset 2.5s ease-out' : 'none',
          }}
        />
      </svg>
    </Paper>
  );
}

function ZoneDistribution({ animate }) {
  const width = 400;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 40, left: 10 };
  const chartH = height - padding.top - padding.bottom;
  const barWidth = 44;
  const gap = 14;
  const totalWidth = zoneData.length * barWidth + (zoneData.length - 1) * gap;
  const startX = (width - totalWidth) / 2;

  const maxPct = 58;

  return (
    <Paper p="sm" style={{ overflow: 'hidden' }}>
      <Text size="xs" fw={600} mb="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Zone Distribution
      </Text>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {zoneData.map((d, i) => {
          const x = startX + i * (barWidth + gap);
          const barH = (d.pct / maxPct) * chartH;
          const y = padding.top + chartH - barH;

          return (
            <g key={d.zone}>
              {/* Bar */}
              <rect
                x={x} y={y} width={barWidth} height={barH}
                fill={d.color}
                opacity="0.8"
                style={{
                  transformOrigin: `${x + barWidth / 2}px ${padding.top + chartH}px`,
                  transform: animate ? 'scaleY(1)' : 'scaleY(0)',
                  transition: `transform 0.6s ease-out ${0.1 + i * 0.1}s`,
                }}
              />
              {/* Percentage label */}
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle"
                style={{
                  fontSize: 10, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-secondary)',
                  opacity: animate ? 1 : 0,
                  transition: `opacity 0.3s ease-out ${0.4 + i * 0.1}s`,
                }}>
                {d.pct}%
              </text>
              {/* Zone label */}
              <text x={x + barWidth / 2} y={height - 22} textAnchor="middle"
                style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, fill: d.color }}>
                {d.zone}
              </text>
              {/* Zone name */}
              <text x={x + barWidth / 2} y={height - 8} textAnchor="middle"
                style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Paper>
  );
}

// Route suitability mock data — matches app's scoring system (0-100 per workout type)
const routeSuitability = [
  { label: 'Endurance', score: 95, color: COLORS.zone2 },
  { label: 'Tempo', score: 82, color: COLORS.zone3 },
  { label: 'Threshold', score: 71, color: COLORS.zone4 },
  { label: 'VO2max', score: 58, color: COLORS.zone5 },
  { label: 'Climbing', score: 34, color: COLORS.zone6 },
];

// Simplified route profile — elevation over distance (mock 50km rolling ride)
const routeProfile = [
  { km: 0, elev: 120 }, { km: 3, elev: 125 }, { km: 6, elev: 155 },
  { km: 9, elev: 180 }, { km: 12, elev: 160 }, { km: 15, elev: 140 },
  { km: 18, elev: 135 }, { km: 21, elev: 130 }, { km: 24, elev: 165 },
  { km: 27, elev: 210 }, { km: 30, elev: 250 }, { km: 33, elev: 220 },
  { km: 36, elev: 170 }, { km: 39, elev: 145 }, { km: 42, elev: 140 },
  { km: 45, elev: 130 }, { km: 48, elev: 125 }, { km: 50, elev: 120 },
];

// Terrain segment ranges (km start, km end, type)
const terrainSegments = [
  { start: 0, end: 6, type: 'flat', color: COLORS.zone2 },
  { start: 6, end: 12, type: 'rolling', color: COLORS.zone3 },
  { start: 12, end: 21, type: 'flat', color: COLORS.zone2 },
  { start: 21, end: 36, type: 'climb', color: COLORS.zone4 },
  { start: 36, end: 45, type: 'descent', color: '#3D8B50' },
  { start: 45, end: 50, type: 'flat', color: COLORS.zone2 },
];

function RouteIntelligence({ animate }) {
  const width = 400;
  const height = 120;
  const padding = { top: 15, right: 15, bottom: 25, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxKm = 50;
  const maxElev = 270;
  const minElev = 100;

  const toX = (km) => padding.left + (km / maxKm) * chartW;
  const toY = (elev) => padding.top + ((maxElev - elev) / (maxElev - minElev)) * chartH;

  // Build elevation profile path
  const profilePath = routeProfile.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(d.km)},${toY(d.elev)}`
  ).join(' ');

  const profileRef = useRef(null);
  const [profileLength, setProfileLength] = useState(800);

  useEffect(() => {
    if (profileRef.current) setProfileLength(profileRef.current.getTotalLength());
  }, []);

  // Bar chart dimensions for suitability scores
  const barH = 12;
  const barGap = 6;
  const barMaxW = 130;

  return (
    <Paper p="sm" style={{ overflow: 'hidden' }}>
      <Text size="xs" fw={600} mb="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Route Intelligence
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {/* Left: Elevation profile with colored terrain segments */}
        <Box>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
            {/* Grid lines */}
            {[150, 200, 250].map(v => (
              <g key={v}>
                <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)}
                  stroke="var(--tribos-border-default)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.4" />
                <text x={padding.left - 6} y={toY(v) + 3} textAnchor="end"
                  style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
                  {v}m
                </text>
              </g>
            ))}

            {/* Colored terrain segment fills under the profile */}
            {terrainSegments.map((seg, i) => {
              const segPoints = routeProfile.filter(d => d.km >= seg.start && d.km <= seg.end);
              if (segPoints.length < 2) return null;
              const areaPath = segPoints.map((d, j) =>
                `${j === 0 ? 'M' : 'L'}${toX(d.km)},${toY(d.elev)}`
              ).join(' ')
                + `L${toX(seg.end)},${padding.top + chartH}`
                + `L${toX(seg.start)},${padding.top + chartH}Z`;
              return (
                <path key={i} d={areaPath} fill={seg.color}
                  style={{
                    opacity: animate ? 0.2 : 0,
                    transition: `opacity 0.5s ease-out ${0.8 + i * 0.1}s`,
                  }}
                />
              );
            })}

            {/* Elevation profile line */}
            <path ref={profileRef} d={profilePath} fill="none" stroke="var(--tribos-text-secondary)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{
                strokeDasharray: profileLength,
                strokeDashoffset: animate ? 0 : profileLength,
                transition: animate ? 'stroke-dashoffset 2s ease-out 0.3s' : 'none',
              }}
            />

            {/* Distance labels */}
            {[0, 10, 20, 30, 40, 50].map(km => (
              <text key={km} x={toX(km)} y={height - 6} textAnchor="middle"
                style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
                {km}km
              </text>
            ))}
          </svg>

          {/* Terrain legend */}
          <Group gap="xs" mt={4} justify="center">
            {[
              { label: 'Flat', color: COLORS.zone2 },
              { label: 'Rolling', color: COLORS.zone3 },
              { label: 'Climb', color: COLORS.zone4 },
              { label: 'Descent', color: '#3D8B50' },
            ].map(t => (
              <Group key={t.label} gap={3}>
                <Box style={{ width: 8, height: 8, background: t.color, opacity: 0.6 }} />
                <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--tribos-text-muted)' }}>
                  {t.label}
                </Text>
              </Group>
            ))}
          </Group>
        </Box>

        {/* Right: Suitability scores as horizontal bars */}
        <Box>
          <svg viewBox={`0 0 240 ${routeSuitability.length * (barH + barGap) + 10}`} style={{ width: '100%', height: 'auto' }}>
            {routeSuitability.map((d, i) => {
              const y = i * (barH + barGap) + 5;
              const barW = (d.score / 100) * barMaxW;
              return (
                <g key={d.label}>
                  {/* Label */}
                  <text x={0} y={y + barH - 2}
                    style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-secondary)' }}>
                    {d.label}
                  </text>
                  {/* Background bar */}
                  <rect x={75} y={y} width={barMaxW} height={barH} rx={0}
                    fill="var(--tribos-border-default)" opacity="0.3" />
                  {/* Score bar */}
                  <rect x={75} y={y} width={barW} height={barH} rx={0}
                    fill={d.color} opacity="0.7"
                    style={{
                      transformOrigin: `75px ${y + barH / 2}px`,
                      transform: animate ? 'scaleX(1)' : 'scaleX(0)',
                      transition: `transform 0.6s ease-out ${0.6 + i * 0.1}s`,
                    }}
                  />
                  {/* Score text */}
                  <text x={75 + barMaxW + 8} y={y + barH - 2}
                    style={{
                      fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, fill: d.color,
                      opacity: animate ? 1 : 0,
                      transition: `opacity 0.3s ease-out ${1 + i * 0.1}s`,
                    }}>
                    {d.score}%
                  </text>
                </g>
              );
            })}
          </svg>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

// ===== Main AnalyzeStep Component =====

export default function AnalyzeStep() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });
  const reducedMotion = usePrefersReducedMotion();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isVisible) {
      if (reducedMotion) {
        setAnimate(true);
      } else {
        // Small delay so the section reveals first, then charts animate
        const timer = setTimeout(() => setAnimate(true), 400);
        return () => clearTimeout(timer);
      }
    }
  }, [isVisible, reducedMotion]);

  return (
    <Box py={{ base: 60, md: 100 }} px={{ base: 'md', md: 'xl' }}>
      <Container size="md">
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <Stack gap="xl" align="center">
            <div>
              <Text
                className="step-label"
                size="xs"
                ta="center"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  color: 'var(--tribos-terracotta-500)',
                  marginBottom: 8,
                }}
              >
                Step 03 — Analyze
              </Text>
              <Text
                className="step-title"
                ta="center"
                style={{
                  fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
                  fontFamily: "'Anybody', sans-serif",
                  fontWeight: 800,
                  color: 'var(--tribos-text-primary)',
                }}
              >
                Your numbers start talking.
              </Text>
            </div>

            <SimpleGrid className="step-content" cols={{ base: 1, md: 2 }} spacing="lg" style={{ width: '100%' }}>
              <Box style={{ gridColumn: '1 / -1' }}>
                <FitnessChart animate={animate} />
              </Box>
              <PowerDurationCurve animate={animate} />
              <ZoneDistribution animate={animate} />
              <Box style={{ gridColumn: '1 / -1' }}>
                <RouteIntelligence animate={animate} />
              </Box>
            </SimpleGrid>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
