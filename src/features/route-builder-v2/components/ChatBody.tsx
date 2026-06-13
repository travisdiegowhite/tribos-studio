/**
 * ChatBody — Route Builder 2.0 shared chat body (bubbles + input).
 *
 * Shared between ChatPanel (desktop floating) and ChatDrawer (mobile
 * bottom sheet). P1.4 wires it to the real chat session: `messages`,
 * `isProcessing`, `onSubmit`, and an `exampleHint` row below the input.
 *
 * P1.4 STUB awareness: the chat surface itself is permanent; only the
 * heuristic translation backing it (in `../chat/`) is throwaway.
 */

import { useState } from 'react';
import { Box, Text, TextInput, UnstyledButton } from '@mantine/core';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { formatDistance, formatElevation } from '../../../utils/units';
import type { ChatMessage, RouteOptionSummary } from '../chat/types';

export interface ChatBodyProps {
  fillHeight?: boolean;
  messages: ChatMessage[];
  isProcessing: boolean;
  exampleHint: readonly string[];
  showAfterRefuseHint: boolean;
  onSubmit: (text: string) => void;
  /** Selects a generated route option card (messageId, option index). */
  onSelectOption?: (messageId: string, index: number) => void;
  /** Render card stats in the rider's units. */
  isImperial?: boolean;
}

export function ChatBody({
  fillHeight = false,
  messages,
  isProcessing,
  exampleHint,
  showAfterRefuseHint,
  onSubmit,
  onSelectOption,
  isImperial = false,
}: ChatBodyProps) {
  const [draft, setDraft] = useState('');

  const handleSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
    setDraft('');
  };

  // Track which assistant message is the most recent "refuse" so we can
  // render examples right under it. Easiest heuristic: the last
  // assistant message text contains "don't understand".
  const lastRefuseIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && /don'?t understand/i.test(m.text)) return i;
      if (m.role === 'user') return -1;
    }
    return -1;
  })();

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
        {messages.map((m, i) => (
          <Box key={m.id}>
            <Bubble role={m.role} text={m.text} />
            {m.kind === 'route-options' && (m.options?.length ?? 0) > 0 && (
              <RouteOptionCards
                options={m.options as RouteOptionSummary[]}
                selectedIndex={m.selectedOptionIndex ?? 0}
                isImperial={isImperial}
                disabled={isProcessing}
                onSelect={(index) => onSelectOption?.(m.id, index)}
              />
            )}
            {i === lastRefuseIndex && showAfterRefuseHint && exampleHint.length > 0 && (
              <ExampleList data-testid="rb2-chat-refuse-examples" items={exampleHint} prominent />
            )}
          </Box>
        ))}
        {isProcessing && (
          <Box data-testid="rb2-chat-typing" style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box
              style={{
                padding: '6px 10px',
                backgroundColor: RB2.cardBg,
                border: `1px solid ${RB2.border}`,
                color: RB2.textSecondary,
                fontFamily: RB2_FONT.body,
                fontSize: 12,
                fontStyle: 'italic',
                borderRadius: 0,
              }}
            >
              Coach is thinking…
            </Box>
          </Box>
        )}
      </Box>
      <Box
        style={{
          borderTop: `1px solid ${RB2.border}`,
          padding: 10,
          backgroundColor: RB2.cardBg,
        }}
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
            placeholder="Type a request…"
            disabled={isProcessing}
            styles={{
              root: { flex: 1 },
              input: { borderRadius: 0, fontFamily: RB2_FONT.body },
            }}
            aria-label="Chat message"
          />
          <UnstyledButton
            data-testid="rb2-chat-send"
            onClick={handleSubmit}
            disabled={isProcessing}
            aria-label="Send message"
            style={{
              padding: 8,
              backgroundColor: RB2.bgSecondary,
              border: `1px solid ${RB2.border}`,
              opacity: isProcessing ? 0.6 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            <PaperPlaneRight size={14} color={RB2.textTertiary} />
          </UnstyledButton>
        </Box>
        {exampleHint.length > 0 && (
          <ExampleList data-testid="rb2-chat-examples-hint" items={exampleHint} />
        )}
      </Box>
    </Box>
  );
}

/**
 * Surface chip text for an option: the measured gravel % (with the requested
 * target in parens when known) takes priority; otherwise the routing-profile
 * label ("gravel-biased"); otherwise nothing.
 */
function surfaceText(option: RouteOptionSummary): string {
  if (typeof option.gravel_actual_pct === 'number') {
    const target =
      typeof option.gravel_target_pct === 'number'
        ? ` (target ${option.gravel_target_pct}%)`
        : '';
    return `~${option.gravel_actual_pct}% gravel${target}`;
  }
  return option.surface_label ?? '';
}

interface RouteOptionCardsProps {
  options: RouteOptionSummary[];
  selectedIndex: number;
  isImperial: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
}

function RouteOptionCards({
  options,
  selectedIndex,
  isImperial,
  disabled,
  onSelect,
}: RouteOptionCardsProps) {
  return (
    <Box
      data-testid="rb2-chat-route-options"
      style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {options.map((option) => {
        const selected = option.index === selectedIndex;
        return (
          <UnstyledButton
            key={option.index}
            data-testid={`rb2-chat-route-option-${option.index}`}
            onClick={() => {
              if (!disabled && !selected) onSelect(option.index);
            }}
            aria-pressed={selected}
            aria-label={`Route option ${option.index + 1}: ${option.name}`}
            style={{
              padding: '8px 10px',
              backgroundColor: selected ? RB2.bgSecondary : RB2.cardBg,
              border: selected ? `2px solid ${RB2.teal}` : `1px solid ${RB2.border}`,
              borderRadius: 0,
              cursor: disabled || selected ? 'default' : 'pointer',
              opacity: disabled && !selected ? 0.6 : 1,
              textAlign: 'left',
            }}
          >
            <Box style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <Text
                style={{
                  fontFamily: RB2_FONT.heading,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: RB2.textPrimary,
                }}
              >
                {option.name}
              </Text>
              {selected && (
                <Text
                  style={{
                    fontFamily: RB2_FONT.mono,
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: RB2.teal,
                    flexShrink: 0,
                  }}
                >
                  On map
                </Text>
              )}
            </Box>
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 11,
                color: RB2.textSecondary,
                marginTop: 2,
              }}
            >
              {formatDistance(option.distance_km, isImperial)} ·{' '}
              {formatElevation(option.elevation_gain_m, isImperial)} climbing
              {option.direction_label ? ` · ${option.direction_label}` : ''}
              {surfaceText(option) ? ` · ${surfaceText(option)}` : ''}
              {typeof option.familiarity_percent === 'number' && option.familiarity_percent > 0
                ? ` · ${option.familiarity_percent}% familiar`
                : ''}
            </Text>
            {option.rationale ? (
              <Text
                style={{
                  fontFamily: RB2_FONT.body,
                  fontSize: 11,
                  fontStyle: 'italic',
                  color: RB2.textTertiary,
                  marginTop: 3,
                  lineHeight: 1.35,
                }}
              >
                {option.rationale}
              </Text>
            ) : null}
          </UnstyledButton>
        );
      })}
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

interface ExampleListProps {
  items: readonly string[];
  prominent?: boolean;
  'data-testid'?: string;
}

function ExampleList({ items, prominent = false, ...rest }: ExampleListProps) {
  return (
    <Box
      data-testid={rest['data-testid']}
      style={{
        marginTop: prominent ? 8 : 6,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: prominent ? 11 : 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: prominent ? RB2.textSecondary : RB2.textTertiary,
          marginRight: 4,
        }}
      >
        Try:
      </Text>
      {items.map((phrase) => (
        <Text
          key={phrase}
          style={{
            fontFamily: RB2_FONT.body,
            fontSize: prominent ? 12 : 11,
            color: prominent ? RB2.textPrimary : RB2.textSecondary,
            fontStyle: 'italic',
          }}
        >
          {phrase}
        </Text>
      ))}
    </Box>
  );
}

export default ChatBody;
