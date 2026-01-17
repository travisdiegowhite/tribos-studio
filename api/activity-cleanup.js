/**
 * API Route: Activity Cleanup
 * Find and merge duplicate activities across providers
 *
 * Endpoints:
 * - POST /api/activity-cleanup?action=find-duplicates - Find potential duplicates
 * - POST /api/activity-cleanup?action=merge-duplicates - Merge duplicates (keep best data)
 * - POST /api/activity-cleanup?action=delete-duplicate - Delete a specific duplicate
 */

import { createClient } from '@supabase/supabase-js';
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query.action || req.body?.action;

  switch (action) {
    case 'find-duplicates':
      return findDuplicates(req, res);
    case 'merge-duplicates':
      return mergeDuplicates(req, res);
    case 'auto-cleanup':
      return autoCleanup(req, res);
    default:
      return res.status(400).json({ error: 'Invalid action. Use: find-duplicates, merge-duplicates, or auto-cleanup' });
  }
}

/**
 * Find all duplicate activities for a user
 * Groups activities that have similar start times and distances
 */
async function findDuplicates(req, res) {
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all activities for user
    const { data: activities, error } = await supabase
      .from('activities')
      .select('id, provider, provider_activity_id, name, start_date, distance, moving_time, average_watts, average_heartrate, map_summary_polyline, created_at')
      .eq('user_id', authUser.id)
      .order('start_date', { ascending: false });

    if (error) throw error;

    // Group potential duplicates by start time (within 5 min window)
    const duplicateGroups = [];
    const processed = new Set();

    for (let i = 0; i < activities.length; i++) {
      if (processed.has(activities[i].id)) continue;

      const activity = activities[i];
      const startTime = new Date(activity.start_date).getTime();
      const group = [activity];

      // Find other activities with similar start time and distance
      for (let j = i + 1; j < activities.length; j++) {
        if (processed.has(activities[j].id)) continue;

        const other = activities[j];
        const otherStartTime = new Date(other.start_date).getTime();
        const timeDiff = Math.abs(startTime - otherStartTime);

        // Within 5 minutes
        if (timeDiff <= 5 * 60 * 1000) {
          // Check distance similarity (within 1% or 100m)
          if (activity.distance && other.distance) {
            const distanceTolerance = Math.max(activity.distance * 0.01, 100);
            const distanceDiff = Math.abs(activity.distance - other.distance);

            if (distanceDiff <= distanceTolerance) {
              group.push(other);
              processed.add(other.id);
            }
          }
        }
      }

      if (group.length > 1) {
        // This is a duplicate group
        duplicateGroups.push({
          activities: group.map(a => ({
            id: a.id,
            provider: a.provider,
            name: a.name,
            start_date: a.start_date,
            distance: a.distance,
            moving_time: a.moving_time,
            has_power: !!a.average_watts,
            has_hr: !!a.average_heartrate,
            has_gps: !!a.map_summary_polyline,
            created_at: a.created_at
          })),
          recommended_keep: selectBestActivity(group)
        });
      }

      processed.add(activity.id);
    }

    return res.json({
      success: true,
      totalActivities: activities.length,
      duplicateGroups: duplicateGroups.length,
      totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.activities.length - 1, 0),
      groups: duplicateGroups
    });

  } catch (error) {
    console.error('Find duplicates error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Select the best activity to keep from a group
 * Prefers: more data (power, HR, GPS), earlier import, Garmin over Strava
 */
function selectBestActivity(activities) {
  return activities.reduce((best, current) => {
    let bestScore = scoreActivity(best);
    let currentScore = scoreActivity(current);

    return currentScore > bestScore ? current : best;
  }).id;
}

function scoreActivity(activity) {
  let score = 0;

  // Power data is valuable
  if (activity.average_watts) score += 10;

  // Heart rate data
  if (activity.average_heartrate) score += 5;

  // GPS data
  if (activity.map_summary_polyline) score += 5;

  // Prefer Garmin (usually has more accurate data from device)
  if (activity.provider === 'garmin') score += 3;
  if (activity.provider === 'wahoo') score += 2;

  // Prefer earlier imports (original source)
  const age = Date.now() - new Date(activity.created_at).getTime();
  score += Math.min(5, age / (24 * 60 * 60 * 1000)); // Up to 5 points for older

  return score;
}

/**
 * Merge duplicate groups - keep best activity, merge data, delete rest
 */
async function mergeDuplicates(req, res) {
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { groups } = req.body;

  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ error: 'groups array required' });
  }

  try {
    let merged = 0;
    let deleted = 0;
    const errors = [];

    for (const group of groups) {
      const keepId = group.keep_id || group.recommended_keep;
      const deleteIds = group.activities
        .map(a => a.id)
        .filter(id => id !== keepId);

      if (!keepId || deleteIds.length === 0) continue;

      // Get full activity data for merging
      const { data: activitiesToMerge } = await supabase
        .from('activities')
        .select('*')
        .in('id', [keepId, ...deleteIds])
        .eq('user_id', authUser.id);

      if (!activitiesToMerge || activitiesToMerge.length < 2) continue;

      const keepActivity = activitiesToMerge.find(a => a.id === keepId);
      const othersToMerge = activitiesToMerge.filter(a => a.id !== keepId);

      // Merge data from others into the keep activity
      const updates = {};

      for (const other of othersToMerge) {
        // Fill in missing data
        if (!keepActivity.average_watts && other.average_watts) {
          updates.average_watts = other.average_watts;
        }
        if (!keepActivity.average_heartrate && other.average_heartrate) {
          updates.average_heartrate = other.average_heartrate;
          updates.max_heartrate = other.max_heartrate;
        }
        if (!keepActivity.average_cadence && other.average_cadence) {
          updates.average_cadence = other.average_cadence;
        }
        if (!keepActivity.map_summary_polyline && other.map_summary_polyline) {
          updates.map_summary_polyline = other.map_summary_polyline;
        }
        if (!keepActivity.kilojoules && other.kilojoules) {
          updates.kilojoules = other.kilojoules;
        }
      }

      // Track merged providers
      const providers = [keepActivity.provider, ...othersToMerge.map(a => a.provider)];
      updates.raw_data = {
        ...keepActivity.raw_data,
        merged_providers: [...new Set(providers)],
        merged_at: new Date().toISOString()
      };
      updates.updated_at = new Date().toISOString();

      // Update the keep activity
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('activities')
          .update(updates)
          .eq('id', keepId)
          .eq('user_id', authUser.id);

        if (updateError) {
          errors.push({ keepId, error: updateError.message });
          continue;
        }
      }

      // Delete the duplicate activities
      const { error: deleteError } = await supabase
        .from('activities')
        .delete()
        .in('id', deleteIds)
        .eq('user_id', authUser.id);

      if (deleteError) {
        errors.push({ deleteIds, error: deleteError.message });
      } else {
        merged++;
        deleted += deleteIds.length;
      }
    }

    return res.json({
      success: true,
      groupsMerged: merged,
      activitiesDeleted: deleted,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Merge duplicates error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Auto-cleanup: Find and merge all duplicates automatically
 */
async function autoCleanup(req, res) {
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { dryRun = true } = req.body;

  try {
    // First find all duplicates
    const { data: activities, error } = await supabase
      .from('activities')
      .select('id, provider, provider_activity_id, name, start_date, distance, moving_time, average_watts, average_heartrate, average_cadence, map_summary_polyline, kilojoules, created_at, raw_data')
      .eq('user_id', authUser.id)
      .order('start_date', { ascending: false });

    if (error) throw error;

    // Find duplicate groups
    const duplicateGroups = [];
    const processed = new Set();

    for (let i = 0; i < activities.length; i++) {
      if (processed.has(activities[i].id)) continue;

      const activity = activities[i];
      const startTime = new Date(activity.start_date).getTime();
      const group = [activity];

      for (let j = i + 1; j < activities.length; j++) {
        if (processed.has(activities[j].id)) continue;

        const other = activities[j];
        const otherStartTime = new Date(other.start_date).getTime();
        const timeDiff = Math.abs(startTime - otherStartTime);

        if (timeDiff <= 5 * 60 * 1000 && activity.distance && other.distance) {
          const distanceTolerance = Math.max(activity.distance * 0.01, 100);
          const distanceDiff = Math.abs(activity.distance - other.distance);

          if (distanceDiff <= distanceTolerance) {
            group.push(other);
            processed.add(other.id);
          }
        }
      }

      if (group.length > 1) {
        const keepId = selectBestActivity(group);
        duplicateGroups.push({
          keep: group.find(a => a.id === keepId),
          delete: group.filter(a => a.id !== keepId)
        });
      }

      processed.add(activity.id);
    }

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        duplicateGroupsFound: duplicateGroups.length,
        wouldDelete: duplicateGroups.reduce((sum, g) => sum + g.delete.length, 0),
        preview: duplicateGroups.slice(0, 10).map(g => ({
          keep: { id: g.keep.id, provider: g.keep.provider, name: g.keep.name, date: g.keep.start_date },
          delete: g.delete.map(d => ({ id: d.id, provider: d.provider, name: d.name }))
        }))
      });
    }

    // Actually perform the cleanup
    let merged = 0;
    let deleted = 0;

    for (const group of duplicateGroups) {
      const keepActivity = group.keep;
      const deleteActivities = group.delete;

      // Merge data
      const updates = { updated_at: new Date().toISOString() };

      for (const other of deleteActivities) {
        if (!keepActivity.average_watts && other.average_watts) {
          updates.average_watts = other.average_watts;
        }
        if (!keepActivity.average_heartrate && other.average_heartrate) {
          updates.average_heartrate = other.average_heartrate;
          updates.max_heartrate = other.max_heartrate;
        }
        if (!keepActivity.average_cadence && other.average_cadence) {
          updates.average_cadence = other.average_cadence;
        }
        if (!keepActivity.map_summary_polyline && other.map_summary_polyline) {
          updates.map_summary_polyline = other.map_summary_polyline;
        }
        if (!keepActivity.kilojoules && other.kilojoules) {
          updates.kilojoules = other.kilojoules;
        }
      }

      const providers = [keepActivity.provider, ...deleteActivities.map(a => a.provider)];
      updates.raw_data = {
        ...keepActivity.raw_data,
        merged_providers: [...new Set(providers)],
        merged_at: new Date().toISOString()
      };

      // Update keeper
      await supabase
        .from('activities')
        .update(updates)
        .eq('id', keepActivity.id);

      // Delete duplicates
      const deleteIds = deleteActivities.map(a => a.id);
      await supabase
        .from('activities')
        .delete()
        .in('id', deleteIds);

      merged++;
      deleted += deleteIds.length;
    }

    return res.json({
      success: true,
      dryRun: false,
      groupsMerged: merged,
      activitiesDeleted: deleted
    });

  } catch (error) {
    console.error('Auto cleanup error:', error);
    return res.status(500).json({ error: error.message });
  }
}
