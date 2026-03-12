/**
 * CheckInRecommendation — Hover-to-reveal recommendation card with accept/dismiss.
 *
 * States:
 * 1. Collapsed: Shows action label only
 * 2. Expanded (hover): Shows detail, reasoning, accept/dismiss buttons
 * 3. Confirming: Shows implication text for chosen action
 * 4. Decided: Shows acknowledgment
 */

import { useState } from 'react';
import { Paper, Text, Group, Button, Stack, Box, Collapse, Transition } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconCheck, IconX, IconBulb, IconArrowRight } from '@tabler/icons-react';
import type { CheckInRecommendation as RecommendationType, DecisionType } from '../../types/checkIn';

interface CheckInRecommendationProps {
  recommendation: RecommendationType;
  onDecision: (decision: DecisionType, summary: string) => Promise<void>;
  existingDecision: DecisionType | null;
}

type CardState = 'idle' | 'confirming_accept' | 'confirming_dismiss' | 'decided';

export default function CheckInRecommendationCard({
  recommendation,
  onDecision,
  existingDecision,
}: CheckInRecommendationProps) {
  const { hovered, ref } = useHover();
  const [state, setState] = useState<CardState>(existingDecision ? 'decided' : 'idle');
  const [decidedAction, setDecidedAction] = useState<DecisionType | null>(existingDecision);
  const [submitting, setSubmitting] = useState(false);

  const isExpanded = hovered || state !== 'idle';

  const handleInitiateAction = (action: DecisionType) => {
    setState(action === 'accept' ? 'confirming_accept' : 'confirming_dismiss');
  };

  const handleConfirm = async () => {
    const decision = state === 'confirming_accept' ? 'accept' : 'dismiss';
    setSubmitting(true);
    try {
      const summary = `${recommendation.action}: ${recommendation.detail}`;
      await onDecision(decision as DecisionType, summary);
      setDecidedAction(decision as DecisionType);
      setState('decided');
    } catch {
      // Revert on error
      setState('idle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setState('idle');
  };

  if (state === 'decided' && decidedAction) {
    const impl = decidedAction === 'accept'
      ? recommendation.implications.accept
      : recommendation.implications.dismiss;

    return (
      <Paper
        p="md"
        withBorder
        style={{
          borderRadius: 0,
          borderLeft: `3px solid ${decidedAction === 'accept' ? 'var(--color-teal)' : 'var(--tribos-border-default)'}`,
        }}
      >
        <Group gap="xs" mb="xs">
          {decidedAction === 'accept' ? (
            <IconCheck size={16} color="var(--color-teal)" />
          ) : (
            <IconX size={16} color="var(--color-text-muted)" />
          )}
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
            {decidedAction === 'accept' ? 'Accepted' : 'Dismissed'}
          </Text>
        </Group>
        <Text size="sm">{impl.full}</Text>
      </Paper>
    );
  }

  return (
    <Paper
      ref={ref}
      p="md"
      withBorder
      style={{
        borderRadius: 0,
        borderLeft: '3px solid var(--color-teal)',
        cursor: 'default',
        transition: 'all 150ms ease',
      }}
    >
      {/* Always visible: action label */}
      <Group gap="xs" mb={isExpanded ? 'sm' : 0}>
        <IconBulb size={16} color="var(--color-teal)" />
        <Text size="sm" fw={600}>
          {recommendation.action}
        </Text>
      </Group>

      {/* Expanded content */}
      <Collapse in={isExpanded}>
        <Stack gap="sm">
          <Text size="sm">{recommendation.detail}</Text>
          <Text size="xs" c="dimmed" fs="italic">
            {recommendation.reasoning}
          </Text>

          {(state === 'confirming_accept' || state === 'confirming_dismiss') ? (
            <Box>
              <Text size="sm" fw={500} mb="xs">
                {state === 'confirming_accept'
                  ? recommendation.implications.accept.short
                  : recommendation.implications.dismiss.short}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  color={state === 'confirming_accept' ? 'teal' : 'gray'}
                  style={{ borderRadius: 0 }}
                  onClick={handleConfirm}
                  loading={submitting}
                  rightSection={<IconArrowRight size={14} />}
                >
                  Confirm
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={handleCancel}
                  disabled={submitting}
                >
                  Back
                </Button>
              </Group>
            </Box>
          ) : (
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="teal"
                style={{ borderRadius: 0 }}
                leftSection={<IconCheck size={14} />}
                onClick={() => handleInitiateAction('accept')}
              >
                Accept
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                style={{ borderRadius: 0 }}
                leftSection={<IconX size={14} />}
                onClick={() => handleInitiateAction('dismiss')}
              >
                Dismiss
              </Button>
            </Group>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
