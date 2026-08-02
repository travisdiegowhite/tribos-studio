# Fitness Model Audit — Findings

**Date:** 2026-08-01
**Scope:** Read-only audit of the TFI/AFI/FormScore pipeline against production data
(single-athlete dataset, `user_id e17a000f-0662-464c-bddf-d44ced141fa1`), plus an
offline re-simulation of the daily EWA walk from `api/utils/trainingLoadRecompute.js`.
**No production data or code was modified by this audit.**

## Executive summary

The displayed fitness numbers are materially inflated by two data-quality defects
in the *historical* activity data — neither is a bug in the TFI/AFI math itself:

1. **139 activities store the FIT "no data" sentinel as a real stress score.**
   Garmin FIT encodes `training_stress_score` as uint16 scaled ×10; the invalid
   marker `0xFFFF` (65535) decodes to **6553.5**, and it was written verbatim into
   `activities.tss`/`rss`. Each such row is trusted as Tier-1 `device` RSS
   (confidence 0.95) and capped to exactly **500** — a fake monster day.
2. **28 unflagged duplicate activity pairs** (same Garmin ride imported twice via
   different paths; one row keeps the raw `travisdiegowhite@gmail.com <id>` name,
   the twin is renamed). Neither row has `duplicate_of` or `is_hidden` set, so
   daily RSS double-counts on those days.

Combined effect (simulation, current inputs vs. cleaned inputs):

| Metric | Displayed / current inputs | Cleaned inputs | Distortion |
|---|---|---|---|
| Peak TFI (2025) | **240** (2025-06-06) | **97** (2025-01-22) | ~2.5× |
| TFI @ 2026-07-30 | 74.5 (server row); sim 69.4 | **45.5** | ~+60% |
| FormScore @ 2026-07-30 | **+32.6** (server row) | **−1.8** | sign flip |
| Monthly mean TFI, 2026 | 77–114 | 36–48 | ~2× |

The dashboard currently tells the athlete they are peaking with a big fitness base
(+32.6 form). The cleaned series says they are at neutral form with a moderate
base. The physiological evidence (§4) sides with the cleaned series.

The ingest-side fix already exists: `api/utils/stressScoreSanitizer.js` guards
every *new* write (no sentinels appear after 2026-05-24). What remains is the
historical backfill, duplicate flagging, and a read-side guard — scoped in §5.

---

## 1. Sentinel stress scores (6553.5 = 0xFFFF / 10)

**Count:** 139 visible, non-duplicate-flagged activities with stored
`coalesce(rss, tss) ≥ 1000` — every one of them exactly **6553.5**.

- 133 `garmin`, 6 `strava`; span **2022-12-04 → 2026-05-24**, none since
  (consistent with `sanitizeStressScore` guarding all current write paths:
  `fit-upload.js`, `garmin-activities.js` ×3, `garmin-webhook-process.js` ×2).
- The affected rides are ordinary (3–90 km, 0.3–3.2 h, mostly no power data);
  a genuine TSS would be ~20–200.

**Why it still hurts:** `estimateTSSWithSource` (`api/utils/fitnessSnapshots.js:306`)
Tier 1 reads `activity.rss ?? activity.tss` and trusts any positive value as
`device` / confidence 0.95. There is **no read-side sanitization**, so each
historical sentinel row contributes `min(6553.5, 500) = 500` RSS to
`training_load_daily` — and inflates `confidence`/`fs_confidence` too, because
the corrupted tier reports the *highest* confidence.

Verified in `training_load_daily`: all 14 days with daily RSS > 400 since March
2026 are `rss_source='device'`; e.g. 2026-04-19 stored RSS 596 = capped sentinel
(500) + the real twin's estimated 96.

## 2. Duplicate imports

**Count:** 28 twin pairs since 2024-08-01 (start time within 5 min, distance
within 200 m, moving time within 120 s), all with `duplicate_of IS NULL` and not
hidden.

Pattern (e.g. 2026-03-28): two rows at `15:45:27`, both 118.3 km / 4.34 h — one
named `travisdiegowhite@gmail.com 422018510357`, one `Erie Road Cycling`, both
carrying RSS 275 → the daily row stores **550**. Where one twin also carries the
6553.5 sentinel (e.g. 2026-04-19), the two defects stack.

Worst single day: **2025-10-26 — 13 activities summing to a capped 6500 RSS**
(cleaned value: 2). That is a mass re-import day, and there are smaller ones
(2025-11-25: 5 rows / 2057; 2025-12-06: 4 rows / 2000, cleaned value 0).

The nightly recompute is documented as absorbing "duplicate-marking" — but only
for rows that are actually marked. These 28 pairs never were.

## 3. Impact on TFI / AFI / FormScore (simulation)

Method: exported the per-day RSS series three ways from production
(`scratch/sql/daily_rss_series.sql`), then ran the exact recompute walk
(`tfi += (rss − tfi)/τ_tfi`, `afi += (rss − afi)/τ_afi`, `FS = prevTFI − prevAFI`,
athlete's τ = 49 / 8.9, cold start 2024-08-01, per-activity cap 500 applied):

- **current** — stored values as the engine sees them today
- **cleaned** — duplicates collapsed + sentinel rows re-estimated from the
  tiered fallback (HR/power/duration)
- **hr-enhanced** — cleaned, but preferring HR-based estimates where available
  (sensitivity check)

Results:

| | Peak TFI (from 2025) | TFI @ 7/30 | AFI @ 7/30 | FS @ 7/30 | Mean TFI 2026-01…07 |
|---|---|---|---|---|---|
| current | 240.3 (2025-06-06) | 69.4 | 49.3 | +22.5 | 113.7 → 76.8 |
| cleaned | 96.6 (2025-01-22) | 45.5 | 49.2 | **−1.8** | 36.3 → 44.3 |
| hr-enhanced | 149.0 | 58.6 | 49.4 | +11.3 | 38.8 → 62.1 |

The production server row for 2026-07-30 (TFI 74.5 / AFI 39.7 / FS +32.6) is
close to the sim's "current" regime; residual differences come from the seeded
180-day window, terrain multipliers, and adaptive tau, which the sim
approximates. The *shape* of the distortion is what matters: the current series
is a duplicate/sentinel artifact roughly 2× too high through 2025–2026, and it
flips FormScore from ~neutral to strongly positive.

A second-order effect: because the recompute only rewrites the trailing 180
days, days older than that keep whatever inflated TFI/AFI was last written for
them — cleanup must recompute the full history, not rely on the nightly job.

## 4. Physiological cross-check — which series is right?

If the "current" series were real, the athlete's fitness collapsed to ~1/3 of a
mid-2025 peak (TFI 240 → 77). The training evidence says otherwise:

**Best sustained power (efforts ≥ 20 min, avg W) and efficiency factor by quarter,
cycling only, duplicates excluded:**

| Quarter | Hours | Best ≥20-min avg W | EF (avg W / avg HR) |
|---|---|---|---|
| 2024 Q3 | 29 | 196 | 1.89* |
| 2024 Q4 | 28 | 188 | 1.28 |
| 2025 Q1 | 52 | 193 | 1.19 |
| 2025 Q2 | 73 | 217 | 1.36 |
| 2025 Q3 | 52 | 227 | 1.29 |
| 2025 Q4 | 36 | 231 | 1.30 |
| 2026 Q1 | 60 | 229 | 1.41 |
| 2026 Q2 | 11 | 212 | 1.40 |

\* 2024 Q3 EF is an outlier from a small sample with sparse power data.

**Segment evidence** (sparse — one repeatable segment with enough efforts):
"Rolling 14.7km", best time 2996 s (2025 Q4, 8 efforts) → 2904 s (2026 Q1,
4 efforts), **−3.1%**.

Interpretation: gradual, steady improvement through 2025 (196 → 231 W) and a
*hold* into 2026 with EF at its best (1.40+). No collapse, no massive peak. This
matches the cleaned series (TFI drifting 36 → 48 through 2026) and is
incompatible with the current one (TFI halving). ~2–6 h/week of riding cannot
produce or sustain a TFI north of 200; the cleaned magnitudes are also simply
more plausible for the recorded volume.

## 5. Recommendations (scoped; each needs approval before any change)

Per the metrics freeze policy, none of this was applied — the fixes below are
deliberately small and data-first:

1. **Backfill-null the 139 sentinel rows.** `UPDATE activities SET rss = NULL,
   tss = NULL WHERE …` (dual-write both columns per freeze policy) for the rows
   with the exact 6553.5 value. The sanitizer's own doc comment states null is
   the correct outcome: the tiered estimator then derives a sane value from
   HR/power/duration instead of a capped 500.
2. **Flag the 28 duplicate twins.** Set `duplicate_of` (or `is_hidden`) on the
   raw-named copy of each pair, keeping the renamed row. The detection predicate
   used here (±5 min / ±200 m / ±120 s) had zero false positives on inspection,
   but each pair should be eyeballed before flagging.
3. **One-off full-history recompute** of `training_load_daily` after (1) and
   (2) — the nightly job only rewrites the trailing 180 days, so 2024–2025
   inflation is frozen in place until an explicit wide-window run. Refresh
   `fitness_snapshots` afterwards.
4. **Read-side guard (small code change):** apply `sanitizeStressScore` to the
   Tier-1 read in `estimateTSSWithSource` so any residual or future bad stored
   value can never be trusted at device-tier confidence. One line, mirrors the
   ingest contract.
5. **Import-path dedup (scoped project, not a quick fix):** the twin rows come
   from two Garmin import paths writing the same `provider_activity_id` ride
   under different names. Worth an idempotency key on
   `(user_id, provider, provider_activity_id)` — but that's a design change,
   out of scope here.

Expected corrected display (approximate, from the cleaned sim): **TFI ~45,
FormScore ~0** as of end-July 2026 — a moderate, honestly-earned base at neutral
form, in place of an inflated peak.

---

## Appendix — reproduction

- Daily RSS export (three regimes): `scripts/fitness-model-audit/daily_rss_series.sql`
- Simulation: `scripts/fitness-model-audit/simulate.mjs`
  (+ `series.mjs` data snapshot, generated 2026-08-01)
- Sentinel census: `SELECT count(*) FROM activities WHERE coalesce(rss, tss) >= 1000
  AND duplicate_of IS NULL AND (is_hidden IS NULL OR NOT is_hidden)` → 139 rows,
  all exactly 6553.5
- Duplicate census: self-join on start time ±5 min, distance ±200 m,
  moving_time ±120 s → 28 pairs since 2024-08
- High-RSS daily rows: `SELECT … FROM training_load_daily WHERE rss > 400` →
  14 days, all `rss_source='device'`, max 717 (2026-05-23), peak TFI 133.4
