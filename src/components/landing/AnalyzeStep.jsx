import { useState, useEffect, useRef } from 'react';
import { Container, Text, Paper, SimpleGrid, Box, Stack, Group } from '@mantine/core';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

// ===== Data for charts =====

// CTL (fitness) and ATL (fatigue) over ~90 days
const fitnessData = [
  { ctl: 42, atl: 38 }, { ctl: 43, atl: 45 }, { ctl: 44, atl: 40 }, { ctl: 45, atl: 52 },
  { ctl: 47, atl: 48 }, { ctl: 48, atl: 42 }, { ctl: 49, atl: 55 }, { ctl: 50, atl: 50 },
  { ctl: 51, atl: 46 }, { ctl: 53, atl: 58 }, { ctl: 54, atl: 52 }, { ctl: 55, atl: 48 },
  { ctl: 56, atl: 60 }, { ctl: 57, atl: 55 }, { ctl: 58, atl: 50 }, { ctl: 59, atl: 62 },
  { ctl: 60, atl: 56 }, { ctl: 61, atl: 52 }, { ctl: 62, atl: 65 }, { ctl: 63, atl: 58 },
  { ctl: 64, atl: 54 }, { ctl: 65, atl: 68 }, { ctl: 66, atl: 62 }, { ctl: 67, atl: 56 },
  { ctl: 67, atl: 70 }, { ctl: 68, atl: 64 }, { ctl: 68, atl: 58 }, { ctl: 69, atl: 72 },
  { ctl: 70, atl: 66 }, { ctl: 70, atl: 60 },
];

// Power duration curve (seconds vs watts)
const pdcData = [
  { sec: 1, watts: 1050 }, { sec: 5, watts: 920 }, { sec: 10, watts: 780 },
  { sec: 15, watts: 680 }, { sec: 30, watts: 520 }, { sec: 60, watts: 380 },
  { sec: 120, watts: 320 }, { sec: 300, watts: 285 }, { sec: 600, watts: 268 },
  { sec: 1200, watts: 255 }, { sec: 1800, watts: 248 }, { sec: 3600, watts: 238 },
  { sec: 5400, watts: 225 }, { sec: 7200, watts: 210 },
];

// Zone distribution (percent of time)
const zoneData = [
  { zone: 'Z1', label: 'Recovery', pct: 18, color: 'var(--tribos-sage-500)' },
  { zone: 'Z2', label: 'Endurance', pct: 35, color: 'var(--tribos-teal-500)' },
  { zone: 'Z3', label: 'Tempo', pct: 22, color: 'var(--tribos-gold-500)' },
  { zone: 'Z4', label: 'Threshold', pct: 15, color: 'var(--tribos-terracotta-500)' },
  { zone: 'Z5', label: 'VO2max', pct: 7, color: 'var(--tribos-mauve-500)' },
  { zone: 'Z6', label: 'Anaerobic', pct: 3, color: 'var(--tribos-sky-500)' },
];

// ===== SVG Chart Components =====

function FitnessChart({ animate }) {
  const width = 400;
  const height = 180;
  const padding = { top: 20, right: 10, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = 80;
  const minVal = 30;

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
          Fitness / Fatigue / Form
        </Text>
        <Group gap="md">
          <Group gap={4}>
            <Box style={{ width: 10, height: 2, background: 'var(--tribos-teal-500)' }} />
            <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)' }}>CTL</Text>
          </Group>
          <Group gap={4}>
            <Box style={{ width: 10, height: 2, background: 'var(--tribos-terracotta-500)' }} />
            <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)' }}>ATL</Text>
          </Group>
        </Group>
      </Group>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[40, 50, 60, 70].map(v => (
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
        <path d={tsbPath} fill="var(--tribos-sage-500)" className={`chart-area-fill ${animate ? 'animate' : ''}`}
          opacity="0.08" />

        {/* CTL line */}
        <path ref={ctlRef} d={ctlPath} fill="none" stroke="var(--tribos-teal-500)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            strokeDasharray: ctlLength,
            strokeDashoffset: animate ? 0 : ctlLength,
            transition: animate ? 'stroke-dashoffset 2s ease-out' : 'none',
          }}
        />

        {/* ATL line */}
        <path ref={atlRef} d={atlPath} fill="none" stroke="var(--tribos-terracotta-500)" strokeWidth="2"
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

  const maxWatts = 1100;
  const minWatts = 150;

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
        {[300, 500, 700, 900].map(v => (
          <g key={v}>
            <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)}
              stroke="var(--tribos-border-default)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
            <text x={padding.left - 6} y={toY(v) + 3} textAnchor="end"
              style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
              {v}w
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ sec, label }) => (
          <text key={sec} x={toX(sec)} y={height - 6} textAnchor="middle"
            style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
            {label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="var(--tribos-gold-500)" className={`chart-area-fill ${animate ? 'animate' : ''}`}
          opacity="0.1" />

        {/* Line */}
        <path ref={pathRef} d={linePath} fill="none" stroke="var(--tribos-gold-500)" strokeWidth="2"
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

  const maxPct = 40;

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
            </SimpleGrid>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
