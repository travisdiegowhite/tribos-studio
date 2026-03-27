/**
 * CheckInThread — Inline conversation below a coaching check-in.
 *
 * Lets the athlete ask follow-up questions about the check-in analysis.
 * Messages are persisted to coach_conversations with check_in_id linkage
 * so each check-in has its own scoped thread.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Stack,
  Text,
  TextInput,
  Paper,
  Box,
  Group,
  Loader,
  ActionIcon,
  ScrollArea,
} from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { ChatCircle, PaperPlaneRight } from '@phosphor-icons/react';
import { CoachMarkdown } from './CoachMarkdown';

interface Message {
  id: string;
  role: 'user' | 'coach';
  message: string;
  timestamp: string;
}

interface CheckInThreadProps {
  checkInId: string;
  trainingContext?: string | null;
}

const getApiBaseUrl = () => '';

export default function CheckInThread({ checkInId, trainingContext = null }: CheckInThreadProps) {
  const { user } = useAuth() as { user: { id: string } | null };
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing thread messages for this check-in
  const loadMessages = useCallback(async () => {
    if (!user?.id || !checkInId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('coach_conversations')
        .select('id, role, message, timestamp')
        .eq('user_id', user.id)
        .eq('check_in_id', checkInId)
        .order('timestamp', { ascending: true });

      if (!error && data) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Error loading check-in thread:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.id, checkInId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !user?.id) return;

    setInput('');
    setLoading(true);

    // Optimistic: show user message immediately
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      message: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      // Build conversation history for Claude from existing thread messages
      const history = messages.map((m) => ({
        role: m.role === 'coach' ? 'assistant' : 'user',
        content: m.message,
      }));

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();

      // Call the coach API with check-in context
      const now = new Date();
      const res = await fetch(`${getApiBaseUrl()}/api/coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: history,
          trainingContext,
          checkInId,
          userId: user.id,
          maxTokens: 1024,
          quickMode: true,
          userLocalDate: {
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
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to get response');
      }

      const data = await res.json();
      const coachResponse = data.message || '';

      // Save both messages to DB with check_in_id linkage
      const timestamp = new Date().toISOString();
      await Promise.all([
        supabase.from('coach_conversations').insert({
          user_id: user.id,
          role: 'user',
          message: trimmed,
          message_type: 'chat',
          check_in_id: checkInId,
          coach_type: 'strategist',
          timestamp,
        }),
        supabase.from('coach_conversations').insert({
          user_id: user.id,
          role: 'coach',
          message: coachResponse,
          message_type: 'chat',
          check_in_id: checkInId,
          coach_type: 'strategist',
          timestamp: new Date(Date.now() + 1).toISOString(), // +1ms to preserve order
        }),
      ]);

      // Replace temp message and add coach reply
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: `user-${Date.now()}` },
        {
          id: `coach-${Date.now()}`,
          role: 'coach',
          message: coachResponse,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Error in check-in thread:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      setInput(trimmed); // Restore input
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <Paper
      p="md"
      withBorder
      style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
    >
      {/* Header */}
      <Group gap={6} mb={hasMessages ? 'sm' : 0}>
        <ChatCircle size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          Ask About This Check-In
        </Text>
      </Group>

      {/* Message thread */}
      {loadingHistory ? (
        <Loader size="xs" color="teal" />
      ) : hasMessages ? (
        <ScrollArea.Autosize mah={300} ref={scrollRef} mb="sm">
          <Stack gap="xs">
            {messages.map((msg) => (
              <Box
                key={msg.id}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                }}
              >
                <Paper
                  p="xs"
                  px="sm"
                  style={{
                    borderRadius: 0,
                    backgroundColor:
                      msg.role === 'user'
                        ? 'var(--mantine-color-teal-0)'
                        : 'var(--color-bg-secondary, var(--mantine-color-gray-0))',
                    border: `1px solid ${
                      msg.role === 'user'
                        ? 'var(--mantine-color-teal-2)'
                        : 'var(--tribos-border-default, var(--mantine-color-gray-3))'
                    }`,
                  }}
                >
                  {msg.role === 'user' ? (
                    <Text
                      size="sm"
                      style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
                    >
                      {msg.message}
                    </Text>
                  ) : (
                    <CoachMarkdown size="sm">
                      {msg.message}
                    </CoachMarkdown>
                  )}
                </Paper>
              </Box>
            ))}
            {loading && (
              <Group gap={4} px="sm">
                <Loader size={12} color="teal" />
                <Text size="xs" c="dimmed">Coach is thinking...</Text>
              </Group>
            )}
          </Stack>
        </ScrollArea.Autosize>
      ) : null}

      {/* Input */}
      <TextInput
        ref={inputRef}
        placeholder={hasMessages ? 'Ask a follow-up...' : 'Why did you recommend this? What if I skip today?'}
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={loading}
        rightSection={
          <ActionIcon
            size="sm"
            variant="subtle"
            color="teal"
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
          >
            <PaperPlaneRight size={14} />
          </ActionIcon>
        }
        styles={{
          input: {
            borderRadius: 0,
            borderColor: 'var(--tribos-border-default)',
            fontSize: 'var(--mantine-font-size-sm)',
          },
        }}
      />
    </Paper>
  );
}
