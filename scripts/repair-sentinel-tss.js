#!/usr/bin/env node

/**
 * Repair activities whose tss/rss carry the Garmin FIT "no data" sentinel.
 *
 * Why: the FIT protocol encodes training_stress_score as uint16 scaled ×10;
 * the 0xFFFF invalid sentinel decodes to 6553.5 and was written verbatim
 * into activities.tss AND activities.rss by the Garmin import paths (now
 * guarded via api/utils/stressScoreSanitizer.js). Every corrupted activity
 * counted as a 500-stress monster day (both fitness engines cap per-activity
 * stress at 500), inflating historical CTL/TFI to implausible levels.
 *
 * The repair NULLs both columns (dual-write rule: both or neither) so the
 * tiered estimators fall back to HR/power/duration and produce sane values.
 *
 * A JSON backup of every touched row's prior {id, tss, rss} is written to
 * scripts/backups/ before any update; --restore re-applies it.
 *
 * Usage:
 *   node scripts/repair-sentinel-tss.js [options]
 *
 * Options:
 *   --dry-run          Report what would change without writing
 *   --user-id <id>     Process only one user
 *   --limit <n>        Cap rows repaired this run (default: unlimited)
 *   --threshold <n>    Sentinel threshold (default 1000 — engines cap at
 *                      500, so no legitimate displayed value can exceed it)
 *   --restore <file>   Rollback mode: re-apply tss/rss from a backup JSON
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional: honor a .env file when dotenv is available, but don't require it.
try {
  (await import('dotenv')).config();
} catch {
  // dotenv not installed — env vars must be provided directly.
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing required environment: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PAGE_SIZE = 1000;
const UPDATE_CHUNK = 100;
const BACKUP_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'backups',
);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    userId: null,
    dryRun: false,
    limit: Infinity,
    threshold: 1000,
    restore: null,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--user-id':
        opts.userId = args[++i];
        break;
      case '--limit':
        opts.limit = Number(args[++i]);
        break;
      case '--threshold':
        opts.threshold = Number(args[++i]);
        break;
      case '--restore':
        opts.restore = args[++i];
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  return opts;
}

async function fetchSentinelRows(opts) {
  const rows = [];
  for (let page = 0; ; page++) {
    let query = supabase
      .from('activities')
      .select('id, user_id, start_date, tss, rss, moving_time, provider')
      .or(`tss.gte.${opts.threshold},rss.gte.${opts.threshold}`)
      .order('start_date', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (opts.userId) query = query.eq('user_id', opts.userId);

    const { data, error } = await query;
    if (error) throw new Error(`select failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.slice(0, opts.limit === Infinity ? undefined : opts.limit);
}

async function repair(opts) {
  const rows = await fetchSentinelRows(opts);
  if (rows.length === 0) {
    console.log('No sentinel rows found — nothing to repair.');
    return;
  }

  // Summary
  const byUser = new Map();
  const values = new Set();
  for (const r of rows) {
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
    values.add(Number(r.tss ?? r.rss));
  }
  console.log(`Found ${rows.length} sentinel rows across ${byUser.size} user(s).`);
  console.log(`Distinct values: ${[...values].sort((a, b) => a - b).join(', ')}`);
  for (const [userId, count] of byUser) console.log(`  ${userId}: ${count}`);

  if (opts.dryRun) {
    console.log('\nDry run — no changes written.');
    return;
  }

  // Backup before writing.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(
    BACKUP_DIR,
    `sentinel-tss-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    backupFile,
    JSON.stringify(rows.map(({ id, tss, rss }) => ({ id, tss, rss })), null, 2),
  );
  console.log(`\nBackup written: ${backupFile}`);

  let repaired = 0;
  for (let i = 0; i < rows.length; i += UPDATE_CHUNK) {
    const chunk = rows.slice(i, i + UPDATE_CHUNK);
    const { error } = await supabase
      .from('activities')
      .update({ tss: null, rss: null })
      .in('id', chunk.map((r) => r.id));
    if (error) throw new Error(`update failed at chunk ${i}: ${error.message}`);
    repaired += chunk.length;
    console.log(`  repaired ${repaired}/${rows.length}`);
  }
  console.log(`\nDone. ${repaired} rows repaired (tss=null, rss=null).`);
  console.log(`Rollback: node scripts/repair-sentinel-tss.js --restore ${backupFile}`);
}

async function restore(file, opts) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Restoring ${rows.length} rows from ${file}`);
  if (opts.dryRun) {
    console.log('Dry run — no changes written.');
    return;
  }
  let restored = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from('activities')
      .update({ tss: row.tss, rss: row.rss })
      .eq('id', row.id);
    if (error) throw new Error(`restore failed for ${row.id}: ${error.message}`);
    restored++;
    if (restored % 50 === 0) console.log(`  restored ${restored}/${rows.length}`);
  }
  console.log(`Done. ${restored} rows restored.`);
}

const opts = parseArgs();
try {
  if (opts.restore) {
    await restore(opts.restore, opts);
  } else {
    await repair(opts);
  }
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
