/**
 * Beat 4 — need a route for that? One button, with the session's duration
 * pre-filled as a route constraint. The smart constraint-to-route engine is a
 * later project; the link still closes the loop.
 */

import { Box, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { BeatCard } from './BeatCard';
import { C, FONT } from '../tokens';
import type { Beat4VM } from './types';

export function Beat4Route({ vm }: { vm: Beat4VM }) {
  return (
    <BeatCard label="Route" accent={C.gold}>
      <Text style={{ fontFamily: FONT.body, fontSize: 15, color: C.text2 }}>{vm.prompt}</Text>
      <Box
        component={Link}
        to={vm.href}
        style={{
          display: 'inline-block',
          alignSelf: 'flex-start',
          border: `1.5px solid ${C.navy}`,
          background: vm.state === 'route' ? C.navy : 'transparent',
          color: vm.state === 'route' ? 'var(--color-bg)' : C.navy,
          fontFamily: FONT.body,
          fontSize: 14,
          fontWeight: 500,
          textDecoration: 'none',
          padding: '10px 18px',
        }}
      >
        {vm.ctaLabel}
      </Box>
    </BeatCard>
  );
}
