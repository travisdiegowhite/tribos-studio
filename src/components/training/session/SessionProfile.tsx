/**
 * SessionProfile — a session's steps drawn as bars: width is time, height is
 * intensity (%FTP or threshold-pace speed), colour is zone. The one picture of
 * a session; the calendar glyph and the Today card draw the same steps smaller.
 *
 * Height is by intensity, not zone: 106% and 120% used to be the same height
 * because the old chart scaled by zone number.
 */

import { Box, Group, Text, Tooltip } from '@mantine/core';
import { zoneColor, zonesFor } from '../../../lib/training/session/zones';
import { formatMinutes, formatTarget, type TargetAnchors } from '../../../lib/training/session/summary';
import type { SessionStep } from '../../../lib/training/session/steps';

interface Props {
  steps: SessionStep[];
  sport: string | null;
  height?: number;
  anchors?: TargetAnchors;
  /** Hide the time axis and tooltips (calendar cell, Today card). */
  compact?: boolean;
}

/** Bar height as a share of the chart: intensity scaled against the hardest step, floored so easy riding stays visible. */
export function barHeightPct(intensity: number, maxIntensity: number): number {
  const top = Math.max(1.2, maxIntensity);
  return Math.round(12 + 88 * Math.min(1, Math.max(0, intensity) / top));
}

export function SessionProfile({ steps, sport, height = 96, anchors, compact = false }: Props) {
  const total = steps.reduce((sum, s) => sum + s.durationMin, 0);
  if (!(total > 0)) return null;
  const maxIntensity = Math.max(...steps.map((s) => s.intensity));
  const zones = zonesFor(sport);
  const label = `${formatMinutes(total)} session profile`;

  return (
    <Box>
      <Box
        role="img"
        aria-label={label}
        data-testid="session-profile"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: compact ? 0 : 1,
          height,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {steps.map((s, i) => {
          const bar = (
            <Box
              key={i}
              data-zone={s.zone ?? ''}
              style={{
                flex: `${s.durationMin} 0 0`,
                minWidth: compact ? 1 : 2,
                height: `${barHeightPct(s.intensity, maxIntensity)}%`,
                background: zoneColor(s.zone),
              }}
            />
          );
          if (compact) return bar;
          const zone = s.zone != null ? zones[s.zone]?.label : null;
          return (
            <Tooltip
              key={i}
              withinPortal
              label={[s.label, formatMinutes(s.durationMin), zone, formatTarget(s.target, anchors)].filter(Boolean).join(' · ')}
            >
              {bar}
            </Tooltip>
          );
        })}
      </Box>
      {!compact && (
        <Group justify="space-between" mt={2}>
          <Text size="xs" c="dimmed" ff="monospace">0</Text>
          <Text size="xs" c="dimmed" ff="monospace">{formatMinutes(total / 2)}</Text>
          <Text size="xs" c="dimmed" ff="monospace">{formatMinutes(total)}</Text>
        </Group>
      )}
    </Box>
  );
}

export default SessionProfile;
