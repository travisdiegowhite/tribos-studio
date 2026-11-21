/**
 * EffortLegend — the key to the ink-trace profile: the ink line is effort,
 * the dashed rule is threshold, and swatches name only the effort tones this
 * session actually inks in.
 */
import { Box, Group, Text } from '@mantine/core';
import { effortTone, TONE_FILL, type EffortTone } from '../../../lib/training/session/zones';
import type { SessionStep } from '../../../lib/training/session/steps';

const label = { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: 'var(--color-text-secondary)' };

export function EffortLegend({ steps, sport }: { steps: SessionStep[]; sport: string | null }) {
  if (steps.length === 0) return null;
  const tones = new Set<EffortTone>(steps.map((s) => effortTone(s.zone)));
  const hasEffort = tones.has('tempo') || tones.has('hard');
  const shown: EffortTone[] = hasEffort
    ? (['tempo', 'hard'] as EffortTone[]).filter((t) => tones.has(t))
    : tones.has('endurance') ? ['endurance'] : [];
  return (
    <Group gap="md" justify="center" data-testid="zone-legend">
      <Group gap={6} wrap="nowrap">
        <Box style={{ width: 16, borderTop: '2px solid var(--color-ink)' }} />
        <Text style={label}>Effort</Text>
      </Group>
      <Group gap={6} wrap="nowrap">
        <Box style={{ width: 16, borderTop: '1px dashed var(--color-ink-border-strong)' }} />
        <Text style={label}>{sport === 'running' ? 'Threshold pace' : 'FTP'}</Text>
      </Group>
      {shown.map((t) => (
        <Group key={t} gap={6} wrap="nowrap" data-tone={t}>
          <Box style={{ width: 10, height: 10, background: TONE_FILL[t].fill, opacity: t === 'endurance' ? 0.35 : 1 }} />
          <Text style={label}>{TONE_FILL[t].label}</Text>
        </Group>
      ))}
    </Group>
  );
}

/** @deprecated The profile is no longer zone-coloured; use EffortLegend. */
export const ZoneLegend = EffortLegend;

export default EffortLegend;
