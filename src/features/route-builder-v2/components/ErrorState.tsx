/**
 * ErrorState — Route Builder 2.0 error toast.
 *
 * Dismissable error banner shown when a hook surfaces a failure.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { Warning, X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface ErrorStateProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorState({ message, onDismiss }: ErrorStateProps) {
  return (
    <Box
      data-testid="rb2-error-state"
      role="alert"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.coral}`,
        borderTop: `3px solid ${RB2.coral}`,
        borderRadius: 0,
        padding: '10px 14px',
        boxShadow: RB2.shadowOverlay,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        maxWidth: 480,
        zIndex: 40,
      }}
    >
      <Warning size={16} color={RB2.coral} weight="fill" />
      <Text
        style={{
          fontFamily: RB2_FONT.body,
          fontSize: 13,
          color: RB2.textPrimary,
          flex: 1,
          lineHeight: 1.4,
        }}
      >
        {message}
      </Text>
      <UnstyledButton
        data-testid="rb2-error-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss error"
        style={{ padding: 2 }}
      >
        <X size={14} color={RB2.textTertiary} />
      </UnstyledButton>
    </Box>
  );
}

export default ErrorState;
