#!/usr/bin/env node
/**
 * Race search samples (Phase 6 gate): five real web searches through the same
 * module api/race-search.js uses, printing each candidate with its source.
 *
 *   ANTHROPIC_API_KEY=… node scripts/race-search-samples.mjs ["Race name" ["near"]]
 *
 * With no arguments it runs the five gate searches. Each web search costs
 * about $0.01 per web query plus tokens (up to 5 queries per search).
 */
import Anthropic from '@anthropic-ai/sdk';
import { webSearchRaces } from '../api/utils/raceSearch.js';

const SAMPLES = [
  { query: 'Unbound Gravel' },
  { query: 'Boulder Roubaix' },
  { query: 'Steamboat Gravel' },
  { query: 'Bolder Boulder 10K' },
  { query: 'Gravel race', near: 'Salida, Colorado' },
];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY to run real searches.');
  process.exit(1);
}

const args = process.argv.slice(2);
const runs = args.length > 0 ? [{ query: args[0], near: args[1] ?? null }] : SAMPLES;
const today = new Date().toISOString().slice(0, 10);
const client = new Anthropic();

for (const [i, s] of runs.entries()) {
  const started = Date.now();
  console.log(`━━━ ${i + 1}. "${s.query}"${s.near ? ` near ${s.near}` : ''} ━━━`);
  try {
    const { candidates, message } = await webSearchRaces(client, { query: s.query, near: s.near ?? null, today });
    for (const c of candidates) {
      const facts = [c.race_date, c.date_status === 'announced' ? 'announced' : 'ESTIMATED', c.location, c.race_type, c.distance_km && `${c.distance_km} km`, c.elevation_gain_m && `${c.elevation_gain_m} m`]
        .filter(Boolean)
        .join(' · ');
      console.log(`  • ${c.name}\n    ${facts}\n    ${c.url}${c.note ? `\n    note: ${c.note}` : ''}`);
    }
    if (message) console.log(`  (${message})`);
  } catch (err) {
    console.log(`  ERROR ${err?.status ?? ''} ${err?.message ?? err}`);
  }
  console.log(`  ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
}
