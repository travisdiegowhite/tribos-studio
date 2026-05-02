/**
 * Reads the most recent N messages from `coach_conversations` for the user.
 * Returns chronological order (oldest first) so the UI can render top-down.
 *
 * The DB column is `message`; we expose it as `content` for UI symmetry with
 * `/api/coach`'s request shape.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export type CoachRole = 'user' | 'coach' | 'system';

export interface CoachMessage {
  id: string;
  role: CoachRole;
  content: string;
  timestamp: string;
}

export function useCoachConversation(
  userId: string | null | undefined,
  options: { limit?: number } = {}
): {
  messages: CoachMessage[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const limit = options.limit ?? 4;
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  const load = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('coach_conversations')
      .select('id, role, message, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (Array.isArray(data)) {
      const mapped: CoachMessage[] = data
        .map((row) => ({
          id: (row as { id: string }).id,
          role: (row as { role: CoachRole }).role,
          content: (row as { message: string }).message,
          timestamp: (row as { timestamp: string }).timestamp,
        }))
        .reverse();
      setMessages(mapped);
    }
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { messages, loading, refresh: load };
}
