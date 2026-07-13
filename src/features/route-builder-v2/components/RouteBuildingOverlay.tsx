/**
 * RouteBuildingOverlay — Route Builder 2.0 AI-generation animation.
 *
 * Full-map overlay shown while Claude is building a route. A field-guide
 * style card plays a looping "plotting" animation — a route line draws
 * itself across graph paper behind a traveling head dot, waypoints pop in
 * as the line passes them — over rotating status copy, so a 10–30s
 * generation reads as active work instead of a stalled spinner.
 *
 * Quick operations (waypoint re-routes, chat edits) keep the compact
 * LoadingState banner; this overlay is reserved for full generation.
 *
 * The overlay never blocks the map (pointer-events: none) and honors
 * prefers-reduced-motion by freezing the sketch at its completed frame.
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';

export interface RouteBuildingOverlayProps {
  message?: string;
}

// One draw-loop cycle. The line finishes at DRAW_END of the cycle, holds,
// then the whole sketch fades and restarts.
const CYCLE_S = 4.2;
const DRAW_END = 0.68;

// Hand-drawn route squiggle inside the 240×110 viewBox; pathLength=100
// normalizes the dash math. Waypoint dots sit on the curve (eyeballed to
// the geometry — adjust together with ROUTE_PATH).
const ROUTE_PATH = 'M16,90 C52,86 38,52 70,44 S104,72 132,64 S172,20 196,24 S222,34 226,28';
const WAYPOINTS = [
  { x: 70, y: 44, at: 0.24 },
  { x: 132, y: 64, at: 0.42 },
  { x: 196, y: 24, at: 0.58 },
];

const STATUS_STEPS = [
  'Scouting the road network…',
  'Weighing climbs and descents…',
  'Dodging busy roads…',
  'Matching today’s target…',
  'Closing the loop…',
];
const STATUS_INTERVAL_MS = 2600;

export function RouteBuildingOverlay({ message = 'Plotting your route' }: RouteBuildingOverlayProps) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setStepIdx((i) => (i + 1) % STATUS_STEPS.length),
      STATUS_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  // SMIL (the head dot's animateMotion) ignores prefers-reduced-motion, so
  // gate it in JS; the CSS animations are gated in the style block below.
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const drawPct = DRAW_END * 100;

  return (
    <Box
      data-testid="rb2-building-overlay"
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(244, 244, 242, 0.45)',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes rb2-build-draw {
          0% { stroke-dashoffset: 100; opacity: 1; }
          ${drawPct}% { stroke-dashoffset: 0; opacity: 1; }
          88% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        ${WAYPOINTS.map(
          (wp, i) => `
        @keyframes rb2-build-wp${i} {
          0%, ${(wp.at * 100).toFixed(1)}% { opacity: 0; }
          ${(wp.at * 100 + 4).toFixed(1)}%, 88% { opacity: 1; }
          100% { opacity: 0; }
        }
        .rb2-build-wp${i} { animation: rb2-build-wp${i} ${CYCLE_S}s linear infinite; }`,
        ).join('\n')}
        @keyframes rb2-build-end {
          0%, ${drawPct}% { opacity: 0; }
          ${drawPct + 5}%, 88% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes rb2-build-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          70% { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes rb2-build-fade-in {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rb2-build-draw {
          stroke-dasharray: 100;
          animation: rb2-build-draw ${CYCLE_S}s linear infinite;
        }
        .rb2-build-end {
          animation: rb2-build-end ${CYCLE_S}s linear infinite;
        }
        .rb2-build-pulse {
          transform-origin: center;
          transform-box: fill-box;
          animation: rb2-build-pulse 1.8s ease-out infinite;
        }
        .rb2-build-status {
          animation: rb2-build-fade-in 320ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .rb2-build-draw { animation: none; stroke-dashoffset: 0; }
          .rb2-build-end { animation: none; opacity: 1; }
          .rb2-build-pulse { animation: none; opacity: 0; }
          .rb2-build-status { animation: none; }
          ${WAYPOINTS.map((_, i) => `.rb2-build-wp${i} { animation: none; opacity: 1; }`).join('\n          ')}
        }
      `}</style>

      <Box
        style={{
          backgroundColor: RB2.cardBg,
          border: `1px solid ${RB2.border}`,
          borderRadius: 0,
          boxShadow: RB2.shadowOverlay,
          padding: '18px 22px 16px',
          width: 300,
          textAlign: 'center',
        }}
      >
        <svg viewBox="0 0 240 110" width={256} height={117} aria-hidden="true" style={{ display: 'block' }}>
          {/* Graph-paper field */}
          <defs>
            <pattern id="rb2-build-grid" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M12 0H0V12" fill="none" stroke={RB2.border} strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="240" height="110" fill="url(#rb2-build-grid)" opacity="0.7" />

          {/* Start marker: pulsing ring + solid square */}
          <circle className="rb2-build-pulse" cx="16" cy="90" r="6" fill="none" stroke={RB2.teal} strokeWidth="1.5" />
          <rect x="12" y="86" width="8" height="8" fill={RB2.teal} />

          {/* The route drawing itself */}
          <path
            className="rb2-build-draw"
            d={ROUTE_PATH}
            pathLength={100}
            fill="none"
            stroke={RB2.teal}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Waypoints pop in as the line reaches them */}
          {WAYPOINTS.map((wp, i) => (
            <circle
              key={i}
              className={`rb2-build-wp${i}`}
              cx={wp.x}
              cy={wp.y}
              r="3.5"
              fill={RB2.cardBg}
              stroke={RB2.textSecondary}
              strokeWidth="1.5"
            />
          ))}

          {/* Destination flag, appears when the line completes */}
          <g className="rb2-build-end">
            <line x1="226" y1="28" x2="226" y2="14" stroke={RB2.textSecondary} strokeWidth="1.5" />
            <path d="M226,14 L236,17.5 L226,21 Z" fill={RB2.coral} />
          </g>

          {/* Head dot riding the line as it draws */}
          {!reducedMotion && (
            <circle r="4" fill={RB2.orange} stroke={RB2.cardBg} strokeWidth="1.5">
              <animateMotion
                dur={`${CYCLE_S}s`}
                repeatCount="indefinite"
                keyPoints={`0;1;1`}
                keyTimes={`0;${DRAW_END};1`}
                calcMode="linear"
                path={ROUTE_PATH}
              />
              <animate
                attributeName="opacity"
                values="1;1;0;0"
                keyTimes={`0;${DRAW_END};${DRAW_END + 0.04};1`}
                dur={`${CYCLE_S}s`}
                repeatCount="indefinite"
              />
            </circle>
          )}
        </svg>

        <Text
          style={{
            fontFamily: RB2_FONT.heading,
            fontSize: 15,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: RB2.textPrimary,
            marginTop: 10,
          }}
        >
          {message}
        </Text>
        <Text
          key={stepIdx}
          className="rb2-build-status"
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 11,
            color: RB2.textTertiary,
            marginTop: 4,
            minHeight: 16,
          }}
        >
          {STATUS_STEPS[stepIdx]}
        </Text>
      </Box>
    </Box>
  );
}

export default RouteBuildingOverlay;
