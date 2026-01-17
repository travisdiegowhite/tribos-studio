/**
 * API Route: Fitness Snapshots
 * Handles snapshot computation, backfill, and retrieval for historical analysis
 *
 * Endpoints:
 * - POST /api/fitness-snapshots?action=backfill - Backfill historical snapshots
 * - POST /api/fitness-snapshots?action=compute-current - Compute current week snapshot
 * - POST /api/fitness-snapshots?action=query - Query historical snapshots
 * - GET /api/fitness-snapshots?action=compute-weekly - Cron job for weekly computation
 */

import { createClient } from '@supabase/supabase-js';
import {
  computeWeeklySnapshot,
  backfillSnapshots,
  getWeekStart
} from './utils/fitnessSnapshots.js';
import { setupCors } from './utils/cors.js';

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
    return null;
  }

  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  const action = req.query.action || req.body?.action;

  // Handle Vercel cron job (GET request)
  if (req.method === 'GET' && action === 'compute-weekly') {
    return handleWeeklyCompute(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  switch (action) {
    case 'backfill':
      return handleBackfill(req, res);
    case 'compute-current':
      return handleComputeCurrent(req, res);
    case 'query':
      return handleQuery(req, res);
    default:
      return res.status(400).json({ error: 'Invalid action. Use: backfill, compute-current, or query' });
  }
}

/**
 * Backfill historical snapshots from activity data
 */
async function handleBackfill(req, res) {
  const { userId, weeksBack = 52 } = req.body;

  // Validate user
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Users can only backfill their own data
  const targetUserId = userId || authUser.id;
  if (targetUserId !== authUser.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    console.log(`Starting backfill for user ${targetUserId}, ${weeksBack} weeks`);

    const result = await backfillSnapshots(supabase, targetUserId, weeksBack);

    console.log(`Backfill complete: ${result.snapshotsCreated} snapshots created`);

    return res.json(result);

  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Compute snapshot for current week
 */
async function handleComputeCurrent(req, res) {
  const { userId } = req.body;

  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const targetUserId = userId || authUser.id;
  if (targetUserId !== authUser.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const weekStart = getWeekStart(new Date());
    const snapshot = await computeWeeklySnapshot(supabase, targetUserId, weekStart);

    // Upsert the snapshot
    const { error } = await supabase
      .from('fitness_snapshots')
      .upsert(snapshot, {
        onConflict: 'user_id,snapshot_week'
      });

    if (error) throw error;

    return res.json({
      success: true,
      snapshot,
      weekStart
    });

  } catch (error) {
    console.error('Compute current error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Query historical snapshots
 */
async function handleQuery(req, res) {
  const {
    userId,
    weeksBack = 12,
    startDate,
    endDate
  } = req.body;

  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const targetUserId = userId || authUser.id;
  if (targetUserId !== authUser.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let query = supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', targetUserId)
      .order('snapshot_week', { ascending: false });

    if (startDate && endDate) {
      query = query.gte('snapshot_week', startDate).lte('snapshot_week', endDate);
    } else {
      const weeksAgo = new Date();
      weeksAgo.setDate(weeksAgo.getDate() - (weeksBack * 7));
      query = query.gte('snapshot_week', weeksAgo.toISOString().split('T')[0]);
    }

    const { data: snapshots, error } = await query.limit(104); // Max 2 years

    if (error) throw error;

    return res.json({
      success: true,
      snapshots,
      count: snapshots.length
    });

  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Weekly cron job to compute snapshots for all active users
 * Configured in vercel.json as: "0 3 * * 1" (Monday 3am)
 */
async function handleWeeklyCompute(req, res) {
  // Verify cron authorization (Vercel sends this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also allow service role for manual triggers
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Get all users with recent activity (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { data: recentActivities, error: actError } = await supabase
      .from('activities')
      .select('user_id')
      .gte('start_date', twoWeeksAgo.toISOString())
      .eq('is_hidden', false);

    if (actError) throw actError;

    const uniqueUsers = [...new Set((recentActivities || []).map(a => a.user_id))];

    console.log(`Weekly snapshot compute: ${uniqueUsers.length} active users`);

    const weekStart = getWeekStart(new Date());
    let processed = 0;
    let errors = 0;

    for (const userId of uniqueUsers) {
      try {
        const snapshot = await computeWeeklySnapshot(supabase, userId, weekStart);

        await supabase.from('fitness_snapshots').upsert(snapshot, {
          onConflict: 'user_id,snapshot_week'
        });

        processed++;
      } catch (err) {
        console.error(`Snapshot failed for ${userId}:`, err.message);
        errors++;
      }
    }

    console.log(`Weekly compute complete: ${processed} processed, ${errors} errors`);

    return res.json({
      success: true,
      usersProcessed: processed,
      errors,
      weekStart
    });

  } catch (error) {
    console.error('Weekly compute error:', error);
    return res.status(500).json({ error: error.message });
  }
}
