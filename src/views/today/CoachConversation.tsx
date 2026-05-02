import { useCallback, useState } from 'react';
import { Skeleton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { usePostHog } from 'posthog-js/react';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { supabase } from '../../lib/supabase';
import { captureToday } from './utils/todayInstrumentation';
import type { TodayData } from './hooks/useTodayData';
import type { CoachMessage } from './hooks/useCoachConversation';

interface Props {
  data: TodayData;
}

export function CoachConversation({ data }: Props) {
  const posthog = usePostHog();
  const [draft, setDraft] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  const handleSend = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversationHistory: data.conversation.messages.map((m) => ({
            role: m.role === 'coach' ? 'assistant' : m.role,
            content: m.content,
          })),
          quickMode: true,
          userLocalDate: { timezone: browserTimezone },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Coach error (${res.status})`);
      }
      captureToday(posthog, 'today_view.coach_message_sent', { length: message.length });
      setDraft('');
      await data.refresh.conversation();
    } catch (err) {
      notifications.show({
        title: 'Coach unreachable',
        message: err instanceof Error ? err.message : 'Could not send message.',
        color: 'orange',
      });
    } finally {
      setSending(false);
    }
  }, [draft, sending, data.conversation.messages, data.refresh, posthog]);

  return (
    <ClusterCard>
      <ClusterHeader title="COACH CONVERSATION" subtitle="ONGOING DIALOGUE" />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 180,
        }}
      >
        {data.loading.conversation && data.conversation.messages.length === 0 ? (
          <>
            <Skeleton height={28} />
            <Skeleton height={28} width="80%" />
          </>
        ) : data.conversation.messages.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>
            Send your coach a message to start a conversation.
          </p>
        ) : (
          data.conversation.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          border: '1px solid var(--color-border)',
        }}
      >
        <input
          type="text"
          placeholder="Ask your coach anything…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: 'var(--color-bg)',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-primary)',
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          style={{
            background: draft.trim() && !sending ? 'var(--color-teal)' : 'var(--color-bg-secondary)',
            color: draft.trim() && !sending ? '#FFFFFF' : 'var(--color-text-muted)',
            border: 'none',
            padding: '0 14px',
            cursor: draft.trim() && !sending ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
          }}
        >
          <PaperPlaneRight size={14} weight="fill" />
          SEND
        </button>
      </form>
    </ClusterCard>
  );
}

function MessageBubble({ msg }: { msg: CoachMessage }) {
  const isCoach = msg.role === 'coach';
  return (
    <div
      style={{
        background: isCoach ? 'var(--tribos-warm-bg)' : 'var(--color-bg-secondary)',
        borderLeft: `2px solid ${isCoach ? 'var(--color-teal)' : 'var(--color-border)'}`,
        padding: '8px 12px',
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isCoach ? 'var(--color-teal)' : 'var(--color-text-muted)',
          fontWeight: 600,
        }}
      >
        {isCoach ? 'Coach' : 'You'}
      </span>
      <p
        style={{
          margin: '4px 0 0',
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--color-text-primary)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {msg.content}
      </p>
    </div>
  );
}
