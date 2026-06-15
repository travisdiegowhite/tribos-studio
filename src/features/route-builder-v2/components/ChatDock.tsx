/**
 * ChatDock — Route Builder 2.0 desktop docked chat.
 *
 * The desktop counterpart to ChatDrawer (mobile). Unlike the floating
 * ChatPanel, this renders in-flow as a right-hand region of the page
 * layout. Two states:
 *   - open:      header + ChatBody, fixed width (default 360)
 *   - collapsed: slim vertical rail with a launcher button
 *
 * Collapse state is controlled by the page so the layout region width can
 * track it. Reuses ChatBody for the message list + input.
 */

import { type ReactNode } from 'react';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { ChatCircle, CaretRight } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { ChatBody } from './ChatBody';
import { trackRb2 } from '../telemetry/trackRb2';
import type { ChatMessage } from '../chat/types';

export interface ChatDockProps {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
  messages: ChatMessage[];
  isProcessing: boolean;
  exampleHint: readonly string[];
  showAfterRefuseHint: boolean;
  onSubmit: (text: string) => void;
  /** Selects a generated route option card (messageId, option index). */
  onSelectOption?: (messageId: string, index: number) => void;
  /** Render stats in the rider's units. */
  isImperial?: boolean;
  /** Optional content rendered between the title bar and the message list
   *  (e.g. the GenerateBar chips). */
  header?: ReactNode;
  /** Open width in px. */
  width?: number;
}

const RAIL_WIDTH = 48;

export function ChatDock({
  collapsed,
  onCollapsedChange,
  messages,
  isProcessing,
  exampleHint,
  showAfterRefuseHint,
  onSubmit,
  onSelectOption,
  isImperial,
  header,
  width = 360,
}: ChatDockProps) {
  if (collapsed) {
    return (
      <Box
        data-testid="rb2-chat-dock-rail"
        style={{
          width: RAIL_WIDTH,
          height: '100%',
          backgroundColor: RB2.navDark,
          borderLeft: `2px solid ${RB2.teal}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
        }}
      >
        <UnstyledButton
          data-testid="rb2-chat-dock-expand"
          onClick={() => {
            onCollapsedChange(false);
            trackRb2('chat_opened', {});
          }}
          aria-label="Open coach chat"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            color: RB2.textInverse,
          }}
        >
          <ChatCircle size={20} color={RB2.teal} weight="duotone" />
          <Text
            style={{
              fontFamily: RB2_FONT.heading,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
            }}
          >
            Coach Chat
          </Text>
        </UnstyledButton>
      </Box>
    );
  }

  return (
    <Box
      data-testid="rb2-chat-dock"
      style={{
        width,
        height: '100%',
        backgroundColor: RB2.cardBg,
        borderLeft: `1px solid ${RB2.border}`,
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
          flexShrink: 0,
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
        <UnstyledButton
          data-testid="rb2-chat-dock-collapse"
          onClick={() => {
            onCollapsedChange(true);
            trackRb2('chat_minimized', {});
          }}
          aria-label="Collapse coach chat"
          style={{ padding: 4 }}
        >
          <CaretRight size={16} color={RB2.textInverse} />
        </UnstyledButton>
      </Box>
      {header}
      <ChatBody
        fillHeight
        messages={messages}
        isProcessing={isProcessing}
        exampleHint={exampleHint}
        showAfterRefuseHint={showAfterRefuseHint}
        onSubmit={onSubmit}
        onSelectOption={onSelectOption}
        isImperial={isImperial}
      />
    </Box>
  );
}

export default ChatDock;
