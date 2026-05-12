#!/usr/bin/env node

/**
 * T1.2 coordinate format unification — dry-run waypoint shape audit.
 *
 * Reads `routes.waypoints` JSONB across the table and reports what
 * shapes exist so we know what a migration script would have to handle.
 *
 * **This script is read-only.** It does not write to the database.
 * If the report comes back clean (all rows are either null/empty or
 * already use canonical `position: [lng, lat]`), no migration is needed.
 * If non-canonical shapes are found, a follow-up PR can add a
 * transform-and-update script after the report is reviewed.
 *
 * Why a dry-run first: the manual save path
 * (`src/hooks/useRouteOperations.js:226-331`) does not write to
 * `routes.waypoints` at all today. So only AI-generated and legacy
 * Strava-import rows could carry non-canonical waypoint data.
 *
 * Usage:
 *   node scripts/audit-route-waypoints-shape.js
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Set them in .env or the environment.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function classifyWaypoint(wp) {
  if (wp == null) return 'null';
  if (Array.isArray(wp)) {
    if (wp.length === 2 && typeof wp[0] === 'number' && typeof wp[1] === 'number') {
      return 'bare-array';
    }
    return 'array-other';
  }
  if (typeof wp !== 'object') return 'primitive';

  const hasPosition = Array.isArray(wp.position) && wp.position.length === 2;
  const hasLngLat = typeof wp.lng === 'number' && typeof wp.lat === 'number';
  const hasLonLat = typeof wp.lon === 'number' && typeof wp.lat === 'number';
  const hasLongLat = typeof wp.longitude === 'number' && typeof wp.latitude === 'number';

  if (hasPosition) return 'object-with-position-canonical';
  if (hasLngLat) return 'object-with-lng-lat';
  if (hasLonLat) return 'object-with-lon-lat';
  if (hasLongLat) return 'object-with-longitude-latitude';
  return 'object-other';
}

async function main() {
  console.log('Auditing routes.waypoints shape…');

  const counts = {};
  const samples = {};
  let totalRows = 0;
  let rowsWithWaypoints = 0;

  let from = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await supabase
      .from('routes')
      .select('id, generated_by, waypoints, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('Supabase error:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      totalRows += 1;
      const wps = row.waypoints;
      if (wps == null) {
        counts['no-waypoints-column'] = (counts['no-waypoints-column'] ?? 0) + 1;
        continue;
      }
      if (Array.isArray(wps) && wps.length === 0) {
        counts['empty-array'] = (counts['empty-array'] ?? 0) + 1;
        continue;
      }
      if (!Array.isArray(wps)) {
        counts['non-array'] = (counts['non-array'] ?? 0) + 1;
        samples['non-array'] ??= { id: row.id, generated_by: row.generated_by, sample: wps };
        continue;
      }

      rowsWithWaypoints += 1;
      // Classify each waypoint, but track per-row by the shape of the first
      const shape = classifyWaypoint(wps[0]);
      const key = `row-first-wp-${shape}`;
      counts[key] = (counts[key] ?? 0) + 1;
      if (!samples[key]) {
        samples[key] = {
          id: row.id,
          generated_by: row.generated_by,
          sample: wps[0],
          rowSize: wps.length,
        };
      }

      // Also tally mixed-shape rows (different shape mid-array)
      for (let i = 1; i < wps.length; i++) {
        const otherShape = classifyWaypoint(wps[i]);
        if (otherShape !== shape) {
          counts['mixed-shape-within-row'] =
            (counts['mixed-shape-within-row'] ?? 0) + 1;
          if (!samples['mixed-shape-within-row']) {
            samples['mixed-shape-within-row'] = {
              id: row.id,
              generated_by: row.generated_by,
              firstShape: shape,
              otherShape,
            };
          }
          break;
        }
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log('');
  console.log(`Total rows scanned: ${totalRows}`);
  console.log(`Rows with non-empty waypoints: ${rowsWithWaypoints}`);
  console.log('');
  console.log('Shape histogram:');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(6)}  ${k}`);
  }
  console.log('');
  console.log('Representative samples (one per shape):');
  for (const [k, v] of Object.entries(samples)) {
    console.log(`  [${k}]`);
    console.log(`    row id: ${v.id}`);
    console.log(`    generated_by: ${v.generated_by}`);
    if (v.sample !== undefined) {
      console.log(`    sample: ${JSON.stringify(v.sample)}`);
    }
    if (v.rowSize !== undefined) {
      console.log(`    waypoints.length: ${v.rowSize}`);
    }
    if (v.firstShape !== undefined) {
      console.log(`    first: ${v.firstShape}; other: ${v.otherShape}`);
    }
  }

  console.log('');
  console.log('Done. No data was modified.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
