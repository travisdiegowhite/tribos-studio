import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Skeleton, Tooltip } from '@mantine/core';
import { CaretRight } from '@phosphor-icons/react';
import { translateCTL, translateATL, translateTSB, colorToVar } from '../../lib/fitness/translate';
import { METRIC_TOOLTIPS } from '../../lib/fitness/tooltips';

function FitnessBar({ label, value, maxValue, color, statusLabel, statusColor, tooltip }) {
  const width = maxValue > 0 ? Math.min((Math.abs(value) / maxValue) * 100, 100) : 0;

  const bar = (
    <Box mb={10} style={{ cursor: tooltip ? 'help' : 'default' }}>
      <Group justify="space-between" mb={4}>
        <Group gap={8} align="center">
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
          {statusLabel && (
            <Text
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                color: statusColor,
              }}
            >
              {statusLabel}
            </Text>
          )}
        </Group>
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

  if (tooltip) {
    return (
      <Tooltip
        label={tooltip}
        multiline
        w={280}
        withArrow
        position="right"
        styles={{
          tooltip: {
            fontSize: 13,
            lineHeight: 1.5,
            padding: '10px 14px',
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          },
        }}
      >
        {bar}
      </Tooltip>
    );
  }

  return bar;
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
          rightSection={<CaretRight size={12} />}
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

      <FitnessBar
        label="CTL"
        value={ctl}
        maxValue={maxValue}
        color="var(--color-teal)"
        statusLabel={translateCTL(ctl).label}
        statusColor={colorToVar(translateCTL(ctl).color)}
        tooltip={METRIC_TOOLTIPS.ctl(ctl)}
      />
      <FitnessBar
        label="ATL"
        value={atl}
        maxValue={maxValue}
        color="var(--color-orange)"
        statusLabel={translateATL(atl, ctl).label}
        statusColor={colorToVar(translateATL(atl, ctl).color)}
        tooltip={METRIC_TOOLTIPS.atl(atl, ctl)}
      />
      <FitnessBar
        label="FORM"
        value={tsb}
        maxValue={maxValue}
        color={tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)'}
        statusLabel={translateTSB(tsb).label}
        statusColor={colorToVar(translateTSB(tsb).color)}
        tooltip={METRIC_TOOLTIPS.tsb(tsb)}
      />
    </Box>
  );
}

export default FitnessBars;
