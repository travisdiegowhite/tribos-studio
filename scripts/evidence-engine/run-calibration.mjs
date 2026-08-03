// Runs the evidence engine week-by-week across the athlete's cleaned history
// and prints the calibration timeline + stability/coverage metrics.
import { readFileSync, writeFileSync } from 'node:fs';
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

// Model series: week -> TFI/FS at week end (Sunday; last available day <= end)
const byDate = new Map(daily.map((r) => [r.date, r]));
function modelAt(weekStart) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  for (let back = 0; back < 14; back++) {
    const d = new Date(start.getTime() + (6 - back) * 86400000).toISOString().slice(0, 10);
    if (byDate.has(d)) return { tfi: Math.round(Number(byDate.get(d).tfi)), fs: Math.round(Number(byDate.get(d).form_score)) };
  }
  return null;
}

// Week grid: Mondays 2024-08-05 .. 2026-07-27
const weeks = [];
for (let t = Date.parse('2024-08-05T00:00:00Z'); t <= Date.parse('2026-07-27T00:00:00Z'); t += 7 * 86400000) {
  weeks.push(new Date(t).toISOString().slice(0, 10));
}
const model = new Map(weeks.map((w) => [w, modelAt(w)]).filter(([, m]) => m));

const cfg = DEFAULT_CONFIG;
const dailyTfi = new Map(daily.map((r) => [r.date, r.tfi]));
const dataset = { rides, segments, model, dailyTfi };
const timeline = [];
let prev = null;
for (const w of weeks) {
  const v = computeWeekVerdict(dataset, w, cfg, prev);
  timeline.push(v);
  if (v.verdict !== 'insufficient_data') prev = v.verdict;
}

writeFileSync(`${DIR}/verdict_timeline.json`, JSON.stringify(timeline, null, 1));

// ── Timeline table ─────────────────────────────────────────────────────
const sym = { ahead: 'A', consistent: '=', behind: 'B', insufficient_data: '·' };
console.log('week        v raw score conf | TFI  FS  div | pd(mv%)  ef(d%)   seg');
for (const v of timeline) {
  const m = v.model_divergence;
  const pd = v.signals.power_duration;
  const ef = v.signals.efficiency_factor;
  const sg = v.signals.segments;
  console.log(
    `${v.week}  ${sym[v.verdict]} ${sym[v.verdictRaw]}  ${String(v.score ?? '').padStart(5)} ${String(v.confidence).padStart(4)} |` +
    ` ${String(m?.tfi ?? '?').padStart(3)} ${String(m?.fs ?? '?').padStart(4)} ${m?.disagrees ? '⚡' : ' '} |` +
    ` ${pd.qualified ? String(pd.movementPct).padStart(6) : '   ---'}` +
    ` ${ef.qualified ? String(ef.deltaPct).padStart(6) : '   ---'}` +
    `  ${sg.qualified ? sg.score : '-'}`
  );
}

// ── Stability ──────────────────────────────────────────────────────────
let flips = 0, adjFlips = 0;
const emitted = timeline.filter((v) => v.verdict !== 'insufficient_data');
for (let i = 1; i < emitted.length; i++) {
  const a = emitted[i - 1].verdict, b = emitted[i].verdict;
  if ((a === 'ahead' && b === 'behind') || (a === 'behind' && b === 'ahead')) {
    flips++;
    const wa = weeks.indexOf(emitted[i - 1].week), wb = weeks.indexOf(emitted[i].week);
    if (wb - wa === 1) adjFlips++;
  }
}
const counts = {};
for (const v of timeline) counts[v.verdict] = (counts[v.verdict] || 0) + 1;
console.log('\nverdict counts:', JSON.stringify(counts));
console.log(`ahead<->behind transitions: ${flips} (adjacent-week: ${adjFlips})`);

// ── Coverage ───────────────────────────────────────────────────────────
const cov = { pd: 0, ef: 0, seg: 0 };
const insufReasons = {};
for (const v of timeline) {
  if (v.signals.power_duration.qualified) cov.pd++;
  if (v.signals.efficiency_factor.qualified) cov.ef++;
  if (v.signals.segments.qualified) cov.seg++;
  if (v.verdict === 'insufficient_data') {
    const key = `pd:[${v.signals.power_duration.reason}] ef:[${v.signals.efficiency_factor.reason}]`;
    insufReasons[key] = (insufReasons[key] || 0) + 1;
  }
}
const n = timeline.length;
console.log(`coverage over ${n} weeks: PD ${cov.pd} (${Math.round(cov.pd / n * 100)}%), EF ${cov.ef} (${Math.round(cov.ef / n * 100)}%), SEG ${cov.seg} (${Math.round(cov.seg / n * 100)}%)`);

// ── Ground truths ──────────────────────────────────────────────────────
const in2025build = timeline.filter((v) => v.week >= '2025-01-06' && v.week <= '2025-06-30' && v.verdict !== 'insufficient_data');
const behindIn2025 = in2025build.filter((v) => v.verdict === 'behind');
console.log(`\nGT(a) 2025 build weeks emitted: ${in2025build.length}, behind: ${behindIn2025.length} ${behindIn2025.length === 0 ? 'PASS' : 'FAIL → ' + behindIn2025.map((v) => v.week).join(',')}`);
const founding = timeline.find((v) => v.week === '2026-07-27');
console.log(`GT(b) founding week 2026-07-27: verdict=${founding.verdict} conf=${founding.confidence} score=${founding.score} divergence=${JSON.stringify(founding.model_divergence)}`);
console.log('facts:');
for (const f of founding.narrative_facts) console.log('  -', f);
