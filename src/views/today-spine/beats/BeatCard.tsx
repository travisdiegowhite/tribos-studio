/**
 * The shared card shell for a beat: a flat sheet with a 2px accent rule on
 * top and a sentence-case label. Kept in one place so the four beats can't
 * drift apart on padding or border weight.
 */

import type { ReactNode } from 'react';
import { Box, Stack, Text } from '@mantine/core';
import { C, FONT } from '../tokens';

interface BeatCardProps {
  /** Sentence-case label, e.g. 'Last ride'. */
  label: string;
  /** Colour of the 2px rule across the top of the card. */
  accent: string;
  children: ReactNode;
}

export function BeatCard({ label, accent, children }: BeatCardProps) {
  return (
    <Box style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${accent}`, padding: '13px 16px 16px' }}>
      <Text style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10 }}>
        {label}
      </Text>
      <Stack gap={12}>{children}</Stack>
    </Box>
  );
}

/** The beat's sentence. The one thing on the card that is not a citation. */
export function BeatSentence({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: FONT.mono,
        fontSize: 21,
        fontWeight: 400,
        lineHeight: 1.35,
        color: C.text,
      }}
    >
      {children}
    </Text>
  );
}
