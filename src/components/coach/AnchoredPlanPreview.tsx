/**
 * AnchoredPlanPreview — confirmable preview of an event-anchored sequencer plan.
 *
 * The sequencer analogue of TrainingPlanPreview. Renders the race-anchored block
 * chain + the first ~14 days of sessions returned by /api/coach's
 * `anchoredPlanPreview` (a no-write preview from `buildAnchoredPreview`). Nothing
 * is persisted until the athlete taps "Anchor plan", which calls the real write
 * path (`anchorPlan` → /api/sequencer-event-anchored-init).
 */

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CalendarCheck, Flag, X } from '@phosphor-icons/react';
import { useEventAnchoredPlan } from '../../hooks/useEventAnchoredPlan';

interface AnchoredPlanPreviewProps {
  preview: any;
  onDismiss?: () => void;
  compact?: boolean;
}

const BLOCK_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  reactivation: 'Reactivation',
  aerobic_build: 'Aerobic Build',
  threshold: 'Threshold',
  vo2: 'VO2 Max',
  race_specific: 'Race-Specific',
  taper: 'Taper',
};

const SESSION_LABELS: Record<string, string> = {
  rest: 'Rest',
  z1: 'Recovery (Z1)',
  z2: 'Endurance (Z2)',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2: 'VO2 Max',
  race_specific: 'Race-Specific',
};

function titleize(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function daysUntil(dateStr: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const ms = new Date(dateStr + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function fmtShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function AnchoredPlanPreview({ preview, onDismiss, compact = false }: AnchoredPlanPreviewProps) {
  const { anchorPlan } = useEventAnchoredPlan();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!preview || preview.ok === false) return null;

  const event = preview.horizon_event ?? {};
  const blocks: any[] = preview.blocks ?? [];
  const prescriptions: any[] = preview.prescriptions ?? [];
  const warnings: any[] = (preview.validation_messages ?? []).filter(
    (m: any) => m.level === 'warning' || m.level === 'error'
  );

  const handleConfirm = async () => {
    if (submitting || !preview.race_goal_id) return;
    setSubmitting(true);
    try {
      const result = await anchorPlan(preview.race_goal_id, true);
      if (!result.ok) {
        notifications.show({
          title: 'Could not anchor plan',
          message: result.detail || result.error || 'Please try again.',
          color: 'red',
        });
        return;
      }
      setDone(true);
      notifications.show({
        title: 'Plan anchored',
        message: `Your block plan to ${event.name ?? 'your race'} is on the calendar.`,
        color: 'sage',
      });
      // Refresh the dashboard's plan/calendar surfaces.
      window.dispatchEvent(
        new CustomEvent('training-plan-activated', { detail: { sequenceId: result.sequence_id } })
      );
    } catch (err: any) {
      notifications.show({
        title: 'Could not anchor plan',
        message: err?.message || 'Please try again.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper
      p={compact ? 'sm' : 'md'}
      mt="xs"
      withBorder
      style={{ borderRadius: 0, borderColor: 'var(--tribos-border-subtle, #DDDDD8)' }}
    >
      <Stack gap={compact ? 'xs' : 'sm'}>
        {/* Header */}
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={6} wrap="nowrap">
            <Flag size={16} weight="fill" color="var(--tribos-terracotta, #9E5A3C)" />
            <Box>
              <Text size="sm" fw={700}>
                {event.name ?? 'Race plan'}
              </Text>
              <Text size="xs" c="dimmed">
                {event.race_date ? `${fmtShort(event.race_date)} · ${daysUntil(event.race_date)} days out` : ''}
                {preview.chain_used?.length ? ` · ${preview.chain_used.map((c: string) => BLOCK_LABELS[c] ?? titleize(c)).join(' → ')}` : ''}
              </Text>
            </Box>
          </Group>
          {event.tier ? (
            <Badge size="sm" variant="light" color="terracotta">
              {event.tier} race
            </Badge>
          ) : null}
        </Group>

        {/* Validation warnings (e.g. "Skipped aerobic_build — race only N days out") */}
        {warnings.length > 0 && (
          <Stack gap={2}>
            {warnings.map((w: any, i: number) => (
              <Text key={i} size="xs" c={w.level === 'error' ? 'red' : 'yellow.8'}>
                ⚠ {w.message}
              </Text>
            ))}
          </Stack>
        )}

        {/* Block chain */}
        <Stack gap={4}>
          {blocks.map((b: any, i: number) => (
            <Group key={i} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="xs" fw={600}>
                {BLOCK_LABELS[b.block_type] ?? titleize(b.block_type)}
              </Text>
              <Text size="xs" c="dimmed">
                {fmtShort(b.start_date)} – {fmtShort(b.end_date)} · {b.duration_days}d
              </Text>
            </Group>
          ))}
        </Stack>

        {/* Next ~2 weeks of sessions */}
        {prescriptions.length > 0 && (
          <>
            <Divider label="Next 14 days" labelPosition="left" />
            <ScrollArea.Autosize mah={compact ? 160 : 220}>
              <Stack gap={2}>
                {prescriptions.map((p: any, i: number) => (
                  <Group key={i} justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="xs" c="dimmed" style={{ minWidth: 80 }}>
                      {fmtShort(p.date)}
                    </Text>
                    <Text size="xs" style={{ flex: 1 }}>
                      {SESSION_LABELS[p.session_type] ?? titleize(p.session_type)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {p.session_type === 'rest'
                        ? '—'
                        : `${p.target_rss ?? 0} RSS${p.target_duration_min ? ` · ${p.target_duration_min}m` : ''}`}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </>
        )}

        {/* Actions */}
        <Group gap="xs" mt={4}>
          <Button
            size="compact-sm"
            color="terracotta"
            leftSection={submitting ? <Loader size={12} color="white" /> : <CalendarCheck size={14} />}
            onClick={handleConfirm}
            disabled={submitting || done}
          >
            {done ? 'Anchored' : 'Anchor plan'}
          </Button>
          {onDismiss && !done && (
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              leftSection={<X size={14} />}
              onClick={onDismiss}
              disabled={submitting}
            >
              Dismiss
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

export default AnchoredPlanPreview;
