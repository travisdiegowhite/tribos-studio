/**
 * LoadingState — Route Builder 2.0 loading overlay.
 *
 * Banner-style overlay shown when a generation or edit is in flight.
 */

import { Box, Text, Loader } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Generating route…' }: LoadingStateProps) {
  return (
    <Box
      data-testid="rb2-loading-state"
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: RB2.navDark,
        color: RB2.textInverse,
        borderRadius: 0,
        padding: '8px 14px',
        boxShadow: RB2.shadowOverlay,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        zIndex: 40,
      }}
    >
      <Loader size="xs" color="teal" />
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 13,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {message}
      </Text>
    </Box>
  );
}

export default LoadingState;
