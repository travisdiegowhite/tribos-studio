// One-at-a-time threshold sensitivity: perturb each key threshold from the
// default config and report ground-truth outcomes + stability metrics.
import { readFileSync } from 'node:fs';
import { computeWeekVerdict, DEFAULT_CONFIG } from '../../api/utils/evidenceEngine.js';

// Data dir holds the read-only exports described in export-queries.sql:
//   evidence_rides.json, evidence_segments.json, recomputed_daily.json
const DIR = process.argv[2] || process.env.EVIDENCE_DATA_DIR;
if (!DIR) {
  console.error('usage: node ' + process.argv[1].split('/').pop() + ' <data-dir>   (see export-queries.sql)');
  process.exit(1);
}
const rides = JSON.parse(readFileSync(`${DIR}/evidence_rides.json`, 'utf8'));
const segments = JSON.parse(readFileSync(`${DIR}/evidence_segments.json`, 'utf8'));
const daily = JSON.parse(readFileSync(`${DIR}/recomputed_daily.json`, 'utf8'));

const byDate = new Map(daily.map((r) => [r.date, r]));
function modelAt(weekStart) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  for (let back = 0; back < 14; back++) {
    const d = new Date(start.getTime() + (6 - back) * 86400000).toISOString().slice(0, 10);
    if (byDate.has(d)) return { tfi: Math.round(Number(byDate.get(d).tfi)), fs: Math.round(Number(byDate.get(d).form_score)) };
  }
  return null;
}
const weeks = [];
for (let t = Date.parse('2024-08-05T00:00:00Z'); t <= Date.parse('2026-07-27T00:00:00Z'); t += 7 * 86400000) {
  weeks.push(new Date(t).toISOString().slice(0, 10));
}
const model = new Map(weeks.map((w) => [w, modelAt(w)]).filter(([, m]) => m));
const dailyTfi = new Map(daily.map((r) => [r.date, r.tfi]));
const dataset = { rides, segments, model, dailyTfi };

function runVariant(cfg) {
  const tl = [];
  let prev = null;
  for (const w of weeks) {
    const v = computeWeekVerdict(dataset, w, cfg, prev);
    tl.push(v);
    if (v.verdict !== 'insufficient_data') prev = v.verdict;
  }
  const emitted = tl.filter((v) => v.verdict !== 'insufficient_data');
  let flips = 0, rawAdj = 0;
  for (let i = 1; i < emitted.length; i++) {
    const a = emitted[i - 1], b = emitted[i];
    if ((a.verdict === 'ahead' && b.verdict === 'behind') || (a.verdict === 'behind' && b.verdict === 'ahead')) flips++;
    if ((a.verdictRaw === 'ahead' && b.verdictRaw === 'behind') || (a.verdictRaw === 'behind' && b.verdictRaw === 'ahead')) rawAdj++;
  }
  const build = tl.filter((v) => v.week >= '2025-01-06' && v.week <= '2025-06-30' && v.verdict !== 'insufficient_data');
  const gtA = build.length >= 5 && build.every((v) => v.verdict !== 'behind');
  const founding = tl.find((v) => v.week === '2026-07-27');
  const counts = {};
  for (const v of tl) counts[v.verdict] = (counts[v.verdict] || 0) + 1;
  return { gtA, gtB: founding.verdict, gtBconf: founding.confidence, flips, rawAdj, counts };
}

const clone = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const variants = [['DEFAULT', clone()]];
for (const v of [-0.04, -0.05, -0.07, -0.08]) { const c = clone(); c.pd.behindPct = v; variants.push([`pd.behindPct=${v}`, c]); }
for (const v of [0.88, 0.92, 0.95]) { const c = clone(); c.pd.attemptRatio = v; variants.push([`pd.attemptRatio=${v}`, c]); }
for (const v of [0.015, 0.03]) { const c = clone(); c.pd.aheadPct = v; variants.push([`pd.aheadPct=${v}`, c]); }
for (const v of [0.015, 0.03]) { const c = clone(); c.ef.aheadPct = v; variants.push([`ef.aheadPct=${v}`, c]); }
for (const v of [-0.02, -0.04]) { const c = clone(); c.ef.behindPct = v; variants.push([`ef.behindPct=${v}`, c]); }
for (const v of [1.08, 1.15, 1.2]) { const c = clone(); c.ef.viMax = v; variants.push([`ef.viMax=${v}`, c]); }
for (const v of [0.3, 0.5]) { const c = clone(); c.aheadScore = v; c.behindScore = -v; variants.push([`score band=±${v}`, c]); }
for (const v of [-8, -15]) { const c = clone(); c.model.fatiguedFs = v; variants.push([`fatiguedFs=${v}`, c]); }
for (const v of [28, 42]) { const c = clone(); c.ef.windowDays = v; variants.push([`ef.windowDays=${v}`, c]); }

console.log('variant                 GT-a  GT-b(conf)        flips rawAdj  A/=/B/·');
for (const [name, cfg] of variants) {
  const r = runVariant(cfg);
  console.log(
    `${name.padEnd(24)}${r.gtA ? 'PASS' : 'FAIL'}  ${(r.gtB + ' (' + r.gtBconf + ')').padEnd(18)}${String(r.flips).padStart(3)} ${String(r.rawAdj).padStart(5)}   ` +
    `${r.counts.ahead ?? 0}/${r.counts.consistent ?? 0}/${r.counts.behind ?? 0}/${r.counts.insufficient_data ?? 0}`
  );
}
