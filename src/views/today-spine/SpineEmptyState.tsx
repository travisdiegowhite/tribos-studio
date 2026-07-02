/**
 * SpineEmptyState — first-run replacement for the training arc when the
 * account has no ride history yet (SpineData.hasHistory === false). Without
 * this, a data-less account renders a plausible-looking dashboard of zeros
 * (CTL 0, FORM +0, black map) that reads as broken rather than empty.
 */

import type { CSSProperties } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { C, FONT } from './tokens';

const actionStyle: CSSProperties = {
  display: 'inline-block',
  border: `1.5px solid ${C.navy}`,
  fontFamily: FONT.mono,
  fontSize: 10,
  letterSpacing: '2px',
  padding: '9px 16px',
  textDecoration: 'none',
};

export function SpineEmptyState() {
  return (
    <Box
      style={{
        background: C.card,
        border: `1.5px solid ${C.teal}`,
        boxShadow: '0 1px 3px rgba(20,16,8,.07),0 4px 12px rgba(20,16,8,.05)',
        padding: '36px 28px 32px',
        textAlign: 'center',
      }}
    >
      <Text style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 500, letterSpacing: '2px', color: C.teal, marginBottom: 10 }}>
        02 · TRAINING ARC
      </Text>
      <Text
        style={{
          fontFamily: FONT.heading,
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: C.text,
          marginBottom: 8,
        }}
      >
        No training history yet
      </Text>
      <Text style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 1.55, color: C.text2, maxWidth: 460, margin: '0 auto 20px' }}>
        Connect Strava, Garmin, or Wahoo — or log your first ride — and your training arc builds
        itself: six weeks of fitness behind you, your plan and goal event ahead.
      </Text>
      <Group justify="center" gap={10}>
        <Box component={Link} to="/settings" style={{ ...actionStyle, background: C.navy, color: '#fff' }}>
          CONNECT A SERVICE
        </Box>
        <Box component={Link} to="/ride/new" style={{ ...actionStyle, background: 'transparent', color: C.navy }}>
          PLAN A RIDE
        </Box>
      </Group>
    </Box>
  );
}
