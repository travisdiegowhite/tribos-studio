/**
 * useChatSession — message-list + processing state for the v2 chat
 * surface.
 *
 * PR-4B adds per-route conversation persistence. On mount with a
 * `routeId`/`userId`, the hook hydrates the thread from
 * `coach_conversations` (scoped by `route_id`, migration 091).
 * `persistTurn` writes the user/assistant pair back after each send.
 * Mirrors the `CheckInThread.tsx` pattern.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { ChatMessage } from './types';

const STATIC_OPENING: ChatMessage = {
  id: 'opening',
  role: 'assistant',
  text:
    "Tell me what kind of ride you're looking for, or ask me to change the route.",
  timestamp: 0,
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseChatSessionArgs {
  routeId: string | null;
  userId: string | null;
  /** Persona-voiced opener override; falls back to the static line. */
  openingMessage?: ChatMessage;
}

export interface UseChatSessionReturn {
  messages: ChatMessage[];
  isProcessing: boolean;
  showExamplesHint: boolean;
  showAfterRefuseHint: boolean;
  hydrated: boolean;
  append: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setProcessing: (processing: boolean) => void;
  markRefused: () => void;
  persistTurn: (userText: string, assistantText: string) => Promise<void>;
}

export function useChatSession({
  routeId,
  userId,
  openingMessage = STATIC_OPENING,
}: UseChatSessionArgs): UseChatSessionReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([openingMessage]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSeenRefuse, setHasSeenRefuse] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the thread from coach_conversations when a route is in scope.
  useEffect(() => {
    if (!routeId || !userId) {
      setHydrated(true); // No persistence to load.
      return;
    }

    let cancelled = false;
    setHydrated(false);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('coach_conversations')
          .select('id, role, message, timestamp')
          .eq('user_id', userId)
          .eq('route_id', routeId)
          .order('timestamp', { ascending: true });

        if (cancelled) return;

        if (!error && data && data.length > 0) {
          const loaded: ChatMessage[] = data.map((row) => ({
            id: row.id,
            role: row.role === 'coach' ? 'assistant' : 'user',
            text: row.message,
            timestamp: new Date(row.timestamp).getTime(),
          }));
          setMessages(loaded);
        }
        // No rows — keep the opener as the first message.
      } catch (err) {
        console.error('[useChatSession] hydration failed:', err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => { cancelled = true; };
  }, [routeId, userId]);

  // Sync a late-arriving opener (the persona-voiced opener is fetched
  // async). Only replaces the message list while it is still the
  // untouched single opener — never clobbers loaded history or an
  // in-progress conversation.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'opening') return [openingMessage];
      return prev;
    });
  }, [openingMessage]);

  const append = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...message, id: newId(), timestamp: Date.now() },
    ]);
  }, []);

  const setProcessing = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  const markRefused = useCallback(() => {
    setHasSeenRefuse(true);
  }, []);

  // Persist a completed turn to coach_conversations. Caller invokes this
  // after the assistant response is in hand. Fails soft — the
  // conversation continues in local state even if the write fails.
  const persistTurn = useCallback(async (userText: string, assistantText: string) => {
    if (!routeId || !userId) return;
    try {
      const baseTs = new Date().toISOString();
      const assistantTs = new Date(Date.now() + 1).toISOString(); // +1ms for order
      await Promise.all([
        supabase.from('coach_conversations').insert({
          user_id: userId,
          route_id: routeId,
          role: 'user',
          message: userText,
          message_type: 'route_edit',
          coach_type: 'strategist',
          timestamp: baseTs,
        }),
        supabase.from('coach_conversations').insert({
          user_id: userId,
          route_id: routeId,
          role: 'coach',
          message: assistantText,
          message_type: 'route_edit',
          coach_type: 'strategist',
          timestamp: assistantTs,
        }),
      ]);
    } catch (err) {
      console.error('[useChatSession] persistTurn failed:', err);
    }
  }, [routeId, userId]);

  return {
    messages,
    isProcessing,
    showExamplesHint: true,
    showAfterRefuseHint: hasSeenRefuse,
    hydrated,
    append,
    setProcessing,
    markRefused,
    persistTurn,
  };
}
