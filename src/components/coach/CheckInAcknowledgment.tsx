/**
 * CheckInAcknowledgment — One-line coach response after a decision.
 * Shows persona-appropriate acknowledgment text.
 */

import { Paper, Text, Group } from '@mantine/core';
import { IconMessageCheck } from '@tabler/icons-react';
import type { PersonaId, DecisionType } from '../../types/checkIn';

interface CheckInAcknowledgmentProps {
  personaId: PersonaId;
  decision: DecisionType;
}

const ACKNOWLEDGMENTS: Record<string, Record<DecisionType, string>> = {
  hammer: {
    accept: "Good. That's the right call. Now execute it.",
    dismiss: "Your call. But the numbers don't lie — keep that in mind Thursday.",
  },
  scientist: {
    accept: 'Noted. The adjusted stimulus should produce a more favorable adaptation response.',
    dismiss: "Understood. We'll monitor the downstream metrics and reassess if the data warrants it.",
  },
  encourager: {
    accept: "Love that you're being intentional about this. Every smart decision compounds.",
    dismiss: "That's okay — you know your body best. We'll check in again after your next session.",
  },
  pragmatist: {
    accept: 'Makes sense. We\'ll fold that into the rest of the week.',
    dismiss: 'Fair enough. We\'ll see how Thursday goes and adjust from there if needed.',
  },
  competitor: {
    accept: 'Smart move. This keeps you on track for race day.',
    dismiss: "Noted. Just keep your eye on the target — we can't afford too many of these.",
  },
};

export default function CheckInAcknowledgment({ personaId, decision }: CheckInAcknowledgmentProps) {
  const text = ACKNOWLEDGMENTS[personaId]?.[decision]
    || ACKNOWLEDGMENTS.pragmatist[decision];

  return (
    <Paper
      p="sm"
      style={{
        borderRadius: 0,
        background: 'var(--tribos-card)',
        borderLeft: '2px solid var(--color-teal)',
      }}
    >
      <Group gap="xs">
        <IconMessageCheck size={16} color="var(--color-teal)" />
        <Text size="sm" fs="italic" c="dimmed">
          {text}
        </Text>
      </Group>
    </Paper>
  );
}
