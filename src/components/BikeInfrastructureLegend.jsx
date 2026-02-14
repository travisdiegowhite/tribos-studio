/**
 * BikeInfrastructureLegend
 * Collapsible legend showing bike infrastructure color coding
 */

import { useState } from 'react';
import { Box, Text, Paper, ActionIcon, Collapse, Stack } from '@mantine/core';
import { IconInfoCircle, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { tokens } from '../theme';
import { INFRASTRUCTURE_LEGEND } from './BikeInfrastructureLayer';

/**
 * Line swatch component showing solid or dashed line
 */
function LineSwatch({ color, style }) {
  return (
    <svg width="24" height="12" style={{ flexShrink: 0 }}>
      <line
        x1="0"
        y1="6"
        x2="24"
        y2="6"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={style === 'dashed' ? '4,4' : 'none'}
      />
    </svg>
  );
}

/**
 * BikeInfrastructureLegend Component
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether the legend should be shown
 */
export default function BikeInfrastructureLegend({ visible = true }) {
  const [expanded, setExpanded] = useState(false);

  if (!visible) {
    return null;
  }

  return (
    <Paper
      shadow="md"
      style={{
        position: 'absolute',
        top: 70,
        right: 16,
        zIndex: 10,
        backgroundColor: 'var(--tribos-bg-secondary)',
        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
        borderRadius: tokens.radius.md,
        overflow: 'hidden',
        minWidth: expanded ? 180 : 'auto',
      }}
    >
      {/* Header - always visible */}
      <Box
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <IconInfoCircle size={16} color={'var(--tribos-terracotta-500)'} />
        <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
          Bike Infrastructure
        </Text>
        <ActionIcon
          variant="subtle"
          size="xs"
          style={{ marginLeft: 'auto' }}
        >
          {expanded ? (
            <IconChevronDown size={14} color={'var(--tribos-text-secondary)'} />
          ) : (
            <IconChevronUp size={14} color={'var(--tribos-text-secondary)'} />
          )}
        </ActionIcon>
      </Box>

      {/* Legend items - collapsible */}
      <Collapse in={expanded}>
        <Box
          style={{
            padding: '0 12px 12px 12px',
            borderTop: `1px solid ${'var(--tribos-bg-tertiary)'}`,
          }}
        >
          <Stack gap={6} mt={8}>
            {INFRASTRUCTURE_LEGEND.map((item) => (
              <Box
                key={item.type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <LineSwatch color={item.color} style={item.style} />
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  {item.label}
                </Text>
              </Box>
            ))}
          </Stack>
          <Text
            size="xs"
            mt={8}
            style={{
              color: tokens.colors.textTertiary,
              fontStyle: 'italic',
            }}
          >
            Data from OpenStreetMap
          </Text>
        </Box>
      </Collapse>
    </Paper>
  );
}
