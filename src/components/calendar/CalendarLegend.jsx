/**
 * The desktop calendar's legend: what the intensity rules, run and strength
 * marks, race priorities and status strips on a day cell mean. Split out of
 * TrainingCalendar.jsx (pure render).
 */
import { Button, Group, Stack, Text } from '@mantine/core';
import { SkipForward, Trophy } from '@phosphor-icons/react';
import { sessionToneStyle } from '../../utils/calendarSessionTone';
import { COMPLIANCE_STYLE } from '../../lib/training/session';
import HandTick from '../ui/HandTick';

/** @param {{ onAddRace: () => void }} props */
export default function CalendarLegend({ onAddRace }) {
  return (
    <Stack gap="xs" mt="md">
      <Group gap="xs">
        <Text size="xs" style={{ color: 'var(--color-text-muted)' }} fw={600}>Intensity</Text>
        {[
          ['recovery', 'Recovery'],
          ['endurance', 'Endurance'],
          ['tempo', 'Tempo / sweet spot'],
          ['hard', 'Threshold and up'],
        ].map(([tone, label]) => (
          <Group gap={4} key={tone}>
            <span style={{ width: 10, height: 10, background: sessionToneStyle(tone).rule, display: 'inline-block' }} />
            <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</Text>
          </Group>
        ))}
        <Group gap={4}>
          <span style={{ width: 10, height: 10, border: '2px dashed var(--color-border)', display: 'inline-block' }} />
          <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Strength, core, mobility</Text>
        </Group>
        <Group gap={4}>
          <span style={{ width: 10, height: 10, borderLeft: '5px double var(--color-text-secondary)', display: 'inline-block' }} />
          <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Run</Text>
        </Group>
        <Group gap={4}>
          <SkipForward size={12} style={{ color: 'var(--color-text-secondary)' }} />
          <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Skipped</Text>
        </Group>
      </Group>

      {/* Race goals legend */}
      <Group gap="md">
        <Text size="xs" style={{ color: 'var(--color-text-muted)' }} fw={600}>Race priority</Text>
        <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>
          A · main goal &nbsp;·&nbsp; B · important &nbsp;·&nbsp; C · training race
        </Text>
        <Button
          size="xs"
          variant="light"
          color="orange"
          leftSection={<Trophy size={14} />}
          ml="auto"
          onClick={onAddRace}
        >
          Add race goal
        </Button>
      </Group>

      {/* The calendar belongs to the athlete, plan or no plan, so its legend shows either way. */}
      <Group gap="md">
        <Text size="xs" style={{ color: 'var(--color-text-muted)' }} fw={600}>Status</Text>
        <Group gap={4}>
          <HandTick size={14} />
          <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Done</Text>
        </Group>
        <Group gap={4}>
          <Text size="xs" style={{ color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>Missed</Text>
        </Group>
        {['on_target', 'partial', 'off'].map((band) => (
          <Group key={band} gap={4}>
            <div style={{ width: 14, height: 3, background: COMPLIANCE_STYLE[band].strip }} />
            <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>{COMPLIANCE_STYLE[band].label}</Text>
          </Group>
        ))}
        <Group gap={4}>
          <div style={{ width: 12, height: 12, background: 'var(--color-card)', border: '2px solid var(--color-ink)' }} />
          <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Today</Text>
        </Group>
        <Text size="xs" c="dimmed" ml="auto">Drag workouts to move • Click to edit</Text>
      </Group>
    </Stack>
  );
}
