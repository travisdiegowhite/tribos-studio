/**
 * The shared card shell for a beat: the brand's flat, square-cornered surface
 * with a small mono eyebrow. Kept in one place so the four beats can't drift
 * apart on padding or border weight.
 */

import type { ReactNode } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { C, FONT } from '../tokens';

interface BeatCardProps {
  /** Mono eyebrow, e.g. 'LAST RIDE'. */
  label: string;
  /** 5×5 marker color beside the eyebrow. */
  accent: string;
  children: ReactNode;
}

export function BeatCard({ label, accent, children }: BeatCardProps) {
  return (
    <Box style={{ background: C.card, border: `1.5px solid ${C.border}`, padding: '13px 16px 16px' }}>
      <Group gap={9} align="center" style={{ marginBottom: 10 }}>
        <span style={{ width: 5, height: 5, background: accent, display: 'inline-block' }} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: C.text }}>
          {label}
        </Text>
      </Group>
      <Stack gap={12}>{children}</Stack>
    </Box>
  );
}

/** The beat's sentence. The one thing on the card that is not a citation. */
export function BeatSentence({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: FONT.body,
        fontSize: 17,
        fontWeight: 500,
        lineHeight: 1.4,
        color: C.text,
      }}
    >
      {children}
    </Text>
  );
}
