/**
 * Garmin Activity Backfill Utilities
 *
 * Handles historical activity data backfill from Garmin Connect API.
 * Implements chunked requests (2-month windows) over 2 years to avoid
 * stressing Garmin's systems and prevent rate limiting.
 *
 * Key concepts:
 * - Backfill is ASYNCHRONOUS - data is PUSHED to webhooks, not returned immediately
 * - Maximum 5 years of historical activity data available
 * - We request 2 years in 2-month chunks (12 chunks total)
 * - 409 errors mean the time range was already processed (OK to ignore)
 * - Must add delays between requests to be respectful of Garmin's servers
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GARMIN_API_BASE = 'https://apis.garmin.com/wellness-api/rest';

// Configuration
const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000; // ~60 days in milliseconds
const DELAY_BETWEEN_CHUNKS_MS = 10000; // 10 seconds between requests (Garmin rate limits at 100/min)
const DEFAULT_YEARS_BACK = 2;
const MAX_YEARS_BACK = 5; // Garmin's limit for activity data

/**
 * Generate backfill chunks for a given time period
 * Breaks the period into 2-month windows
 *
 * @param {number} yearsBack - Number of years of history to request (default: 2, max: 5)
 * @returns {BackfillChunk[]} Array of chunk objects with date ranges and timestamps
 */
export function generateBackfillChunks(yearsBack = DEFAULT_YEARS_BACK) {
  const chunks = [];
  const now = new Date();

  // Limit to Garmin's maximum
  const actualYears = Math.min(yearsBack, MAX_YEARS_BACK);

  const startDate = new Date(now);
  startDate.setFullYear(startDate.getFullYear() - actualYears);

  let chunkStart = new Date(startDate);

  while (chunkStart < now) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + 2);

    // Don't go past current date
    const actualEnd = chunkEnd > now ? new Date(now) : chunkEnd;

    chunks.push({
      startDate: new Date(chunkStart),
      endDate: new Date(actualEnd),
      startTimestamp: Math.floor(chunkStart.getTime() / 1000),
      endTimestamp: Math.floor(actualEnd.getTime() / 1000),
    });

    chunkStart = chunkEnd;
  }

  return chunks;
}

/**
 * Request activity backfill for a specific time range from Garmin
 *
 * @param {string} accessToken - Valid Garmin OAuth2 access token
 * @param {number} startTimestamp - Start time in seconds (Unix epoch)
 * @param {number} endTimestamp - End time in seconds (Unix epoch)
 * @returns {Promise<{success: boolean, status: number, error?: string, duplicate?: boolean}>}
 */
export async function requestActivityBackfill(accessToken, startTimestamp, endTimestamp) {
  try {
    const url = `${GARMIN_API_BASE}/backfill/activities?summaryStartTimeInSeconds=${startTimestamp}&summaryEndTimeInSeconds=${endTimestamp}`;

    console.log(`📤 Requesting backfill: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`);

    const response = await fetch(url, {
      method: 'GET', // Garmin backfill uses GET with query params
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    // 200 or 202 = Success, request queued
    if (response.status === 200 || response.status === 202) {
      return { success: true, status: response.status };
    }

    // 409 = Duplicate - already processed this time range (this is OK)
    if (response.status === 409) {
      const errorText = await response.text();
      console.log('ℹ️ Duplicate backfill request (already processed):', errorText.substring(0, 100));
      return { success: false, status: 409, error: 'Already processed', duplicate: true };
    }

    // 401 = Unauthorized - token may need refresh
    if (response.status === 401) {
      return { success: false, status: 401, error: 'Unauthorized - token may be expired' };
    }

    // 403 = Forbidden - user may not have granted activity permissions
    if (response.status === 403) {
      return { success: false, status: 403, error: 'Activity permission not granted' };
    }

    // Other errors
    const errorText = await response.text();
    console.error(`❌ Backfill request failed: ${response.status}`, errorText.substring(0, 200));
    return { success: false, status: response.status, error: errorText.substring(0, 200) };

  } catch (error) {
    console.error('❌ Backfill request error:', error);
    return { success: false, status: 0, error: error.message };
  }
}

/**
 * Create backfill chunks in the database for a user
 * This sets up the tracking records before starting the actual requests
 *
 * @param {string} userId - User UUID
 * @param {number} yearsBack - Number of years to backfill
 * @returns {Promise<{success: boolean, chunks: object[], error?: string}>}
 */
export async function createBackfillChunks(userId, yearsBack = DEFAULT_YEARS_BACK) {
  try {
    const chunks = generateBackfillChunks(yearsBack);

    const chunkRecords = chunks.map(chunk => ({
      user_id: userId,
      chunk_start: chunk.startDate.toISOString(),
      chunk_end: chunk.endDate.toISOString(),
      start_timestamp: chunk.startTimestamp,
      end_timestamp: chunk.endTimestamp,
      status: 'pending'
    }));

    // Use upsert to handle re-runs (won't duplicate existing chunks)
    const { data, error } = await supabase
      .from('garmin_backfill_chunks')
      .upsert(chunkRecords, {
        onConflict: 'user_id,chunk_start,chunk_end',
        ignoreDuplicates: true
      })
      .select();

    if (error) {
      console.error('❌ Error creating backfill chunks:', error);
      return { success: false, chunks: [], error: error.message };
    }

    console.log(`✅ Created ${data?.length || 0} backfill chunk records`);
    return { success: true, chunks: data || [] };

  } catch (error) {
    console.error('❌ Error creating backfill chunks:', error);
    return { success: false, chunks: [], error: error.message };
  }
}

/**
 * Get all backfill chunks for a user
 *
 * @param {string} userId - User UUID
 * @returns {Promise<object[]>} Array of chunk records
 */
export async function getBackfillChunks(userId) {
  const { data, error } = await supabase
    .from('garmin_backfill_chunks')
    .select('*')
    .eq('user_id', userId)
    .order('chunk_start', { ascending: true });

  if (error) {
    console.error('❌ Error fetching backfill chunks:', error);
    return [];
  }

  return data || [];
}

/**
 * Update the status of a backfill chunk
 *
 * @param {string} chunkId - Chunk UUID
 * @param {string} status - New status
 * @param {object} additionalData - Additional fields to update
 */
export async function updateBackfillChunkStatus(chunkId, status, additionalData = {}) {
  const updateData = {
    status,
    ...additionalData
  };

  if (status === 'requested') {
    updateData.requested_at = new Date().toISOString();
  } else if (status === 'received') {
    updateData.received_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('garmin_backfill_chunks')
    .update(updateData)
    .eq('id', chunkId);

  if (error) {
    console.error(`❌ Error updating chunk ${chunkId}:`, error);
  }
}

/**
 * Update backfill chunk when activity is received via webhook
 * Called from webhook handler when an activity arrives within a backfill window
 *
 * @param {string} userId - User UUID
 * @param {number} activityStartTimestamp - Activity start time in seconds
 */
export async function updateBackfillChunkIfApplicable(userId, activityStartTimestamp) {
  try {
    // Find chunk that contains this activity's timestamp
    const { data: chunks, error } = await supabase
      .from('garmin_backfill_chunks')
      .select('id, status, activity_count')
      .eq('user_id', userId)
      .eq('status', 'requested')
      .lte('start_timestamp', activityStartTimestamp)
      .gte('end_timestamp', activityStartTimestamp)
      .limit(1);

    if (error || !chunks || chunks.length === 0) {
      return; // No matching chunk or not from backfill
    }

    const chunk = chunks[0];
    const newCount = (chunk.activity_count || 0) + 1;

    // Update activity count and potentially mark as received
    // Note: We don't immediately mark as "received" because more activities may come
    // The status will be updated to "received" after a timeout or manually
    await supabase
      .from('garmin_backfill_chunks')
      .update({
        activity_count: newCount,
        received_at: new Date().toISOString()
      })
      .eq('id', chunk.id);

    console.log(`📊 Backfill chunk updated: +1 activity (total: ${newCount})`);

  } catch (err) {
    console.error('❌ Error updating backfill chunk:', err);
  }
}

/**
 * Execute the full backfill process for a user
 * Processes all pending chunks with delays between requests
 *
 * @param {string} userId - User UUID
 * @param {string} accessToken - Valid Garmin OAuth2 access token
 * @param {object} options - Options { yearsBack, delayMs }
 * @returns {Promise<{success: boolean, summary: object}>}
 */
export async function executeBackfillForUser(userId, accessToken, options = {}) {
  const { yearsBack = DEFAULT_YEARS_BACK, delayMs = DELAY_BETWEEN_CHUNKS_MS } = options;

  console.log(`🔄 Starting historical backfill for user ${userId}: ${yearsBack} years`);

  // Create or get existing chunks
  await createBackfillChunks(userId, yearsBack);

  // Get all chunks (including existing ones)
  const { data: chunks, error } = await supabase
    .from('garmin_backfill_chunks')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'failed'])
    .order('chunk_start', { ascending: true });

  if (error) {
    console.error('❌ Error fetching chunks:', error);
    return {
      success: false,
      summary: { error: error.message }
    };
  }

  if (!chunks || chunks.length === 0) {
    console.log('ℹ️ No pending chunks to process');
    return {
      success: true,
      summary: {
        total: 0,
        requested: 0,
        alreadyProcessed: 0,
        failed: 0,
        message: 'No pending chunks - backfill may already be complete'
      }
    };
  }

  console.log(`📥 Processing ${chunks.length} chunks`);

  const summary = {
    total: chunks.length,
    requested: 0,
    alreadyProcessed: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(`\n📦 Chunk ${i + 1}/${chunks.length}: ${chunk.chunk_start.split('T')[0]} to ${chunk.chunk_end.split('T')[0]}`);

    const result = await requestActivityBackfill(
      accessToken,
      chunk.start_timestamp,
      chunk.end_timestamp
    );

    if (result.success) {
      await updateBackfillChunkStatus(chunk.id, 'requested');
      summary.requested++;
      console.log(`  ✓ Queued successfully`);
    } else if (result.duplicate) {
      await updateBackfillChunkStatus(chunk.id, 'already_processed');
      summary.alreadyProcessed++;
      console.log(`  ℹ Already processed`);
    } else {
      const retryCount = (chunk.retry_count || 0) + 1;
      await updateBackfillChunkStatus(chunk.id, 'failed', {
        error_message: result.error,
        retry_count: retryCount
      });
      summary.failed++;
      summary.errors.push({
        chunk: `${chunk.chunk_start.split('T')[0]} to ${chunk.chunk_end.split('T')[0]}`,
        error: result.error
      });
      console.log(`  ✗ Failed: ${result.error}`);

      // If unauthorized, stop processing - token is likely invalid
      if (result.status === 401) {
        console.error('🚫 Unauthorized - stopping backfill. User may need to reconnect Garmin.');
        break;
      }
    }

    // Delay before next request (except for last chunk)
    if (i < chunks.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(`\n✅ Backfill requests complete: ${summary.requested} queued, ${summary.alreadyProcessed} already done, ${summary.failed} failed`);

  return {
    success: summary.failed === 0,
    summary
  };
}

/**
 * Get backfill progress summary for a user
 *
 * @param {string} userId - User UUID
 * @returns {Promise<object>} Summary with counts by status
 */
export async function getBackfillProgress(userId) {
  const chunks = await getBackfillChunks(userId);

  if (chunks.length === 0) {
    return {
      initialized: false,
      total: 0,
      pending: 0,
      requested: 0,
      received: 0,
      alreadyProcessed: 0,
      failed: 0,
      activitiesReceived: 0,
      percentComplete: 0,
      chunks: []
    };
  }

  const summary = {
    initialized: true,
    total: chunks.length,
    pending: 0,
    requested: 0,
    received: 0,
    alreadyProcessed: 0,
    failed: 0,
    activitiesReceived: 0,
    percentComplete: 0,
    oldestChunk: chunks[0]?.chunk_start,
    newestChunk: chunks[chunks.length - 1]?.chunk_end,
    chunks: chunks.map(c => ({
      start: c.chunk_start,
      end: c.chunk_end,
      status: c.status,
      activityCount: c.activity_count || 0,
      requestedAt: c.requested_at,
      receivedAt: c.received_at,
      error: c.error_message
    }))
  };

  for (const chunk of chunks) {
    switch (chunk.status) {
      case 'pending':
        summary.pending++;
        break;
      case 'requested':
        summary.requested++;
        break;
      case 'received':
        summary.received++;
        break;
      case 'already_processed':
        summary.alreadyProcessed++;
        break;
      case 'failed':
        summary.failed++;
        break;
    }
    summary.activitiesReceived += chunk.activity_count || 0;
  }

  // Calculate completion percentage
  // Consider "received" and "already_processed" as complete
  const completed = summary.received + summary.alreadyProcessed;
  summary.percentComplete = Math.round((completed / summary.total) * 100);

  return summary;
}

/**
 * Mark old "requested" chunks as "received" if they've been waiting too long
 * Called periodically to clean up stale chunks
 *
 * @param {string} userId - User UUID
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 */
export async function markStaleChunksAsReceived(userId, maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await supabase
    .from('garmin_backfill_chunks')
    .update({
      status: 'received',
      received_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('status', 'requested')
    .lt('requested_at', cutoffTime)
    .select();

  if (error) {
    console.error('❌ Error marking stale chunks:', error);
    return 0;
  }

  if (data && data.length > 0) {
    console.log(`📊 Marked ${data.length} stale chunks as received`);
  }

  return data?.length || 0;
}

/**
 * Reset failed chunks to pending for retry
 *
 * @param {string} userId - User UUID
 */
export async function resetFailedChunks(userId) {
  const { data, error } = await supabase
    .from('garmin_backfill_chunks')
    .update({
      status: 'pending',
      error_message: null
    })
    .eq('user_id', userId)
    .eq('status', 'failed')
    .select();

  if (error) {
    console.error('❌ Error resetting failed chunks:', error);
    return 0;
  }

  console.log(`🔄 Reset ${data?.length || 0} failed chunks to pending`);
  return data?.length || 0;
}

/**
 * Sleep utility function
 *
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  generateBackfillChunks,
  requestActivityBackfill,
  createBackfillChunks,
  getBackfillChunks,
  updateBackfillChunkStatus,
  updateBackfillChunkIfApplicable,
  executeBackfillForUser,
  getBackfillProgress,
  markStaleChunksAsReceived,
  resetFailedChunks
};
