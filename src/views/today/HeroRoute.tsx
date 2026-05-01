/**
 * HeroRoute — the visual anchor of the Today view
 *
 * Shows the selected route's mini-map + elevation profile + meta chip
 * row. If nothing is selected yet (user has no saved routes that match,
 * or the picker is loading), renders a quiet placeholder so the picker
 * below becomes the focal interaction.
 */

import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { Mountains, Path, Ruler } from '@phosphor-icons/react';
import MiniRouteMap from './MiniRouteMap';
import ElevationProfile from './ElevationProfile';
import SendToGarminButton from './SendToGarminButton';
import type { SuggestedRoute } from '../../hooks/useSuggestedRoutes';

interface HeroRouteProps {
  route: SuggestedRoute | null;
  formatDistance?: (km: number | null | undefined) => string;
  formatElevation?: (m: number | null | undefined) => string;
}

function defaultDist(km: number | null | undefined) {
  if (km == null) return '—';
  return `${Math.round(km)} km`;
}

function defaultElev(m: number | null | undefined) {
  if (m == null) return '—';
  return `${Math.round(m)} m`;
}

function Placeholder() {
  return (
    <Box
      style={{
        height: 220,
        background: 'var(--tribos-input)',
        border: '1.5px solid var(--tribos-border-default)',
        borderRadius: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <Path size={28} color="var(--color-text-secondary)" />
      <Text size="sm" c="dimmed" ff="monospace" tt="uppercase" fw={600}>
        Pick a route below
      </Text>
    </Box>
  );
}

function HeroRoute({
  route,
  formatDistance = defaultDist,
  formatElevation = defaultElev,
}: HeroRouteProps) {
  if (!route) {
    return (
      <Box
        component="section"
        style={{
          background: 'var(--tribos-card)',
          border: '1.5px solid var(--tribos-border-default)',
          padding: 16,
          borderRadius: 0,
        }}
      >
        <Stack gap={12}>
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
            Today's Route
          </Text>
          <Placeholder />
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      component="section"
      style={{
        background: 'var(--tribos-card)',
        border: '1.5px solid var(--tribos-border-default)',
        padding: 16,
        borderRadius: 0,
      }}
    >
      <Stack gap={12}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
              Today's Route
            </Text>
            <Title order={3} style={{ marginTop: 0 }}>
              {route.name || 'Untitled route'}
            </Title>
          </Stack>
          <SendToGarminButton route={route} />
        </Group>

        <MiniRouteMap geometry={route.geometry} height={220} />

        <ElevationProfile geometry={route.geometry} height={56} />

        <Group gap="lg" wrap="wrap">
          <Group gap={6}>
            <Ruler size={16} color="var(--color-teal, #2A8C82)" />
            <Text size="sm" ff="monospace">{formatDistance(route.distance_km)}</Text>
          </Group>
          <Group gap={6}>
            <Mountains size={16} color="var(--color-orange, #D4600A)" />
            <Text size="sm" ff="monospace">{formatElevation(route.elevation_gain_m)}</Text>
          </Group>
          {route.surface_type && (
            <Text size="xs" tt="uppercase" ff="monospace" c="dimmed">
              {route.surface_type}
            </Text>
          )}
          {route.route_type && (
            <Text size="xs" tt="uppercase" ff="monospace" c="dimmed">
              {route.route_type}
            </Text>
          )}
        </Group>
      </Stack>
    </Box>
  );
}

export default HeroRoute;
