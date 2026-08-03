# Performance Evidence Engine — calibration harness

Offline calibration harness for the weekly performance-evidence verdict.
Calibration results and the full design rationale live in
`docs/EVIDENCE_ENGINE_CALIBRATION.md`. The production pieces are
`api/utils/evidenceEngine.js` (engine core), `api/evidence-weekly.js` (weekly
job), and `api/utils/evidenceCoachSection.js` (coach prompt section).

## Files

- The engine core lives at **`api/utils/evidenceEngine.js`** (moved there in
  Phase 2 — the weekly job and these calibration scripts import the same
  module, so calibration always exercises exactly the shipped math).
- `run-calibration.mjs` — runs the engine week-by-week (Mondays, aligned with
  `fitness_snapshots` weeks) across the full cleaned history, prints the
  verdict timeline, stability metrics, coverage, and the two ground-truth
  checks. Writes `verdict_timeline.json` into the data dir.
- `sensitivity-sweep.mjs` — one-at-a-time threshold perturbations; prints
  ground-truth outcomes and stability per variant.
- `export-queries.sql` — the exact read-only SQL that produces the three JSON
  inputs. All activity reads apply the cleaned-input contract
  (`duplicate_of IS NULL`, non-hidden).

## Reproducing

1. Run the three queries in `export-queries.sql` (read-only) and save the
   `json_agg` payloads as `evidence_rides.json`, `evidence_segments.json`,
   `recomputed_daily.json` in a local directory. Do not commit these files —
   they are athlete data.
2. `node run-calibration.mjs <data-dir>`
3. `node sensitivity-sweep.mjs <data-dir>`
