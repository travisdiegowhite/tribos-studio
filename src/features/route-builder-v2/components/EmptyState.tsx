/**
 * EmptyState — Route Builder 2.0 empty state.
 *
 * Shown when no route is loaded. Suggests the form panel or chat as
 * the entry point. For guests (root now lands signed-out visitors
 * directly here, no landing page first), it also carries the one-line
 * identity + "no account needed" reassurance, with a link to the
 * marketing page at /welcome for anyone who wants the full pitch.
 */

import { Box, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { ArrowUpLeft } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface EmptyStateProps {
  /** True when there is no session — shows the guest identity/reassurance lines. */
  isGuest?: boolean;
}

export function EmptyState({ isGuest = false }: EmptyStateProps) {
  return (
    <Box
      data-testid="rb2-empty-state"
      style={{
        // Anchored near the bottom (not dead-center) so it never covers the
        // spot users click to drop their first waypoint. pointerEvents: 'none'
        // makes the card click-through too — it's purely informational, so map
        // clicks pass straight through its footprint (the guest "What is
        // tribos?" link re-enables pointer events on itself only).
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
      {isGuest && (
        <Text
          data-testid="rb2-empty-state-kicker"
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: RB2.textTertiary,
            marginBottom: 8,
          }}
        >
          Tribos — AI route builder for cyclists
        </Text>
      )}
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
      {isGuest && (
        <Text
          data-testid="rb2-empty-state-guest-note"
          style={{
            fontFamily: RB2_FONT.body,
            fontSize: 12,
            color: RB2.textTertiary,
            marginTop: 10,
          }}
        >
          Free to try — no account needed.{' '}
          <Text
            component={Link}
            to="/welcome"
            style={{
              fontSize: 12,
              color: RB2.teal,
              textDecoration: 'underline',
              pointerEvents: 'auto',
            }}
          >
            What is tribos?
          </Text>
        </Text>
      )}
    </Box>
  );
}

export default EmptyState;
