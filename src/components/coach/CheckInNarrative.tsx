/**
 * CheckInNarrative — Displays the coaching narrative and optional deviation callout.
 */

import { Stack, Text, Paper, Box, Group, Badge } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { PERSONAS } from '../../data/coachingPersonas';
import type { PersonaId } from '../../types/checkIn';

interface CheckInNarrativeProps {
  narrative: string;
  deviationCallout: string | null;
  nextSessionPurpose: string | null;
  personaId: PersonaId;
}

export default function CheckInNarrative({
  narrative,
  deviationCallout,
  nextSessionPurpose,
  personaId,
}: CheckInNarrativeProps) {
  const persona = PERSONAS[personaId];

  return (
    <Stack gap="md">
      {/* Persona badge */}
      <Group gap="xs">
        <Badge
          variant="light"
          color="gray"
          size="sm"
          style={{ borderRadius: 0 }}
        >
          {persona?.name || 'Coach'}
        </Badge>
      </Group>

      {/* Main narrative */}
      <Text size="lg" lh={1.6} style={{ maxWidth: 640 }}>
        {narrative}
      </Text>

      {/* Deviation callout */}
      {deviationCallout && (
        <Paper
          p="md"
          withBorder
          style={{
            borderRadius: 0,
            borderLeft: '3px solid var(--color-orange)',
            borderColor: 'var(--tribos-border-default)',
            borderLeftColor: 'var(--color-orange)',
          }}
        >
          <Group gap="xs" mb="xs">
            <IconAlertTriangle size={16} color="var(--color-orange)" />
            <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
              Deviation
            </Text>
          </Group>
          <Text size="sm" lh={1.5}>
            {deviationCallout}
          </Text>
        </Paper>
      )}

      {/* Next session purpose */}
      {nextSessionPurpose && (
        <Box>
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed" mb={4}>
            Next Session
          </Text>
          <Text size="sm" c="dimmed">
            {nextSessionPurpose}
          </Text>
        </Box>
      )}
    </Stack>
  );
}
