/**
 * BeatsColumn — the mobile Today page.
 *
 * Four beats, then the coach, then a disclosure holding the instrument view.
 * Everything above the door is one sentence plus its citation; nothing above
 * the door has an axis, a gridline or a legend.
 *
 * The door's contents are passed in rather than built here so TodaySpine keeps
 * ownership of the spine's interaction state, and so the map inside them stays
 * behind the lazy boundary that keeps mapbox-gl off this page's load.
 */

import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { Box, Skeleton, Stack, Text } from '@mantine/core';
import { buildBeats } from './buildBeats';
import { Beat1Recap } from './Beat1Recap';
import { Beat3Call } from './Beat3Call';
import { Beat4Route } from './Beat4Route';
import { C, FONT } from '../tokens';
import type { UnitsPreference } from '../units';
import type { SpineData } from '../types';
import type { Feel } from './types';

interface BeatsColumnProps {
  data: SpineData;
  units: UnitsPreference;
  /** The instrument view revealed by the numbers door. */
  numbers: ReactNode;
  /**
   * The Beat 2 answer. Always null until PR 2 adds the control — Beat 3's
   * flat/strong copy already exists and is tested, it simply has no way to be
   * selected yet.
   */
  feel?: Feel | null;
}

export function BeatsColumn({ data, units, numbers, feel = null }: BeatsColumnProps) {
  const [showNumbers, setShowNumbers] = useState(false);
  const beats = useMemo(() => buildBeats(data, feel, units), [data, feel, units]);

  return (
    <Stack gap={14}>
      <Beat1Recap vm={beats.beat1} />
      <Beat3Call vm={beats.beat3} personaName={data.coach.personaName} />
      <Beat4Route vm={beats.beat4} />

      <Box style={{ paddingTop: 4 }}>
        <Text
          component="button"
          type="button"
          onClick={() => setShowNumbers((open) => !open)}
          aria-expanded={showNumbers}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: FONT.mono,
            fontSize: 11,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: C.text3,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {showNumbers ? 'Hide the numbers' : 'See the numbers'}
        </Text>
      </Box>

      {showNumbers && (
        <Suspense fallback={<Skeleton height={220} radius={0} />}>
          <Stack gap={14}>{numbers}</Stack>
        </Suspense>
      )}
    </Stack>
  );
}
