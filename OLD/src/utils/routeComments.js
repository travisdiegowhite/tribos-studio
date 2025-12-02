// Route Comments Utilities
// Practical, utility-focused comments about routes

import { supabase } from '../supabase';
import { CommentTypes } from './routeSharing';

/**
 * Add a comment to a route
 */
export const addRouteComment = async (routeId, commentData) => {
  const {
    commentType,
    content,
    locationPoint = null,
    segmentIndex = null,
    expiresInDays = null
  } = commentData;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Validate comment type
    if (!Object.values(CommentTypes).includes(commentType)) {
      throw new Error('Invalid comment type');
    }

    // Calculate expiration for temporary conditions
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('route_comments')
      .insert({
        route_id: routeId,
        user_id: user.id,
        comment_type: commentType,
        content: content.trim(),
        location_point: locationPoint,
        segment_index: segmentIndex,
        expires_at: expiresAt,
        is_current: true,
        created_at: new Date().toISOString()
      })
      .select(`
        *,
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return { success: true, comment: data };
  } catch (error) {
    console.error('Error adding route comment:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get comments for a route
 */
export const getRouteComments = async (routeId, filters = {}) => {
  const {
    commentType = null,
    onlyCurrent = true,
    includeExpired = false
  } = filters;

  try {
    let query = supabase
      .from('route_comments')
      .select(`
        *,
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('route_id', routeId)
      .eq('is_flagged', false)
      .order('is_verified', { ascending: false })
      .order('verification_count', { ascending: false })
      .order('created_at', { ascending: false });

    if (commentType) {
      query = query.eq('comment_type', commentType);
    }

    if (onlyCurrent) {
      query = query.eq('is_current', true);
    }

    if (!includeExpired) {
      query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    // Group by comment type
    const grouped = {
      conditions: [],
      tips: [],
      variants: [],
      hazards: [],
      amenities: []
    };

    data.forEach(comment => {
      switch (comment.comment_type) {
        case CommentTypes.CONDITION:
          grouped.conditions.push(comment);
          break;
        case CommentTypes.TIP:
          grouped.tips.push(comment);
          break;
        case CommentTypes.VARIANT:
          grouped.variants.push(comment);
          break;
        case CommentTypes.HAZARD:
          grouped.hazards.push(comment);
          break;
        case CommentTypes.AMENITY:
          grouped.amenities.push(comment);
          break;
      }
    });

    return {
      success: true,
      comments: data,
      grouped
    };
  } catch (error) {
    console.error('Error fetching route comments:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Verify a comment (upvote for usefulness)
 */
export const verifyComment = async (commentId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Check if user already verified this comment
    const { data: comment } = await supabase
      .from('route_comments')
      .select('verified_by_users')
      .eq('id', commentId)
      .single();

    if (comment?.verified_by_users?.includes(user.id)) {
      return { success: false, error: 'Already verified' };
    }

    // Use the database function to verify
    const { data, error } = await supabase.rpc('verify_route_comment', {
      comment_id: commentId,
      verifying_user_id: user.id
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error verifying comment:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update a comment (owner only)
 */
export const updateComment = async (commentId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('route_comments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .eq('user_id', user.id)
      .select(`
        *,
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return { success: true, comment: data };
  } catch (error) {
    console.error('Error updating comment:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete a comment (owner only)
 */
export const deleteComment = async (commentId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('route_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Mark a comment as outdated
 */
export const markCommentOutdated = async (commentId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('route_comments')
      .update({
        is_current: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error marking comment as outdated:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Flag a comment for moderation
 */
export const flagComment = async (commentId, reason = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get current flag count
    const { data: comment } = await supabase
      .from('route_comments')
      .select('flag_count')
      .eq('id', commentId)
      .single();

    const newFlagCount = (comment?.flag_count || 0) + 1;

    const { error } = await supabase
      .from('route_comments')
      .update({
        flag_count: newFlagCount,
        is_flagged: newFlagCount >= 3, // Auto-hide after 3 flags
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error flagging comment:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get comment statistics for a route
 */
export const getCommentStats = async (routeId) => {
  try {
    const { data, error } = await supabase
      .from('route_comments')
      .select('comment_type, is_verified, is_current')
      .eq('route_id', routeId)
      .eq('is_flagged', false);

    if (error) throw error;

    const stats = {
      total: data.length,
      verified: data.filter(c => c.is_verified).length,
      current: data.filter(c => c.is_current).length,
      byType: {
        conditions: data.filter(c => c.comment_type === CommentTypes.CONDITION).length,
        tips: data.filter(c => c.comment_type === CommentTypes.TIP).length,
        variants: data.filter(c => c.comment_type === CommentTypes.VARIANT).length,
        hazards: data.filter(c => c.comment_type === CommentTypes.HAZARD).length,
        amenities: data.filter(c => c.comment_type === CommentTypes.AMENITY).length
      }
    };

    return { success: true, stats };
  } catch (error) {
    console.error('Error fetching comment stats:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get recent comments from friends (for discovery)
 */
export const getFriendComments = async (limit = 20) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get friend connections
    const { data: connections } = await supabase
      .from('connections')
      .select('connected_user_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted');

    if (!connections || connections.length === 0) {
      return { success: true, comments: [] };
    }

    const friendIds = connections.map(c => c.connected_user_id);

    // Get recent comments from friends
    const { data, error } = await supabase
      .from('route_comments')
      .select(`
        *,
        routes (
          id,
          name,
          distance,
          route_type
        ),
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .in('user_id', friendIds)
      .eq('is_current', true)
      .eq('is_flagged', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { success: true, comments: data };
  } catch (error) {
    console.error('Error fetching friend comments:', error);
    return { success: false, error: error.message };
  }
};

export default {
  addRouteComment,
  getRouteComments,
  verifyComment,
  updateComment,
  deleteComment,
  markCommentOutdated,
  flagComment,
  getCommentStats,
  getFriendComments
};
