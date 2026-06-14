/**
 * EmptyState — Route Builder 2.0 empty state.
 *
 * Shown when no route is loaded. Suggests the form panel or chat as
 * the entry point.
 */

import { Box, Text } from '@mantine/core';
import { ArrowUpLeft } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export function EmptyState() {
  return (
    <Box
      data-testid="rb2-empty-state"
      style={{
        // Anchored near the bottom (not dead-center) so it never covers the
        // spot users click to drop their first waypoint. pointerEvents: 'none'
        // makes the card click-through too — it's purely informational, so map
        // clicks pass straight through its footprint.
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '20px 24px',
        maxWidth: 380,
        boxShadow: RB2.shadowOverlay,
        pointerEvents: 'none',
        textAlign: 'center',
      }}
    >
      <ArrowUpLeft size={20} color={RB2.teal} weight="duotone" />
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 22,
          fontWeight: 700,
          color: RB2.textPrimary,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginTop: 8,
          marginBottom: 6,
        }}
      >
        Build your first route
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.body,
          fontSize: 14,
          color: RB2.textSecondary,
          lineHeight: 1.5,
        }}
      >
        Click the map to drop waypoints and draw your own line — or open the
        Generate panel for a goal-based route, or just describe it in the chat.
      </Text>
    </Box>
  );
}

export default EmptyState;
