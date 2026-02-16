// Vercel API Route: Secure Admin Operations
// SECURITY: This endpoint is restricted to travis@tribos.studio ONLY
// All actions are logged to admin_audit_log table

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

// Initialize Resend for batch email sending
const resend = new Resend(process.env.RESEND_API_KEY);

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

  // Rate limiting: 30 requests per minute for admin operations
  const rateLimitResult = await rateLimitMiddleware(req, res, 'ADMIN', 30, 1);
  if (rateLimitResult !== null) {
    return;
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

      // Email Campaign Actions
      case 'list_campaigns':
        return await listCampaigns(req, res, adminUser);

      case 'get_campaign':
        return await getCampaign(req, res, adminUser);

      case 'create_campaign':
        return await createCampaign(req, res, adminUser);

      case 'update_campaign':
        return await updateCampaign(req, res, adminUser);

      case 'delete_campaign':
        return await deleteCampaign(req, res, adminUser);

      case 'preview_recipients':
        return await previewRecipients(req, res, adminUser);

      case 'send_test_email':
        return await sendTestEmail(req, res, adminUser);

      case 'send_campaign':
        return await sendCampaign(req, res, adminUser);

      case 'get_user_insights':
        return await getUserInsights(req, res, adminUser);

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

  // Get ALL users from auth.users via admin API (paginate to avoid 50-per-page default)
  let allUsers = [];
  let page = 1;
  const perPage = 1000;
  let authError = null;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      authError = error;
      break;
    }
    allUsers = allUsers.concat(data.users || []);
    if (!data.users || data.users.length < perPage) break;
    page++;
  }

  const authUsers = { users: allUsers };

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

  // Fetch all users by paginating (avoids default 50-per-page limit)
  let allStatsUsers = [];
  let statsPage = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: statsPage, perPage: 1000 });
    if (error) break;
    allStatsUsers = allStatsUsers.concat(data.users || []);
    if (!data.users || data.users.length < 1000) break;
    statsPage++;
  }

  const [
    activitiesResult,
    plansResult,
    routesResult,
    feedbackResult
  ] = await Promise.all([
    supabase.from('activities').select('id', { count: 'exact', head: true }),
    supabase.from('training_plans').select('id', { count: 'exact', head: true }),
    supabase.from('routes').select('id', { count: 'exact', head: true }),
    supabase.from('beta_feedback').select('id', { count: 'exact', head: true })
  ]);

  return res.status(200).json({
    success: true,
    stats: {
      total_users: allStatsUsers.length,
      total_activities: activitiesResult.count || 0,
      total_training_plans: plansResult.count || 0,
      total_routes: routesResult.count || 0,
      total_feedback: feedbackResult.count || 0
    }
  });
}

/**
 * Get user insights: activation funnel, feature adoption, retention, stale users
 */
async function getUserInsights(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'get_user_insights', null, null);

  // Fetch all auth users
  let allUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    allUsers = allUsers.concat(data.users || []);
    if (!data.users || data.users.length < 1000) break;
    page++;
  }

  // Fetch all data in parallel for funnel/adoption analysis
  const [
    profilesResult,
    integrationsResult,
    activitiesResult,
    routesResult,
    plansResult,
    coachMemoriesResult,
    activityEventsResult
  ] = await Promise.all([
    supabase.from('user_profiles').select('id, display_name, ftp, weight_kg'),
    supabase.from('bike_computer_integrations').select('user_id, provider'),
    supabase.from('activities').select('user_id, start_date'),
    supabase.from('routes').select('user_id, created_at'),
    supabase.from('training_plans').select('user_id, created_at'),
    supabase.from('accountability_coach_memories').select('user_id'),
    supabase.from('user_activity_events').select('user_id, event_category, event_type, created_at')
  ]);

  const profiles = profilesResult.data || [];
  const integrations = integrationsResult.data || [];
  const activities = activitiesResult.data || [];
  const routes = routesResult.data || [];
  const plans = plansResult.data || [];
  const coachMemories = coachMemoriesResult.data || [];
  const activityEvents = activityEventsResult.data || [];

  // Build per-user data sets
  const profileSet = new Set(profiles.filter(p => p.display_name || p.ftp || p.weight_kg).map(p => p.id));
  const integrationSet = new Set(integrations.map(i => i.user_id));
  const activityUserSet = new Set(activities.map(a => a.user_id));
  const routeUserSet = new Set(routes.map(r => r.user_id));
  const planUserSet = new Set(plans.map(p => p.user_id));
  const coachUserSet = new Set(coachMemories.map(c => c.user_id));

  // Per-user integration providers
  const integrationsByUser = {};
  integrations.forEach(i => {
    if (!integrationsByUser[i.user_id]) integrationsByUser[i.user_id] = new Set();
    integrationsByUser[i.user_id].add(i.provider);
  });

  // Per-user event types
  const eventTypesByUser = {};
  activityEvents.forEach(e => {
    if (!eventTypesByUser[e.user_id]) eventTypesByUser[e.user_id] = new Set();
    eventTypesByUser[e.user_id].add(e.event_type);
  });

  // Per-user last activity event timestamp
  const lastEventByUser = {};
  activityEvents.forEach(e => {
    const ts = new Date(e.created_at).getTime();
    if (!lastEventByUser[e.user_id] || ts > lastEventByUser[e.user_id]) {
      lastEventByUser[e.user_id] = ts;
    }
  });

  const totalUsers = allUsers.length;

  // ---- ACTIVATION FUNNEL ----
  const funnel = {
    signed_up: totalUsers,
    profile_completed: 0,
    integration_connected: 0,
    first_activity: 0,
    route_created: 0,
    training_plan: 0,
    coach_used: 0
  };

  allUsers.forEach(u => {
    if (profileSet.has(u.id)) funnel.profile_completed++;
    if (integrationSet.has(u.id)) funnel.integration_connected++;
    if (activityUserSet.has(u.id)) funnel.first_activity++;
    if (routeUserSet.has(u.id)) funnel.route_created++;
    if (planUserSet.has(u.id)) funnel.training_plan++;
    if (coachUserSet.has(u.id)) funnel.coach_used++;
  });

  // ---- FEATURE ADOPTION ----
  const featureAdoption = {
    strava: { users: 0, label: 'Strava Connected' },
    garmin: { users: 0, label: 'Garmin Connected' },
    wahoo: { users: 0, label: 'Wahoo Connected' },
    route_builder: { users: routeUserSet.size, label: 'Route Builder' },
    training_plans: { users: planUserSet.size, label: 'Training Plans' },
    ai_coach: { users: coachUserSet.size, label: 'AI Coach' },
    file_uploads: { users: 0, label: 'File Uploads' },
    community: { users: 0, label: 'Community' }
  };

  // Count per-provider integrations
  Object.values(integrationsByUser).forEach(providers => {
    if (providers.has('strava')) featureAdoption.strava.users++;
    if (providers.has('garmin')) featureAdoption.garmin.users++;
    if (providers.has('wahoo')) featureAdoption.wahoo.users++;
  });

  // Count users who've done uploads and community actions
  Object.entries(eventTypesByUser).forEach(([userId, types]) => {
    if (types.has('gpx_upload') || types.has('fit_upload') || types.has('bulk_import')) {
      featureAdoption.file_uploads.users++;
    }
    if (types.has('cafe_join') || types.has('checkin_create') || types.has('discussion_create')) {
      featureAdoption.community.users++;
    }
  });

  // ---- RETENTION COHORTS (by signup week) ----
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  // Get users active in last 7 and 30 days (from activity events or last_sign_in)
  const activeIn7d = new Set();
  const activeIn30d = new Set();
  allUsers.forEach(u => {
    const lastEvent = lastEventByUser[u.id];
    const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
    const latest = Math.max(lastEvent || 0, lastSignIn);
    if (latest >= sevenDaysAgo.getTime()) activeIn7d.add(u.id);
    if (latest >= thirtyDaysAgo.getTime()) activeIn30d.add(u.id);
  });

  // Group users by signup week
  const cohorts = {};
  allUsers.forEach(u => {
    const created = new Date(u.created_at);
    // Get Monday of signup week
    const day = created.getDay();
    const diff = created.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(created);
    monday.setDate(diff);
    const weekKey = monday.toISOString().slice(0, 10);

    if (!cohorts[weekKey]) {
      cohorts[weekKey] = { week: weekKey, signed_up: 0, active_7d: 0, active_30d: 0, activated: 0 };
    }
    cohorts[weekKey].signed_up++;
    if (activeIn7d.has(u.id)) cohorts[weekKey].active_7d++;
    if (activeIn30d.has(u.id)) cohorts[weekKey].active_30d++;
    if (activityUserSet.has(u.id) || routeUserSet.has(u.id) || planUserSet.has(u.id)) {
      cohorts[weekKey].activated++;
    }
  });

  const retentionCohorts = Object.values(cohorts).sort((a, b) => a.week.localeCompare(b.week));

  // ---- STALE / AT-RISK USERS ----
  const staleUsers = [];
  allUsers.forEach(u => {
    const lastEvent = lastEventByUser[u.id];
    const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
    const latest = Math.max(lastEvent || 0, lastSignIn);
    const daysSinceActive = latest > 0 ? Math.floor((now.getTime() - latest) / 86400000) : null;
    const hasActivity = activityUserSet.has(u.id);
    const hasIntegration = integrationSet.has(u.id);
    const hasProfile = profileSet.has(u.id);

    let status = 'healthy';
    if (daysSinceActive === null || daysSinceActive > 30) {
      status = !hasActivity && !hasIntegration ? 'never_activated' : 'churned';
    } else if (daysSinceActive > 14) {
      status = 'at_risk';
    }

    if (status !== 'healthy') {
      staleUsers.push({
        email: u.email,
        created_at: u.created_at,
        last_active: latest > 0 ? new Date(latest).toISOString() : null,
        days_inactive: daysSinceActive,
        status,
        has_profile: hasProfile,
        has_integration: hasIntegration,
        has_activity: hasActivity
      });
    }
  });

  // Sort: never_activated first, then by days_inactive descending
  const statusOrder = { never_activated: 0, churned: 1, at_risk: 2 };
  staleUsers.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return (b.days_inactive || 9999) - (a.days_inactive || 9999);
  });

  return res.status(200).json({
    success: true,
    insights: {
      total_users: totalUsers,
      funnel,
      feature_adoption: featureAdoption,
      retention_cohorts: retentionCohorts,
      stale_users: staleUsers,
      summary: {
        active_7d: activeIn7d.size,
        active_30d: activeIn30d.size,
        never_activated: staleUsers.filter(u => u.status === 'never_activated').length,
        churned: staleUsers.filter(u => u.status === 'churned').length,
        at_risk: staleUsers.filter(u => u.status === 'at_risk').length
      }
    }
  });
}

// ============================================================================
// EMAIL CAMPAIGN FUNCTIONS
// ============================================================================

/**
 * List all email campaigns
 */
async function listCampaigns(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'list_campaigns', null, null);

  const { data: campaigns, error } = await supabase
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing campaigns:', error);
    return res.status(500).json({ error: 'Failed to list campaigns' });
  }

  return res.status(200).json({
    success: true,
    campaigns: campaigns || []
  });
}

/**
 * Get a single campaign with recipient stats
 */
async function getCampaign(req, res, adminUser) {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  await logAdminAction(adminUser.id, 'get_campaign', null, { campaignId });

  // Get campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  // Get recipient breakdown
  const { data: recipients, error: recipientsError } = await supabase
    .from('email_recipients')
    .select('id, email, status, sent_at, delivered_at, first_opened_at, first_clicked_at, open_count, click_count, error_message')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  return res.status(200).json({
    success: true,
    campaign,
    recipients: recipients || []
  });
}

/**
 * Create a new email campaign
 */
async function createCampaign(req, res, adminUser) {
  const { name, subject, htmlContent, textContent, campaignType, audienceType, filterCriteria, fromName, fromEmail, replyTo } = req.body;

  if (!name || !subject || !htmlContent) {
    return res.status(400).json({ error: 'name, subject, and htmlContent are required' });
  }

  await logAdminAction(adminUser.id, 'create_campaign', null, { name, subject });

  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .insert({
      name,
      subject,
      html_content: htmlContent,
      text_content: textContent || null,
      campaign_type: campaignType || 'announcement',
      audience_type: audienceType || 'users',
      filter_criteria: filterCriteria || {},
      from_name: fromName || 'Tribos Studio',
      from_email: fromEmail || 'noreply@tribos.studio',
      reply_to: replyTo || null,
      created_by: adminUser.id
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating campaign:', error);
    return res.status(500).json({ error: 'Failed to create campaign' });
  }

  return res.status(200).json({
    success: true,
    campaign
  });
}

/**
 * Update an existing campaign (only if draft)
 */
async function updateCampaign(req, res, adminUser) {
  const { campaignId, name, subject, htmlContent, textContent, campaignType, audienceType, filterCriteria, fromName, fromEmail, replyTo } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  // Check campaign status
  const { data: existing, error: fetchError } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (existing.status !== 'draft') {
    return res.status(400).json({ error: 'Can only update draft campaigns' });
  }

  await logAdminAction(adminUser.id, 'update_campaign', null, { campaignId });

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (htmlContent !== undefined) updates.html_content = htmlContent;
  if (textContent !== undefined) updates.text_content = textContent;
  if (campaignType !== undefined) updates.campaign_type = campaignType;
  if (audienceType !== undefined) updates.audience_type = audienceType;
  if (filterCriteria !== undefined) updates.filter_criteria = filterCriteria;
  if (fromName !== undefined) updates.from_name = fromName;
  if (fromEmail !== undefined) updates.from_email = fromEmail;
  if (replyTo !== undefined) updates.reply_to = replyTo;

  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .update(updates)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({ error: 'Failed to update campaign' });
  }

  return res.status(200).json({
    success: true,
    campaign
  });
}

/**
 * Delete a campaign (only if draft)
 */
async function deleteCampaign(req, res, adminUser) {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  // Check campaign status
  const { data: existing, error: fetchError } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (existing.status !== 'draft') {
    return res.status(400).json({ error: 'Can only delete draft campaigns' });
  }

  await logAdminAction(adminUser.id, 'delete_campaign', null, { campaignId });

  const { error } = await supabase
    .from('email_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({ error: 'Failed to delete campaign' });
  }

  return res.status(200).json({
    success: true,
    message: 'Campaign deleted'
  });
}

/**
 * Preview recipients based on filter criteria
 */
async function previewRecipients(req, res, adminUser) {
  const { audienceType, filterCriteria } = req.body;

  await logAdminAction(adminUser.id, 'preview_recipients', null, { audienceType, filterCriteria });

  try {
    const recipients = await getFilteredRecipients(audienceType || 'users', filterCriteria || {});

    return res.status(200).json({
      success: true,
      recipients: recipients.slice(0, 100), // Return first 100 for preview
      total: recipients.length
    });
  } catch (error) {
    console.error('Error previewing recipients:', error);
    return res.status(500).json({ error: 'Failed to preview recipients' });
  }
}

/**
 * Send a test email to the admin
 */
async function sendTestEmail(req, res, adminUser) {
  const { subject, htmlContent, fromName, fromEmail } = req.body;

  if (!subject || !htmlContent) {
    return res.status(400).json({ error: 'subject and htmlContent are required' });
  }

  await logAdminAction(adminUser.id, 'send_test_email', null, { subject });

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName || 'Tribos Studio'} <${fromEmail || 'noreply@tribos.studio'}>`,
      to: [adminUser.email],
      subject: `[TEST] ${subject}`,
      html: htmlContent
    });

    if (error) {
      console.error('Resend test email error:', error);
      return res.status(500).json({ error: 'Failed to send test email', details: error });
    }

    return res.status(200).json({
      success: true,
      message: `Test email sent to ${adminUser.email}`,
      messageId: data.id
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    return res.status(500).json({ error: 'Failed to send test email' });
  }
}

/**
 * Send a campaign to all recipients
 */
async function sendCampaign(req, res, adminUser) {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  // Get campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (campaign.status !== 'draft') {
    return res.status(400).json({ error: 'Campaign has already been sent or is in progress' });
  }

  await logAdminAction(adminUser.id, 'send_campaign', null, { campaignId, campaignName: campaign.name });

  try {
    // Get recipients based on filter
    const recipients = await getFilteredRecipients(campaign.audience_type, campaign.filter_criteria);

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients match the filter criteria' });
    }

    // Update campaign status to sending
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sending',
        started_at: new Date().toISOString(),
        total_recipients: recipients.length
      })
      .eq('id', campaignId);

    // Insert all recipients into email_recipients table
    const recipientRecords = recipients.map(r => ({
      campaign_id: campaignId,
      user_id: r.user_id || null,
      email: r.email,
      recipient_name: r.name || null,
      source: r.source || 'users',
      status: 'pending'
    }));

    await supabase
      .from('email_recipients')
      .insert(recipientRecords);

    // Send emails in batches of 100 (Resend limit)
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      batches.push(recipients.slice(i, i + BATCH_SIZE));
    }

    let sentCount = 0;
    let failedCount = 0;

    for (let batchNum = 0; batchNum < batches.length; batchNum++) {
      const batch = batches[batchNum];

      try {
        // Prepare batch emails (use camelCase for Resend SDK)
        const emailBatch = batch.map(r => {
          const email = {
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: [r.email],
            subject: campaign.subject,
            html: campaign.html_content
          };
          // Only add optional fields if they have values
          if (campaign.text_content) email.text = campaign.text_content;
          if (campaign.reply_to) email.replyTo = campaign.reply_to;
          return email;
        });

        console.log(`Sending batch ${batchNum + 1} with ${emailBatch.length} emails`);

        // Send batch
        const { data: batchResult, error: batchError } = await resend.batch.send(emailBatch);

        if (batchError) {
          const errorMsg = batchError.message || JSON.stringify(batchError) || 'Batch send failed';
          console.error(`Batch ${batchNum + 1} error:`, errorMsg, batchError);
          // Mark batch as failed
          for (const recipient of batch) {
            await supabase
              .from('email_recipients')
              .update({
                status: 'failed',
                error_message: errorMsg
              })
              .eq('campaign_id', campaignId)
              .eq('email', recipient.email);
          }
          failedCount += batch.length;
        } else {
          // Update recipients with Resend IDs
          for (let i = 0; i < batchResult.data.length; i++) {
            const resendId = batchResult.data[i].id;
            const recipient = batch[i];

            await supabase
              .from('email_recipients')
              .update({
                resend_email_id: resendId,
                status: 'sent',
                sent_at: new Date().toISOString(),
                batch_number: batchNum + 1
              })
              .eq('campaign_id', campaignId)
              .eq('email', recipient.email);
          }
          sentCount += batch.length;
        }

        // Small delay between batches to stay under rate limit
        if (batchNum < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        const errorMsg = err.message || JSON.stringify(err) || 'Unknown error';
        console.error(`Batch ${batchNum + 1} exception:`, errorMsg, err);
        // Mark batch as failed with error message
        for (const recipient of batch) {
          await supabase
            .from('email_recipients')
            .update({
              status: 'failed',
              error_message: errorMsg
            })
            .eq('campaign_id', campaignId)
            .eq('email', recipient.email);
        }
        failedCount += batch.length;
      }
    }

    // Update campaign status to completed
    await supabase
      .from('email_campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        sent_count: sentCount,
        failed_count: failedCount
      })
      .eq('id', campaignId);

    return res.status(200).json({
      success: true,
      message: `Campaign sent to ${sentCount} recipients`,
      stats: {
        total: recipients.length,
        sent: sentCount,
        failed: failedCount
      }
    });
  } catch (error) {
    console.error('Error sending campaign:', error);

    // Update campaign status to show error
    await supabase
      .from('email_campaigns')
      .update({
        status: 'draft' // Reset to draft so it can be retried
      })
      .eq('id', campaignId);

    return res.status(500).json({ error: 'Failed to send campaign' });
  }
}

/**
 * Get filtered recipients based on audience type and filter criteria
 */
async function getFilteredRecipients(audienceType, filterCriteria) {
  const recipients = [];
  const seenEmails = new Set();

  // Check if we're using manual selection mode
  const isManualSelection = filterCriteria.selectedUserIds && filterCriteria.selectedUserIds.length > 0;

  // Get registered users if needed
  if (audienceType === 'users' || audienceType === 'both') {
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error listing auth users:', authError);
      throw new Error('Failed to list users');
    }

    let users = authData.users || [];

    // If manual selection mode, filter to only selected users
    if (isManualSelection) {
      users = users.filter(u =>
        filterCriteria.selectedUserIds.includes(u.id) ||
        filterCriteria.selectedUserIds.includes(u.email)
      );
    } else {
      // Apply filters only in filter mode
      if (filterCriteria.emailVerified) {
        users = users.filter(u => u.email_confirmed_at);
      }

      if (filterCriteria.signedUpAfter) {
        const cutoff = new Date(filterCriteria.signedUpAfter);
        users = users.filter(u => new Date(u.created_at) >= cutoff);
      }

      if (filterCriteria.signedUpBefore) {
        const cutoff = new Date(filterCriteria.signedUpBefore);
        users = users.filter(u => new Date(u.created_at) <= cutoff);
      }

      if (filterCriteria.lastSignInWithinDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - filterCriteria.lastSignInWithinDays);
        users = users.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at) >= cutoff);
      }

      const userIds = users.map(u => u.id);

      // Activity-based filters
      if (filterCriteria.hasActivity !== undefined || filterCriteria.activityCountMin) {
        const { data: activities } = await supabase
          .from('activities')
          .select('user_id');

        const activityCounts = {};
        (activities || []).forEach(a => {
          activityCounts[a.user_id] = (activityCounts[a.user_id] || 0) + 1;
        });

        if (filterCriteria.hasActivity === true) {
          users = users.filter(u => (activityCounts[u.id] || 0) > 0);
        } else if (filterCriteria.hasActivity === false) {
          users = users.filter(u => (activityCounts[u.id] || 0) === 0);
        }

        if (filterCriteria.activityCountMin) {
          users = users.filter(u => (activityCounts[u.id] || 0) >= filterCriteria.activityCountMin);
        }
      }

      // Integration filters
      if (filterCriteria.integrations && filterCriteria.integrations.length > 0) {
        const { data: integrations } = await supabase
          .from('bike_computer_integrations')
          .select('user_id, provider')
          .in('user_id', userIds);

        const userIntegrations = {};
        (integrations || []).forEach(i => {
          if (!userIntegrations[i.user_id]) {
            userIntegrations[i.user_id] = [];
          }
          userIntegrations[i.user_id].push(i.provider);
        });

        users = users.filter(u => {
          const userProviders = userIntegrations[u.id] || [];
          return filterCriteria.integrations.some(p => userProviders.includes(p));
        });
      }

      if (filterCriteria.hasIntegration !== undefined) {
        const { data: integrations } = await supabase
          .from('bike_computer_integrations')
          .select('user_id')
          .in('user_id', userIds);

        const usersWithIntegrations = new Set((integrations || []).map(i => i.user_id));

        if (filterCriteria.hasIntegration === true) {
          users = users.filter(u => usersWithIntegrations.has(u.id));
        } else {
          users = users.filter(u => !usersWithIntegrations.has(u.id));
        }
      }
    }

    // Sort users by signup date (newest first)
    users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Add to recipients
    for (const user of users) {
      if (user.email && !seenEmails.has(user.email.toLowerCase())) {
        seenEmails.add(user.email.toLowerCase());
        recipients.push({
          user_id: user.id,
          email: user.email,
          name: user.user_metadata?.name || null,
          source: 'users',
          created_at: user.created_at
        });
      }
    }
  }

  // Get beta signups if needed
  if (audienceType === 'beta_signups' || audienceType === 'both') {
    let query = supabase.from('beta_signups').select('*');

    // If manual selection, filter by selected emails
    if (isManualSelection) {
      query = query.in('email', filterCriteria.selectedUserIds);
    } else {
      if (filterCriteria.betaStatus) {
        query = query.eq('status', filterCriteria.betaStatus);
      }

      if (filterCriteria.wantsNotifications !== undefined) {
        query = query.eq('wants_notifications', filterCriteria.wantsNotifications);
      }
    }

    // Sort by signup date (newest first)
    query = query.order('signed_up_at', { ascending: false });

    const { data: signups, error: signupsError } = await query;

    if (signupsError) {
      console.error('Error fetching beta signups:', signupsError);
    } else {
      for (const signup of (signups || [])) {
        if (signup.email && !seenEmails.has(signup.email.toLowerCase())) {
          seenEmails.add(signup.email.toLowerCase());
          recipients.push({
            user_id: signup.user_id || null,
            email: signup.email,
            name: signup.name || null,
            source: 'beta_signups',
            created_at: signup.signed_up_at || signup.created_at
          });
        }
      }
    }
  }

  return recipients;
}
