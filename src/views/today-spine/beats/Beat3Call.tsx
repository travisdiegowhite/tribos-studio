/**
 * Beat 3 — here's what to do. The one prescriptive surface on the page, which
 * is why it carries the coach's name: prescriptions belong to the coach layer
 * (see the register note in src/utils/todayVocabulary.ts).
 */

import { Text } from '@mantine/core';
import { BeatCard, BeatSentence } from './BeatCard';
import { WorkoutSilhouette } from './glyphs/WorkoutSilhouette';
import { C, FONT } from '../tokens';
import type { Beat3VM } from './types';

interface Beat3CallProps {
  vm: Beat3VM;
  personaName: string;
}

export function Beat3Call({ vm, personaName }: Beat3CallProps) {
  return (
    <BeatCard label="TODAY'S CALL" accent={C.orange}>
      <BeatSentence>{vm.line}</BeatSentence>
      <WorkoutSilhouette session={vm.session} />
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: C.text3,
        }}
      >
        {personaName}
      </Text>
    </BeatCard>
  );
}
