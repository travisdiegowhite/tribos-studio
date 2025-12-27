// Vercel API Route: Activities Management
// Handles activity operations like hide/unhide

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Extract and validate user from Authorization header
 */
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }

  return user;
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, activityId, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate that authenticated user matches requested userId
    const authUser = await getUserFromAuthHeader(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (authUser.id !== userId) {
      console.error(`User ID mismatch: auth user ${authUser.id} requested data for ${userId}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only modify your own activities'
      });
    }

    switch (action) {
      case 'hide':
        return await hideActivity(req, res, userId, activityId, true);

      case 'unhide':
        return await hideActivity(req, res, userId, activityId, false);

      case 'toggle_hide':
        return await toggleHideActivity(req, res, userId, activityId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Activities API error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Hide or unhide an activity
 */
async function hideActivity(req, res, userId, activityId, isHidden) {
  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  // Update the activity
  const { data, error } = await supabase
    .from('activities')
    .update({
      is_hidden: isHidden,
      updated_at: new Date().toISOString()
    })
    .eq('id', activityId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating activity:', error);
    return res.status(500).json({ error: 'Failed to update activity' });
  }

  if (!data) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  console.log(`Activity ${activityId} ${isHidden ? 'hidden' : 'unhidden'} for user ${userId}`);

  return res.status(200).json({
    success: true,
    activity: data,
    message: isHidden ? 'Activity hidden' : 'Activity restored'
  });
}

/**
 * Toggle hide status of an activity
 */
async function toggleHideActivity(req, res, userId, activityId) {
  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  // First get current state
  const { data: current, error: fetchError } = await supabase
    .from('activities')
    .select('is_hidden')
    .eq('id', activityId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !current) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  const newHiddenState = !current.is_hidden;

  // Update the activity
  const { data, error } = await supabase
    .from('activities')
    .update({
      is_hidden: newHiddenState,
      updated_at: new Date().toISOString()
    })
    .eq('id', activityId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error toggling activity visibility:', error);
    return res.status(500).json({ error: 'Failed to update activity' });
  }

  console.log(`Activity ${activityId} toggled to ${newHiddenState ? 'hidden' : 'visible'} for user ${userId}`);

  return res.status(200).json({
    success: true,
    activity: data,
    isHidden: newHiddenState,
    message: newHiddenState ? 'Activity hidden' : 'Activity restored'
  });
}
