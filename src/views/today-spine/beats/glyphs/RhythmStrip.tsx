/**
 * RhythmStrip — the rolling seven days, ride or rest, colored by effort.
 *
 * Deliberately unlabeled: no weekday letters, no dates. That is what keeps it
 * date-agnostic (spec D7) and what stops it from growing into a chart. If it
 * ever wants an axis, delete it.
 *
 * Same cell geometry as the glance's ConsistencyRibbon so the two surfaces
 * read as one system.
 */

import { Box, Group, Text } from '@mantine/core';
import { C, FONT } from '../../tokens';
import { tierColor } from '../effortColor';
import type { RhythmDay } from '../types';

export function RhythmStrip({ days }: { days: RhythmDay[] }) {
  if (!days.length) return null;
  return (
    <Group gap={10} align="center" data-testid="rhythm-strip">
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
            data-testid={d.tier ? 'rhythm-ride' : 'rhythm-rest'}
            style={{
              width: 18,
              height: 8,
              backgroundColor: d.tier ? tierColor(d.tier) : 'transparent',
              border: d.tier ? 'none' : `1px solid ${d.isToday ? C.text3 : C.border}`,
            }}
          />
        ))}
      </Group>
    </Group>
  );
}
