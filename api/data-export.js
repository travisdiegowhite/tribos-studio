// Vercel API Route: User Data Export
// Exports all user data as JSON for GDPR/compliance data portability requests

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase with service role (server-side only)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper to get user from Authorization header
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

// Fetch all rows from a table for a given user_id, handling errors gracefully
async function fetchUserData(tableName, userId, options = {}) {
  const { foreignKey = 'user_id', select = '*' } = options;

  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(select)
      .eq(foreignKey, userId);

    if (error) {
      console.error(`Error fetching ${tableName}:`, error.message);
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error(`Exception fetching ${tableName}:`, err.message);
    return { data: null, error: err.message };
  }
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
    // Authenticate user via Bearer token
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized. Please provide a valid Bearer token.',
        code: 'UNAUTHORIZED'
      });
    }

    const userId = user.id;
    console.log('Data export requested for user:', userId);

    // Fetch all user data in parallel for performance
    const [
      profileResult,
      activitiesResult,
      routesResult,
      trainingPlansResult,
      plannedWorkoutsResult,
      conversationThreadsResult,
      coachConversationsResult,
      gearItemsResult,
      gearComponentsResult
    ] = await Promise.all([
      fetchUserData('user_profiles', userId, { foreignKey: 'id' }),
      fetchUserData('activities', userId),
      fetchUserData('routes', userId),
      fetchUserData('training_plans', userId),
      fetchUserData('planned_workouts', userId),
      fetchUserData('conversation_threads', userId),
      fetchUserData('coach_conversations', userId),
      fetchUserData('gear_items', userId),
      fetchUserData('gear_components', userId)
    ]);

    // Update data_export_requested_at on the user's profile
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ data_export_requested_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating data_export_requested_at:', updateError.message);
      // Non-fatal: continue with the export even if timestamp update fails
    }

    // Build the export payload
    const exportData = {
      export_metadata: {
        user_id: userId,
        email: user.email,
        exported_at: new Date().toISOString(),
        format_version: '1.0'
      },
      user_profiles: profileResult.data,
      activities: activitiesResult.data,
      routes: routesResult.data,
      training_plans: trainingPlansResult.data,
      planned_workouts: plannedWorkoutsResult.data,
      conversation_threads: conversationThreadsResult.data,
      coach_conversations: coachConversationsResult.data,
      gear_items: gearItemsResult.data,
      gear_components: gearComponentsResult.data
    };

    // Collect any errors that occurred during fetching
    const errors = {};
    if (profileResult.error) errors.user_profiles = profileResult.error;
    if (activitiesResult.error) errors.activities = activitiesResult.error;
    if (routesResult.error) errors.routes = routesResult.error;
    if (trainingPlansResult.error) errors.training_plans = trainingPlansResult.error;
    if (plannedWorkoutsResult.error) errors.planned_workouts = plannedWorkoutsResult.error;
    if (conversationThreadsResult.error) errors.conversation_threads = conversationThreadsResult.error;
    if (coachConversationsResult.error) errors.coach_conversations = coachConversationsResult.error;
    if (gearItemsResult.error) errors.gear_items = gearItemsResult.error;
    if (gearComponentsResult.error) errors.gear_components = gearComponentsResult.error;

    if (Object.keys(errors).length > 0) {
      exportData.export_metadata.partial = true;
      exportData.export_metadata.errors = errors;
    }

    console.log('Data export completed for user:', userId, {
      tables_exported: Object.keys(exportData).filter(k => k !== 'export_metadata').length,
      partial: !!exportData.export_metadata.partial
    });

    return res.status(200).json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Data export error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred during data export. Please try again or contact support.',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
