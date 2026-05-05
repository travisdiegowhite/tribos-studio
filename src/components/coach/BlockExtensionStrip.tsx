/**
 * BlockExtensionStrip
 *
 * Coach Intel Strip surface for the event-anchored planner. Phase 1 surfaces
 * block-extension/compression explanations from /api/coach-block-modifications.
 *
 * Visual pattern mirrors CorrectionProposalCard.tsx:
 *   idle  → confirming → decided
 * Two actions: acknowledge (dismiss) and dispute (Phase 4 hook).
 *
 * One modification at a time; FIFO. Strip hides itself when nothing is unread.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { Check, Lightning, Question } from '@phosphor-icons/react';
import { useAuth } from '../../contexts/AuthContext';

interface BlockModification {
  id: string;
  block_id: string;
  modified_at: string;
  modified_by: 'system' | 'user';
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  acknowledged: boolean;
}

type StripState = 'idle' | 'confirming' | 'decided';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function BlockExtensionStrip() {
  const { user } = useAuth();
  const [items, setItems] = useState<BlockModification[]>([]);
  const [state, setState] = useState<StripState>('idle');
  const [submitting, setSubmitting] = useState(false);

  const fetchUnread = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `/api/coach-block-modifications?user_id=${encodeURIComponent(user.id)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.modifications ?? []);
      setState('idle');
    } catch (err) {
      console.error('[BlockExtensionStrip] fetch failed', err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchUnread]);

  const handleAction = useCallback(
    async (modificationId: string, action: 'acknowledge' | 'dispute') => {
      if (!user?.id) return;
      setSubmitting(true);
      setState('confirming');
      try {
        const res = await fetch('/api/coach-block-modifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            modification_id: modificationId,
            action,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setState('decided');
        // Optimistic remove
        setItems((prev) => prev.filter((m) => m.id !== modificationId));
        // Re-fetch in case more modifications queued up
        setTimeout(fetchUnread, 600);
      } catch (err) {
        console.error('[BlockExtensionStrip] action failed', err);
        setState('idle');
      } finally {
        setSubmitting(false);
      }
    },
    [user?.id, fetchUnread]
  );

  if (items.length === 0) return null;

  const top = items[0];

  return (
    <Paper p="md" withBorder radius={0} mb="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Lightning size={16} />
            <Badge variant="light" color="orange" radius={0}>
              Coach Intel
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {new Date(top.modified_at).toLocaleString()}
          </Text>
        </Group>

        <Box>
          <Text size="sm">{top.reason}</Text>
        </Box>

        {state !== 'decided' && (
          <Group gap="xs" justify="flex-end">
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Question size={14} />}
              disabled={submitting}
              onClick={() => handleAction(top.id, 'dispute')}
              radius={0}
            >
              Push back
            </Button>
            <Button
              size="xs"
              leftSection={<Check size={14} />}
              disabled={submitting}
              onClick={() => handleAction(top.id, 'acknowledge')}
              radius={0}
            >
              Got it
            </Button>
          </Group>
        )}

        {items.length > 1 && (
          <Text size="xs" c="dimmed">
            {items.length - 1} more update{items.length === 2 ? '' : 's'} after this.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
