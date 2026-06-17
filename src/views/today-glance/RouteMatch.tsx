/**
 * RouteMatch — the route line of the rail: matched route name, distance, and
 * the match-% badge (reusing the existing "100% MATCH" concept). Consumes the
 * deferred route via use(), so it streams in under its own <Suspense>.
 */

import { use } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { C, FONT } from './tokens';
import { formatDistanceKm, type UnitsPreference } from './units';
import type { HeroState, TodayRoute } from './types';

interface RouteMatchProps {
  routePromise: Promise<TodayRoute | null>;
  units: UnitsPreference;
  heroState: HeroState;
}

export function RouteMatch({ routePromise, units, heroState }: RouteMatchProps) {
  const route = use(routePromise);

  if (!route) {
    return (
      <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text3, fontStyle: 'italic' }}>
        No matched route yet
      </Text>
    );
  }

  // matchPct >= 75 → matched (teal); otherwise a generated, training-aware route.
  const isMatched = heroState !== 'generated' && route.matchPct >= 75;
  const badgeText = isMatched ? `${Math.round(route.matchPct)}% MATCH` : 'GENERATED';
  const badgeBg = isMatched ? C.teal : C.gold;

  return (
    <Box>
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: C.text3,
          marginBottom: 4,
        }}
      >
        Route
      </Text>
      <Group gap={10} align="baseline">
        <Text style={{ fontFamily: FONT.heading, fontSize: 17, fontWeight: 600, color: C.text }}>
          {route.name}
        </Text>
        <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text3 }}>
          {formatDistanceKm(route.distanceKm, units)}
        </Text>
        <Box
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#FFFFFF',
            backgroundColor: badgeBg,
            padding: '2px 6px',
          }}
        >
          {badgeText}
        </Box>
      </Group>
    </Box>
  );
}
