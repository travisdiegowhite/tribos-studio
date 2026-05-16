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
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '20px 24px',
        maxWidth: 380,
        boxShadow: RB2.shadowOverlay,
        pointerEvents: 'auto',
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
        Open the Generate panel to start with goal + duration, or describe
        what you want in the chat.
      </Text>
    </Box>
  );
}

export default EmptyState;
