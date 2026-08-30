/**
 * ChatBody — Route Builder 2.0 shared chat body (bubbles + input).
 *
 * Shared between ChatDock (desktop right-hand region) and the
 * MobileControlSheet "Coach" tab. Renders the message list (markdown for
 * coach turns), route-option cards, the plan-mode toggle, suggestion
 * chips, staged-progress copy, and the input row.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, Text, Textarea, UnstyledButton } from '@mantine/core';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { CoachMarkdown } from '../../../components/coach/CoachMarkdown';
import { formatDistance, formatElevation } from '../../../utils/units';
import { trackRb2 } from '../telemetry/trackRb2';
import type { ChatMessage, ChatPhase, RouteOptionSummary } from '../chat/types';

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
  /**
   * Rider-controlled plan link. When provided together with
   * `onPlanAwareChange`, a Training plan / Just riding mode toggle renders
   * above the input. "Just riding" keeps the coach out of training-plan
   * territory so routes can be built on their own terms.
   */
  planAware?: boolean;
  onPlanAwareChange?: (next: boolean) => void;
  /** Focus the input on mount and re-focus after each turn (desktop). */
  autoFocus?: boolean;
  /** Coach persona display name, shown above each coach reply run. */
  personaName?: string;
  /** Stage of the in-flight turn — drives the progress bubble copy. */
  processingPhase?: ChatPhase | null;
  /** One-tap edit chips rendered above the input (page passes when a route exists). */
  quickActions?: readonly { id: string; label: string; phrase: string }[];
  /** Resubmit an error bubble's retryText without retyping. */
  onRetry?: (text: string) => void;
  /** False while the persisted thread is loading; shows a placeholder. */
  hydrated?: boolean;
}

const PHASE_LABEL: Record<ChatPhase, string> = {
  thinking: 'Coach is thinking…',
  generating: 'Planning route options…',
  rerouting: 'Rerouting…',
  measuring: 'Measuring elevation…',
};

export function ChatBody({
  fillHeight = false,
  messages,
  isProcessing,
  exampleHint,
  showAfterRefuseHint,
  onSubmit,
  onSelectOption,
  isImperial = false,
  planAware,
  onPlanAwareChange,
  autoFocus = false,
  personaName,
  processingPhase = null,
  quickActions,
  onRetry,
  hydrated = true,
}: ChatBodyProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message (or the typing bubble) in view.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  // Desktop: focus the input on mount…
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // …and re-focus when a turn finishes (readOnly keeps focus in most
  // cases, but cover the paths where it was lost anyway).
  const prevProcessingRef = useRef(isProcessing);
  useEffect(() => {
    if (prevProcessingRef.current && !isProcessing && autoFocus) {
      inputRef.current?.focus();
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing, autoFocus]);

  const handleSubmit = () => {
    if (isProcessing) return;
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
    setDraft('');
  };

  const submitPhrase = (phrase: string) => {
    if (isProcessing) return;
    onSubmit(phrase);
  };

  // The most recent coach refusal (kind-tagged by submitChatMessage) in
  // the trailing assistant run — phrasing examples render right under it.
  const lastRefuseIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.kind === 'refusal') return i;
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
      {/* First (and so far only) consumer of the RB2.focusRing token. */}
      <style>{`.rb2-focusable:focus-visible { outline: none; box-shadow: 0 0 0 3px ${RB2.focusRing}; }`}</style>
      <Box
        ref={scrollRef}
        data-testid="rb2-chat-bubbles"
        role="log"
        aria-live="polite"
        aria-label="Coach conversation"
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
        {!hydrated ? (
          <Text
            data-testid="rb2-chat-hydrating"
            style={{
              fontFamily: RB2_FONT.body,
              fontSize: 12,
              fontStyle: 'italic',
              color: RB2.textTertiary,
            }}
          >
            Loading conversation…
          </Text>
        ) : (
          messages.map((m, i) => (
            <Box key={m.id}>
              {m.role === 'assistant' &&
                personaName &&
                (i === 0 || messages[i - 1].role !== 'assistant') && (
                  <Text
                    data-testid="rb2-chat-persona-label"
                    style={{
                      fontFamily: RB2_FONT.mono,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: RB2.textTertiary,
                      marginBottom: 3,
                    }}
                  >
                    {personaName}
                  </Text>
                )}
              <Bubble
                message={m}
                isProcessing={isProcessing}
                onRetry={onRetry}
              />
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
                <ExampleChips
                  data-testid="rb2-chat-refuse-examples"
                  items={exampleHint}
                  prominent
                  disabled={isProcessing}
                  onPick={(phrase) => {
                    trackRb2('chat_example_chip_clicked', { phrase });
                    submitPhrase(phrase);
                  }}
                />
              )}
            </Box>
          ))
        )}
        {isProcessing && (
          <Box data-testid="rb2-chat-typing" style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box
              role="status"
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
              {processingPhase ? PHASE_LABEL[processingPhase] : PHASE_LABEL.thinking}
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
        {planAware !== undefined && onPlanAwareChange && (
          <PlanModeToggle
            planAware={planAware}
            disabled={isProcessing}
            onChange={onPlanAwareChange}
          />
        )}
        {quickActions && quickActions.length > 0 && (
          <Box
            data-testid="rb2-chat-quick-actions"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}
          >
            {quickActions.map((action) => (
              <UnstyledButton
                key={action.id}
                data-testid={`rb2-chat-quick-${action.id}`}
                className="rb2-focusable"
                aria-disabled={isProcessing}
                onClick={() => {
                  if (isProcessing) return;
                  trackRb2('chat_quick_action_clicked', { action_id: action.id });
                  submitPhrase(action.phrase);
                }}
                style={{
                  padding: '3px 8px',
                  backgroundColor: RB2.bgSecondary,
                  color: RB2.textSecondary,
                  border: `1px solid ${RB2.border}`,
                  borderRadius: 0,
                  fontFamily: RB2_FONT.mono,
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: isProcessing ? 'default' : 'pointer',
                  opacity: isProcessing ? 0.6 : 1,
                }}
              >
                {action.label}
              </UnstyledButton>
            ))}
          </Box>
        )}
        <Box style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <Textarea
            ref={inputRef}
            className="tribos-chat-input"
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
            readOnly={isProcessing}
            autosize
            minRows={2}
            maxRows={10}
            styles={{
              root: { flex: 1 },
              input: {
                borderRadius: 0,
                fontFamily: RB2_FONT.body,
                lineHeight: 1.5,
                opacity: isProcessing ? 0.6 : 1,
              },
            }}
            aria-label="Chat message"
          />
          <UnstyledButton
            data-testid="rb2-chat-send"
            className="rb2-focusable"
            onClick={handleSubmit}
            aria-disabled={isProcessing}
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
          <ExampleChips
            data-testid="rb2-chat-examples-hint"
            items={exampleHint}
            disabled={isProcessing}
            onPick={(phrase) => {
              trackRb2('chat_example_chip_clicked', { phrase });
              submitPhrase(phrase);
            }}
          />
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
      role="radiogroup"
      aria-label="Route options"
      style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {options.map((option) => {
        const selected = option.index === selectedIndex;
        return (
          <UnstyledButton
            key={option.index}
            data-testid={`rb2-chat-route-option-${option.index}`}
            className="rb2-focusable"
            onClick={() => {
              if (!disabled && !selected) onSelect(option.index);
            }}
            aria-pressed={selected}
            aria-disabled={disabled}
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

interface PlanModeToggleProps {
  planAware: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Two-chip mode switch: "Training plan" links the coach to today's
 * prescription and fitness state; "Just riding" builds the route on its
 * own terms with no training-plan context.
 */
function PlanModeToggle({ planAware, disabled, onChange }: PlanModeToggleProps) {
  const chips: Array<{ id: string; label: string; value: boolean }> = [
    { id: 'rb2-chat-mode-plan', label: 'Training plan', value: true },
    { id: 'rb2-chat-mode-free', label: 'Just riding', value: false },
  ];
  return (
    <Box
      data-testid="rb2-chat-mode-toggle"
      role="radiogroup"
      aria-label="Coach mode"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginRight: 4,
        }}
      >
        Coach:
      </Text>
      {chips.map((chip) => {
        const active = planAware === chip.value;
        return (
          <UnstyledButton
            key={chip.id}
            data-testid={chip.id}
            className="rb2-focusable"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (!disabled && !active) onChange(chip.value);
            }}
            style={{
              padding: '3px 8px',
              backgroundColor: active ? RB2.teal : RB2.bgSecondary,
              color: active ? RB2.textInverse : RB2.textSecondary,
              border: `1px solid ${active ? RB2.teal : RB2.border}`,
              borderRadius: 0,
              fontFamily: RB2_FONT.mono,
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: disabled || active ? 'default' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {chip.label}
          </UnstyledButton>
        );
      })}
    </Box>
  );
}

interface BubbleProps {
  message: ChatMessage;
  isProcessing: boolean;
  onRetry?: (text: string) => void;
}

function Bubble({ message, isProcessing, onRetry }: BubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.kind === 'error';
  const timeLabel =
    message.timestamp > 0
      ? new Date(message.timestamp).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          backgroundColor: isUser ? RB2.teal : RB2.cardBg,
          border: isUser ? 'none' : `1px solid ${isError ? RB2.coral : RB2.border}`,
          color: isUser ? RB2.textInverse : RB2.textPrimary,
          borderRadius: 0,
        }}
      >
        {isUser ? (
          <Text
            style={{
              fontFamily: RB2_FONT.body,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {message.text}
          </Text>
        ) : (
          <Box style={{ fontFamily: RB2_FONT.body }}>
            <CoachMarkdown size="xs" color={RB2.textPrimary}>
              {message.text}
            </CoachMarkdown>
          </Box>
        )}
        {isError && message.retryText && onRetry && (
          <UnstyledButton
            data-testid="rb2-chat-retry"
            className="rb2-focusable"
            aria-disabled={isProcessing}
            onClick={() => {
              if (isProcessing) return;
              trackRb2('chat_retry_clicked', {});
              onRetry(message.retryText as string);
            }}
            style={{
              marginTop: 6,
              padding: '2px 8px',
              border: `1px solid ${RB2.coral}`,
              color: RB2.coral,
              borderRadius: 0,
              fontFamily: RB2_FONT.mono,
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: isProcessing ? 'default' : 'pointer',
              opacity: isProcessing ? 0.6 : 1,
            }}
          >
            Retry
          </UnstyledButton>
        )}
      </Box>
      {timeLabel && (
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 9,
            color: RB2.textTertiary,
            marginTop: 2,
          }}
        >
          {timeLabel}
        </Text>
      )}
    </Box>
  );
}

interface ExampleChipsProps {
  items: readonly string[];
  onPick: (phrase: string) => void;
  disabled: boolean;
  prominent?: boolean;
  'data-testid'?: string;
}

function ExampleChips({ items, onPick, disabled, prominent = false, ...rest }: ExampleChipsProps) {
  return (
    <Box
      data-testid={rest['data-testid']}
      style={{
        marginTop: prominent ? 8 : 6,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
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
        <UnstyledButton
          key={phrase}
          className="rb2-focusable"
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) onPick(phrase);
          }}
          style={{
            padding: '2px 8px',
            backgroundColor: prominent ? RB2.cardBg : 'transparent',
            border: `1px solid ${RB2.border}`,
            borderRadius: 0,
            fontFamily: RB2_FONT.body,
            fontSize: prominent ? 12 : 11,
            color: prominent ? RB2.textPrimary : RB2.textSecondary,
            fontStyle: 'italic',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {phrase}
        </UnstyledButton>
      ))}
    </Box>
  );
}

export default ChatBody;
