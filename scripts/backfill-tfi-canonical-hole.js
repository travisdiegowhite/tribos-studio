#!/usr/bin/env node

/**
 * Backfill training_load_daily for the Apr 27 – May 9 Garmin canonical hole.
 *
 * Why: between commits 95eb804 (Apr 27 rollback of Garmin canonical dual-
 * writes) and dc43a5c (May 9 re-add), Garmin webhook ingest populated
 * `activities.tss` but left `activities.rss` NULL. The server-side TFI
 * estimator (`estimateTSSWithSource` in `api/utils/fitnessSnapshots.js`)
 * read only `activity.rss`, so Garmin rides in that window fell through
 * Tier 1 → Tier 4 (kJ + terrain multiplier) or Tier 5 (heuristic), which
 * INFLATED their daily RSS via the terrain multiplier and propagated bad
 * tfi/afi/form_score forward via the EWA chain.
 *
 * The reader is now fixed (commit pending in this PR) to use
 * `activity.rss ?? activity.tss`. This script re-runs the daily writer
 * for affected users from the start of the window through today so the
 * stored series matches what the corrected reader would emit.
 *
 * Scope (per decision memo §5.3): only users with at least one Garmin
 * webhook activity in the affected window.
 *
 * Usage:
 *   node scripts/backfill-tfi-canonical-hole.js [options]
 *
 * Options:
 *   --user-id <id>   Process only one user
 *   --dry-run        Report intended writes without persisting
 *   --window-start <YYYY-MM-DD>   Override start (default 2026-04-27)
 *   --through <YYYY-MM-DD>         Override end (default today)
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { estimateTSSWithSource } from '../api/utils/fitnessSnapshots.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const DEFAULT_WINDOW_START = '2026-04-27';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    userId: null,
    dryRun: false,
    windowStart: DEFAULT_WINDOW_START,
    through: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id') opts.userId = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--window-start') opts.windowStart = args[++i];
    else if (args[i] === '--through') opts.through = args[++i];
  }
  return opts;
}

function isoDateAdd(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function findAffectedUsers(windowStart, windowEnd) {
  // A user is affected if they have at least one Garmin activity in the
  // window with rss NULL but tss > 0 — the exact rows the canonical-only
  // Tier-1 reader would have mis-classified.
  const { data, error } = await supabase
    .from('activities')
    .select('user_id')
    .eq('source', 'garmin')
    .gte('start_date', `${windowStart}T00:00:00Z`)
    .lte('start_date', `${windowEnd}T23:59:59Z`)
    .is('rss', null)
    .gt('tss', 0)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.user_id)));
}

async function fetchUserContext(userId) {
  const [prefsRes, profileRes] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('ftp')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_profiles')
      .select('tfi_tau, afi_tau')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  return {
    ftp: prefsRes.data?.ftp ?? null,
    tfiTau: profileRes.data?.tfi_tau ?? 42,
    afiTau: profileRes.data?.afi_tau ?? 7,
  };
}

async function fetchPriorRow(userId, windowStart) {
  const { data } = await supabase
    .from('training_load_daily')
    .select('date, tfi, afi')
    .eq('user_id', userId)
    .lt('date', windowStart)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function fetchActivitiesForUser(userId, windowStart, windowEnd) {
  const { data, error } = await supabase
    .from('activities')
    .select(
      'id, type, sport_type, start_date, moving_time, distance, ' +
      'total_elevation_gain, average_watts, average_heartrate, kilojoules, ' +
      'rss, tss, effective_power, normalized_power, ' +
      'average_gradient_percent, percent_above_6_percent, ' +
      'is_hidden, duplicate_of'
    )
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
    .gte('start_date', `${windowStart}T00:00:00Z`)
    .lte('start_date', `${windowEnd}T23:59:59Z`)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function rebuildUser(userId, opts) {
  const { windowStart, through, dryRun } = opts;
  const ctx = await fetchUserContext(userId);

  const prior = await fetchPriorRow(userId, windowStart);
  let tfi = prior?.tfi ?? 0;
  let afi = prior?.afi ?? 0;

  const activities = await fetchActivitiesForUser(userId, windowStart, through);
  const byDate = new Map();
  for (const a of activities) {
    const date = a.start_date.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(a);
  }

  const writes = [];
  for (let day = windowStart; day <= through; day = isoDateAdd(day, 1)) {
    const dayActs = byDate.get(day) ?? [];
    let dailyRSS = 0;
    let dominantSource = null;
    let dominantConfidence = 0;
    let dominantTerrain = null;

    for (const a of dayActs) {
      const est = estimateTSSWithSource(a, ctx.ftp);
      const rss = Math.min(est.tss, 500);
      dailyRSS += rss;
      // Track the highest-confidence tier as the day's representative source.
      if (est.confidence > dominantConfidence) {
        dominantConfidence = est.confidence;
        dominantSource = est.source;
        dominantTerrain = est.terrain_class ?? null;
      }
    }

    const tfiYesterday = tfi;
    const afiYesterday = afi;
    tfi = tfi + (dailyRSS - tfi) / ctx.tfiTau;
    afi = afi + (dailyRSS - afi) / ctx.afiTau;
    const formScore = Math.round((tfiYesterday - afiYesterday) * 100) / 100;

    // Only upsert days that either had activities or already have a row.
    // (Empty days inside the window would get a zero-RSS row otherwise,
    // which pollutes the series.)
    const hasActivity = dayActs.length > 0;
    let hadExistingRow = false;
    if (!hasActivity) {
      const { data: existing } = await supabase
        .from('training_load_daily')
        .select('date')
        .eq('user_id', userId)
        .eq('date', day)
        .maybeSingle();
      hadExistingRow = !!existing;
    }

    if (!hasActivity && !hadExistingRow) continue;

    writes.push({
      user_id: userId,
      date: day,
      rss: Math.round(dailyRSS * 100) / 100,
      tfi: Math.round(tfi * 100) / 100,
      afi: Math.round(afi * 100) / 100,
      form_score: formScore,
      rss_source: dominantSource ?? 'inferred',
      confidence: dominantConfidence || 0.4,
      terrain_class: dominantTerrain,
      tfi_tau: ctx.tfiTau,
      afi_tau: ctx.afiTau,
    });
  }

  if (dryRun) {
    return { userId, rowsToWrite: writes.length, sample: writes.slice(0, 3) };
  }

  if (writes.length === 0) {
    return { userId, rowsWritten: 0 };
  }

  // Chunk to avoid request-size limits.
  const CHUNK = 50;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const slice = writes.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('training_load_daily')
      .upsert(slice, { onConflict: 'user_id,date' });
    if (error) throw error;
  }

  return { userId, rowsWritten: writes.length };
}

async function main() {
  const opts = parseArgs();
  console.log(
    `[backfill-tfi] window=${opts.windowStart}..${opts.through} dryRun=${opts.dryRun}`
  );

  let userIds;
  if (opts.userId) {
    userIds = [opts.userId];
  } else {
    userIds = await findAffectedUsers(opts.windowStart, '2026-05-09');
    console.log(`[backfill-tfi] ${userIds.length} affected user(s) identified`);
  }

  const results = [];
  for (const userId of userIds) {
    try {
      const r = await rebuildUser(userId, opts);
      console.log(`[backfill-tfi] ${userId}: ${JSON.stringify(r)}`);
      results.push(r);
    } catch (err) {
      console.error(`[backfill-tfi] ${userId} failed:`, err.message);
      results.push({ userId, error: err.message });
    }
  }

  const ok = results.filter((r) => !r.error).length;
  const failed = results.length - ok;
  console.log(`[backfill-tfi] done. ok=${ok} failed=${failed}`);
}

main().catch((err) => {
  console.error('[backfill-tfi] fatal:', err);
  process.exit(1);
});
