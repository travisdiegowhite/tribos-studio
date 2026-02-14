/**
 * useDiscussions Hook
 * Manages cafe discussion threads and replies
 */

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Types
export type DiscussionCategory =
  | 'general'
  | 'training'
  | 'nutrition'
  | 'gear'
  | 'motivation'
  | 'race_prep'
  | 'recovery'
  | 'question';

export interface TrainingContext {
  ctl?: number;
  atl?: number;
  tsb?: number;
  weekly_hours?: number;
  weekly_tss?: number;
  ftp?: number;
}

export interface Discussion {
  id: string;
  cafe_id: string;
  author_id: string;
  title: string;
  body: string;
  include_training_context: boolean;
  training_context: TrainingContext | null;
  category: DiscussionCategory;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  last_reply_at: string | null;
  last_reply_by: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    display_name: string | null;
    community_display_name: string | null;
  };
}

export interface DiscussionReply {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  include_training_context: boolean;
  training_context: TrainingContext | null;
  parent_reply_id: string | null;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  author?: {
    display_name: string | null;
    community_display_name: string | null;
  };
  has_marked_helpful?: boolean;
}

export interface CreateDiscussionData {
  title: string;
  body: string;
  category?: DiscussionCategory;
  include_training_context?: boolean;
  training_context?: TrainingContext;
}

export interface CreateReplyData {
  body: string;
  parent_reply_id?: string;
  include_training_context?: boolean;
  training_context?: TrainingContext;
}

interface UseDiscussionsOptions {
  cafeId: string | null;
  userId: string | null;
}

interface UseDiscussionsReturn {
  // State
  discussions: Discussion[];
  activeDiscussion: Discussion | null;
  replies: DiscussionReply[];
  loading: boolean;
  error: string | null;

  // Discussion operations
  loadDiscussions: (category?: DiscussionCategory) => Promise<void>;
  loadDiscussion: (discussionId: string) => Promise<void>;
  createDiscussion: (data: CreateDiscussionData) => Promise<Discussion | null>;
  updateDiscussion: (discussionId: string, data: Partial<CreateDiscussionData>) => Promise<boolean>;
  deleteDiscussion: (discussionId: string) => Promise<boolean>;

  // Reply operations
  loadReplies: (discussionId: string) => Promise<void>;
  createReply: (discussionId: string, data: CreateReplyData) => Promise<DiscussionReply | null>;
  updateReply: (replyId: string, body: string) => Promise<boolean>;
  deleteReply: (replyId: string) => Promise<boolean>;

  // Helpful markers
  markHelpful: (replyId: string) => Promise<boolean>;
  unmarkHelpful: (replyId: string) => Promise<boolean>;

  // Utilities
  clearActiveDiscussion: () => void;
}

export const CATEGORY_LABELS: Record<DiscussionCategory, string> = {
  general: 'General',
  training: 'Training',
  nutrition: 'Nutrition',
  gear: 'Gear',
  motivation: 'Motivation',
  race_prep: 'Race Prep',
  recovery: 'Recovery',
  question: 'Question',
};

export const CATEGORY_COLORS: Record<DiscussionCategory, string> = {
  general: 'gray',
  training: 'teal',
  nutrition: 'sage',
  gear: 'gold',
  motivation: 'terracotta',
  race_prep: 'mauve',
  recovery: 'dusty-rose',
  question: 'sky',
};

export function useDiscussions({
  cafeId,
  userId,
}: UseDiscussionsOptions): UseDiscussionsReturn {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [activeDiscussion, setActiveDiscussion] = useState<Discussion | null>(null);
  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // LOAD DISCUSSIONS
  // ============================================================
  const loadDiscussions = useCallback(async (category?: DiscussionCategory) => {
    if (!cafeId) return;

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('cafe_discussions')
        .select(`
          *,
          author:user_profiles!cafe_discussions_author_id_profile_fkey(display_name, community_display_name)
        `)
        .eq('cafe_id', cafeId)
        .order('is_pinned', { ascending: false })
        .order('last_reply_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error: fetchError } = await query.limit(50);

      if (fetchError) throw fetchError;

      setDiscussions(data || []);
    } catch (err: any) {
      console.error('Error loading discussions:', err);
      setError(err.message || 'Failed to load discussions');
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  // ============================================================
  // LOAD SINGLE DISCUSSION
  // ============================================================
  const loadDiscussion = useCallback(async (discussionId: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('cafe_discussions')
        .select(`
          *,
          author:user_profiles!cafe_discussions_author_id_profile_fkey(display_name, community_display_name)
        `)
        .eq('id', discussionId)
        .single();

      if (fetchError) throw fetchError;

      setActiveDiscussion(data);
    } catch (err: any) {
      console.error('Error loading discussion:', err);
      setError(err.message || 'Failed to load discussion');
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // CREATE DISCUSSION
  // ============================================================
  const createDiscussion = useCallback(async (data: CreateDiscussionData): Promise<Discussion | null> => {
    if (!cafeId || !userId) return null;

    try {
      setError(null);

      const { data: newDiscussion, error: insertError } = await supabase
        .from('cafe_discussions')
        .insert({
          cafe_id: cafeId,
          author_id: userId,
          title: data.title,
          body: data.body,
          category: data.category || 'general',
          include_training_context: data.include_training_context || false,
          training_context: data.training_context || null,
        })
        .select(`
          *,
          author:user_profiles!cafe_discussions_author_id_profile_fkey(display_name, community_display_name)
        `)
        .single();

      if (insertError) throw insertError;

      // Add to local state
      setDiscussions(prev => [newDiscussion, ...prev]);

      return newDiscussion;
    } catch (err: any) {
      console.error('Error creating discussion:', err);
      setError(err.message || 'Failed to create discussion');
      return null;
    }
  }, [cafeId, userId]);

  // ============================================================
  // UPDATE DISCUSSION
  // ============================================================
  const updateDiscussion = useCallback(async (
    discussionId: string,
    data: Partial<CreateDiscussionData>
  ): Promise<boolean> => {
    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('cafe_discussions')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', discussionId);

      if (updateError) throw updateError;

      // Update local state
      setDiscussions(prev =>
        prev.map(d => d.id === discussionId ? { ...d, ...data } : d)
      );

      if (activeDiscussion?.id === discussionId) {
        setActiveDiscussion(prev => prev ? { ...prev, ...data } : null);
      }

      return true;
    } catch (err: any) {
      console.error('Error updating discussion:', err);
      setError(err.message || 'Failed to update discussion');
      return false;
    }
  }, [activeDiscussion]);

  // ============================================================
  // DELETE DISCUSSION
  // ============================================================
  const deleteDiscussion = useCallback(async (discussionId: string): Promise<boolean> => {
    try {
      setError(null);

      const { error: deleteError } = await supabase
        .from('cafe_discussions')
        .delete()
        .eq('id', discussionId);

      if (deleteError) throw deleteError;

      // Update local state
      setDiscussions(prev => prev.filter(d => d.id !== discussionId));

      if (activeDiscussion?.id === discussionId) {
        setActiveDiscussion(null);
      }

      return true;
    } catch (err: any) {
      console.error('Error deleting discussion:', err);
      setError(err.message || 'Failed to delete discussion');
      return false;
    }
  }, [activeDiscussion]);

  // ============================================================
  // LOAD REPLIES
  // ============================================================
  const loadReplies = useCallback(async (discussionId: string) => {
    if (!userId) return;

    try {
      setError(null);

      // Get replies
      const { data: replyData, error: fetchError } = await supabase
        .from('cafe_discussion_replies')
        .select(`
          *,
          author:user_profiles!cafe_discussion_replies_author_id_profile_fkey(display_name, community_display_name)
        `)
        .eq('discussion_id', discussionId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Get user's helpful markers for these replies
      const replyIds = (replyData || []).map(r => r.id);
      let helpfulMarkers: string[] = [];

      if (replyIds.length > 0) {
        const { data: markers } = await supabase
          .from('cafe_helpful_markers')
          .select('reply_id')
          .eq('user_id', userId)
          .in('reply_id', replyIds);

        helpfulMarkers = (markers || []).map(m => m.reply_id);
      }

      // Merge helpful status into replies
      const repliesWithHelpful = (replyData || []).map(reply => ({
        ...reply,
        has_marked_helpful: helpfulMarkers.includes(reply.id),
      }));

      setReplies(repliesWithHelpful);
    } catch (err: any) {
      console.error('Error loading replies:', err);
      setError(err.message || 'Failed to load replies');
    }
  }, [userId]);

  // ============================================================
  // CREATE REPLY
  // ============================================================
  const createReply = useCallback(async (
    discussionId: string,
    data: CreateReplyData
  ): Promise<DiscussionReply | null> => {
    if (!userId) return null;

    try {
      setError(null);

      const { data: newReply, error: insertError } = await supabase
        .from('cafe_discussion_replies')
        .insert({
          discussion_id: discussionId,
          author_id: userId,
          body: data.body,
          parent_reply_id: data.parent_reply_id || null,
          include_training_context: data.include_training_context || false,
          training_context: data.training_context || null,
        })
        .select(`
          *,
          author:user_profiles!cafe_discussion_replies_author_id_profile_fkey(display_name, community_display_name)
        `)
        .single();

      if (insertError) throw insertError;

      // Add to local state
      setReplies(prev => [...prev, { ...newReply, has_marked_helpful: false }]);

      // Update discussion reply count in local state
      setDiscussions(prev =>
        prev.map(d =>
          d.id === discussionId
            ? { ...d, reply_count: d.reply_count + 1, last_reply_at: newReply.created_at }
            : d
        )
      );

      if (activeDiscussion?.id === discussionId) {
        setActiveDiscussion(prev =>
          prev
            ? { ...prev, reply_count: prev.reply_count + 1, last_reply_at: newReply.created_at }
            : null
        );
      }

      return newReply;
    } catch (err: any) {
      console.error('Error creating reply:', err);
      setError(err.message || 'Failed to create reply');
      return null;
    }
  }, [userId, activeDiscussion]);

  // ============================================================
  // UPDATE REPLY
  // ============================================================
  const updateReply = useCallback(async (replyId: string, body: string): Promise<boolean> => {
    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('cafe_discussion_replies')
        .update({
          body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', replyId);

      if (updateError) throw updateError;

      // Update local state
      setReplies(prev =>
        prev.map(r => r.id === replyId ? { ...r, body } : r)
      );

      return true;
    } catch (err: any) {
      console.error('Error updating reply:', err);
      setError(err.message || 'Failed to update reply');
      return false;
    }
  }, []);

  // ============================================================
  // DELETE REPLY
  // ============================================================
  const deleteReply = useCallback(async (replyId: string): Promise<boolean> => {
    try {
      setError(null);

      const reply = replies.find(r => r.id === replyId);

      const { error: deleteError } = await supabase
        .from('cafe_discussion_replies')
        .delete()
        .eq('id', replyId);

      if (deleteError) throw deleteError;

      // Update local state
      setReplies(prev => prev.filter(r => r.id !== replyId));

      // Update discussion reply count
      if (reply) {
        setDiscussions(prev =>
          prev.map(d =>
            d.id === reply.discussion_id
              ? { ...d, reply_count: Math.max(0, d.reply_count - 1) }
              : d
          )
        );

        if (activeDiscussion?.id === reply.discussion_id) {
          setActiveDiscussion(prev =>
            prev
              ? { ...prev, reply_count: Math.max(0, prev.reply_count - 1) }
              : null
          );
        }
      }

      return true;
    } catch (err: any) {
      console.error('Error deleting reply:', err);
      setError(err.message || 'Failed to delete reply');
      return false;
    }
  }, [replies, activeDiscussion]);

  // ============================================================
  // MARK HELPFUL
  // ============================================================
  const markHelpful = useCallback(async (replyId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: insertError } = await supabase
        .from('cafe_helpful_markers')
        .insert({
          user_id: userId,
          reply_id: replyId,
        });

      if (insertError) throw insertError;

      // Update local state
      setReplies(prev =>
        prev.map(r =>
          r.id === replyId
            ? { ...r, helpful_count: r.helpful_count + 1, has_marked_helpful: true }
            : r
        )
      );

      return true;
    } catch (err: any) {
      // Ignore duplicate errors
      if (err.code === '23505') return true;
      console.error('Error marking helpful:', err);
      setError(err.message || 'Failed to mark helpful');
      return false;
    }
  }, [userId]);

  // ============================================================
  // UNMARK HELPFUL
  // ============================================================
  const unmarkHelpful = useCallback(async (replyId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: deleteError } = await supabase
        .from('cafe_helpful_markers')
        .delete()
        .eq('user_id', userId)
        .eq('reply_id', replyId);

      if (deleteError) throw deleteError;

      // Update local state
      setReplies(prev =>
        prev.map(r =>
          r.id === replyId
            ? { ...r, helpful_count: Math.max(0, r.helpful_count - 1), has_marked_helpful: false }
            : r
        )
      );

      return true;
    } catch (err: any) {
      console.error('Error unmarking helpful:', err);
      setError(err.message || 'Failed to unmark helpful');
      return false;
    }
  }, [userId]);

  // ============================================================
  // CLEAR ACTIVE DISCUSSION
  // ============================================================
  const clearActiveDiscussion = useCallback(() => {
    setActiveDiscussion(null);
    setReplies([]);
  }, []);

  return {
    // State
    discussions,
    activeDiscussion,
    replies,
    loading,
    error,

    // Discussion operations
    loadDiscussions,
    loadDiscussion,
    createDiscussion,
    updateDiscussion,
    deleteDiscussion,

    // Reply operations
    loadReplies,
    createReply,
    updateReply,
    deleteReply,

    // Helpful markers
    markHelpful,
    unmarkHelpful,

    // Utilities
    clearActiveDiscussion,
  };
}

export default useDiscussions;
