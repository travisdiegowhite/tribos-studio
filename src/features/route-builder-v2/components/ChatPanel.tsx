/**
 * ChatPanel — Route Builder 2.0 desktop floating chat window.
 *
 * Renders in the lower-right of the page. Default open + expanded.
 * Has minimize and close controls. P1.3 chat body is a hardcoded
 * placeholder; P1.4 wires real conversation state.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { Minus, X, ChatCircle } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { ChatBody } from './ChatBody';
import type { ChatMessage } from '../chat/types';
import { trackRb2 } from '../telemetry/trackRb2';

export type ChatPanelState = 'open' | 'minimized' | 'closed';

export interface ChatPanelProps {
  state: ChatPanelState;
  onStateChange: (next: ChatPanelState) => void;
  messages: ChatMessage[];
  isProcessing: boolean;
  exampleHint: readonly string[];
  showAfterRefuseHint: boolean;
  onSubmit: (text: string) => void;
}

export function ChatPanel({
  state,
  onStateChange,
  messages,
  isProcessing,
  exampleHint,
  showAfterRefuseHint,
  onSubmit,
}: ChatPanelProps) {
  if (state === 'closed') {
    return (
      <Box
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 50,
        }}
      >
        <UnstyledButton
          data-testid="rb2-chat-open"
          onClick={() => {
            onStateChange('open');
            trackRb2('chat_opened', {});
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            backgroundColor: RB2.teal,
            color: RB2.textInverse,
            border: 'none',
            borderRadius: 0,
            boxShadow: RB2.shadowOverlay,
            fontFamily: RB2_FONT.heading,
            fontSize: 13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
          aria-label="Open chat"
        >
          <ChatCircle size={16} weight="duotone" />
          Open Chat
        </UnstyledButton>
      </Box>
    );
  }

  if (state === 'minimized') {
    return (
      <Box
        style={{
          position: 'fixed',
          bottom: 0,
          right: 16,
          zIndex: 50,
        }}
      >
        <UnstyledButton
          data-testid="rb2-chat-restore"
          onClick={() => {
            onStateChange('open');
            trackRb2('chat_opened', {});
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            backgroundColor: RB2.navDark,
            color: RB2.textInverse,
            border: 'none',
            borderTop: `2px solid ${RB2.teal}`,
            borderRadius: 0,
            boxShadow: RB2.shadowOverlay,
            fontFamily: RB2_FONT.heading,
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
          aria-label="Restore chat"
        >
          <ChatCircle size={14} weight="duotone" />
          Coach Chat
        </UnstyledButton>
      </Box>
    );
  }

  return (
    <Box
      data-testid="rb2-chat-panel"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 50,
        width: 360,
        height: 460,
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        boxShadow: RB2.shadowOverlay,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        style={{
          padding: '10px 12px',
          backgroundColor: RB2.navDark,
          color: RB2.textInverse,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `2px solid ${RB2.teal}`,
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
        <Box style={{ display: 'flex', gap: 4 }}>
          <UnstyledButton
            data-testid="rb2-chat-minimize"
            onClick={() => {
              onStateChange('minimized');
              trackRb2('chat_minimized', {});
            }}
            aria-label="Minimize chat"
            style={{ padding: 4 }}
          >
            <Minus size={14} color={RB2.textInverse} />
          </UnstyledButton>
          <UnstyledButton
            data-testid="rb2-chat-close"
            onClick={() => {
              onStateChange('closed');
              trackRb2('chat_closed', {});
            }}
            aria-label="Close chat"
            style={{ padding: 4 }}
          >
            <X size={14} color={RB2.textInverse} />
          </UnstyledButton>
        </Box>
      </Box>
      <ChatBody
        fillHeight
        messages={messages}
        isProcessing={isProcessing}
        exampleHint={exampleHint}
        showAfterRefuseHint={showAfterRefuseHint}
        onSubmit={onSubmit}
      />
    </Box>
  );
}

export default ChatPanel;
