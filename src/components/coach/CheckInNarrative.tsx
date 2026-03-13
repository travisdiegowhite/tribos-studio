import React from 'react';
import { Card, Text, Stack, Badge, Group, Box } from '@mantine/core';
import type { CoachCheckIn } from '../../types/checkIn';
import { COACHING_PERSONAS } from '../../data/coachingPersonas';

interface CheckInNarrativeProps {
  checkIn: CoachCheckIn;
  blockPurpose?: string | null;
}

export function CheckInNarrative({ checkIn, blockPurpose }: CheckInNarrativeProps) {
  const persona = COACHING_PERSONAS[checkIn.persona_id];

  return (
    <Stack gap="md">
      {/* Persona badge */}
      <Group gap="xs">
        <Badge variant="light" color="teal" size="sm" style={{ borderRadius: 0 }}>
          {persona?.name || 'Coach'}
        </Badge>
        <Text size="xs" c="dimmed">
          {new Date(checkIn.generated_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </Group>

      {/* Block purpose callout */}
      {blockPurpose && (
        <Box
          p="sm"
          style={{
            borderLeft: '3px solid var(--mantine-color-teal-6)',
            background: 'var(--mantine-color-teal-0)',
          }}
        >
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={2}>
            This week is for
          </Text>
          <Text size="sm">{blockPurpose}</Text>
        </Box>
      )}

      {/* Main narrative */}
      <Text size="sm" lh={1.6} style={{ whiteSpace: 'pre-line' }}>
        {checkIn.narrative}
      </Text>

      {/* Deviation callout */}
      {checkIn.deviation_callout && (
        <Card
          withBorder
          p="sm"
          style={{
            borderRadius: 0,
            borderLeft: '3px solid var(--mantine-color-orange-6)',
          }}
        >
          <Text size="xs" fw={600} c="orange" tt="uppercase" mb={4}>
            Deviation
          </Text>
          <Text size="sm" lh={1.5}>{checkIn.deviation_callout}</Text>
        </Card>
      )}

      {/* Next session purpose */}
      {checkIn.next_session_purpose && (
        <Box
          p="sm"
          style={{
            borderLeft: '3px solid var(--mantine-color-gray-4)',
          }}
        >
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={2}>
            Next session
          </Text>
          <Text size="sm">{checkIn.next_session_purpose}</Text>
        </Box>
      )}
    </Stack>
  );
}
