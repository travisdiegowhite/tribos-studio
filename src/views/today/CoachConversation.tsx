import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Group,
  Loader,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import type { ConversationMessage } from './useTodayData';

interface CoachConversationProps {
  messages: ConversationMessage[];
  loading: boolean;
  /** Limit messages shown — desktop is 4, mobile is 2 (per spec). */
  maxMessages?: number;
  trainingContext?: string;
  onMessageSent?: () => void;
  onConversationRefresh?: () => Promise<void>;
}

export function CoachConversation({
  messages,
  loading,
  maxMessages = 4,
  trainingContext,
  onMessageSent,
  onConversationRefresh,
}: CoachConversationProps) {
  const { user } = useAuth() as { user: { id: string } | null };
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [optimistic, setOptimistic] = useState<ConversationMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const merged = [...messages, ...optimistic];
    return merged.slice(-maxMessages);
  }, [messages, optimistic, maxMessages]);

  const handleSubmit = useCallback(async () => {
    const message = draft.trim();
    if (!message || submitting || !user?.id) return;
    setSubmitting(true);
    setDraft('');
    const userMsg: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setOptimistic((prev) => [...prev, userMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const conversationHistory = [...messages, userMsg].map((m) => ({
        role: m.role === 'coach' ? 'assistant' : 'user',
        content: m.content,
      }));

      const now = new Date();
      const userLocalDate = {
        dayOfWeek: now.getDay(),
        date: now.getDate(),
        month: now.getMonth(),
        year: now.getFullYear(),
        dateString: now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      };

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message,
          conversationHistory: conversationHistory.slice(0, -1),
          trainingContext: trainingContext ?? '',
          userLocalDate,
          userId: user.id,
          maxTokens: 1024,
          quickMode: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const coachMsg: ConversationMessage = {
        role: 'coach',
        content: data.message,
        timestamp: new Date().toISOString(),
      };
      setOptimistic((prev) => [...prev, coachMsg]);

      // Persist both turns so the next load reflects them.
      try {
        await supabase.from('coach_conversations').insert([
          {
            user_id: user.id,
            role: 'user',
            message,
            message_type: 'chat',
            context_snapshot: { coach_type: 'training', surface: 'today' },
            coach_type: 'strategist',
            timestamp: userMsg.timestamp,
          },
          {
            user_id: user.id,
            role: 'coach',
            message: data.message,
            message_type: 'chat',
            context_snapshot: { coach_type: 'training', surface: 'today' },
            coach_type: 'strategist',
            timestamp: coachMsg.timestamp,
          },
        ]);
      } catch (dbErr) {
        console.error('coach conversation persist failed', dbErr);
      }

      onMessageSent?.();
      // Allow parent to re-pull the canonical history; clear optimistic state
      // once it returns so the merged view doesn't double-count.
      if (onConversationRefresh) {
        await onConversationRefresh();
        setOptimistic([]);
      }
    } catch (err) {
      console.error('coach send failed', err);
      // Roll back the optimistic user message on hard failure so the user can
      // retry with a clean state.
      setOptimistic((prev) => prev.filter((m) => m !== userMsg));
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [draft, submitting, user?.id, messages, trainingContext, onMessageSent, onConversationRefresh]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <ClusterCard>
      <ClusterHeader title="COACH CONVERSATION" subtitle="ONGOING DIALOGUE" />
      <Stack gap={8} mb={12} style={{ minHeight: 140 }}>
        {loading && messages.length === 0 ? (
          <>
            <Skeleton height={36} />
            <Skeleton height={36} width="80%" />
          </>
        ) : visible.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#7A7970', fontStyle: 'italic' }}>
            No conversation yet. Ask your coach anything to get started.
          </Text>
        ) : (
          visible.map((m, idx) => {
            const isCoach = m.role === 'coach';
            return (
              <Box
                key={`${m.timestamp}-${idx}`}
                style={{
                  backgroundColor: isCoach ? '#FBF6F2' : '#F4F4F2',
                  borderLeft: isCoach ? '2px solid #2A8C82' : '2px solid #DDDDD8',
                  padding: '8px 12px',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: isCoach ? '#2A8C82' : '#7A7970',
                    marginBottom: 2,
                  }}
                >
                  {isCoach ? 'Coach:' : 'You:'}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: '#3D3C36',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </Text>
              </Box>
            );
          })
        )}
      </Stack>

      <Group gap={8} wrap="nowrap">
        <TextInput
          ref={inputRef}
          placeholder="Ask your coach anything…"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          size="sm"
          style={{ flex: 1 }}
          styles={{
            input: {
              borderRadius: 0,
              borderColor: '#DDDDD8',
              backgroundColor: '#FFFFFF',
            },
          }}
        />
        <ActionIcon
          size="lg"
          color="teal"
          variant="filled"
          onClick={handleSubmit}
          disabled={!draft.trim() || submitting}
          aria-label="Send message"
          style={{ borderRadius: 0 }}
        >
          {submitting ? <Loader size={14} color="white" /> : <PaperPlaneRight size={16} />}
        </ActionIcon>
      </Group>
    </ClusterCard>
  );
}
