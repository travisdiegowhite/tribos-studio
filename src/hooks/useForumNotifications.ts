/**
 * useForumNotifications Hook
 * In-app notifications for forum activity (replies, quotes, mentions).
 *
 * Rows are created by database triggers; this hook only reads and marks
 * them. Uses polling (60s) per the project's no-Realtime rule — see the
 * Supabase Connection Hygiene section in CLAUDE.md.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 20;

export type ForumNotificationType = 'reply' | 'quote' | 'mention';

export interface ForumNotification {
  id: string;
  user_id: string;
  actor_id: string;
  thread_id: string;
  post_id: string | null;
  type: ForumNotificationType;
  read_at: string | null;
  created_at: string;
  actor?: {
    display_name: string | null;
    community_display_name: string | null;
  };
  thread?: {
    title: string;
  };
}

interface UseForumNotificationsOptions {
  userId: string | null;
  /** Disable polling (e.g. when the forum isn't visible). Defaults to true. */
  enabled?: boolean;
}

export function useForumNotifications({ userId, enabled = true }: UseForumNotificationsOptions) {
  const [notifications, setNotifications] = useState<ForumNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase
      .from('forum_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    setUnreadCount(count || 0);
  }, [userId]);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_notifications')
        .select(`
          *,
          actor:user_profiles!forum_notifications_actor_id_profile_fkey(display_name, community_display_name),
          thread:forum_threads!forum_notifications_thread_id_fkey(title)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Error loading forum notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const markRead = useCallback(async (notificationId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();
    setNotifications(prev =>
      prev.map(n => n.id === notificationId && !n.read_at ? { ...n, read_at: now } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    await supabase
      .from('forum_notifications')
      .update({ read_at: now })
      .eq('id', notificationId)
      .eq('user_id', userId);
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    setUnreadCount(0);

    await supabase
      .from('forum_notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null);
  }, [userId]);

  // Poll the unread count while enabled
  useEffect(() => {
    if (!userId || !enabled) return;

    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, enabled, refreshUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    markRead,
    markAllRead,
    refreshUnreadCount,
  };
}

export default useForumNotifications;
