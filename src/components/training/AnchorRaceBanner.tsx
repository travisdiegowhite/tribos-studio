/**
 * AnchorRaceBanner
 *
 * Shown at the top of the planner / dashboard when a user has an upcoming
 * A or B priority race but no active sequencer chain anchored to it. CTA
 * calls /api/sequencer-event-anchored-init via useEventAnchoredPlan().
 *
 * Hidden when:
 *   - The event_anchored_planner feature flag is off
 *   - A sequence is already active
 *   - The user has dismissed the banner for this race id (localStorage)
 *   - There is no upcoming A/B priority race
 */

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Anchor as AnchorIcon, Trophy, X } from '@phosphor-icons/react';
import { useEventAnchoredPlan } from '../../hooks/useEventAnchoredPlan';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';

const DISMISS_KEY = 'tribos.anchorBanner.dismissedRaceId';

function readDismissedId(): string | null {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(DISMISS_KEY)
      : null;
  } catch {
    return null;
  }
}

function writeDismissedId(id: string) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, id);
    }
  } catch {
    // localStorage may be unavailable; ignore.
  }
}

export default function AnchorRaceBanner() {
  const enabled = useFeatureFlag('event_anchored_planner');
  const { sequence_id, upcomingRaces, loading, anchorPlan } =
    useEventAnchoredPlan();

  const [dismissedId, setDismissedId] = useState<string | null>(() =>
    readDismissedId()
  );
  const [anchoring, setAnchoring] = useState(false);

  // Pick the soonest A/B priority upcoming race the user hasn't dismissed.
  const target = useMemo(() => {
    return (
      upcomingRaces.find(
        (r) =>
          (r.priority === 'A' || r.priority === 'B') && r.id !== dismissedId
      ) ?? null
    );
  }, [upcomingRaces, dismissedId]);

  if (!enabled) return null;
  if (loading) return null;
  if (sequence_id) return null;
  if (!target) return null;

  const handleAnchor = async () => {
    setAnchoring(true);
    try {
      const result = await anchorPlan(target.id, false);
      if (result?.ok) {
        notifications.show({
          title: 'Plan Anchored',
          message: `Your training plan is now anchored to ${target.name}.`,
          color: 'terracotta',
        });
      } else {
        notifications.show({
          title: 'Could not anchor plan',
          message:
            result?.detail || result?.error || 'Please try again.',
          color: 'yellow',
        });
      }
    } finally {
      setAnchoring(false);
    }
  };

  const handleDismiss = () => {
    writeDismissedId(target.id);
    setDismissedId(target.id);
  };

  const daysUntil = (() => {
    try {
      const d = new Date(target.race_date + 'T00:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  })();

  return (
    <Paper p="md" withBorder radius={0} mb="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Trophy size={16} />
            <Badge variant="light" color="orange" radius={0}>
              Coach Intel
            </Badge>
          </Group>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<X size={12} />}
            onClick={handleDismiss}
          >
            Dismiss
          </Button>
        </Group>

        <Box>
          <Text size="sm" fw={500}>
            Anchor your training plan to your next race
          </Text>
          <Group gap="xs" mt={4} wrap="nowrap">
            <Badge
              size="sm"
              color={target.priority === 'A' ? 'red' : 'orange'}
              variant="filled"
            >
              {target.priority}
            </Badge>
            <Text size="sm" lineClamp={1}>
              {target.name}
            </Text>
            <Text size="xs" c="dimmed">
              {new Date(target.race_date + 'T00:00:00').toLocaleDateString(
                'en-US',
                { month: 'short', day: 'numeric', year: 'numeric' }
              )}
              {daysUntil != null ? ` • ${daysUntil} days` : ''}
            </Text>
          </Group>
        </Box>

        <Group gap="xs" justify="flex-end">
          <Button
            size="xs"
            leftSection={<AnchorIcon size={14} />}
            onClick={handleAnchor}
            loading={anchoring}
            radius={0}
          >
            Anchor plan to {target.name}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
