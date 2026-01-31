#!/usr/bin/env node

/**
 * Backfill Road Segments
 *
 * This script extracts road segments from existing activities for all users.
 * Run this once after deploying the road segments feature to populate
 * historical segment data.
 *
 * Usage:
 *   node scripts/backfillRoadSegments.js [options]
 *
 * Options:
 *   --user-id <id>    Process only a specific user
 *   --limit <n>       Limit activities per user (default: 100)
 *   --months <n>      Only process activities from last N months (default: all)
 *   --force           Re-process already processed activities
 *   --dry-run         Show what would be processed without making changes
 *
 * Environment:
 *   Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables
 */

import { createClient } from '@supabase/supabase-js';
import {
  extractAndStoreActivitySegments,
  extractSegmentsForUser
} from '../api/utils/roadSegmentExtractor.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    userId: null,
    limit: 100,
    months: null,
    force: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--user-id':
        options.userId = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i]) || 100;
        break;
      case '--months':
        options.months = parseInt(args[++i]);
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Backfill Road Segments Script

Usage:
  node scripts/backfillRoadSegments.js [options]

Options:
  --user-id <id>    Process only a specific user
  --limit <n>       Limit activities per user (default: 100)
  --months <n>      Only process activities from last N months
  --force           Re-process already processed activities
  --dry-run         Show what would be processed without changes
  --help            Show this help message
        `);
        process.exit(0);
    }
  }

  return options;
}

async function getUsers(specificUserId) {
  if (specificUserId) {
    return [{ user_id: specificUserId }];
  }

  // Get all users who have activities with GPS data
  const { data, error } = await supabase
    .from('activities')
    .select('user_id')
    .not('map_summary_polyline', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }

  // Deduplicate
  const uniqueUsers = [...new Set(data.map(a => a.user_id))];
  return uniqueUsers.map(user_id => ({ user_id }));
}

async function getActivityCount(userId, months, includeProcessed) {
  let query = supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('map_summary_polyline', 'is', null);

  if (!includeProcessed) {
    query = query.is('segments_extracted_at', null);
  }

  if (months) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    query = query.gte('start_date', cutoffDate.toISOString());
  }

  const { count, error } = await query;
  return error ? 0 : count || 0;
}

async function main() {
  const options = parseArgs();

  console.log('🛣️  Road Segments Backfill Script');
  console.log('================================');
  console.log(`Options: limit=${options.limit}, months=${options.months || 'all'}, force=${options.force}, dryRun=${options.dryRun}`);
  console.log('');

  // Validate environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
    process.exit(1);
  }

  try {
    // Get users to process
    const users = await getUsers(options.userId);
    console.log(`📊 Found ${users.length} user(s) to process`);

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN - No changes will be made\n');
    }

    let totalProcessed = 0;
    let totalSegments = 0;
    let totalErrors = 0;

    for (const user of users) {
      const userId = user.user_id;

      // Get count of activities to process
      const activityCount = await getActivityCount(userId, options.months, options.force);

      if (activityCount === 0) {
        console.log(`👤 User ${userId}: No activities to process`);
        continue;
      }

      console.log(`\n👤 User ${userId}: ${activityCount} activities to process`);

      if (options.dryRun) {
        console.log(`   Would process up to ${Math.min(options.limit, activityCount)} activities`);
        continue;
      }

      // Process in batches
      let userProcessed = 0;
      let userSegments = 0;
      let remaining = activityCount;

      while (remaining > 0 && userProcessed < options.limit) {
        const batchLimit = Math.min(50, options.limit - userProcessed);

        // Calculate date filter
        let afterDate = null;
        if (options.months) {
          const cutoffDate = new Date();
          cutoffDate.setMonth(cutoffDate.getMonth() - options.months);
          afterDate = cutoffDate.toISOString();
        }

        const result = await extractSegmentsForUser(userId, {
          limit: batchLimit,
          includeProcessed: options.force,
          afterDate
        });

        userProcessed += result.processed;
        userSegments += result.segments;
        remaining = result.remaining;

        if (result.errors.length > 0) {
          totalErrors += result.errors.length;
          console.log(`   ⚠️ ${result.errors.length} errors in batch`);
        }

        console.log(`   ✅ Processed ${result.processed} activities (${result.segments} segments), ${remaining} remaining`);

        // Small delay between batches
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      totalProcessed += userProcessed;
      totalSegments += userSegments;

      console.log(`   📊 User total: ${userProcessed} activities, ${userSegments} segments`);
    }

    console.log('\n================================');
    console.log('🏁 Backfill Complete!');
    console.log(`   Total activities processed: ${totalProcessed}`);
    console.log(`   Total segments stored: ${totalSegments}`);
    if (totalErrors > 0) {
      console.log(`   ⚠️ Errors encountered: ${totalErrors}`);
    }

  } catch (error) {
    console.error('\n❌ Backfill failed:', error.message);
    process.exit(1);
  }
}

main();
