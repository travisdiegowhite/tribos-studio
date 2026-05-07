/**
 * EventAnchoredPlanCard
 *
 * Phase 2 surface for the event-anchored planner. Two states:
 *
 *   1. Anchored — show the horizon race, days-to-race, and the block chain
 *      (start/end dates, current block highlighted).
 *   2. Not anchored — list upcoming race goals and offer "Anchor plan" CTAs.
 *
 * Behind the same `event_anchored_planner` flag as SequencerPrescriptionCard.
 * Lives above SequencerPrescriptionCard in TodayView.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { CalendarBlank, Flag, Lightning, WarningCircle } from '@phosphor-icons/react';
import {
  useEventAnchoredPlan,
  type AnchoredBlock,
  type HorizonEvent,
} from '../../hooks/useEventAnchoredPlan';

const BLOCK_LABELS: Record<string, string> = {
  recovery: 'Recovery',
  reactivation: 'Reactivation',
  aerobic_build: 'Aerobic Build',
  threshold: 'Threshold',
  vo2: 'VO2',
  race_specific: 'Race-Specific',
  taper: 'Taper',
  maintenance: 'Maintenance',
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(s)} – ${fmt(e)}`;
}

function blockLength(block: AnchoredBlock): number {
  return daysBetween(block.start_date, block.end_date) + 1;
}

export default function EventAnchoredPlanCard() {
  const {
    horizon_event,
    blocks,
    upcomingRaces,
    loading,
    error,
    anchorPlan,
  } = useEventAnchoredPlan();
  const [busy, setBusy] = useState<string | null>(null);
  const [opMessage, setOpMessage] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const today = isoToday();

  const activeBlock = useMemo(
    () =>
      blocks.find(
        (b) => b.start_date <= today && b.end_date >= today && b.status === 'active'
      ) ?? null,
    [blocks, today]
  );

  const daysToRace = useMemo(
    () =>
      horizon_event ? Math.max(0, daysBetween(today, horizon_event.race_date)) : null,
    [horizon_event, today]
  );

  const handleAnchor = async (race: HorizonEvent) => {
    setBusy(race.id);
    setOpMessage(null);
    setOpError(null);
    const result = await anchorPlan(race.id, false);
    setBusy(null);
    if (!result.ok) {
      setOpError(result.detail ?? result.error ?? 'Failed to anchor plan.');
      return;
    }
    if (result.already_anchored) {
      setOpMessage('Plan is already anchored to this race.');
      return;
    }
    if (
      result.validation_status === 'warning' &&
      result.validation_messages?.length
    ) {
      setOpMessage(
        `Plan anchored with warnings: ${result.validation_messages
          .map((m) => m.message)
          .join(' ')}`
      );
    } else {
      setOpMessage('Plan anchored.');
    }
  };

  if (loading) {
    return (
      <Paper p="md" withBorder radius={0}>
        <Text size="sm" c="dimmed">Loading event-anchored plan…</Text>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" withBorder radius={0}>
        <Alert color="red" radius={0} icon={<WarningCircle size={16} />}>
          Couldn't load plan: {error}
        </Alert>
      </Paper>
    );
  }

  // ── Not anchored: show CTA list ─────────────────────────────────────────
  if (!horizon_event || blocks.length === 0) {
    if (upcomingRaces.length === 0) {
      return (
        <Paper p="md" withBorder radius={0}>
          <Stack gap="xs">
            <Group gap="xs">
              <Flag size={20} />
              <Title order={5}>No race anchored</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Add an upcoming race in Race Goals, then return here to anchor
              your training plan to it.
            </Text>
          </Stack>
        </Paper>
      );
    }

    return (
      <Paper p="md" withBorder radius={0}>
        <Stack gap="sm">
          <Group gap="xs">
            <Flag size={20} />
            <Title order={5}>Anchor your plan to a race</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Pick a race below and the sequencer will build a block chain
            (aerobic build → threshold → VO2 → race-specific → taper) ending
            on race day.
          </Text>
          <Stack gap="xs">
            {upcomingRaces.slice(0, 5).map((race) => {
              const days = daysBetween(today, race.race_date);
              return (
                <Group
                  key={race.id}
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                >
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" wrap="nowrap">
                      <Badge
                        variant="filled"
                        color={
                          race.priority === 'A'
                            ? 'red'
                            : race.priority === 'B'
                              ? 'orange'
                              : 'gray'
                        }
                        radius={0}
                      >
                        Tier {race.priority}
                      </Badge>
                      <Text size="sm" fw={500} truncate>
                        {race.name}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {race.race_date} · {days} days out
                    </Text>
                  </Box>
                  <Button
                    size="xs"
                    radius={0}
                    onClick={() => handleAnchor(race)}
                    loading={busy === race.id}
                    disabled={busy !== null}
                  >
                    Anchor plan
                  </Button>
                </Group>
              );
            })}
          </Stack>
          {opMessage && (
            <Alert color="blue" radius={0} icon={<Lightning size={16} />}>
              {opMessage}
            </Alert>
          )}
          {opError && (
            <Alert color="red" radius={0} icon={<WarningCircle size={16} />}>
              {opError}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // ── Anchored: show chain ────────────────────────────────────────────────
  return (
    <Paper p="md" withBorder radius={0}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <CalendarBlank size={20} />
            <Box>
              <Title order={5}>{horizon_event.name}</Title>
              <Text size="xs" c="dimmed">
                {horizon_event.race_date}
                {daysToRace !== null && ` · ${daysToRace} days to go`}
              </Text>
            </Box>
          </Group>
          <Badge
            variant="filled"
            color={
              horizon_event.priority === 'A'
                ? 'red'
                : horizon_event.priority === 'B'
                  ? 'orange'
                  : 'gray'
            }
            radius={0}
          >
            Tier {horizon_event.priority}
          </Badge>
        </Group>

        <Stack gap={6}>
          {blocks.map((block) => {
            const isActive = activeBlock?.id === block.id;
            const isPast = block.end_date < today;
            const length = blockLength(block);
            return (
              <Box
                key={block.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr auto',
                  gap: 12,
                  padding: '6px 8px',
                  borderLeft: `3px solid ${isActive ? 'var(--mantine-color-orange-6)' : isPast ? 'var(--mantine-color-gray-4)' : 'var(--mantine-color-gray-2)'}`,
                  background: isActive
                    ? 'var(--mantine-color-orange-0)'
                    : 'transparent',
                  opacity: isPast ? 0.6 : 1,
                }}
              >
                <Text size="sm" fw={isActive ? 600 : 500}>
                  {BLOCK_LABELS[block.block_type] ?? block.block_type}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDateRange(block.start_date, block.end_date)}
                </Text>
                <Text size="xs" c="dimmed">
                  {length}d{isActive ? ' · now' : ''}
                </Text>
              </Box>
            );
          })}
        </Stack>

        {opMessage && (
          <Alert color="blue" radius={0} icon={<Lightning size={16} />}>
            {opMessage}
          </Alert>
        )}
        {opError && (
          <Alert color="red" radius={0} icon={<WarningCircle size={16} />}>
            {opError}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
