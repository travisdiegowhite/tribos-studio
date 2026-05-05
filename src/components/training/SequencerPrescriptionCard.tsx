/**
 * SequencerPrescriptionCard
 *
 * TODAY-screen surface for the event-anchored planner (Phase 1).
 * Replaces the legacy template-based workout card when feature flag
 * `event_anchored_planner` is enabled.
 *
 * Shows:
 *   - Block context badge (e.g., "Day 3 of 21 · Maintenance")
 *   - Prescribed session type, duration, target RSS
 *   - Interval breakdown (if any)
 *   - Gating notice when the session was substituted server-side
 */

import {
  Alert,
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useSequencerToday } from '../../hooks/useSequencerToday';
import {
  Coffee,
  Lightning,
  PersonSimpleWalk,
  Pulse,
  WarningCircle,
} from '@phosphor-icons/react';

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

const SESSION_LABELS: Record<string, string> = {
  rest: 'Rest',
  z1: 'Easy Z1',
  z2: 'Endurance Z2',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2: 'VO2 Max',
  race_sim: 'Race Simulation',
  opener: 'Opener',
};

function sessionIcon(session_type: string) {
  switch (session_type) {
    case 'rest':
      return Coffee;
    case 'z1':
    case 'z2':
      return PersonSimpleWalk;
    case 'tempo':
    case 'threshold':
      return Pulse;
    case 'vo2':
    case 'race_sim':
    case 'opener':
      return Lightning;
    default:
      return Pulse;
  }
}

export default function SequencerPrescriptionCard() {
  const { prescription, block, gating, loading, error } = useSequencerToday();

  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed" size="sm">Loading today's prescription…</Text>
      </Paper>
    );
  }

  if (error === 'not_initialized') {
    return (
      <Paper p="md" withBorder>
        <Stack gap="xs">
          <Title order={4}>Welcome to the new planner</Title>
          <Text size="sm" c="dimmed">
            Your block-based plan hasn't been set up yet. Open the coach to
            initialize maintenance mode.
          </Text>
        </Stack>
      </Paper>
    );
  }

  if (error || !prescription || !block) {
    return (
      <Paper p="md" withBorder>
        <Alert color="red" icon={<WarningCircle size={16} />}>
          Couldn't load today's prescription{error ? `: ${error}` : '.'}
        </Alert>
      </Paper>
    );
  }

  const Icon = sessionIcon(prescription.session_type);
  const sessionLabel = SESSION_LABELS[prescription.session_type] ?? prescription.session_type;
  const blockLabel = BLOCK_LABELS[block.block_type] ?? block.block_type;

  return (
    <Paper p="md" withBorder radius={0}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Badge variant="light" color="orange" radius={0}>
            Day {block.days_in} of {block.block_total_days} · {blockLabel}
          </Badge>
          {block.parent_event_tier && (
            <Badge variant="filled" color="red" radius={0}>
              Anchored to Tier {block.parent_event_tier} race
            </Badge>
          )}
        </Group>

        <Group align="flex-start" gap="md">
          <ThemeIcon size={48} variant="light" radius={0}>
            <Icon size={28} />
          </ThemeIcon>
          <Box style={{ flex: 1 }}>
            <Title order={3}>{sessionLabel}</Title>
            <Group gap="xl" mt={4}>
              <Text size="sm" c="dimmed">
                {prescription.target_rss} RSS
              </Text>
              <Text size="sm" c="dimmed">
                {prescription.target_duration_min} min
              </Text>
              {prescription.long_ride_flag && (
                <Badge size="xs" radius={0}>Long ride</Badge>
              )}
            </Group>
          </Box>
        </Group>

        {prescription.notes && (
          <Text size="sm">{prescription.notes}</Text>
        )}

        {prescription.prescribed_intervals && prescription.prescribed_intervals.length > 0 && (
          <Box>
            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>
              Intervals
            </Text>
            <Stack gap={4}>
              {prescription.prescribed_intervals.map((iv, i) => (
                <Text size="sm" key={i}>
                  {iv.repeats}× {iv.duration_min} min @ {iv.target_pct_ftp_min}–{iv.target_pct_ftp_max}% FTP
                  {iv.recovery_min ? `, ${iv.recovery_min} min recovery` : ''}
                  {iv.notes ? ` — ${iv.notes}` : ''}
                </Text>
              ))}
            </Stack>
          </Box>
        )}

        {gating.gated && gating.reason && (
          <Alert
            color="yellow"
            radius={0}
            icon={<WarningCircle size={16} />}
            title="Session adjusted"
          >
            {gating.reason}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
