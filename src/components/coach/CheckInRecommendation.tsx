import React, { useState } from 'react';
import { Card, Text, Stack, Group, Button, Box, Collapse } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { CheckInRecommendation as RecommendationType, PersonaId } from '../../types/checkIn';

interface CheckInRecommendationProps {
  recommendation: RecommendationType;
  personaId: PersonaId;
  onAccept: () => void;
  onDismiss: () => void;
  decided: boolean;
}

export function CheckInRecommendation({
  recommendation,
  personaId,
  onAccept,
  onDismiss,
  decided,
}: CheckInRecommendationProps) {
  const [hovered, setHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (decided) {
    return null;
  }

  return (
    <Card
      withBorder
      p="md"
      style={{
        borderRadius: 0,
        borderLeft: '3px solid var(--tribos-terracotta-500, #C4704B)',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={() => {
        setHovered(true);
        setShowDetails(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setShowDetails(!showDetails)}
    >
      <Stack gap="sm">
        {/* Header — always visible */}
        <Group justify="space-between" wrap="nowrap">
          <Box>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={2}>
              Recommendation
            </Text>
            <Text fw={600} size="sm">{recommendation.action}</Text>
          </Box>
        </Group>

        {/* Detail — revealed on hover/click */}
        <Collapse in={showDetails}>
          <Stack gap="sm">
            <Text size="sm" lh={1.5}>{recommendation.detail}</Text>
            <Text size="xs" c="dimmed" fs="italic">{recommendation.reasoning}</Text>

            {/* Accept/Dismiss buttons with implications */}
            <Group gap="xs" mt="xs">
              <Button
                variant="filled"
                color="teal"
                size="xs"
                leftSection={<IconCheck size={14} />}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onAccept();
                }}
                style={{ borderRadius: 0, flex: 1 }}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                color="gray"
                size="xs"
                leftSection={<IconX size={14} />}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                style={{ borderRadius: 0, flex: 1 }}
              >
                Dismiss
              </Button>
            </Group>

            {/* Implication text */}
            <Group gap="lg" wrap="nowrap">
              <Box style={{ flex: 1 }}>
                <Text size="xs" c="teal" fw={500}>{recommendation.implications.accept.short}</Text>
              </Box>
              <Box style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" fw={500}>{recommendation.implications.dismiss.short}</Text>
              </Box>
            </Group>
          </Stack>
        </Collapse>

        {!showDetails && (
          <Text size="xs" c="dimmed">Hover or tap to see details</Text>
        )}
      </Stack>
    </Card>
  );
}
