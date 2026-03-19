import { Box, Group, Text, Skeleton, SimpleGrid } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

function StatusBar({ ctl, atl, tsb, weekRides, weekPlanned, loading }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (loading) {
    return (
      <SimpleGrid cols={isMobile ? 2 : 4} spacing={0}>
        {[1, 2, 3, 4].map((i) => (
          <Box
            key={i}
            style={{
              padding: '14px 16px',
              border: '0.5px solid var(--color-border)',
            }}
          >
            <Skeleton height={12} width={60} mb={6} />
            <Skeleton height={24} width={40} />
          </Box>
        ))}
      </SimpleGrid>
    );
  }

  const cells = [
    {
      label: 'FORM',
      value: tsb > 0 ? `+${tsb}` : String(tsb),
      color: tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)',
    },
    {
      label: 'FITNESS',
      value: String(ctl),
      color: 'var(--color-teal)',
    },
    {
      label: 'FATIGUE',
      value: String(atl),
      color: 'var(--color-orange)',
    },
    {
      label: 'THIS WEEK',
      value: `${weekRides}/${weekPlanned}`,
      color: 'var(--color-teal)',
    },
  ];

  return (
    <SimpleGrid cols={isMobile ? 2 : 4} spacing={0}>
      {cells.map((cell) => (
        <Box
          key={cell.label}
          style={{
            padding: '14px 16px',
            border: '0.5px solid var(--color-border)',
            backgroundColor: 'var(--color-card)',
          }}
        >
          <Text
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 4,
            }}
          >
            {cell.label}
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 20,
              fontWeight: 700,
              color: cell.color,
              lineHeight: 1.2,
            }}
          >
            {cell.value}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
  );
}

export default StatusBar;
