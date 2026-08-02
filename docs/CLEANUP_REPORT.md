# Fitness Model Cleanup — Execution Report

**Date:** 2026-08-02
**Scope:** Production data cleanup for `user_id e17a000f-0662-464c-bddf-d44ced141fa1`
(single-athlete dataset), executing the remediation plan scoped in
`docs/FITNESS_MODEL_FINDINGS.md` §5.
**Companion code change:** read-side sentinel guard in
`api/utils/fitnessSnapshots.js` (commit `159c8a3`).

## Executive summary

All four remediation steps ran to completion. The stored fitness history now
matches what the production math produces from clean inputs:

| Metric | Before cleanup | After recompute |
|---|---|---|
| Peak TFI (all history) | **1,096** (week 2026-05-18) | **99** (week 2025-01-20) |
| Current-week TFI / AFI / FormScore | 254 / 60 / **+194** | **41 / 60 / −19** |
| Weekly RSS, week 2026-05-11 | 33,152 | 407 |
| `fitness_snapshots` weeks materially changed | — | 90 of 97 |
| `training_load_daily` rows needing correction | — | **0** (verified clean) |

The dashboard no longer tells the athlete they hold a monster fitness base with
+194 form; the corrected series shows a moderate, steadily built base (TFI ≈ 40)
carrying a normal mid-block fatigue load (FormScore ≈ −19). This agrees with the
physiological evidence in the findings doc (§4: power-duration curve, EF trend,
segment history).

---

## Step 0 — Backups

Full row-level backups were taken before any mutation, into plain tables
(no FK dependents, excluded from all application code paths):

| Backup table | Rows | Contents |
|---|---|---|
| `_cleanup_20260801_activities` | 291 | Every activity row touched by Steps 1–2 (pre-mutation state) |
| `_cleanup_20260801_fitness_snapshots` | 97 | Complete `fitness_snapshots` history (pre-recompute) |
| `_cleanup_20260801_training_load_daily` | 203 | Daily rows in scope at backup time |

Rollback is a straight `UPDATE … FROM` join on `id` (activities) or upsert on
`(user_id, snapshot_week)` / `(user_id, date)` for the metric tables. Keep the
backup tables under the same "wait and watch" policy as legacy columns — drop
only with explicit approval once the corrected numbers have soaked.

## Step 1 — Duplicate flagging (26 rows)

The duplicate-import pairs identified in the findings (same Garmin ride imported
twice via different paths) were reviewed pair-by-pair in a staging review table,
then the losing twin of each confirmed pair got `duplicate_of` set to its
primary. **26 activities** are now flagged; both the weekly snapshot computation
and the daily recompute already filter on `duplicate_of IS NULL`, so flagged
rows drop out of every fitness series without deleting user data.

## Step 2 — Sentinel stress scores nulled (239 rows)

The FIT "no data" sentinel (`0xFFFF` → **6553.5**) stored verbatim in
`activities.rss`/`tss` was cleared to `NULL` on **239 rows**, letting
`estimateTSSWithSource` fall through to the honest lower tiers (power → kJ →
HR → RPE → inferred) instead of trusting a fake Tier-1 device value capped at
500.

Current state (verified 2026-08-02): **zero** visible, primary activities carry
a sentinel value. 14 rows still hold `6553.5` in raw form, but every one is
excluded from computation — 11 are duplicate-flagged (Step 1) and 3 were already
hidden. Their raw values were deliberately preserved for forensics; the
read-side guard (Step 3) makes them harmless even if unhidden later.

## Step 3 — Read-side sanitizer guard (commit `159c8a3`)

`estimateTSSWithSource` now routes the Tier-1 device read through
`sanitizeStressScore`, so a sentinel (or any absurd stored stress score) can
never again enter the fitness math from the read side — regardless of import
path or historical residue. Shipped with a regression test covering the 6553.5
case. Ingest paths were already guarded (`stressScoreSanitizer.js` since
2026-05-24); this closes the read half.

## Step 4 — Full-history recompute + validation

### `fitness_snapshots` (97 weeks upserted)

Recomputed every existing snapshot week (2024-01-22 → 2026-07-27) with the
**real production function** `computeWeeklySnapshot()` from
`api/utils/fitnessSnapshots.js` — not a reimplementation — fed by the cleaned
activity set (423 activities from 2023-10-20, covering the 90-day lookback of
the earliest week) and the athlete's actual profile (FTP 270, adaptive tau
49 / 8.9). Results were upserted on `(user_id, snapshot_week)` with the same
column payload the production backfill writes, including the B9 dual-write
pairs (`ctl`/`tfi`, `atl`/`afi`, `tsb`/`form_score`, `weekly_tss`/`weekly_rss`).

Validation, all passing:

- Row count unchanged (97 before, 97 after — pure in-place refresh).
- Zero dual-write mismatches between legacy and canonical columns.
- All 97 rows show `snapshot_date` = recompute day.
- Weeks untouched by the defects reproduce their stored weekly RSS exactly
  (e.g. 2026-05-25 onward: 527→527, 432→432, 473→473), confirming the offline
  pipeline is faithful to production.
- The corrections land exactly where the findings predicted: the May 2026
  duplicate storm (TFI 960–1,096 → 37–42), the 2024 sentinel weeks
  (ATL 420 → 5), and the lone 2025-10-13 spike (TFI 601 → 25).

Largest corrections:

| Week | TFI old → new | Weekly RSS old → new | Cause |
|---|---|---|---|
| 2026-05-18 | 1,096 → 38 | 13,429 → 322 | duplicates + sentinels |
| 2026-05-11 | 960 → 37 | 33,152 → 407 | duplicates + sentinels |
| 2025-10-13 | 601 → 25 | 2,004 → 159 | sentinel |
| 2025-06-16 | 323 → 49 | 2,737 → 475 | sentinels |
| 2024-02-12 | 219 → 4 | 3,376 → 43 | sentinels |

### `training_load_daily` (verified — no write needed)

The nightly writer (`recomputeTrainingLoadForUser`) self-heals only its trailing
180-day window; rows older than ~2026-02-03 are frozen, so they were checked
explicitly. The full 731-day history (2024-08-01 → 2026-08-01) was recomputed
offline with the real `computeTrainingLoadRows()` (cold start matching the
table's original population run, America/Denver local dates, adaptive tau) and
diffed against the stored rows: **0 of 731 rows differ** — on values (rss, tfi,
afi, form_score, beyond ±0.05) or metadata (rss_source, tau). The daily table
was already consistent with clean inputs, because its per-activity 500 cap and
the post-cleanup nightly runs had absorbed the damage inside the window, and the
recomputed latest row (2026-08-01: TFI 49.07 / AFI 67.41) matches the stored row
to the hundredth.

No `plan_deviations` or coach-conversation rows were mutated.

---

## What the athlete sees now

- **TFI ≈ 41, AFI ≈ 60, FormScore ≈ −19** (week of 2026-07-27) — a moderate
  base under an active training block, replacing the fictitious
  TFI 254 / FormScore +194.
- The Long-term Fitness Progression chart now peaks at 99 (January 2025 block)
  instead of 1,096.
- Weekly/daily series agree with each other (snapshot vs daily divergence is
  now pipeline-definition differences only, not data corruption).

## Step 5 — Coach correction notice (executed 2026-08-02)

A dated `DATA CORRECTION NOTICE` block was added to the coach system prompt in
`api/coach.js`, ahead of the memory/check-in/history sections it governs. It
instructs the coach to (1) never quote or reason from fitness metric values
appearing in conversation history, prior check-ins, or memories dated before
2026-08-02, (2) explain the correction once and plainly if the athlete asks why
the numbers dropped, (3) never interpret the drop as detraining, and (4) not
bring it up proactively beyond that. `coach_memory` rows were audited first —
none contain inflated fitness values, so no data mutation was needed; the
notice covers the remaining exposure (old conversation turns and stored
check-in narratives). The block can be retired once pre-August-2026
conversation history has aged out of practical relevance.

## Follow-ups

1. **Backup retention:** drop the three `_cleanup_20260801_*` tables after the
   corrected numbers have soaked (explicit approval required, per policy).
2. The nightly `training_load_daily` recompute and activity webhooks need no
   changes — new data flows through the already-guarded write and read paths.
