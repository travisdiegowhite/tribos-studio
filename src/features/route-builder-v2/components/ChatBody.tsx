/**
 * ChatBody — Route Builder 2.0 shared chat body (bubbles + input).
 *
 * Shared between ChatPanel (desktop floating) and ChatDrawer (mobile
 * bottom sheet). In P1.3 the input is a no-op visual placeholder.
 */

import { useState } from 'react';
import { Box, Text, TextInput, UnstyledButton, Tooltip } from '@mantine/core';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { PLACEHOLDER_BUBBLES } from './chatPlaceholder';

export interface ChatBodyProps {
  fillHeight?: boolean;
}

export function ChatBody({ fillHeight = false }: ChatBodyProps) {
  const [draft, setDraft] = useState('');
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = () => {
    // P1.3: input is a no-op. Show a transient hint instead.
    if (!draft.trim()) return;
    setShowHint(true);
    window.setTimeout(() => setShowHint(false), 2400);
  };

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: fillHeight ? '100%' : undefined,
        flex: fillHeight ? 1 : undefined,
        minHeight: 0,
      }}
    >
      <Box
        data-testid="rb2-chat-bubbles"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          backgroundColor: RB2.bgBase,
        }}
      >
        {PLACEHOLDER_BUBBLES.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} />
        ))}
      </Box>
      <Box
        style={{
          borderTop: `1px solid ${RB2.border}`,
          padding: 10,
          backgroundColor: RB2.cardBg,
        }}
      >
        <Tooltip
          label="Chat coming in next update"
          opened={showHint}
          withinPortal
          position="top"
        >
          <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TextInput
              data-testid="rb2-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Chat coming soon…"
              styles={{
                root: { flex: 1 },
                input: { borderRadius: 0, fontFamily: RB2_FONT.body },
              }}
              aria-label="Chat message"
            />
            <UnstyledButton
              data-testid="rb2-chat-send"
              onClick={handleSubmit}
              aria-label="Send message"
              style={{
                padding: 8,
                backgroundColor: RB2.bgSecondary,
                border: `1px solid ${RB2.border}`,
              }}
            >
              <PaperPlaneRight size={14} color={RB2.textTertiary} />
            </UnstyledButton>
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user';
  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          backgroundColor: isUser ? RB2.teal : RB2.cardBg,
          border: isUser ? 'none' : `1px solid ${RB2.border}`,
          color: isUser ? RB2.textInverse : RB2.textPrimary,
          borderRadius: 0,
        }}
      >
        <Text
          style={{
            fontFamily: RB2_FONT.body,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
}

export default ChatBody;
