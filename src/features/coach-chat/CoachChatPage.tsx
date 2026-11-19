/**
 * /coach — the full-height conversation with the coach.
 *
 * The other coach surfaces (the Cmd+K command bar, the Today panel, the
 * check-in feed on Train → Coach) stay as quick entry points and link here.
 * This page is where a longer conversation happens, and the only one where
 * the coach can show charts and maps and the athlete can select part of one
 * to ask about.
 *
 * `?q=` prefills the composer (the command bar's "Open in Coach" uses it).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Box, Button, CloseButton, Group, Loader, Text, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUp, ChatCircleDots } from '@phosphor-icons/react';
import AppShell from '../../components/AppShell.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useCoachChat } from './useCoachChat';
import type { ChatMessage } from './useCoachChat';
import type { CoachFocus } from './coachApi';
import { MessageBubble } from './MessageBubble';

const STARTERS = [
  'How has my fitness changed over the last six weeks?',
  'Show me my last ride and where I faded.',
  'What does my power curve say I should work on?',
  'Walk me through the hardest part of my most recent saved route.',
];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'topic'; key: string }
  | { type: 'msg'; key: string; message: ChatMessage };

/** Interleave day separators and "new topic" rules with the messages. */
function buildRows(messages: ChatMessage[]): Row[] {
  const rows: Row[] = [];
  let lastDay = '';
  messages.forEach((m, idx) => {
    const day = new Date(m.timestamp).toDateString();
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${day}`, label: dayLabel(m.timestamp) });
      lastDay = day;
    } else if (m.topicStart && idx > 0) {
      rows.push({ type: 'topic', key: `topic-${m.id}` });
    }
    rows.push({ type: 'msg', key: m.id, message: m });
  });
  return rows;
}

function Rule({ label }: { label: string }) {
  return (
    <Group gap={10} wrap="nowrap" style={{ margin: '6px 0' }}>
      <Box style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</Text>
      <Box style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </Group>
  );
}

function TypingDots() {
  return (
    <Box style={{ display: 'flex', gap: 4, padding: '6px 0 6px 17px' }} aria-label="Coach is typing">
      <style>{`@keyframes coach-bob{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}`}</style>
      {[0, 0.2, 0.4].map((d) => (
        <span
          key={d}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-ink)',
            animation: `coach-bob 1.4s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
    </Box>
  );
}

export default function CoachChatPage() {
  const { user } = useAuth() as { user: { id: string } | null };
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const chat = useCoachChat(user?.id);
  const [draft, setDraft] = useState('');
  const [focus, setFocus] = useState<CoachFocus | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ?q= prefill, then drop it from the URL so a reload doesn't re-prefill.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setDraft(q);
      const next = new URLSearchParams(searchParams);
      next.delete('q');
      setSearchParams(next, { replace: true });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchParams, setSearchParams]);

  const rows = useMemo(() => buildRows(chat.messages), [chat.messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [rows.length, chat.sending]);

  const submit = async (text: string) => {
    if (!text.trim() || chat.sending) return;
    const sentFocus = focus;
    setDraft('');
    setFocus(null);
    const ok = await chat.send(text, sentFocus);
    if (!ok) {
      // Give the athlete their words (and selection) back to retry.
      setDraft(text);
      setFocus(sentFocus);
    }
  };

  const handleFocus = (f: CoachFocus) => {
    setFocus(f);
    inputRef.current?.focus();
  };

  const empty = !chat.loadingHistory && chat.messages.length === 0;
  // Header 60px; on mobile the bottom tab bar is another 64px.
  const height = isMobile ? 'calc(100dvh - 60px - 64px)' : 'calc(100dvh - 60px)';

  return (
    <AppShell fullWidth>
      <Box style={{ height, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
        {/* Masthead */}
        <Box style={{ borderBottom: '1px solid var(--color-border)' }}>
          <Group
            justify="space-between"
            wrap="nowrap"
            style={{ maxWidth: 820, margin: '0 auto', padding: isMobile ? '10px 16px' : '14px 24px' }}
          >
            <Text
              component="h1"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                textTransform: 'uppercase',
                fontSize: isMobile ? 26 : 32,
                lineHeight: 1,
                margin: 0,
              }}
            >
              Coach
            </Text>
            <Group gap={8} wrap="nowrap">
              {chat.pendingTopicStart && (
                <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  next message starts fresh
                </Text>
              )}
              <Button
                size="xs"
                variant="default"
                radius={0}
                onClick={chat.startNewTopic}
                disabled={chat.pendingTopicStart || chat.messages.length === 0}
              >
                New topic
              </Button>
            </Group>
          </Group>
        </Box>

        {/* Conversation */}
        <Box ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
          <Box
            style={{
              maxWidth: 820,
              margin: '0 auto',
              padding: isMobile ? '16px' : '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {chat.loadingHistory && (
              <Group justify="center" py="xl">
                <Loader size="sm" color="dark" />
              </Group>
            )}

            {empty && (
              <Box py={isMobile ? 'md' : 'xl'}>
                <span className="tribos-stamp" style={{ fontSize: 15 }}>
                  Ask anything
                </span>
                <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 17, lineHeight: 1.5, marginTop: 16, maxWidth: 560 }}>
                  I can pull up your fitness trend, a ride’s power and heart rate with the stretch we’re talking about
                  marked on the map, your power curve, or a saved route. Select part of a chart and ask about just that.
                </Text>
              </Box>
            )}

            {rows.map((row) => {
              if (row.type === 'day') return <Rule key={row.key} label={row.label} />;
              if (row.type === 'topic') return <Rule key={row.key} label="new topic" />;
              return (
                <MessageBubble
                  key={row.key}
                  message={row.message}
                  onAddWorkout={chat.addWorkout}
                  onActivatePlan={chat.activatePlan}
                  onFocus={handleFocus}
                />
              );
            })}

            {chat.sending && <TypingDots />}
          </Box>
        </Box>

        {/* Composer */}
        <Box style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          <Box style={{ maxWidth: 820, margin: '0 auto', padding: isMobile ? '10px 16px 12px' : '12px 24px 16px' }}>
            {chat.error && (
              <Group justify="space-between" wrap="nowrap" mb={8}>
                <Text size="sm" c="red">
                  {chat.error}
                </Text>
                <CloseButton size="sm" onClick={chat.clearError} aria-label="Dismiss error" />
              </Group>
            )}

            {chat.consent === false ? (
              <Box style={{ borderLeft: '3px solid var(--color-ink)', background: 'var(--color-bg-secondary)', padding: '12px 14px' }}>
                <Text size="sm" mb={8}>
                  Your coach reads your training data to answer you.{' '}
                  <Anchor component={Link} to="/privacy#ai" size="sm">
                    How we handle it
                  </Anchor>
                  .
                </Text>
                <Button size="sm" radius={0} color="dark" loading={chat.consentGranting} onClick={chat.grantConsent}>
                  Enable coach
                </Button>
              </Box>
            ) : (
              <>
                {empty && (
                  <Group gap={8} mb={10} style={{ flexWrap: 'wrap' }}>
                    {STARTERS.map((s) => (
                      <Button
                        key={s}
                        size="compact-sm"
                        variant="default"
                        radius={0}
                        disabled={chat.sending || chat.consent !== true}
                        onClick={() => submit(s)}
                        styles={{ label: { whiteSpace: 'normal', textAlign: 'left', fontWeight: 400 } }}
                      >
                        {s}
                      </Button>
                    ))}
                  </Group>
                )}

                {focus && (
                  <Group
                    gap={6}
                    wrap="nowrap"
                    mb={8}
                    style={{
                      display: 'inline-flex',
                      background: 'var(--color-highlight-subtle)',
                      border: '1px solid var(--color-highlight-border)',
                      padding: '3px 4px 3px 10px',
                    }}
                  >
                    <ChatCircleDots size={14} />
                    <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{focus.label}</Text>
                    <CloseButton size="xs" onClick={() => setFocus(null)} aria-label="Clear selection" />
                  </Group>
                )}

                <Group gap={8} wrap="nowrap" align="flex-end">
                  <Textarea
                    ref={inputRef}
                    placeholder={focus ? 'Ask about this selection…' : 'Ask your coach…'}
                    value={draft}
                    onChange={(e) => setDraft(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submit(draft);
                      }
                    }}
                    disabled={chat.consent !== true}
                    autosize
                    minRows={1}
                    maxRows={8}
                    style={{ flex: 1 }}
                    styles={{ input: { borderRadius: 0, fontSize: 15, lineHeight: 1.5 } }}
                    aria-label="Message your coach"
                  />
                  <Button
                    radius={0}
                    color="dark"
                    onClick={() => submit(draft)}
                    disabled={!draft.trim() || chat.sending || chat.consent !== true}
                    aria-label="Send"
                    px={12}
                  >
                    <ArrowUp size={18} weight="bold" />
                  </Button>
                </Group>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}
