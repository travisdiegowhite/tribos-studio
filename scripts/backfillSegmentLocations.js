#!/usr/bin/env node

/**
 * Backfill Segment Location Names
 *
 * Reverse geocodes existing training segments to prepend a location name
 * to their auto_name. Only updates segments that don't already have a
 * location-style name (i.e. names that start with a generic terrain label).
 *
 * Usage:
 *   node scripts/backfillSegmentLocations.js [options]
 *
 * Options:
 *   --user-id <id>    Process only a specific user
 *   --dry-run         Show what would be updated without making changes
 *   --limit <n>       Max segments to process (default: all)
 *
 * Environment:
 *   Requires SUPABASE_URL, SUPABASE_SERVICE_KEY, and MAPBOX_ACCESS_TOKEN
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN;

// Generic prefixes that indicate no location has been added yet
const GENERIC_PREFIXES = ['Climb', 'Descent', 'Rolling', 'Flat'];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, userId: null, limit: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    if (args[i] === '--user-id' && args[i + 1]) opts.userId = args[++i];
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10);
  }
  return opts;
}

async function reverseGeocode(lat, lng) {
  if (!MAPBOX_ACCESS_TOKEN || !lat || !lng) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=neighborhood,locality,place&limit=1`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  return data.features?.[0]?.text || null;
}

function needsLocation(autoName) {
  if (!autoName) return true;
  // If name starts with a number (e.g. "5 min Climb") or a generic prefix, it needs location
  const firstWord = autoName.split(' ')[0];
  if (!isNaN(firstWord)) return true;
  return GENERIC_PREFIXES.some(p => autoName.startsWith(p));
}

async function main() {
  const opts = parseArgs();

  if (!MAPBOX_ACCESS_TOKEN) {
    console.error('MAPBOX_ACCESS_TOKEN is required');
    process.exit(1);
  }

  console.log(`Backfill segment locations${opts.dryRun ? ' (DRY RUN)' : ''}`);

  // Fetch segments that need location names
  let query = supabase
    .from('training_segments')
    .select('id, auto_name, custom_name, start_lat, start_lng, terrain_type, distance_meters, avg_gradient')
    .is('custom_name', null)  // Don't touch segments with user-set names
    .order('created_at', { ascending: false });

  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.limit) query = query.limit(opts.limit);

  const { data: segments, error } = await query;
  if (error) {
    console.error('Failed to fetch segments:', error.message);
    process.exit(1);
  }

  const toUpdate = segments.filter(s => needsLocation(s.auto_name));
  console.log(`Found ${segments.length} segments, ${toUpdate.length} need location names`);

  let updated = 0;
  let failed = 0;

  for (const seg of toUpdate) {
    const location = await reverseGeocode(seg.start_lat, seg.start_lng);

    if (!location) {
      failed++;
      continue;
    }

    const newName = `${location} ${seg.auto_name || ''}`.trim();

    if (opts.dryRun) {
      console.log(`  [DRY] ${seg.auto_name} → ${newName}`);
    } else {
      const { error: updateErr } = await supabase
        .from('training_segments')
        .update({ auto_name: newName })
        .eq('id', seg.id);

      if (updateErr) {
        console.error(`  Failed to update ${seg.id}: ${updateErr.message}`);
        failed++;
        continue;
      }
      console.log(`  Updated: ${seg.auto_name} → ${newName}`);
    }
    updated++;

    // Rate limit: Mapbox allows 600 req/min, be conservative at ~10/sec
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}, Skipped: ${segments.length - toUpdate.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
