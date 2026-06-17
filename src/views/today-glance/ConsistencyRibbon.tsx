/**
 * ConsistencyRibbon — the one bounded recent-work element allowed on the home
 * glance: a single thin seven-day ribbon (day cells colored by activity type,
 * rest = empty, today = hollow). No map on the home, ever. Optional; must not
 * push the hero above the fold.
 */

import { Box, Group, Text } from '@mantine/core';
import { C, FONT } from './tokens';
import type { ConsistencyDay } from './types';

const KIND_COLOR: Record<ConsistencyDay['kind'], string> = {
  ride: C.teal,
  run: C.orange,
  rest: 'transparent',
  today: 'transparent',
};

export function ConsistencyRibbon({ days }: { days: ConsistencyDay[] }) {
  if (!days.length) return null;
  return (
    <Group gap={10} align="center" mt={4}>
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: C.text3,
        }}
      >
        7-day
      </Text>
      <Group gap={4}>
        {days.map((d) => (
          <Box
            key={d.date}
            title={d.date}
            style={{
              width: 18,
              height: 8,
              backgroundColor: KIND_COLOR[d.kind],
              border:
                d.kind === 'today'
                  ? `1px solid ${C.text3}`
                  : d.kind === 'rest'
                    ? `1px solid ${C.border}`
                    : 'none',
            }}
          />
        ))}
      </Group>
    </Group>
  );
}
