/**
 * CoachTake — the persona-labeled coach take box, shared by the normal rail
 * (GlanceRail) and the no-plan rail (SuggestedRail). The take itself streams in
 * via the deferred coachPromise (/api/fitness-summary) under <Suspense>.
 */

import { Suspense, use } from 'react';
import { Box, Group, Skeleton, Text } from '@mantine/core';
import { Sparkle } from '@phosphor-icons/react';
import { C, FONT } from './tokens';

function CoachTakeText({ coachPromise }: { coachPromise: Promise<string | null> }) {
  const take = use(coachPromise);
  return (
    <Text style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 1.5, color: C.text2 }}>
      {take ?? 'Your coach is warming up — log a few rides for a daily take.'}
    </Text>
  );
}

interface CoachTakeBoxProps {
  coachPromise: Promise<string | null>;
  personaName: string;
}

export function CoachTakeBox({ coachPromise, personaName }: CoachTakeBoxProps) {
  return (
    <Box style={{ backgroundColor: '#FBF6F2', borderLeft: `3px solid ${C.teal}`, padding: '10px 12px' }}>
      <Group gap={6} mb={4} align="center">
        <Sparkle size={12} color={C.teal} weight="fill" />
        <Text
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: C.teal,
          }}
        >
          Coach · {personaName}
        </Text>
      </Group>
      <Suspense fallback={<Skeleton height={36} radius={0} />}>
        <CoachTakeText coachPromise={coachPromise} />
      </Suspense>
    </Box>
  );
}
