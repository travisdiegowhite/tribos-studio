/**
 * SessionProfile — a session drawn the tribos way: one ink step-line tracing
 * effort over time on paper, with only the efforts inked in.
 *
 * It replaced a row of solid bars in a seven-colour zone rainbow, which read
 * as TrainingPeaks. The language here is the landing page's route sheet (an
 * ink line, a lime overprint): the trace carries the shape, and colour is kept
 * for effort, in the four role colours the calendar cards use (tempo lime as an
 * overprint, threshold-and-up magenta; an all-endurance day gets a pale
 * ultramarine wash so it isn't blank). Warmups, cooldowns and recoveries stay
 * paper.
 *
 * Width is time, height is intensity (%FTP or threshold-pace speed). The
 * calendar cell and the Today card draw the same steps, compact.
 */

import { Box, Group, Text, Tooltip, useComputedColorScheme } from '@mantine/core';
import { effortTone, TONE_FILL, zonesFor } from '../../../lib/training/session/zones';
import { formatMinutes, formatTarget, type TargetAnchors } from '../../../lib/training/session/summary';
import type { SessionStep } from '../../../lib/training/session/steps';

interface Props {
  steps: SessionStep[];
  sport: string | null;
  height?: number;
  anchors?: TargetAnchors;
  /** Trace and fills only — no labels, rule or tooltips (calendar cell, Today card). */
  compact?: boolean;
}

/** Step height as a share of the chart: intensity against the hardest step, floored so easy riding stays visible. */
export function barHeightPct(intensity: number, maxIntensity: number): number {
  const top = Math.max(1.2, maxIntensity);
  return Math.round(12 + 88 * Math.min(1, Math.max(0, intensity) / top));
}

/** Viewbox height; width is minutes × X_SCALE. Shapes stretch, so text lives in HTML overlays. */
const H = 100;
const X_SCALE = 10;

const mono = { fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1, color: 'var(--color-text-muted)' } as const;

export function SessionProfile({ steps, sport, height = 96, anchors, compact = false }: Props) {
  const scheme = useComputedColorScheme('light');
  const total = steps.reduce((sum, s) => sum + s.durationMin, 0);
  if (!(total > 0)) return null;

  const maxIntensity = Math.max(...steps.map((s) => s.intensity));
  const zones = zonesFor(sport);
  const W = total * X_SCALE;

  // Lay the steps out once: x range, top y, tone.
  let cursor = 0;
  const laid = steps.map((s) => {
    const x0 = cursor;
    cursor += s.durationMin;
    const pct = barHeightPct(s.intensity, maxIntensity);
    return { step: s, x0: x0 * X_SCALE, x1: cursor * X_SCALE, y: H - pct, pct, tone: effortTone(s.zone) };
  });

  const hasEffort = laid.some((l) => l.tone === 'tempo' || l.tone === 'hard');
  // An all-endurance day: wash its endurance steps so the sheet isn't blank.
  const filled = laid.filter((l) =>
    l.tone === 'tempo' || l.tone === 'hard' || (!hasEffort && l.tone === 'endurance'),
  );

  // The ink trace: a pure step-line across every step, like the route sheet's
  // line. (Dropping to the baseline at both ends boxed an easy session in a
  // bracket on the small calendar glyph.)
  const d = laid.map((l, i) => `${i === 0 ? 'M' : 'L'}${l.x0} ${l.y} L${l.x1} ${l.y}`).join(' ');

  const thresholdPct = barHeightPct(1, maxIntensity);
  const repMarks = laid.filter((l) => l.step.phase === 'work' && l.step.rep?.index === 1);
  const summaryLabel = `${formatMinutes(total)} session profile`;

  return (
    <Box>
      <Box
        role="img"
        aria-label={summaryLabel}
        data-testid="session-profile"
        style={{ position: 'relative', height, marginTop: compact ? 0 : 14 }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {filled.map((l, i) => (
            <rect
              key={i}
              data-tone={l.tone}
              x={l.x0}
              y={l.y}
              width={l.x1 - l.x0}
              height={H - l.y}
              style={{
                fill: TONE_FILL[l.tone].fill,
                fillOpacity: l.tone === 'endurance' ? 0.18 : l.tone === 'tempo' ? 0.85 : 0.9,
                // Lime overprints the paper like riso ink; on the dark page a
                // multiply would vanish, so it prints flat there.
                mixBlendMode: l.tone === 'tempo' && scheme === 'light' ? 'multiply' : 'normal',
              }}
            />
          ))}
          {!compact && (
            <line
              x1={0}
              x2={W}
              y1={H}
              y2={H}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: 'var(--color-ink-border)', strokeWidth: 1 }}
            />
          )}
          {!compact && (
            <line
              data-testid="threshold-rule"
              x1={0}
              x2={W}
              y1={H - thresholdPct}
              y2={H - thresholdPct}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: 'var(--color-ink-border-strong)', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
          )}
          <path
            data-testid="ink-trace"
            d={d}
            vectorEffect="non-scaling-stroke"
            style={{
              fill: 'none',
              stroke: 'var(--color-ink)',
              strokeWidth: compact ? 1.25 : 2,
              strokeLinejoin: 'miter',
            }}
          />
        </svg>

        {!compact && (
          <>
            {/* Threshold label, Courier, at the rule's right end. */}
            <Text
              component="span"
              data-testid="threshold-label"
              style={{ ...mono, position: 'absolute', right: 0, bottom: `calc(${thresholdPct}% + 2px)` }}
            >
              {sport === 'running' ? 'THR' : 'FTP'}
            </Text>
            {/* Set marks above the first rep of each set: "4×8′". */}
            {repMarks.map((l, i) => (
              <Text
                key={i}
                component="span"
                data-testid="rep-mark"
                style={{
                  ...mono,
                  color: 'var(--color-text-primary)',
                  position: 'absolute',
                  left: `${(l.x0 / W) * 100}%`,
                  bottom: `calc(${l.pct}% + 3px)`,
                  whiteSpace: 'nowrap',
                }}
              >
                {`${l.step.rep!.count}×${formatMinutes(l.step.durationMin).replace(' min', '′').replace(' ', '')}`}
              </Text>
            ))}
            {/* Hit areas for the step tooltips. */}
            <Box style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              {laid.map((l, i) => {
                const zone = l.step.zone != null ? zones[l.step.zone]?.label : null;
                return (
                  <Tooltip
                    key={i}
                    withinPortal
                    label={[l.step.label, formatMinutes(l.step.durationMin), zone, formatTarget(l.step.target, anchors)].filter(Boolean).join(' · ')}
                  >
                    <Box style={{ flex: `${l.step.durationMin} 0 0`, height: '100%' }} />
                  </Tooltip>
                );
              })}
            </Box>
          </>
        )}
      </Box>
      {!compact && (
        <Group justify="space-between" mt={4}>
          <Text style={mono}>0</Text>
          <Text style={mono}>{formatMinutes(total / 2)}</Text>
          <Text style={mono}>{formatMinutes(total)}</Text>
        </Group>
      )}
    </Box>
  );
}

export default SessionProfile;
