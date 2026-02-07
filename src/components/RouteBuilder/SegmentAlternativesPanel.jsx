/**
 * SegmentAlternativesPanel — Shows 2-3 alternative route options for a
 * selected segment with stats comparison and apply/preview actions.
 */

import { Box, Text, Badge, Group, Stack, Button, ActionIcon, Tooltip, Loader, Divider } from '@mantine/core';
import { IconArrowRight, IconX, IconMountain, IconRuler, IconClock, IconCheck } from '@tabler/icons-react';
import { tokens } from '../../theme';

/**
 * @param {Object}   props
 * @param {Array}    props.alternatives      Alternative objects from generateSegmentAlternatives
 * @param {boolean}  props.loading           Whether alternatives are loading
 * @param {number}   props.hoveredIndex      Index of alternative being hovered/previewed
 * @param {Function} props.onHover           Called with index when user hovers a card (null on leave)
 * @param {Function} props.onApply           Called with alternative object to replace the segment
 * @param {Function} props.onClose           Close the panel
 * @param {Object}   props.currentSegment    Stats for the current segment {distanceKm, elevationGain}
 */
export default function SegmentAlternativesPanel({
  alternatives,
  loading,
  hoveredIndex,
  onHover,
  onApply,
  onClose,
  currentSegment,
}) {
  return (
    <Box
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderRadius: tokens.radius.md,
        border: '1px solid var(--tribos-bg-tertiary)',
        overflow: 'hidden',
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
          <IconArrowRight size={16} color="var(--tribos-lime)" />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Segment Alternatives
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" onClick={onClose} color="gray">
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {/* Current segment reference */}
      {currentSegment && (
        <Box px="sm" py={6} style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap={12}>
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Current:</Text>
            <Group gap={6}>
              <IconRuler size={12} color="var(--tribos-text-muted)" />
              <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                {currentSegment.distanceKm} km
              </Text>
            </Group>
            {currentSegment.elevationGain > 0 && (
              <Group gap={6}>
                <IconMountain size={12} color="var(--tribos-text-muted)" />
                <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                  {Math.round(currentSegment.elevationGain)}m
                </Text>
              </Group>
            )}
          </Group>
        </Box>
      )}

      <Divider color="var(--tribos-bg-tertiary)" />

      {/* Alternatives list */}
      <Box style={{ padding: tokens.spacing.xs }}>
        {loading ? (
          <Box py="lg" style={{ textAlign: 'center' }}>
            <Loader size={24} color="lime" />
            <Text size="xs" mt="xs" style={{ color: 'var(--tribos-text-muted)' }}>
              Finding alternative routes…
            </Text>
          </Box>
        ) : alternatives.length === 0 ? (
          <Text size="xs" ta="center" py="md" style={{ color: 'var(--tribos-text-muted)' }}>
            No alternatives found for this segment.
          </Text>
        ) : (
          <Stack gap={6}>
            {alternatives.map((alt, i) => {
              const distDelta = currentSegment
                ? (alt.distanceKm - currentSegment.distanceKm)
                : null;
              const elevDelta = (currentSegment && alt.elevationGain && currentSegment.elevationGain)
                ? (alt.elevationGain - currentSegment.elevationGain)
                : null;
              const isHovered = hoveredIndex === i;

              return (
                <Box
                  key={alt.id}
                  onMouseEnter={() => onHover?.(i)}
                  onMouseLeave={() => onHover?.(null)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: tokens.radius.sm,
                    border: `2px solid ${isHovered ? alt.color : 'transparent'}`,
                    backgroundColor: isHovered ? alt.color + '12' : 'var(--tribos-bg-tertiary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    {/* Label + source badge */}
                    <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: alt.color,
                          flexShrink: 0,
                        }}
                      />
                      <Text
                        size="sm"
                        fw={600}
                        lineClamp={1}
                        style={{ color: 'var(--tribos-text-primary)' }}
                      >
                        {alt.label}
                      </Text>
                    </Group>

                    {/* Apply button */}
                    <Tooltip label="Use this route">
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color="lime"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApply?.(alt);
                        }}
                      >
                        <IconCheck size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  {/* Stats row */}
                  <Group gap={12} mt={4}>
                    <Group gap={4}>
                      <IconRuler size={12} color="var(--tribos-text-muted)" />
                      <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                        {alt.distanceKm} km
                      </Text>
                      {distDelta != null && distDelta !== 0 && (
                        <Text
                          size="xs"
                          fw={500}
                          style={{ color: distDelta > 0 ? tokens.colors.zone4 : 'var(--tribos-lime)' }}
                        >
                          {distDelta > 0 ? '+' : ''}{distDelta.toFixed(1)}
                        </Text>
                      )}
                    </Group>

                    {alt.elevationGain > 0 && (
                      <Group gap={4}>
                        <IconMountain size={12} color="var(--tribos-text-muted)" />
                        <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                          {Math.round(alt.elevationGain)}m
                        </Text>
                        {elevDelta != null && elevDelta !== 0 && (
                          <Text
                            size="xs"
                            fw={500}
                            style={{ color: elevDelta > 0 ? tokens.colors.zone4 : 'var(--tribos-lime)' }}
                          >
                            {elevDelta > 0 ? '+' : ''}{Math.round(elevDelta)}m
                          </Text>
                        )}
                      </Group>
                    )}

                    {alt.durationMin > 0 && (
                      <Group gap={4}>
                        <IconClock size={12} color="var(--tribos-text-muted)" />
                        <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                          {alt.durationMin}m
                        </Text>
                      </Group>
                    )}
                  </Group>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
