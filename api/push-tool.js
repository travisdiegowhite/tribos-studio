// Vercel API Route: Push Notification Admin Operations
// Admin-only endpoint for managing and sending push notifications.
// Supports: test sends, broadcast to all/select users, subscription stats.
//
// SECURITY: This endpoint is restricted to travis@tribos.studio ONLY
// All actions are logged to admin_audit_log table

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { sendPushToUser } from './utils/pushNotification.js';

const supabase = getSupabaseAdmin();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'travis@tribos.studio';

async function verifyAdminAccess(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    console.warn(`SECURITY: Unauthorized push-tool access attempt by ${user.email} (ID: ${user.id})`);
    return { user: null, error: 'Unauthorized - admin access denied' };
  }

  return { user, error: null };
}

async function logAdminAction(adminUserId, action, targetUserId, details) {
  try {
    await supabase
      .from('admin_audit_log')
      .insert({
        admin_user_id: adminUserId,
        action,
        target_user_id: targetUserId,
        details,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user: adminUser, error: authError } = await verifyAdminAccess(req);
  if (!adminUser) {
    return res.status(403).json({ error: authError || 'Unauthorized' });
  }

  const rateLimitResult = await rateLimitMiddleware(req, res, 'PUSH_TOOL', 30, 1);
  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    switch (action) {
      case 'get_stats':
        return await getStats(req, res, adminUser);
      case 'send_test':
        return await sendTest(req, res, adminUser);
      case 'send_to_users':
        return await sendToUsers(req, res, adminUser);
      case 'send_broadcast':
        return await sendBroadcast(req, res, adminUser);
      case 'list_subscriptions':
        return await listSubscriptions(req, res, adminUser);
      case 'list_recent_notifications':
        return await listRecentNotifications(req, res, adminUser);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Push tool API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// Stats
// ============================================================================

async function getStats(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'push_get_stats', null, null);

  const [
    { count: totalSubscriptions },
    { count: activeSubscriptions },
    { data: recentNotifications },
    { data: subscribedUsers },
  ] = await Promise.all([
    supabase.from('push_subscriptions').select('*', { count: 'exact', head: true }),
    supabase.from('push_subscriptions').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('notification_log')
      .select('*')
      .eq('channel', 'push')
      .order('sent_at', { ascending: false })
      .limit(5),
    supabase.from('push_subscriptions')
      .select('user_id')
      .eq('is_active', true),
  ]);

  // Get unique user count
  const uniqueUsers = new Set((subscribedUsers || []).map(s => s.user_id)).size;

  return res.status(200).json({
    success: true,
    stats: {
      totalSubscriptions: totalSubscriptions || 0,
      activeSubscriptions: activeSubscriptions || 0,
      uniqueUsers,
      recentNotifications: recentNotifications || [],
    }
  });
}

// ============================================================================
// Send test notification to admin's own accounts
// ============================================================================

async function sendTest(req, res, adminUser) {
  const { title, body, url, targetEmails } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  // Default to admin emails, or use provided list
  const emails = targetEmails || ['travis@tribos.studio', 'travisdiegowhite@gmail.com'];

  await logAdminAction(adminUser.id, 'push_send_test', null, { title, emails });

  // Load user email map once
  const emailToUser = await buildEmailMap();

  const results = [];

  for (const email of emails) {
    const userData = emailToUser[email.toLowerCase()];

    if (!userData) {
      results.push({ email, status: 'skipped', reason: 'User not found' });
      continue;
    }

    try {
      const result = await sendPushToUser(userData.id, {
        title: `[TEST] ${title}`,
        body,
        url: url || '/dashboard',
        notificationType: 'feature_broadcast',
        referenceId: `admin-test-${Date.now()}-${email}`,
      });

      results.push({ email, status: 'sent', ...result });
    } catch (error) {
      results.push({ email, status: 'error', error: error.message });
    }
  }

  return res.status(200).json({ success: true, results });
}

/**
 * Build a map of email -> { id, email } for all users.
 * Uses the Supabase admin auth API (service role).
 */
async function buildEmailMap() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error || !users) return {};

  const map = {};
  for (const u of users) {
    if (u.email) {
      map[u.email.toLowerCase()] = { id: u.id, email: u.email };
    }
  }
  return map;
}

// ============================================================================
// Send to specific users (by email or user ID)
// ============================================================================

async function sendToUsers(req, res, adminUser) {
  const { title, body, url, notificationType, userIds, emails } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  if (!userIds?.length && !emails?.length) {
    return res.status(400).json({ error: 'userIds or emails required' });
  }

  const resolvedUserIds = [...(userIds || [])];

  // Resolve emails to user IDs
  if (emails?.length) {
    const emailMap = await buildEmailMap();
    for (const email of emails) {
      const userData = emailMap[email.toLowerCase()];
      if (userData) {
        resolvedUserIds.push(userData.id);
      }
    }
  }

  const uniqueUserIds = [...new Set(resolvedUserIds)];

  await logAdminAction(adminUser.id, 'push_send_to_users', null, {
    title,
    notificationType: notificationType || 'feature_broadcast',
    userCount: uniqueUserIds.length,
  });

  const results = [];

  for (const userId of uniqueUserIds) {
    try {
      const result = await sendPushToUser(userId, {
        title,
        body,
        url: url || '/dashboard',
        notificationType: notificationType || 'feature_broadcast',
        referenceId: `admin-${Date.now()}`,
      });
      results.push({ userId, status: 'sent', ...result });
    } catch (error) {
      results.push({ userId, status: 'error', error: error.message });
    }
  }

  return res.status(200).json({
    success: true,
    sent: results.filter(r => r.sent).length,
    skipped: results.filter(r => r.skipped).length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  });
}

// ============================================================================
// Broadcast to all users with active subscriptions
// ============================================================================

async function sendBroadcast(req, res, adminUser) {
  const { title, body, url, notificationType } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  // Get all users with active push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .eq('is_active', true);

  if (!subscriptions?.length) {
    return res.status(200).json({ success: true, message: 'No active subscriptions', sent: 0 });
  }

  // Deduplicate user IDs
  const uniqueUserIds = [...new Set(subscriptions.map(s => s.user_id))];

  await logAdminAction(adminUser.id, 'push_send_broadcast', null, {
    title,
    notificationType: notificationType || 'feature_broadcast',
    userCount: uniqueUserIds.length,
  });

  const results = [];

  for (const userId of uniqueUserIds) {
    try {
      const result = await sendPushToUser(userId, {
        title,
        body,
        url: url || '/dashboard',
        notificationType: notificationType || 'feature_broadcast',
        referenceId: `broadcast-${Date.now()}`,
      });
      results.push({ userId, ...result });
    } catch (error) {
      results.push({ userId, status: 'error', error: error.message });
    }
  }

  return res.status(200).json({
    success: true,
    totalUsers: uniqueUserIds.length,
    sent: results.filter(r => r.sent).length,
    skipped: results.filter(r => r.skipped).length,
    errors: results.filter(r => r.status === 'error').length,
  });
}

// ============================================================================
// List subscriptions (for admin visibility)
// ============================================================================

async function listSubscriptions(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'push_list_subscriptions', null, null);

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, user_agent, created_at, last_used_at, is_active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: 'Failed to list subscriptions' });
  }

  // Enrich with user emails
  const userIds = [...new Set((subscriptions || []).map(s => s.user_id))];
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = {};
  (authUsers || []).forEach(u => { emailMap[u.id] = u.email; });

  const enriched = (subscriptions || []).map(sub => ({
    ...sub,
    email: emailMap[sub.user_id] || 'unknown',
    endpoint_short: sub.endpoint ? sub.endpoint.substring(0, 60) + '...' : '',
  }));

  return res.status(200).json({ success: true, subscriptions: enriched });
}

// ============================================================================
// List recent push notifications
// ============================================================================

async function listRecentNotifications(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'push_list_notifications', null, null);

  const { data: notifications, error } = await supabase
    .from('notification_log')
    .select('*')
    .eq('channel', 'push')
    .order('sent_at', { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: 'Failed to list notifications' });
  }

  // Enrich with user emails
  const userIds = [...new Set((notifications || []).map(n => n.user_id))];
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = {};
  (authUsers || []).forEach(u => { emailMap[u.id] = u.email; });

  const enriched = (notifications || []).map(n => ({
    ...n,
    email: emailMap[n.user_id] || 'unknown',
  }));

  return res.status(200).json({ success: true, notifications: enriched });
}
