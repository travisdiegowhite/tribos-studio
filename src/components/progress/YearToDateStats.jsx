import { Box, Text, SimpleGrid, Skeleton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

function YearToDateStats({ ytdStats, formatDist, formatElev, formatTime, loading }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (loading) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Skeleton height={12} width={100} mb={12} />
        <SimpleGrid cols={2} spacing="sm">
          {[1, 2, 3, 4].map((i) => (
            <Box key={i}>
              <Skeleton height={10} width={60} mb={4} />
              <Skeleton height={20} width={80} />
            </Box>
          ))}
        </SimpleGrid>
      </Box>
    );
  }

  const { totalRides = 0, totalDistance = 0, totalElevation = 0, totalTime = 0 } = ytdStats || {};

  const cells = [
    {
      label: 'RIDES',
      value: String(totalRides),
    },
    {
      label: 'DISTANCE',
      value: formatDist ? formatDist(totalDistance / 1000) : `${Math.round(totalDistance / 1000)} km`,
    },
    {
      label: 'ELEVATION',
      value: formatElev ? formatElev(totalElevation) : `${Math.round(totalElevation)} m`,
    },
    {
      label: 'MOVING TIME',
      value: formatTime ? formatTime(totalTime) : `${Math.round(totalTime / 3600)}h`,
    },
  ];

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: 16,
      }}
    >
      <Text
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          marginBottom: 14,
        }}
      >
        YEAR TO DATE
      </Text>

      <SimpleGrid cols={2} spacing="sm">
        {cells.map((cell) => (
          <Box key={cell.label}>
            <Text
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 2,
              }}
            >
              {cell.label}
            </Text>
            <Text
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                lineHeight: 1.2,
              }}
            >
              {cell.value}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

export default YearToDateStats;
