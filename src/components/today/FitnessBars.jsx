import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Skeleton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';

function FitnessBar({ label, value, maxValue, color }) {
  const width = maxValue > 0 ? Math.min((Math.abs(value) / maxValue) * 100, 100) : 0;

  return (
    <Box mb={10}>
      <Group justify="space-between" mb={4}>
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 16,
            fontWeight: 700,
            color,
          }}
        >
          {value > 0 && label === 'FORM' ? `+${value}` : value}
        </Text>
      </Group>
      <Box
        style={{
          height: 6,
          backgroundColor: 'var(--color-bg-secondary)',
          position: 'relative',
        }}
      >
        <Box
          style={{
            height: '100%',
            width: `${width}%`,
            backgroundColor: color,
            transition: 'width 300ms ease',
          }}
        />
      </Box>
    </Box>
  );
}

function FitnessBars({ ctl, atl, tsb, loading }) {
  if (loading) {
    return (
      <Box
        style={{
          border: '0.5px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Skeleton height={14} width={80} mb={10} />
        <Skeleton height={30} mb={8} />
        <Skeleton height={30} mb={8} />
        <Skeleton height={30} />
      </Box>
    );
  }

  const maxValue = Math.max(ctl, atl, Math.abs(tsb), 50);

  return (
    <Box
      style={{
        border: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: 16,
      }}
    >
      <Group justify="space-between" mb={12}>
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
          }}
        >
          FITNESS
        </Text>
        <Button
          component={Link}
          to="/train?tab=trends"
          variant="subtle"
          color="gray"
          size="compact-xs"
          rightSection={<IconChevronRight size={12} />}
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          DETAILS
        </Button>
      </Group>

      <FitnessBar label="CTL" value={ctl} maxValue={maxValue} color="var(--color-teal)" />
      <FitnessBar label="ATL" value={atl} maxValue={maxValue} color="var(--color-orange)" />
      <FitnessBar
        label="FORM"
        value={tsb}
        maxValue={maxValue}
        color={tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)'}
      />
    </Box>
  );
}

export default FitnessBars;
