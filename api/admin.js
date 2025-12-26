// Vercel API Route: Secure Admin Operations
// SECURITY: This endpoint is restricted to travis@tribos.studio ONLY
// All actions are logged to admin_audit_log table

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase with service key for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// SECURITY: Hardcoded admin email - this is the ONLY account with admin access
// DO NOT add other emails here without careful consideration
const ADMIN_EMAIL = 'travis@tribos.studio';

/**
 * Verify the user from JWT token and check admin authorization
 * Returns the user if authorized, null otherwise
 */
async function verifyAdminAccess(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Admin auth validation failed:', error?.message);
    return { user: null, error: 'Invalid or expired token' };
  }

  // SECURITY: Strict email check - must match exactly
  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    console.warn(`SECURITY: Unauthorized admin access attempt by ${user.email} (ID: ${user.id})`);
    return { user: null, error: 'Unauthorized - admin access denied' };
  }

  return { user, error: null };
}

/**
 * Log admin action to audit table
 */
async function logAdminAction(adminUserId, action, targetUserId, details) {
  try {
    await supabase
      .from('admin_audit_log')
      .insert({
        admin_user_id: adminUserId,
        action,
        target_user_id: targetUserId,
        details,
        ip_address: null, // Could be extracted from req if needed
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't fail the request if logging fails, but log the error
  }
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate service key is configured
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('CRITICAL: SUPABASE_SERVICE_KEY not configured for admin endpoint');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // SECURITY: Verify admin access
  const { user: adminUser, error: authError } = await verifyAdminAccess(req);
  if (!adminUser) {
    return res.status(403).json({ error: authError || 'Unauthorized' });
  }

  try {
    const { action, targetUserId } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    switch (action) {
      case 'list_users':
        return await listUsers(req, res, adminUser);

      case 'get_user_details':
        if (!targetUserId) {
          return res.status(400).json({ error: 'targetUserId is required' });
        }
        return await getUserDetails(req, res, adminUser, targetUserId);

      case 'clean_user_data':
        if (!targetUserId) {
          return res.status(400).json({ error: 'targetUserId is required' });
        }
        return await cleanUserData(req, res, adminUser, targetUserId);

      case 'list_feedback':
        return await listFeedback(req, res, adminUser);

      case 'list_webhooks':
        return await listWebhooks(req, res, adminUser);

      case 'get_stats':
        return await getStats(req, res, adminUser);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * List all users with basic stats
 */
async function listUsers(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'list_users', null, null);

  // Get users from auth.users via admin API
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('Error listing auth users:', authError);
    return res.status(500).json({ error: 'Failed to list users' });
  }

  // Get activity counts per user
  const { data: activityCounts, error: activityError } = await supabase
    .from('activities')
    .select('user_id')
    .then(result => {
      if (result.error) return { data: null, error: result.error };
      // Count activities per user
      const counts = {};
      (result.data || []).forEach(a => {
        counts[a.user_id] = (counts[a.user_id] || 0) + 1;
      });
      return { data: counts, error: null };
    });

  // Get integration status per user
  const { data: integrations } = await supabase
    .from('bike_computer_integrations')
    .select('user_id, provider');

  const integrationMap = {};
  (integrations || []).forEach(i => {
    if (!integrationMap[i.user_id]) {
      integrationMap[i.user_id] = [];
    }
    integrationMap[i.user_id].push(i.provider);
  });

  // Combine data
  const users = authUsers.users.map(user => ({
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    email_confirmed_at: user.email_confirmed_at,
    activity_count: activityCounts?.[user.id] || 0,
    integrations: integrationMap[user.id] || []
  }));

  // Sort by most recent signup
  users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return res.status(200).json({
    success: true,
    users,
    total: users.length
  });
}

/**
 * Get detailed info for a specific user
 */
async function getUserDetails(req, res, adminUser, targetUserId) {
  await logAdminAction(adminUser.id, 'get_user_details', targetUserId, null);

  // Get auth user info
  const { data: { user: targetUser }, error: userError } = await supabase.auth.admin.getUserById(targetUserId);

  if (userError || !targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Get counts from various tables
  const [
    activitiesResult,
    plansResult,
    routesResult,
    integrationsResult,
    feedbackResult
  ] = await Promise.all([
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
    supabase.from('training_plans').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
    supabase.from('routes').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
    supabase.from('bike_computer_integrations').select('provider').eq('user_id', targetUserId),
    supabase.from('beta_feedback').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId)
  ]);

  return res.status(200).json({
    success: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      created_at: targetUser.created_at,
      last_sign_in_at: targetUser.last_sign_in_at,
      email_confirmed_at: targetUser.email_confirmed_at,
      user_metadata: targetUser.user_metadata
    },
    data_counts: {
      activities: activitiesResult.count || 0,
      training_plans: plansResult.count || 0,
      routes: routesResult.count || 0,
      feedback: feedbackResult.count || 0
    },
    integrations: (integrationsResult.data || []).map(i => i.provider)
  });
}

/**
 * Clean all data for a specific user (for testing new user flow)
 * DANGEROUS: This permanently deletes user data
 */
async function cleanUserData(req, res, adminUser, targetUserId) {
  // Extra security: log with details before action
  await logAdminAction(adminUser.id, 'clean_user_data_started', targetUserId, {
    warning: 'Data deletion initiated'
  });

  console.log(`ADMIN ACTION: ${adminUser.email} is cleaning data for user ${targetUserId}`);

  const deletionResults = {};
  const errors = [];

  // Define tables to clean in order (respecting foreign key constraints)
  const tablesToClean = [
    // Notifications and logs first
    { table: 'notification_log', userIdField: 'user_id' },

    // Coach data
    { table: 'coach_conversations', userIdField: 'user_id' },
    { table: 'coach_memory', userIdField: 'user_id' },
    { table: 'user_coach_settings', userIdField: 'user_id' },

    // Training data
    { table: 'scheduled_workouts', userIdField: 'user_id' },
    { table: 'planned_workouts', userIdField: 'user_id' },
    { table: 'training_plans', userIdField: 'user_id' },

    // Activities and feedback
    { table: 'workout_feedback', userIdField: 'user_id' },
    { table: 'activities', userIdField: 'user_id' },

    // Health and performance
    { table: 'health_metrics', userIdField: 'user_id' },
    { table: 'ftp_history', userIdField: 'user_id' },
    { table: 'progression_levels', userIdField: 'user_id' },
    { table: 'user_speed_profiles', userIdField: 'user_id' },

    // Routes
    { table: 'route_context_history', userIdField: 'user_id' },
    { table: 'user_route_preferences', userIdField: 'user_id' },
    { table: 'routes', userIdField: 'user_id' },

    // Race goals
    { table: 'race_goals', userIdField: 'user_id' },

    // Integrations
    { table: 'bike_computer_sync_history', userIdField: 'user_id' },
    { table: 'bike_computer_integrations', userIdField: 'user_id' },
    { table: 'garmin_webhook_events', userIdField: 'user_id' },
    { table: 'garmin_oauth_temp', userIdField: 'user_id' },

    // Beta/feedback
    { table: 'beta_feedback', userIdField: 'user_id' },
    { table: 'beta_signups', userIdField: 'user_id' }
  ];

  // Delete from each table
  for (const { table, userIdField } of tablesToClean) {
    try {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq(userIdField, targetUserId);

      if (error) {
        // Some tables might not exist or user might not have data - that's ok
        if (!error.message.includes('does not exist')) {
          errors.push({ table, error: error.message });
        }
        deletionResults[table] = { deleted: 0, error: error.message };
      } else {
        deletionResults[table] = { deleted: count || 0 };
      }
    } catch (err) {
      errors.push({ table, error: err.message });
      deletionResults[table] = { deleted: 0, error: err.message };
    }
  }

  // Log completion
  await logAdminAction(adminUser.id, 'clean_user_data_completed', targetUserId, {
    deletionResults,
    errorCount: errors.length
  });

  const totalDeleted = Object.values(deletionResults)
    .reduce((sum, r) => sum + (r.deleted || 0), 0);

  return res.status(200).json({
    success: errors.length === 0,
    message: `Deleted ${totalDeleted} records for user`,
    details: deletionResults,
    errors: errors.length > 0 ? errors : undefined
  });
}

/**
 * List beta feedback submissions
 */
async function listFeedback(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'list_feedback', null, null);

  const { data: feedback, error } = await supabase
    .from('beta_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching feedback:', error);
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }

  return res.status(200).json({
    success: true,
    feedback: feedback || [],
    total: feedback?.length || 0
  });
}

/**
 * List recent webhook events (for debugging integrations)
 * Supports optional filtering by user_id
 */
async function listWebhooks(req, res, adminUser) {
  const { filterUserId } = req.body;

  await logAdminAction(adminUser.id, 'list_webhooks', filterUserId || null, { filterUserId });

  // Build query
  let query = supabase
    .from('garmin_webhook_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  // Apply user filter if provided
  if (filterUserId) {
    query = query.eq('user_id', filterUserId);
  }

  const { data: webhooks, error } = await query;

  if (error) {
    console.error('Error fetching webhooks:', error);
    return res.status(500).json({ error: 'Failed to fetch webhooks' });
  }

  // Get unique user IDs from webhooks to fetch their emails
  const userIds = [...new Set((webhooks || [])
    .map(w => w.user_id)
    .filter(id => id != null))];

  // Fetch user emails for the webhooks
  let userMap = {};
  if (userIds.length > 0) {
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    if (authUsers) {
      authUsers.forEach(u => {
        if (userIds.includes(u.id)) {
          userMap[u.id] = u.email;
        }
      });
    }
  }

  // Also get all users for the filter dropdown
  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers();
  const usersWithWebhooks = [];

  if (allUsers) {
    // Get users who have webhook events
    const { data: usersWithEvents } = await supabase
      .from('garmin_webhook_events')
      .select('user_id')
      .not('user_id', 'is', null);

    const usersWithEventsSet = new Set((usersWithEvents || []).map(e => e.user_id));

    allUsers.forEach(u => {
      if (usersWithEventsSet.has(u.id)) {
        usersWithWebhooks.push({ id: u.id, email: u.email });
      }
    });
  }

  // Enrich webhooks with user emails
  const enrichedWebhooks = (webhooks || []).map(w => ({
    ...w,
    user_email: w.user_id ? userMap[w.user_id] || null : null
  }));

  return res.status(200).json({
    success: true,
    webhooks: enrichedWebhooks,
    total: enrichedWebhooks.length,
    usersWithWebhooks: usersWithWebhooks.sort((a, b) => a.email.localeCompare(b.email))
  });
}

/**
 * Get overall system stats
 */
async function getStats(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'get_stats', null, null);

  const [
    usersResult,
    activitiesResult,
    plansResult,
    routesResult,
    feedbackResult
  ] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('activities').select('id', { count: 'exact', head: true }),
    supabase.from('training_plans').select('id', { count: 'exact', head: true }),
    supabase.from('routes').select('id', { count: 'exact', head: true }),
    supabase.from('beta_feedback').select('id', { count: 'exact', head: true })
  ]);

  return res.status(200).json({
    success: true,
    stats: {
      total_users: usersResult.data?.users?.length || 0,
      total_activities: activitiesResult.count || 0,
      total_training_plans: plansResult.count || 0,
      total_routes: routesResult.count || 0,
      total_feedback: feedbackResult.count || 0
    }
  });
}
