/**
 * ChatDrawer — Route Builder 2.0 mobile bottom-sheet chat.
 *
 * Slides up from the bottom on mobile viewports. Default open + at
 * ~55% viewport height. Tap the handle to collapse to a 56px peek.
 * Gesture support (swipe up/down) is out of scope for P1.3.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { ChatCircle, CaretUp, CaretDown } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { ChatBody } from './ChatBody';
import { trackRb2 } from '../telemetry/trackRb2';

export type ChatDrawerState = 'open' | 'peek';

export interface ChatDrawerProps {
  state: ChatDrawerState;
  onStateChange: (next: ChatDrawerState) => void;
}

export function ChatDrawer({ state, onStateChange }: ChatDrawerProps) {
  const open = state === 'open';
  return (
    <Box
      data-testid="rb2-chat-drawer"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        height: open ? '55vh' : 56,
        backgroundColor: RB2.cardBg,
        borderTop: `2px solid ${RB2.teal}`,
        boxShadow: '0 -4px 12px rgba(20, 20, 16, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 200ms ease',
      }}
    >
      <UnstyledButton
        data-testid="rb2-chat-drawer-handle"
        onClick={() => {
          const next: ChatDrawerState = open ? 'peek' : 'open';
          onStateChange(next);
          trackRb2(open ? 'chat_minimized' : 'chat_opened', {});
        }}
        aria-label={open ? 'Collapse chat' : 'Expand chat'}
        style={{
          width: '100%',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: RB2.navDark,
          color: RB2.textInverse,
        }}
      >
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChatCircle size={14} color={RB2.teal} weight="duotone" />
          <Text
            style={{
              fontFamily: RB2_FONT.heading,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Coach Chat
          </Text>
        </Box>
        {open ? (
          <CaretDown size={14} color={RB2.textInverse} />
        ) : (
          <CaretUp size={14} color={RB2.textInverse} />
        )}
      </UnstyledButton>
      {open && <ChatBody fillHeight />}
    </Box>
  );
}

export default ChatDrawer;
