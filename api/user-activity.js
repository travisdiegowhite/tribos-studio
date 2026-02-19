// Vercel API Route: User Activity Tracking
// Logs user activity events for analytics

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase clients
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

// Regular client for user operations
const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// Admin client for admin operations
const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_KEY
);

// SECURITY: Hardcoded admin email
const ADMIN_EMAIL = 'travis@tribos.studio';

/**
 * Fetch all rows from a Supabase table, paginating in batches to avoid the 1000-row default limit.
 * @param {string} table - Table name
 * @param {string} selectColumns - Columns to select
 * @param {object} filters - Optional filters: { column, op, value } or array of filters
 * @returns {Promise<Array>} All rows
 */
async function fetchAllRows(table, selectColumns, filters = []) {
  let allRows = [];
  let start = 0;
  const batchSize = 1000;

  while (true) {
    let query = supabaseAdmin.from(table).select(selectColumns).range(start, start + batchSize - 1);

    // Apply filters
    const filterList = Array.isArray(filters) ? filters : [filters];
    for (const f of filterList) {
      if (f && f.column && f.op) {
        query = query[f.op](f.column, f.value);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error(`fetchAllRows error on ${table}:`, error);
      break;
    }
    allRows = allRows.concat(data || []);
    if (!data || data.length < batchSize) break;
    start += batchSize;
  }

  return allRows;
}

/**
 * Fetch all auth users, paginating past the 50-per-page default limit.
 * @returns {Promise<Array>} All auth users
 */
async function fetchAllAuthUsers() {
  let allUsers = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('fetchAllAuthUsers error:', error);
      break;
    }
    allUsers = allUsers.concat(users || []);
    if (!users || users.length < perPage) break;
    page++;
  }

  return allUsers;
}

/**
 * Get user from JWT token
 */
async function getUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Check if user is admin
 */
function isAdmin(user) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
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

  const user = await getUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { action } = req.body;

    switch (action) {
      case 'log_event':
        return await logEvent(req, res, user);

      case 'log_events':
        return await logEvents(req, res, user);

      // Admin-only actions
      case 'get_user_activity':
        if (!isAdmin(user)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        return await getUserActivity(req, res);

      case 'get_activity_summary':
        if (!isAdmin(user)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        return await getActivitySummary(req, res);

      case 'get_recent_activity':
        if (!isAdmin(user)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        return await getRecentActivity(req, res);

      case 'get_activity_stats':
        if (!isAdmin(user)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        return await getActivityStats(req, res);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('User activity API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Log a single user activity event
 */
async function logEvent(req, res, user) {
  const { eventType, eventCategory, eventData, pagePath, sessionId } = req.body;

  if (!eventType || !eventCategory) {
    return res.status(400).json({ error: 'eventType and eventCategory are required' });
  }

  const { error } = await supabaseAdmin
    .from('user_activity_events')
    .insert({
      user_id: user.id,
      event_type: eventType,
      event_category: eventCategory,
      event_data: eventData || {},
      page_path: pagePath,
      session_id: sessionId,
      user_agent: req.headers['user-agent']
    });

  if (error) {
    console.error('Error logging activity event:', error);
    return res.status(500).json({ error: 'Failed to log event' });
  }

  return res.status(200).json({ success: true });
}

/**
 * Log multiple user activity events (batch)
 */
async function logEvents(req, res, user) {
  const { events } = req.body;

  if (!events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events array is required' });
  }

  // Limit batch size
  if (events.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 events per batch' });
  }

  const eventsToInsert = events.map(e => ({
    user_id: user.id,
    event_type: e.eventType,
    event_category: e.eventCategory,
    event_data: e.eventData || {},
    page_path: e.pagePath,
    session_id: e.sessionId,
    user_agent: req.headers['user-agent'],
    created_at: e.timestamp || new Date().toISOString()
  }));

  const { error } = await supabaseAdmin
    .from('user_activity_events')
    .insert(eventsToInsert);

  if (error) {
    console.error('Error logging activity events:', error);
    return res.status(500).json({ error: 'Failed to log events' });
  }

  return res.status(200).json({ success: true, count: events.length });
}

/**
 * Admin: Get activity for a specific user
 */
async function getUserActivity(req, res) {
  const { targetUserId, limit = 100, offset = 0 } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId is required' });
  }

  const { data: events, error, count } = await supabaseAdmin
    .from('user_activity_events')
    .select('*', { count: 'exact' })
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching user activity:', error);
    return res.status(500).json({ error: 'Failed to fetch activity' });
  }

  return res.status(200).json({
    success: true,
    events: events || [],
    total: count || 0
  });
}

/**
 * Admin: Get activity summary for all users
 */
async function getActivitySummary(req, res) {
  // Get ALL events, paginating past the 1000-row default limit
  const events = await fetchAllRows('user_activity_events', 'user_id, event_category, created_at');

  // Aggregate by user
  const userStats = {};
  const now = new Date();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  events.forEach(e => {
    if (!userStats[e.user_id]) {
      userStats[e.user_id] = {
        user_id: e.user_id,
        total_events: 0,
        page_views: 0,
        sync_events: 0,
        upload_events: 0,
        feature_uses: 0,
        interaction_events: 0,
        last_activity: null,
        events_24h: 0,
        events_7d: 0
      };
    }

    const stats = userStats[e.user_id];
    const eventDate = new Date(e.created_at);

    stats.total_events++;

    if (e.event_category === 'page_view') stats.page_views++;
    else if (e.event_category === 'sync') stats.sync_events++;
    else if (e.event_category === 'upload') stats.upload_events++;
    else if (e.event_category === 'feature') stats.feature_uses++;
    else if (e.event_category === 'interaction') stats.interaction_events++;

    if (!stats.last_activity || eventDate > new Date(stats.last_activity)) {
      stats.last_activity = e.created_at;
    }

    if (eventDate > last24h) stats.events_24h++;
    if (eventDate > last7d) stats.events_7d++;
  });

  // Get ALL user emails, paginating past the 50-per-page default limit
  const authUsers = await fetchAllAuthUsers();
  const userMap = {};
  authUsers.forEach(u => {
    userMap[u.id] = u.email;
  });

  // Enrich with emails and sort by last activity
  const summaries = Object.values(userStats)
    .map(s => ({
      ...s,
      email: userMap[s.user_id] || 'Unknown'
    }))
    .sort((a, b) => {
      if (!a.last_activity) return 1;
      if (!b.last_activity) return -1;
      return new Date(b.last_activity) - new Date(a.last_activity);
    });

  return res.status(200).json({
    success: true,
    summaries,
    total_users: summaries.length
  });
}

/**
 * Admin: Get recent activity across all users
 */
async function getRecentActivity(req, res) {
  const { limit = 100, eventCategory, eventType } = req.body;

  let query = supabaseAdmin
    .from('user_activity_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (eventCategory) {
    query = query.eq('event_category', eventCategory);
  }
  if (eventType) {
    query = query.eq('event_type', eventType);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error('Error fetching recent activity:', error);
    return res.status(500).json({ error: 'Failed to fetch activity' });
  }

  // Get ALL user emails, paginating past the 50-per-page default limit
  const userIds = [...new Set((events || []).map(e => e.user_id))];
  const authUsers = await fetchAllAuthUsers();
  const userMap = {};
  authUsers.forEach(u => {
    if (userIds.includes(u.id)) {
      userMap[u.id] = u.email;
    }
  });

  // Enrich with emails
  const enrichedEvents = (events || []).map(e => ({
    ...e,
    user_email: userMap[e.user_id] || 'Unknown'
  }));

  return res.status(200).json({
    success: true,
    events: enrichedEvents,
    total: enrichedEvents.length
  });
}

/**
 * Admin: Get overall activity stats
 */
async function getActivityStats(req, res) {
  const { days = 7 } = req.body;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch ALL events in the date range, paginating past the 1000-row limit
  const events = await fetchAllRows(
    'user_activity_events',
    'event_type, event_category, created_at, user_id',
    [{ column: 'created_at', op: 'gte', value: startDate.toISOString() }]
  );

  // Calculate stats
  const stats = {
    total_events: events.length,
    unique_users: new Set(events.map(e => e.user_id)).size,
    by_category: {},
    by_type: {},
    by_day: {}
  };

  events.forEach(e => {
    // By category
    stats.by_category[e.event_category] = (stats.by_category[e.event_category] || 0) + 1;

    // By type
    stats.by_type[e.event_type] = (stats.by_type[e.event_type] || 0) + 1;

    // By day
    const day = e.created_at.split('T')[0];
    if (!stats.by_day[day]) {
      stats.by_day[day] = { total: 0, users: new Set() };
    }
    stats.by_day[day].total++;
    stats.by_day[day].users.add(e.user_id);
  });

  // Convert sets to counts for by_day
  Object.keys(stats.by_day).forEach(day => {
    stats.by_day[day] = {
      total: stats.by_day[day].total,
      unique_users: stats.by_day[day].users.size
    };
  });

  return res.status(200).json({
    success: true,
    stats,
    period_days: days
  });
}
