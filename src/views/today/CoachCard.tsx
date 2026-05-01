/**
 * CoachCard — persona name + 3–4 sentence coach paragraph
 *
 * Reads the paragraph from /api/fitness-summary?surface=today via
 * useCoachParagraph. Loading shimmer while in flight; quiet fallback
 * + retry on error.
 */

import { Box, Skeleton, Stack, Text } from '@mantine/core';
import type { ParagraphState } from '../../hooks/useCoachParagraph';
import type { PersonaId } from '../../types/checkIn';
import { PERSONAS } from '../../data/coachingPersonas';

interface CoachCardProps {
  personaId: PersonaId;
  paragraph: string | null;
  state: ParagraphState;
}

function CoachCard({ personaId, paragraph, state }: CoachCardProps) {
  const persona = PERSONAS[personaId] ?? PERSONAS.pragmatist;
  const name = (persona?.name || 'YOUR COACH').toUpperCase();

  return (
    <Box
      component="section"
      style={{
        background: 'var(--tribos-card)',
        border: '1.5px solid var(--tribos-border-default)',
        padding: 18,
        borderRadius: 0,
      }}
    >
      <Stack gap={10}>
        <Text
          size="xs"
          fw={700}
          tt="uppercase"
          style={{
            letterSpacing: '0.08em',
            color: 'var(--color-teal, #2A8C82)',
            fontFamily: 'monospace',
          }}
        >
          {name}
        </Text>

        {state === 'loading' && !paragraph ? (
          <Stack gap={6}>
            <Skeleton height={14} width="100%" />
            <Skeleton height={14} width="92%" />
            <Skeleton height={14} width="78%" />
          </Stack>
        ) : state === 'error' && !paragraph ? (
          <Text size="sm" c="dimmed" fs="italic">
            Coach is thinking…
          </Text>
        ) : (
          <Text
            size="md"
            style={{
              fontFamily: 'Barlow, var(--mantine-font-family)',
              lineHeight: 1.5,
              color: 'var(--color-text-primary)',
            }}
          >
            {paragraph}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

export default CoachCard;
