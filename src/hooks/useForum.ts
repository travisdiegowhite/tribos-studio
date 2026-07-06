/**
 * useForum Hook
 * Manages the community-wide forum: categories, threads, posts,
 * reactions, read tracking, moderation, and search.
 *
 * Follows the same conventions as useDiscussions.ts (self-contained
 * Supabase queries with optimistic local-state updates).
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================
// Types
// ============================================================

export type ForumSort = 'latest' | 'top' | 'new' | 'unanswered';

export type ForumReactionType = 'thumbs_up' | 'heart' | 'fire' | 'flex' | 'laugh';

export const REACTION_EMOJI: Record<ForumReactionType, string> = {
  thumbs_up: '👍',
  heart: '❤️',
  fire: '🔥',
  flex: '💪',
  laugh: '😂',
};

export const THREADS_PER_PAGE = 25;

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  thread_count: number;
}

export interface ForumAuthor {
  display_name: string | null;
  community_display_name: string | null;
}

export interface ForumThread {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  body: string;
  include_training_context: boolean;
  training_context: Record<string, number> | null;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  reaction_count: number;
  last_post_at: string | null;
  last_post_by: string | null;
  last_activity_at: string;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  author?: ForumAuthor;
  // Client-side annotations
  is_unread?: boolean;
}

export interface ForumPost {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  parent_post_id: string | null;
  reaction_count: number;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  author?: ForumAuthor;
}

/** Reactions for one target, keyed by type, with the current user's picks. */
export interface ReactionSummary {
  counts: Partial<Record<ForumReactionType, number>>;
  mine: ForumReactionType[];
}

export interface ForumSearchResult {
  thread_id: string;
  title: string;
  category_id: string;
  snippet: string;
  rank: number;
  matched_in: 'thread' | 'reply';
  reply_count: number;
  last_activity_at: string;
}

export interface CreateThreadData {
  title: string;
  body: string;
  category_id: string;
}

const AUTHOR_SELECT = 'display_name, community_display_name';

export function forumAuthorName(author?: ForumAuthor | null): string {
  return author?.community_display_name || author?.display_name || 'Rider';
}

interface UseForumOptions {
  userId: string | null;
}

export function useForum({ userId }: UseForumOptions) {
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [threadTotal, setThreadTotal] = useState(0);
  const [activeThread, setActiveThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  // Reaction summaries keyed by `thread:<id>` / `post:<id>`
  const [reactions, setReactions] = useState<Record<string, ReactionSummary>>({});
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // CATEGORIES + MODERATOR STATUS (once per mount)
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    const loadStatics = async () => {
      const { data: cats } = await supabase
        .from('forum_categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!cancelled && cats) setCategories(cats);

      if (userId) {
        const { data: mod } = await supabase
          .from('forum_moderators')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (!cancelled) setIsModerator(!!mod);
      }
    };

    loadStatics();
    return () => { cancelled = true; };
  }, [userId]);

  // ============================================================
  // LOAD THREADS (paginated, sorted, optionally filtered by category)
  // ============================================================
  const loadThreads = useCallback(async (opts: {
    categoryId?: string | null;
    sort?: ForumSort;
    page?: number;
  } = {}) => {
    const { categoryId = null, sort = 'latest', page = 0 } = opts;

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('forum_threads')
        .select(`
          *,
          author:user_profiles!forum_threads_author_id_profile_fkey(${AUTHOR_SELECT})
        `, { count: 'exact' });

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      if (sort === 'unanswered') {
        query = query.eq('reply_count', 0);
      }

      // Pinned threads always float to the top
      query = query.order('is_pinned', { ascending: false });

      if (sort === 'top') {
        query = query.order('reaction_count', { ascending: false });
      } else if (sort === 'new' || sort === 'unanswered') {
        query = query.order('created_at', { ascending: false });
      }
      query = query.order('last_activity_at', { ascending: false });

      const from = page * THREADS_PER_PAGE;
      const { data, count, error: fetchError } = await query
        .range(from, from + THREADS_PER_PAGE - 1);

      if (fetchError) throw fetchError;

      let rows: ForumThread[] = data || [];

      // Annotate unread state from the user's read markers
      if (userId && rows.length > 0) {
        const { data: reads } = await supabase
          .from('forum_thread_reads')
          .select('thread_id, last_read_at')
          .eq('user_id', userId)
          .in('thread_id', rows.map(t => t.id));

        const readMap = new Map((reads || []).map(r => [r.thread_id, r.last_read_at]));
        rows = rows.map(t => {
          const lastRead = readMap.get(t.id);
          const isOwnUntouched = t.author_id === userId && t.reply_count === 0;
          return {
            ...t,
            is_unread: !isOwnUntouched &&
              (!lastRead || new Date(lastRead) < new Date(t.last_activity_at)),
          };
        });
      }

      setThreads(rows);
      setThreadTotal(count || 0);
    } catch (err: any) {
      console.error('Error loading forum threads:', err);
      setError(err.message || 'Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ============================================================
  // REACTIONS (fetched per thread view, aggregated client-side)
  // ============================================================
  const loadReactionsFor = useCallback(async (threadId: string, postIds: string[]) => {
    if (!userId) return;

    const [threadRes, postRes] = await Promise.all([
      supabase.from('forum_reactions')
        .select('user_id, thread_id, post_id, reaction')
        .eq('thread_id', threadId),
      postIds.length > 0
        ? supabase.from('forum_reactions')
            .select('user_id, thread_id, post_id, reaction')
            .in('post_id', postIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const summary: Record<string, ReactionSummary> = {};
    const addRow = (row: any) => {
      const key = row.thread_id ? `thread:${row.thread_id}` : `post:${row.post_id}`;
      if (!summary[key]) summary[key] = { counts: {}, mine: [] };
      const type = row.reaction as ForumReactionType;
      summary[key].counts[type] = (summary[key].counts[type] || 0) + 1;
      if (row.user_id === userId) summary[key].mine.push(type);
    };
    (threadRes.data || []).forEach(addRow);
    (postRes.data || []).forEach(addRow);

    setReactions(summary);
  }, [userId]);

  // ============================================================
  // LOAD SINGLE THREAD (+ posts + reactions) AND MARK READ
  // ============================================================
  const loadThread = useCallback(async (threadId: string) => {
    try {
      setThreadLoading(true);
      setError(null);

      const [threadRes, postsRes] = await Promise.all([
        supabase
          .from('forum_threads')
          .select(`
            *,
            author:user_profiles!forum_threads_author_id_profile_fkey(${AUTHOR_SELECT})
          `)
          .eq('id', threadId)
          .single(),
        supabase
          .from('forum_posts')
          .select(`
            *,
            author:user_profiles!forum_posts_author_id_profile_fkey(${AUTHOR_SELECT})
          `)
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true }),
      ]);

      if (threadRes.error) throw threadRes.error;
      if (postsRes.error) throw postsRes.error;

      setActiveThread(threadRes.data);
      setPosts(postsRes.data || []);

      await loadReactionsFor(threadId, (postsRes.data || []).map(p => p.id));

      // Mark read + clear the unread dot in the list
      if (userId) {
        await supabase
          .from('forum_thread_reads')
          .upsert(
            { user_id: userId, thread_id: threadId, last_read_at: new Date().toISOString() },
            { onConflict: 'user_id,thread_id' }
          );
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, is_unread: false } : t));
      }
    } catch (err: any) {
      console.error('Error loading thread:', err);
      setError(err.message || 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  }, [userId, loadReactionsFor]);

  const clearActiveThread = useCallback(() => {
    setActiveThread(null);
    setPosts([]);
    setReactions({});
  }, []);

  // ============================================================
  // THREAD CRUD
  // ============================================================
  const createThread = useCallback(async (data: CreateThreadData): Promise<ForumThread | null> => {
    if (!userId) return null;

    try {
      setError(null);
      const { data: created, error: insertError } = await supabase
        .from('forum_threads')
        .insert({
          category_id: data.category_id,
          author_id: userId,
          title: data.title,
          body: data.body,
        })
        .select(`
          *,
          author:user_profiles!forum_threads_author_id_profile_fkey(${AUTHOR_SELECT})
        `)
        .single();

      if (insertError) throw insertError;

      setThreads(prev => [created, ...prev]);
      setThreadTotal(prev => prev + 1);
      return created;
    } catch (err: any) {
      console.error('Error creating thread:', err);
      setError(err.message || 'Failed to create thread');
      return null;
    }
  }, [userId]);

  const updateThread = useCallback(async (
    threadId: string,
    data: Partial<Pick<ForumThread, 'title' | 'body' | 'category_id'>>
  ): Promise<boolean> => {
    try {
      setError(null);
      const patch = { ...data, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { error: updateError } = await supabase
        .from('forum_threads')
        .update(patch)
        .eq('id', threadId);

      if (updateError) throw updateError;

      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, ...patch } : t));
      setActiveThread(prev => prev?.id === threadId ? { ...prev, ...patch } : prev);
      return true;
    } catch (err: any) {
      console.error('Error updating thread:', err);
      setError(err.message || 'Failed to update thread');
      return false;
    }
  }, []);

  const deleteThread = useCallback(async (threadId: string): Promise<boolean> => {
    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from('forum_threads')
        .delete()
        .eq('id', threadId);

      if (deleteError) throw deleteError;

      setThreads(prev => prev.filter(t => t.id !== threadId));
      setThreadTotal(prev => Math.max(0, prev - 1));
      setActiveThread(prev => prev?.id === threadId ? null : prev);
      return true;
    } catch (err: any) {
      console.error('Error deleting thread:', err);
      setError(err.message || 'Failed to delete thread');
      return false;
    }
  }, []);

  // Moderation: pin / lock (RLS restricts to moderators or the author)
  const setThreadFlags = useCallback(async (
    threadId: string,
    flags: Partial<Pick<ForumThread, 'is_pinned' | 'is_locked'>>
  ): Promise<boolean> => {
    try {
      setError(null);
      const { error: updateError } = await supabase
        .from('forum_threads')
        .update(flags)
        .eq('id', threadId);

      if (updateError) throw updateError;

      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, ...flags } : t));
      setActiveThread(prev => prev?.id === threadId ? { ...prev, ...flags } : prev);
      return true;
    } catch (err: any) {
      console.error('Error updating thread flags:', err);
      setError(err.message || 'Failed to update thread');
      return false;
    }
  }, []);

  // ============================================================
  // POST CRUD
  // ============================================================
  const createPost = useCallback(async (
    threadId: string,
    body: string,
    parentPostId?: string
  ): Promise<ForumPost | null> => {
    if (!userId) return null;

    try {
      setError(null);
      const { data: created, error: insertError } = await supabase
        .from('forum_posts')
        .insert({
          thread_id: threadId,
          author_id: userId,
          body,
          parent_post_id: parentPostId || null,
        })
        .select(`
          *,
          author:user_profiles!forum_posts_author_id_profile_fkey(${AUTHOR_SELECT})
        `)
        .single();

      if (insertError) throw insertError;

      setPosts(prev => [...prev, created]);
      const bump = (t: ForumThread): ForumThread => ({
        ...t,
        reply_count: t.reply_count + 1,
        last_post_at: created.created_at,
        last_activity_at: created.created_at,
      });
      setThreads(prev => prev.map(t => t.id === threadId ? bump(t) : t));
      setActiveThread(prev => prev?.id === threadId ? bump(prev) : prev);

      // Keep our own read marker current so our reply doesn't look unread
      await supabase
        .from('forum_thread_reads')
        .upsert(
          { user_id: userId, thread_id: threadId, last_read_at: new Date().toISOString() },
          { onConflict: 'user_id,thread_id' }
        );

      return created;
    } catch (err: any) {
      console.error('Error creating post:', err);
      setError(err.message || 'Failed to post reply');
      return null;
    }
  }, [userId]);

  const updatePost = useCallback(async (postId: string, body: string): Promise<boolean> => {
    try {
      setError(null);
      const patch = { body, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { error: updateError } = await supabase
        .from('forum_posts')
        .update(patch)
        .eq('id', postId);

      if (updateError) throw updateError;

      setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...patch } : p));
      return true;
    } catch (err: any) {
      console.error('Error updating post:', err);
      setError(err.message || 'Failed to update reply');
      return false;
    }
  }, []);

  const deletePost = useCallback(async (postId: string): Promise<boolean> => {
    try {
      setError(null);
      const post = posts.find(p => p.id === postId);
      const { error: deleteError } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId);

      if (deleteError) throw deleteError;

      setPosts(prev => prev.filter(p => p.id !== postId));
      if (post) {
        const drop = (t: ForumThread): ForumThread => ({
          ...t,
          reply_count: Math.max(0, t.reply_count - 1),
        });
        setThreads(prev => prev.map(t => t.id === post.thread_id ? drop(t) : t));
        setActiveThread(prev => prev?.id === post.thread_id ? drop(prev) : prev);
      }
      return true;
    } catch (err: any) {
      console.error('Error deleting post:', err);
      setError(err.message || 'Failed to delete reply');
      return false;
    }
  }, [posts]);

  // ============================================================
  // REACTIONS (toggle)
  // ============================================================
  const toggleReaction = useCallback(async (
    target: { threadId?: string; postId?: string },
    type: ForumReactionType
  ): Promise<boolean> => {
    if (!userId) return false;
    const key = target.threadId ? `thread:${target.threadId}` : `post:${target.postId}`;
    const current = reactions[key] || { counts: {}, mine: [] };
    const hasReacted = current.mine.includes(type);

    // Optimistic update
    setReactions(prev => {
      const entry = prev[key] || { counts: {}, mine: [] };
      const count = entry.counts[type] || 0;
      return {
        ...prev,
        [key]: {
          counts: { ...entry.counts, [type]: Math.max(0, count + (hasReacted ? -1 : 1)) },
          mine: hasReacted ? entry.mine.filter(t => t !== type) : [...entry.mine, type],
        },
      };
    });

    try {
      if (hasReacted) {
        let query = supabase.from('forum_reactions')
          .delete()
          .eq('user_id', userId)
          .eq('reaction', type);
        query = target.threadId
          ? query.eq('thread_id', target.threadId)
          : query.eq('post_id', target.postId!);
        const { error: deleteError } = await query;
        if (deleteError) throw deleteError;
      } else {
        const { error: insertError } = await supabase.from('forum_reactions').insert({
          user_id: userId,
          thread_id: target.threadId || null,
          post_id: target.postId || null,
          reaction: type,
        });
        if (insertError && insertError.code !== '23505') throw insertError;
      }
      return true;
    } catch (err: any) {
      console.error('Error toggling reaction:', err);
      // Roll back optimistic update
      setReactions(prev => ({ ...prev, [key]: current }));
      return false;
    }
  }, [userId, reactions]);

  // ============================================================
  // SEARCH
  // ============================================================
  const searchForum = useCallback(async (query: string): Promise<ForumSearchResult[]> => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    try {
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('search_forum', {
        search_query: trimmed,
        max_results: 20,
      });
      if (rpcError) throw rpcError;
      return data || [];
    } catch (err: any) {
      console.error('Error searching forum:', err);
      setError(err.message || 'Search failed');
      return [];
    }
  }, []);

  return {
    // State
    categories,
    threads,
    threadTotal,
    activeThread,
    posts,
    reactions,
    isModerator,
    loading,
    threadLoading,
    error,

    // Threads
    loadThreads,
    loadThread,
    clearActiveThread,
    createThread,
    updateThread,
    deleteThread,
    setThreadFlags,

    // Posts
    createPost,
    updatePost,
    deletePost,

    // Reactions
    toggleReaction,

    // Search
    searchForum,
  };
}

export default useForum;
