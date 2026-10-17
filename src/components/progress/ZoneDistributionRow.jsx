import { Box, Group, Text, Stack, Tooltip } from '@mantine/core';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import { getRouteZoneColor } from '../ui/zoneColors';


const ZONE_NAMES = {
  1: 'RECOVERY',
  2: 'ENDURANCE',
  3: 'TEMPO',
  4: 'THRESHOLD',
  5: 'VO2MAX',
  6: 'ANAEROBIC',
};

function ZoneDistributionRow({
  zones,
  totalTime,
  emptyText = 'No zone data available. Ride with a power meter to see your distribution.',
}) {
  if (!zones || zones.length === 0) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 20,
          textAlign: 'center',
        }}
      >
        <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
          {emptyText}
        </Text>
      </Box>
    );
  }

  const maxPercent = Math.max(...zones.map(z => z.percentage || 0), 1);

  return (
    <Stack gap={8}>
      {zones.filter(z => z.zone >= 1 && z.zone <= 6).map((zone) => {
        const color = getRouteZoneColor(zone.zone);
        const name = ZONE_NAMES[zone.zone] || `Z${zone.zone}`;
        const barWidth = maxPercent > 0 ? (zone.percentage / maxPercent) * 100 : 0;

        const zoneDescription = TRAINING_ZONES[zone.zone]?.description;
        return (
          <Tooltip
            key={zone.zone}
            label={zoneDescription ? `${name.charAt(0)}${name.slice(1).toLowerCase()} — ${zoneDescription}` : name}
            withArrow
            multiline
            w={280}
          >
          <Group gap="sm" wrap="nowrap" align="center">
            {/* Zone label */}
            <Text
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 700,
                color,
                width: 22,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              Z{zone.zone}
            </Text>

            {/* Bar */}
            <Box style={{ flex: 1, position: 'relative', height: 20 }}>
              <Box
                style={{
                  height: '100%',
                  backgroundColor: 'var(--color-bg-secondary)',
                  position: 'absolute',
                  inset: 0,
                }}
              />
              <Box
                style={{
                  height: '100%',
                  width: `${barWidth}%`,
                  backgroundColor: color,
                  position: 'relative',
                  transition: 'width 400ms ease',
                  minWidth: zone.percentage > 0 ? 4 : 0,
                }}
              />
            </Box>

            {/* Zone name */}
            <Text
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '1.5px',
                color: 'var(--color-text-muted)',
                width: 80,
                flexShrink: 0,
              }}
            >
              {name}
            </Text>

            {/* Percentage and time */}
            <Text
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                width: 40,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {Math.round(zone.percentage)}%
            </Text>
            <Text
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-muted)',
                width: 50,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {zone.hours || '0:00'}
            </Text>
          </Group>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

export default ZoneDistributionRow;
