/**
 * RouteSuggestionPicker — three chips below the hero
 *
 * The three top-ranked routes for today's workout. Tapping a chip
 * selects it; the choice persists for the day via useSuggestedRoutes.
 */

import { Group, UnstyledButton, Stack, Text } from '@mantine/core';
import type { SuggestedRoute } from '../../hooks/useSuggestedRoutes';

interface RouteSuggestionPickerProps {
  suggestions: SuggestedRoute[];
  selectedRouteId: string | null;
  onSelect: (routeId: string) => void;
  formatDistance?: (km: number | null | undefined) => string;
}

function defaultFormatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  return `${Math.round(km)} km`;
}

function RouteSuggestionPicker({
  suggestions,
  selectedRouteId,
  onSelect,
  formatDistance = defaultFormatDistance,
}: RouteSuggestionPickerProps) {
  if (!suggestions.length) return null;

  return (
    <Group gap="xs" wrap="wrap">
      {suggestions.map((route) => {
        const isSelected = route.id === selectedRouteId;
        return (
          <UnstyledButton
            key={route.id}
            onClick={() => onSelect(route.id)}
            style={{
              padding: '10px 14px',
              border: isSelected
                ? '2px solid var(--color-teal, #2A8C82)'
                : '1.5px solid var(--tribos-border-default)',
              background: isSelected ? 'var(--color-teal-subtle)' : 'var(--tribos-card)',
              borderRadius: 0,
              minWidth: 140,
              flex: '1 1 140px',
              textAlign: 'left',
            }}
            aria-pressed={isSelected}
          >
            <Stack gap={2}>
              <Text size="sm" fw={isSelected ? 600 : 500} lineClamp={1}>
                {route.name || 'Untitled route'}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                {formatDistance(route.distance_km)}
                {route.elevation_gain_m != null ? ` · ${Math.round(route.elevation_gain_m)} m` : ''}
              </Text>
            </Stack>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}

export default RouteSuggestionPicker;
