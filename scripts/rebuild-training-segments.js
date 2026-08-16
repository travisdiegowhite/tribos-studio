#!/usr/bin/env node

/**
 * Rebuild Training Segments
 *
 * Repairs a segment library that fragmented under the old endpoint-based
 * identity test, then recomputes "times ridden" from every ride with GPS
 * rather than the small fraction that segment detection ever reached.
 *
 * Phases, in order:
 *   retire    drop segments whose geometry is a ride, not a road
 *   dedupe    cluster the survivors by mutual coverage, merge each cluster
 *   coverage  record traversals for every activity with a track
 *   rollup    recompute ride_count / profiles from the traversal rows
 *
 * Dry run is the DEFAULT. Nothing is written without --apply. Review the
 * report first — the dedupe phase clusters far more aggressively than the
 * test it replaces, which is the intent but is worth eyeballing once.
 *
 * Usage:
 *   node scripts/rebuild-training-segments.js --user-id <uuid> [options]
 *
 * Options:
 *   --user-id <uuid>      Required unless --all-users
 *   --all-users           Process every user with segments
 *   --phase <name>        retire | dedupe | coverage | rollup | all (default: all)
 *   --apply               Actually write. Without this, nothing is modified.
 *   --limit <n>           Max activities per user in the coverage phase (default: 5000)
 *   --since <date>        Only consider activities on/after this ISO date
 *   --min-coverage <f>    Traversal + merge coverage threshold (default: 0.8)
 *   --tolerance <m>       Match radius in metres (default: 40)
 *   --report <path>       Write a JSON report, including the durations that
 *                         migration 110 discarded (read from its backup table)
 *   --verbose
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

import { COVERAGE_DEFAULTS } from '../api/utils/segmentCoverage.js';
import {
  analyzeCoverageForUser,
  TRAVERSAL_ANALYSIS_VERSION,
} from '../api/utils/segmentTraversalMatcher.js';
import {
  classifyForRetirement,
  findDuplicateClusters,
  chooseRepresentative,
  pickCustomName,
  mergeCluster,
  retireSegments,
  MERGE_DEFAULTS,
} from '../api/utils/segmentLibraryMerge.js';

// dotenv is not a declared dependency of this repo, so load it only if the
// environment happens to provide it and fall back to the ambient env.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // Expected when running with env vars already exported.
}

// Constructed in main() once the arguments and environment have been
// validated, so --help and usage errors don't need credentials to work.
let supabase = null;

// ============================================================================
// ARGS
// ============================================================================

function parseArgs() {
  const argv = process.argv.slice(2);
  const opts = {
    userId: null,
    allUsers: false,
    phase: 'all',
    apply: false,
    limit: 5000,
    since: null,
    minCoverage: MERGE_DEFAULTS.minMutualCoverage,
    tolerance: COVERAGE_DEFAULTS.toleranceMeters,
    report: null,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--user-id': opts.userId = argv[++i]; break;
      case '--all-users': opts.allUsers = true; break;
      case '--phase': opts.phase = argv[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--limit': opts.limit = parseInt(argv[++i], 10); break;
      case '--since': opts.since = argv[++i]; break;
      case '--min-coverage': opts.minCoverage = parseFloat(argv[++i]); break;
      case '--tolerance': opts.tolerance = parseFloat(argv[++i]); break;
      case '--report': opts.report = argv[++i]; break;
      case '--verbose': opts.verbose = true; break;
      case '--help':
        console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
        process.exit(0);
        break;
      default:
        if (argv[i].startsWith('--')) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
    }
  }

  if (!opts.userId && !opts.allUsers) {
    console.error('Specify --user-id <uuid> or --all-users. Use --help for usage.');
    process.exit(1);
  }
  return opts;
}

// ============================================================================
// REPORTING HELPERS
// ============================================================================

function histogram(counts) {
  const buckets = { '0': 0, '1': 0, '2-3': 0, '4-9': 0, '10+': 0 };
  for (const n of counts) {
    if (n === 0) buckets['0']++;
    else if (n === 1) buckets['1']++;
    else if (n <= 3) buckets['2-3']++;
    else if (n <= 9) buckets['4-9']++;
    else buckets['10+']++;
  }
  return buckets;
}

function fmtHistogram(h) {
  return Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('  ');
}

async function rideCountHistogram(userId) {
  const { data } = await supabase
    .from('training_segments')
    .select('ride_count')
    .eq('user_id', userId)
    .is('retired_at', null);
  return histogram((data || []).map(s => Number(s.ride_count) || 0));
}

// ============================================================================
// PHASES
// ============================================================================

async function loadSegments(userId) {
  const { data, error } = await supabase
    .from('training_segments')
    .select('id, geojson, distance_meters, data_quality_tier, ride_count, created_at, custom_name, bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng')
    .eq('user_id', userId)
    .is('retired_at', null);
  if (error) throw new Error(`load segments: ${error.message}`);
  return data || [];
}

async function phaseRetire(userId, opts, report) {
  const segments = await loadSegments(userId);

  // Distances of every activity each segment is linked to, so a segment that
  // is always most of its ride can be recognised.
  const { data: rides } = await supabase
    .from('training_segment_rides')
    .select('segment_id, activities!inner(distance)')
    .eq('user_id', userId);

  const bySegment = new Map();
  for (const r of rides || []) {
    const list = bySegment.get(r.segment_id) || [];
    if (r.activities?.distance) list.push(Number(r.activities.distance));
    bySegment.set(r.segment_id, list);
  }

  const doomed = { oversized: [], whole_ride: [] };
  const detail = [];

  for (const s of segments) {
    const verdict = classifyForRetirement(s, bySegment.get(s.id) || []);
    if (verdict.retire) {
      doomed[verdict.reason].push(s.id);
      detail.push({
        id: s.id,
        reason: verdict.reason,
        distance_meters: Number(s.distance_meters),
        ride_count: Number(s.ride_count) || 0,
      });
    }
  }

  console.log(`\n[retire] ${segments.length} active segments`);
  console.log(`  oversized  (> ${MERGE_DEFAULTS.maxSegmentMeters}m): ${doomed.oversized.length}`);
  console.log(`  whole_ride (> ${MERGE_DEFAULTS.maxActivityFraction * 100}% of every linked ride): ${doomed.whole_ride.length}`);

  const biggest = detail.sort((a, b) => b.distance_meters - a.distance_meters).slice(0, 10);
  for (const d of biggest) {
    console.log(`    ${(d.distance_meters / 1000).toFixed(1)}km  ride_count=${d.ride_count}  ${d.reason}  ${d.id}`);
  }

  report.retire = { candidates: detail.length, byReason: {
    oversized: doomed.oversized.length,
    whole_ride: doomed.whole_ride.length,
  }, detail };

  for (const [reason, ids] of Object.entries(doomed)) {
    const res = await retireSegments(supabase, ids, reason, { dryRun: !opts.apply });
    if (res.errors.length) console.error(`  errors: ${res.errors.join('; ')}`);
  }
}

async function phaseDedupe(userId, opts, report) {
  const segments = await loadSegments(userId);
  console.log(`\n[dedupe] clustering ${segments.length} segments at mutual coverage >= ${opts.minCoverage}`);

  const clusters = findDuplicateClusters(segments, {
    minMutualCoverage: opts.minCoverage,
    toleranceMeters: opts.tolerance,
  });

  const sizes = clusters.map(c => c.length);
  const merged = sizes.reduce((a, b) => a + b - 1, 0);
  console.log(`  ${clusters.length} clusters covering ${sizes.reduce((a, b) => a + b, 0)} segments`);
  console.log(`  would retire ${merged}, leaving ${segments.length - merged}`);

  const detail = [];
  for (const cluster of clusters.sort((a, b) => b.length - a.length)) {
    const rep = chooseRepresentative(cluster);
    const losers = cluster.filter(s => s.id !== rep.id);
    const customName = pickCustomName(cluster);

    detail.push({
      representative: rep.id,
      customNameCarried: customName,
      losers: losers.map(s => ({
        id: s.id,
        tier: s.data_quality_tier,
        points: s.geojson?.coordinates?.length,
        ride_count: Number(s.ride_count) || 0,
      })),
    });

    if (detail.length <= 10) {
      console.log(`  keep ${rep.id} (${rep.data_quality_tier}, ${rep.geojson?.coordinates?.length} pts) + ${losers.length} merged`);
    }

    if (opts.apply) {
      const res = await mergeCluster(supabase, rep.id, losers.map(s => s.id), { dryRun: false });
      if (res.errors.length) console.error(`    errors: ${res.errors.join('; ')}`);

      // A rider's own name for the road outlives whichever geometry won.
      if (customName && customName !== rep.custom_name) {
        await supabase.from('training_segments')
          .update({ custom_name: customName }).eq('id', rep.id);
      }
    }
  }

  if (clusters.length > 10) console.log(`  ... and ${clusters.length - 10} more clusters`);
  report.dedupe = { clusters: clusters.length, wouldRetire: merged, detail };
}

async function phaseCoverage(userId, opts, report) {
  console.log(`\n[coverage] scanning activities (limit ${opts.limit})`);

  const summary = await analyzeCoverageForUser(userId, {
    supabase,
    limit: opts.limit,
    since: opts.since,
    force: true,
    dryRun: !opts.apply,
    coverage: { toleranceMeters: opts.tolerance, minCoverage: opts.minCoverage },
    onProgress: (s) => {
      if (opts.verbose) console.log(`    ${s.activitiesScanned} scanned, ${s.traversals} traversals`);
    },
  });

  console.log(`  ${summary.activitiesScanned} activities scanned`);
  console.log(`  ${summary.activitiesMatched} matched at least one segment`);
  console.log(`  ${summary.traversals} traversals ${opts.apply ? 'written' : 'would be written'}`);
  console.log(`  ${summary.touchedSegmentIds.size} distinct segments touched`);
  if (summary.errors.length) {
    console.error(`  ${summary.errors.length} errors, first few:`);
    for (const e of summary.errors.slice(0, 5)) console.error(`    ${e}`);
  }

  report.coverage = {
    activitiesScanned: summary.activitiesScanned,
    activitiesMatched: summary.activitiesMatched,
    traversals: summary.traversals,
    segmentsTouched: summary.touchedSegmentIds.size,
    errors: summary.errors.slice(0, 50),
  };

  return summary.touchedSegmentIds;
}

async function phaseRollup(userId, opts, report, segmentIds = null) {
  const ids = segmentIds && segmentIds.size
    ? [...segmentIds]
    : (await loadSegments(userId)).map(s => s.id);

  console.log(`\n[rollup] recomputing ${ids.length} segments`);
  if (!opts.apply) {
    report.rollup = { wouldRecompute: ids.length };
    return;
  }

  let ok = 0;
  const errors = [];
  for (const id of ids) {
    const { error: e1 } = await supabase.rpc('recompute_training_segment_rollup', { p_segment_id: id });
    const { error: e2 } = await supabase.rpc('recompute_training_segment_profile', { p_segment_id: id });
    if (e1 || e2) errors.push(`${id}: ${(e1 || e2).message}`);
    else ok++;
  }

  console.log(`  ${ok} recomputed, ${errors.length} failed`);
  report.rollup = { recomputed: ok, errors: errors.slice(0, 50) };
}

/**
 * Include the durations migration 110 discarded in the report.
 *
 * The migration takes this backup itself. It has to: this script cannot run
 * until the migration has added the columns it reads, so by the time it could
 * snapshot anything the values are already gone. Reading the backup here just
 * puts them in the report alongside everything else.
 */
async function includeDiscardedDurations(userId, report) {
  const { data, error } = await supabase
    .from('training_segment_rides_duration_backup')
    .select('ride_id, segment_id, activity_id, duration_seconds, avg_speed')
    .eq('user_id', userId);

  if (error) {
    // Absent table means the migration has not run yet, which is worth
    // knowing but is not this phase's problem to solve.
    console.warn(`  discarded-duration backup unavailable: ${error.message}`);
    return;
  }

  report.discardedDurations = data || [];
  console.log(`  ${report.discardedDurations.length} fabricated durations discarded by migration 110 (recorded in report)`);
}

// ============================================================================
// MAIN
// ============================================================================

async function processUser(userId, opts) {
  const report = { userId, phase: opts.phase, apply: opts.apply, generatedAt: new Date().toISOString() };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`User ${userId}   ${opts.apply ? 'APPLY' : 'DRY RUN — nothing will be written'}`);
  console.log('='.repeat(70));

  report.before = { rideCountHistogram: await rideCountHistogram(userId) };
  console.log(`\nride_count before:  ${fmtHistogram(report.before.rideCountHistogram)}`);

  if (opts.report) await includeDiscardedDurations(userId, report);

  const run = (p) => opts.phase === 'all' || opts.phase === p;
  let touched = null;

  if (run('retire')) await phaseRetire(userId, opts, report);
  if (run('dedupe')) await phaseDedupe(userId, opts, report);
  if (run('coverage')) touched = await phaseCoverage(userId, opts, report);
  if (run('rollup')) await phaseRollup(userId, opts, report, touched);

  report.after = { rideCountHistogram: await rideCountHistogram(userId) };
  console.log(`\nride_count after:   ${fmtHistogram(report.after.rideCountHistogram)}`);
  if (!opts.apply) console.log('(unchanged — this was a dry run; re-run with --apply)');

  return report;
}

async function main() {
  const opts = parseArgs();

  const validPhases = ['all', 'retire', 'dedupe', 'coverage', 'rollup'];
  if (!validPhases.includes(opts.phase)) {
    console.error(`--phase must be one of: ${validPhases.join(', ')}`);
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY are required.');
    process.exit(1);
  }
  supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);

  let userIds = [opts.userId];
  if (opts.allUsers) {
    const { data, error } = await supabase.from('training_segments').select('user_id');
    if (error) throw new Error(`list users: ${error.message}`);
    userIds = [...new Set((data || []).map(r => r.user_id))];
    console.log(`Found ${userIds.length} users with segments`);
  }

  console.log(`Traversal analysis version ${TRAVERSAL_ANALYSIS_VERSION}`);
  console.log(`Coverage threshold ${opts.minCoverage}, tolerance ${opts.tolerance}m`);

  const reports = [];
  for (const userId of userIds) {
    try {
      reports.push(await processUser(userId, opts));
    } catch (err) {
      console.error(`\nUser ${userId} failed: ${err.message}`);
      reports.push({ userId, error: err.message });
    }
  }

  if (opts.report) {
    fs.writeFileSync(opts.report, JSON.stringify(reports, null, 2));
    console.log(`\nReport written to ${opts.report}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
