/**
 * RunReachPanel — Control panel for the Run Reach (road network reachability) feature.
 * Lets users configure mode, pace, time, and out-and-back settings.
 * Follows the same floating panel pattern as POIPanel.
 */

import {
  Box, Text, Group, Stack, ActionIcon, Badge, SegmentedControl,
  NumberInput, Switch, Slider, Loader, Tooltip,
} from '@mantine/core';
import { IconX, IconRun, IconBike } from '@tabler/icons-react';
import { tokens } from '../theme';
import {
  PACE_PRESETS, CYCLING_PRESETS, REACH_COLORS,
  formatDistance, formatPace,
} from '../utils/isochroneService';

/**
 * @param {Object}   props
 * @param {'running'|'cycling'} props.mode
 * @param {Function} props.onModeChange
 * @param {number}   props.paceMinPerMile
 * @param {Function} props.onPaceChange
 * @param {number}   props.speedMph
 * @param {Function} props.onSpeedChange
 * @param {number}   props.timeMinutes
 * @param {Function} props.onTimeChange
 * @param {boolean}  props.outAndBack
 * @param {Function} props.onOutAndBackChange
 * @param {number}   props.maxDistanceMeters  - calculated max distance
 * @param {boolean}  props.loading
 * @param {'valhalla'|'mapbox'|'none'} props.source
 * @param {boolean}  props.hasOrigin - whether an origin point is set
 * @param {Function} props.onClose
 * @param {Function} props.onSetOrigin - trigger "click to set origin" mode
 */
export default function RunReachPanel({
  mode = 'running',
  onModeChange,
  paceMinPerMile = 8.5,
  onPaceChange,
  speedMph = 15,
  onSpeedChange,
  timeMinutes = 30,
  onTimeChange,
  outAndBack = true,
  onOutAndBackChange,
  maxDistanceMeters = 0,
  loading = false,
  source = 'none',
  hasOrigin = false,
  onClose,
  onSetOrigin,
}) {
  const presets = mode === 'running' ? PACE_PRESETS : CYCLING_PRESETS;
  const currentValue = mode === 'running' ? paceMinPerMile : speedMph;
  const onValueChange = mode === 'running' ? onPaceChange : onSpeedChange;

  return (
    <Box
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderRadius: tokens.radius.md,
        border: '1px solid var(--tribos-bg-tertiary)',
        overflow: 'hidden',
        width: 320,
        maxHeight: 480,
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="sm"
        py="xs"
        style={{ borderBottom: '1px solid var(--tribos-bg-tertiary)' }}
      >
        <Group gap={6}>
          {mode === 'running' ? <IconRun size={16} /> : <IconBike size={16} />}
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Run Reach
          </Text>
          {loading && <Loader size={14} color="green" />}
          {source === 'mapbox' && !loading && (
            <Tooltip label="Using polygon fallback (Valhalla unavailable)">
              <Badge size="xs" variant="light" color="yellow">fallback</Badge>
            </Tooltip>
          )}
        </Group>
        <ActionIcon size="sm" variant="subtle" onClick={onClose} color="gray">
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs" px="sm" py="xs">
        {/* Mode toggle */}
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={onModeChange}
          data={[
            { label: 'Running', value: 'running' },
            { label: 'Cycling', value: 'cycling' },
          ]}
          fullWidth
        />

        {/* Pace / Speed presets */}
        <Box>
          <Text size="xs" c="dimmed" mb={4}>
            {mode === 'running' ? 'Pace' : 'Speed'}
          </Text>
          <Group gap={4} wrap="wrap">
            {presets.map(preset => (
              <Badge
                key={preset.label}
                size="sm"
                variant={currentValue === preset.value ? 'filled' : 'light'}
                color={currentValue === preset.value ? 'green' : 'gray'}
                style={{ cursor: 'pointer' }}
                onClick={() => onValueChange(preset.value)}
              >
                {preset.label} ({preset.description})
              </Badge>
            ))}
          </Group>
        </Box>

        {/* Custom pace/speed input */}
        <NumberInput
          size="xs"
          label={mode === 'running' ? 'Custom pace (min/mi)' : 'Custom speed (mph)'}
          value={currentValue}
          onChange={onValueChange}
          min={mode === 'running' ? 4 : 5}
          max={mode === 'running' ? 16 : 35}
          step={0.5}
          decimalScale={1}
        />

        {/* Time slider */}
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">Time</Text>
            <Text size="xs" fw={500}>{timeMinutes} min</Text>
          </Group>
          <Slider
            size="sm"
            value={timeMinutes}
            onChange={onTimeChange}
            min={5}
            max={120}
            step={5}
            marks={[
              { value: 15, label: '15' },
              { value: 30, label: '30' },
              { value: 60, label: '60' },
              { value: 90, label: '90' },
            ]}
            color="green"
          />
        </Box>

        {/* Out-and-back toggle */}
        <Group justify="space-between" mt={4}>
          <Box>
            <Text size="xs" fw={500}>Out-and-back</Text>
            <Text size="xs" c="dimmed">
              {outAndBack ? 'Shows turnaround distance' : 'Shows one-way distance'}
            </Text>
          </Box>
          <Switch
            size="sm"
            checked={outAndBack}
            onChange={(e) => onOutAndBackChange(e.currentTarget.checked)}
            color="green"
          />
        </Group>

        {/* Distance result */}
        {maxDistanceMeters > 0 && (
          <Box
            p="xs"
            style={{
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: tokens.radius.sm,
              textAlign: 'center',
            }}
          >
            <Text size="lg" fw={700} style={{ color: '#22c55e' }}>
              {formatDistance(maxDistanceMeters)}
            </Text>
            <Text size="xs" c="dimmed">
              {outAndBack ? 'max turnaround distance' : 'max one-way distance'}
              {' '}at {mode === 'running' ? formatPace(paceMinPerMile) : `${speedMph} mph`}
            </Text>
          </Box>
        )}

        {/* Set origin instruction */}
        {!hasOrigin && (
          <Box
            p="xs"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: tokens.radius.sm,
              border: '1px dashed rgba(59, 130, 246, 0.3)',
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={onSetOrigin}
          >
            <Text size="sm" fw={500} c="blue">
              Click the map to set your starting point
            </Text>
          </Box>
        )}

        {/* Color legend */}
        {hasOrigin && maxDistanceMeters > 0 && (
          <Box>
            <Text size="xs" c="dimmed" mb={4}>Distance from start</Text>
            <Box
              style={{
                height: 8,
                borderRadius: 4,
                background: `linear-gradient(to right, ${REACH_COLORS.map(c => c.color).join(', ')})`,
              }}
            />
            <Group justify="space-between" mt={2}>
              <Text size="xs" c="dimmed">0</Text>
              <Text size="xs" c="dimmed">{formatDistance(maxDistanceMeters / 2)}</Text>
              <Text size="xs" c="dimmed">{formatDistance(maxDistanceMeters)}</Text>
            </Group>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
