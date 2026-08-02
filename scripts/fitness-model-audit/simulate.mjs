// TFI/AFI/FormScore simulation under three RSS input regimes.
// Series produced by scratch/sql/daily_rss_series.sql (per-activity cap 500
// already applied). Walk replicates api/utils/trainingLoadRecompute.js:
//   tfi += (rss - tfi)/49 ; afi += (rss - afi)/8.9 ; FS = prevTfi - prevAfi
// Cold start 2024-08-01 (tau 49 => fully converged well before 2026).
import { writeFileSync } from 'node:fs';
import { SERIES } from './series.mjs';

const TFI_TAU = 49, AFI_TAU = 8.9;
const byDay = new Map(SERIES.map(([d, cur, cln, hrx]) => [d, { cur, cln, hrx }]));

const start = new Date('2024-08-01T00:00:00Z');
const end = new Date('2026-08-01T00:00:00Z');
const fmt = (dt) => dt.toISOString().slice(0, 10);

const out = [];
const s = { cur: { tfi: 0, afi: 0 }, cln: { tfi: 0, afi: 0 }, hrx: { tfi: 0, afi: 0 } };
for (let dt = new Date(start); dt <= end; dt.setUTCDate(dt.getUTCDate() + 1)) {
  const d = fmt(dt);
  const rss = byDay.get(d) ?? { cur: 0, cln: 0, hrx: 0 };
  const row = { d };
  for (const k of ['cur', 'cln', 'hrx']) {
    const prevTfi = s[k].tfi, prevAfi = s[k].afi;
    s[k].tfi += (rss[k] - s[k].tfi) / TFI_TAU;
    s[k].afi += (rss[k] - s[k].afi) / AFI_TAU;
    row[k] = {
      rss: rss[k],
      tfi: +s[k].tfi.toFixed(2),
      afi: +s[k].afi.toFixed(2),
      fs: +(prevTfi - prevAfi).toFixed(2),
    };
  }
  out.push(row);
}

writeFileSync(new URL('./sim_output.json', import.meta.url), JSON.stringify(out));

// Console summary
const last = out[out.length - 1];
const at = (d) => out.find((r) => r.d === d);
console.log('=== Final (2026-08-01) ===');
for (const k of ['cur', 'cln', 'hrx'])
  console.log(`${k}: TFI ${last[k].tfi}  AFI ${last[k].afi}  FS ${last[k].fs}`);
console.log('\n=== Dashboard reference (server row 2026-07-30): TFI 74.5 AFI 39.7 FS +32.6 ===');
const s730 = at('2026-07-30');
for (const k of ['cur', 'cln', 'hrx'])
  console.log(`${k} @7/30: TFI ${s730[k].tfi}  AFI ${s730[k].afi}  FS ${s730[k].fs}`);
console.log('\n=== Peak TFI per regime (2025-01-01 onward) ===');
for (const k of ['cur', 'cln', 'hrx']) {
  let peak = null;
  for (const r of out) if (r.d >= '2025-01-01' && (!peak || r[k].tfi > peak[k].tfi)) peak = r;
  console.log(`${k}: peak TFI ${peak[k].tfi} on ${peak.d}`);
}
console.log('\n=== Monthly mean TFI (2026) ===');
for (let m = 1; m <= 7; m++) {
  const mm = String(m).padStart(2, '0');
  const rows = out.filter((r) => r.d.startsWith(`2026-${mm}`));
  const mean = (k) => (rows.reduce((a, r) => a + r[k].tfi, 0) / rows.length).toFixed(1);
  console.log(`2026-${mm}: cur ${mean('cur')}  cln ${mean('cln')}  hrx ${mean('hrx')}`);
}
