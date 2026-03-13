import React from 'react';
import { Box, Text } from '@mantine/core';
import type { CheckInDecisionType, PersonaId } from '../../types/checkIn';
import { COACHING_PERSONAS } from '../../data/coachingPersonas';

interface CheckInAcknowledgmentProps {
  decision: CheckInDecisionType;
  personaId: PersonaId;
}

export function CheckInAcknowledgment({ decision, personaId }: CheckInAcknowledgmentProps) {
  const persona = COACHING_PERSONAS[personaId];
  if (!persona) return null;

  const responses = decision === 'accept' ? persona.acknowledgments.accept : persona.acknowledgments.dismiss;
  // Pick a consistent response based on a simple hash of the decision type
  const response = responses[0];

  return (
    <Box
      p="sm"
      style={{
        borderLeft: `3px solid ${decision === 'accept' ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-gray-5)'}`,
      }}
    >
      <Text size="sm" fs="italic" c="dimmed">
        {response}
      </Text>
    </Box>
  );
}
