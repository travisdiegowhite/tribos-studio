// Vercel API Route: COROS Activities
// Fetches activities from COROS and stores them in Supabase
// COROS API: max 30-day range, max 3 months back

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { checkForDuplicate, mergeActivityData } from './utils/activityDedup.js';
import { getValidAccessToken } from './coros-auth.js';
import { buildCorosActivityData, mapCorosWorkoutType } from './utils/coros/activityBuilder.js';

// Initialize Supabase (server-side)
const supabase = getSupabaseAdmin();

const COROS_API_BASE = process.env.COROS_API_BASE || 'https://open.coros.com';

// Cycling-related COROS workout types (mode values)
const CYCLING_MODES = new Set([9]); // mode 9 = all cycling types
const RUNNING_MODES = new Set([8, 15, 20]); // Run, Trail Run, Track Run
const RELEVANT_MODES = new Set([8, 9, 10, 13, 14, 15, 16, 18, 19, 20, 21, 23, 24, 29, 31]);

export default async function handler(req, res) {
  if (setupCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    switch (action) {
      case 'sync_activities':
        return await syncActivities(req, res, userId);

      case 'sync_all_activities':
        return await syncAllActivities(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('COROS activities error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Format date as YYYYMMDD integer for COROS API
 */
function formatCorosDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Fetch workouts from COROS API for a date range
 */
async function fetchCorosWorkouts(token, openId, startDate, endDate) {
  const url = `${COROS_API_BASE}/v2/coros/sport/list?token=${token}&openId=${openId}&startDate=${formatCorosDate(startDate)}&endDate=${formatCorosDate(endDate)}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`COROS API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  if (result.result !== '0000') {
    throw new Error(`COROS API error: ${result.message || 'Unknown error'}`);
  }

  return result.data || [];
}

/**
 * Process and store a single COROS workout
 */
async function processWorkout(userId, workout) {
  const activityId = workout.labelId;
  if (!activityId) {
    return { status: 'skipped', reason: 'no_label_id' };
  }

  // Check for duplicates
  const dupCheck = await checkForDuplicate(
    userId,
    'coros',
    activityId,
    workout.startTime ? new Date(workout.startTime * 1000) : null,
    workout.distance || null
  );

  if (dupCheck.isDuplicate) {
    if (dupCheck.shouldMerge && dupCheck.existingActivity) {
      // Merge additional data into existing activity
      const corosData = buildCorosActivityData(userId, workout, 'api_sync');
      await mergeActivityData(dupCheck.existingActivity.id, corosData);
      return { status: 'merged', activityId };
    }
    return { status: 'skipped', reason: 'duplicate', activityId };
  }

  // Build activity data
  const activityData = buildCorosActivityData(userId, workout, 'api_sync');

  // Store activity
  const { data: inserted, error: insertError } = await supabase
    .from('activities')
    .insert(activityData)
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to insert COROS activity:', insertError.message);
    return { status: 'error', error: insertError.message, activityId };
  }

  return { status: 'imported', activityId, id: inserted.id };
}

/**
 * Sync recent activities (last 30 days)
 */
async function syncActivities(req, res, userId) {
  try {
    const { token, openId } = await getValidAccessToken(userId);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    console.log(`🔄 Syncing COROS activities for user ${userId}: ${formatCorosDate(startDate)} - ${formatCorosDate(endDate)}`);

    const workouts = await fetchCorosWorkouts(token, openId, startDate, endDate);

    const results = {
      fetched: workouts.length,
      imported: 0,
      merged: 0,
      skipped: 0,
      errors: 0
    };

    for (const workout of workouts) {
      const result = await processWorkout(userId, workout);
      switch (result.status) {
        case 'imported': results.imported++; break;
        case 'merged': results.merged++; break;
        case 'skipped': results.skipped++; break;
        case 'error': results.errors++; break;
      }
    }

    // Update last sync timestamp
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'coros');

    console.log(`✅ COROS sync complete:`, results);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('COROS sync error:', error);

    // Store sync error
    await supabase
      .from('bike_computer_integrations')
      .update({
        sync_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'coros');

    return res.status(500).json({ error: error.message });
  }
}

/**
 * Sync all available activities (up to 3 months back, in 30-day chunks)
 */
async function syncAllActivities(req, res, userId) {
  try {
    const { token, openId } = await getValidAccessToken(userId);

    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const totalResults = {
      fetched: 0,
      imported: 0,
      merged: 0,
      skipped: 0,
      errors: 0,
      chunks: 0
    };

    // Process in 30-day chunks, working backwards from today
    let chunkEnd = new Date(now);

    while (chunkEnd > threeMonthsAgo) {
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - 30);

      // Ensure we don't go before the 3-month limit
      if (chunkStart < threeMonthsAgo) {
        chunkStart.setTime(threeMonthsAgo.getTime());
      }

      console.log(`📦 COROS chunk ${totalResults.chunks + 1}: ${formatCorosDate(chunkStart)} - ${formatCorosDate(chunkEnd)}`);

      const workouts = await fetchCorosWorkouts(token, openId, chunkStart, chunkEnd);
      totalResults.fetched += workouts.length;

      for (const workout of workouts) {
        const result = await processWorkout(userId, workout);
        switch (result.status) {
          case 'imported': totalResults.imported++; break;
          case 'merged': totalResults.merged++; break;
          case 'skipped': totalResults.skipped++; break;
          case 'error': totalResults.errors++; break;
        }
      }

      totalResults.chunks++;

      // Move window back
      chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() - 1);
    }

    // Update last sync timestamp
    await supabase
      .from('bike_computer_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'coros');

    console.log(`✅ COROS full sync complete:`, totalResults);

    return res.status(200).json({
      success: true,
      ...totalResults
    });

  } catch (error) {
    console.error('COROS full sync error:', error);

    await supabase
      .from('bike_computer_integrations')
      .update({
        sync_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'coros');

    return res.status(500).json({ error: error.message });
  }
}
