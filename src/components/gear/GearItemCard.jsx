import { Card, Text, Group, Badge, Progress, Stack, Box } from '@mantine/core';
import { IconBike, IconRun } from '@tabler/icons-react';
import { formatDistance } from '../../utils/units';
import { RUNNING_SHOE_THRESHOLDS } from './gearConstants';

/**
 * Card displaying a single gear item (bike or shoes).
 */
export default function GearItemCard({ gear, onClick, useImperial = true }) {
  const distanceKm = (gear.total_distance_logged || 0) / 1000;
  const isRetired = gear.status === 'retired';
  const isShoes = gear.gear_type === 'shoes';
  const Icon = gear.gear_type === 'bike' ? IconBike : IconRun;

  // Shoe progress bar
  const shoeProgress = isShoes
    ? Math.min(100, ((gear.total_distance_logged || 0) / RUNNING_SHOE_THRESHOLDS.replace) * 100)
    : 0;

  const shoeProgressColor = shoeProgress >= 100 ? 'red' : shoeProgress >= 87.5 ? 'yellow' : 'teal';

  // Component alert count for bikes
  const activeComponents = (gear.gear_components || []).filter(c => c.status === 'active');

  return (
    <Card
      shadow="sm"
      padding="md"
      withBorder
      onClick={onClick}
      style={{
        cursor: 'pointer',
        opacity: isRetired ? 0.6 : 1,
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Icon
              size={20}
              color="var(--tribos-terracotta-500)"
              stroke={1.5}
            />
            <Box style={{ minWidth: 0 }}>
              <Text fw={500} truncate>{gear.name}</Text>
              {(gear.brand || gear.model) && (
                <Text size="xs" c="dimmed" truncate>
                  {[gear.brand, gear.model].filter(Boolean).join(' ')}
                </Text>
              )}
            </Box>
          </Group>
          <Group gap={4}>
            {gear.is_default && (
              <Badge size="xs" variant="light" color="terracotta">Default</Badge>
            )}
            {isRetired && (
              <Badge size="xs" variant="light" color="gray">Retired</Badge>
            )}
          </Group>
        </Group>

        <Group justify="space-between">
          <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
            {formatDistance(distanceKm, useImperial, 0)}
          </Text>
          {!isShoes && activeComponents.length > 0 && (
            <Text size="xs" c="dimmed">
              {activeComponents.length} component{activeComponents.length !== 1 ? 's' : ''}
            </Text>
          )}
        </Group>

        {isShoes && !isRetired && (
          <Progress
            value={shoeProgress}
            color={shoeProgressColor}
            size="sm"
            radius="xl"
          />
        )}
      </Stack>
    </Card>
  );
}
