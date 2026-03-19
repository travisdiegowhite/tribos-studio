import { Box, Group, Text, Progress, Skeleton } from '@mantine/core';

function WeekChart({ weekStats, loading, formatDist, formatElev }) {
  if (loading) {
    return (
      <Box
        style={{
          border: '0.5px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Skeleton height={14} width={100} mb={10} />
        <Skeleton height={8} mb={14} />
        <Skeleton height={40} />
      </Box>
    );
  }

  const { rides = 0, planned = 5, distance = 0, elevation = 0 } = weekStats || {};
  const completion = Math.min((rides / Math.max(planned, 1)) * 100, 100);

  return (
    <Box
      style={{
        border: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: 16,
      }}
    >
      <Group justify="space-between" mb={10}>
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
          }}
        >
          THIS WEEK
        </Text>
        <Text
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--color-teal)',
          }}
        >
          {rides}/{planned} RIDES
        </Text>
      </Group>

      <Progress
        value={completion}
        color="teal"
        size="sm"
        radius={0}
        mb={14}
      />

      <Group gap="xl">
        <Box>
          <Text
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 2,
            }}
          >
            DISTANCE
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            {formatDist ? formatDist(distance) : `${Math.round(distance)} km`}
          </Text>
        </Box>
        <Box>
          <Text
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 2,
            }}
          >
            ELEVATION
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            {formatElev ? formatElev(elevation) : `${Math.round(elevation)} m`}
          </Text>
        </Box>
      </Group>
    </Box>
  );
}

export default WeekChart;
