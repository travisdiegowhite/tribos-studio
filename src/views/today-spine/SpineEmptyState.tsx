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
  fontFamily: FONT.body,
  fontSize: 14,
  fontWeight: 500,
  padding: '9px 16px',
  textDecoration: 'none',
};

export function SpineEmptyState() {
  return (
    <Box
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        padding: '36px 28px 32px',
        textAlign: 'center',
      }}
    >
      <Text style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: 600, color: C.text3, marginBottom: 10 }}>
        Your training arc
      </Text>
      <Text
        style={{
          fontFamily: FONT.heading,
          textTransform: 'uppercase',
          fontWeight: 900,
          fontSize: 30,
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
        <Box component={Link} to="/settings" style={{ ...actionStyle, background: C.navy, color: 'var(--color-bg)' }}>
          Connect a service
        </Box>
        <Box component={Link} to="/ride/new" style={{ ...actionStyle, background: 'transparent', color: C.navy }}>
          Plan a ride
        </Box>
      </Group>
    </Box>
  );
}
