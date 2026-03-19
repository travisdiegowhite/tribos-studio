import { Box, Group, Text, Stack } from '@mantine/core';

const ZONE_COLORS = {
  1: '#8CBFA8',  // Recovery - sage green
  2: '#2A8C82',  // Endurance - teal
  3: '#D4A843',  // Tempo - gold
  4: '#C4784A',  // Threshold - terracotta
  5: '#9E5A3C',  // VO2max - coral
  6: '#7A3A2A',  // Anaerobic - deep coral
};

const ZONE_NAMES = {
  1: 'RECOVERY',
  2: 'ENDURANCE',
  3: 'TEMPO',
  4: 'THRESHOLD',
  5: 'VO2MAX',
  6: 'ANAEROBIC',
};

function ZoneDistributionRow({ zones, totalTime }) {
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
          No zone data available. Ride with a power meter to see your distribution.
        </Text>
      </Box>
    );
  }

  const maxPercent = Math.max(...zones.map(z => z.percentage || 0), 1);

  return (
    <Stack gap={8}>
      {zones.filter(z => z.zone >= 1 && z.zone <= 6).map((zone) => {
        const color = ZONE_COLORS[zone.zone] || '#666';
        const name = ZONE_NAMES[zone.zone] || `Z${zone.zone}`;
        const barWidth = maxPercent > 0 ? (zone.percentage / maxPercent) * 100 : 0;

        return (
          <Group key={zone.zone} gap="sm" wrap="nowrap" align="center">
            {/* Zone label */}
            <Text
              style={{
                fontFamily: "'DM Mono', monospace",
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
                fontFamily: "'Barlow Condensed', sans-serif",
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
                fontFamily: "'DM Mono', monospace",
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
                fontFamily: "'DM Mono', monospace",
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
        );
      })}
    </Stack>
  );
}

export default ZoneDistributionRow;
