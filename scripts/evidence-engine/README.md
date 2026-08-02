# Performance Evidence Engine — Phase 1 prototype

Offline, read-only prototype of the weekly performance-evidence verdict.
Calibration results and the full design rationale live in
`docs/EVIDENCE_ENGINE_CALIBRATION.md`. **Phase 2 (production table, job, coach
integration) is not approved yet — nothing here runs in production.**

## Files

- `evidence-engine.mjs` — the engine: three signals (power-duration movement,
  efficiency-factor trend, repeat segments), residual-vs-model verdict,
  confidence formula, coach-ready narrative facts. Pure functions over plain
  data; `computeWeekVerdict()` is designed to lift into a Phase 2 job as-is.
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
