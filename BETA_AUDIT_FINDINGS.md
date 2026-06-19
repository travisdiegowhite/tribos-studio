# Beta-Readiness Audit — Stats & Data Outputs

**Date:** 2026-06-19
**Scope:** Training-load metrics, dashboard numbers, activity analysis, gear/fueling displays
**Status:** Code verification complete. **Production-data sweep PENDING** — Supabase MCP
access is gated in this session (see "Blocked" at bottom).

This report is deliberately conservative: every item was confirmed against current
source. Two parallel audit passes produced ~50 candidate issues; the ones that didn't
reproduce are listed under **Debunked** so we don't re-litigate them.

---

## How to read this

Severity reflects *user-facing impact for beta*, not code aesthetics. Several items
are flagged **DATA-DEPENDENT** — their real severity can't be set until the production
queries run, because they only matter if real rows actually hit those paths.

---

## High — wrong/inconsistent numbers shown to users (confirmed in code)

### H1. Divergent TSS estimators → same ride shows different TSS in different views
- **Where:** `src/components/RideHistoryTable.jsx:197-204` defines its own `estimateTSS`
  (`duration/3600 * 50 + elevation/300 * 10`). It ignores stored `rss`/`tss`, power,
  HR, and FTP entirely.
- **Canonical estimator:** `api/utils/fitnessSnapshots.js:estimateTSSWithSource` (6-tier,
  uses stored RSS → power → kJ → HR → inferred). Client mirror in
  `src/utils/computeFitnessSnapshots.ts`.
- **Impact:** The Ride History table can show a materially different TSS than the
  dashboard/training views for the *same activity*. Beta users will notice and not trust
  the number.
- **Bonus bug:** `getDuration(ride) || 3600` (line 200) silently treats an
  unknown-duration ride as exactly 1 hour → ~50 TSS out of nowhere.
- **Suggested fix:** Have the table consume the stored value first (`ride.rss ?? ride.tss`)
  and fall back to the shared estimator, not a private formula.

### H2. Power Duration Curve presents *estimated* power as measured "best efforts"
- **Where:** `src/components/PowerDurationCurve.jsx:76-104`. Best-power-per-duration is
  synthesized from each activity's `average_watts`/`max_watts` via a decay model
  (`P = avg + (max-avg)*(1 - (t/dur)^0.07)`), not computed from power streams.
- **Impact:** Labeled as the rider's best 5s/1m/5m/20m/60m outputs and used to assign a
  rider-type ("Sprinter", "Climber", etc.) and W/kg. Power-meter users will see numbers
  that don't match their head units / TrainingPeaks and lose confidence.
- **Note:** Graceful when no power data (filtered at line 67; empty state). The issue is
  *honesty of presentation*, not a crash.
- **Suggested fix:** Either label it clearly as an estimate, or compute true best efforts
  from `stream_data` where available.

---

## Medium — systematic skew / missing guards (confirmed in code; prevalence DATA-DEPENDENT)

### M1. Hard-coded FTP fallback (200 W) and inferred-tier assumption (150 W)
- **Where:** `api/utils/computeFitnessMetrics.js` and `src/utils/computeFitnessSnapshots.ts`
  use `effectiveFtp = ftp>0 ? ftp : 200`; Tier-5 inference in
  `api/utils/fitnessSnapshots.js:386` uses `average_watts / 150`; Tier-4 no-FTP path
  uses FTP=200 at confidence 0.50 (`fitnessSnapshots.js:365`).
- **Impact:** Athletes who haven't set an FTP get systematically wrong RSS/intensity with
  **no UI warning**. A 150 W-FTP rider is under-counted; a 300 W rider over-counted.
- **DATA-DEPENDENT:** Severity hinges on how many active athletes have NULL/0 FTP
  (data query #5/#6). If most beta users set FTP at onboarding, this is minor.
- **Suggested fix:** Prompt for FTP at onboarding; badge inferred metrics as low-confidence.

### M2. Canonical/legacy dual-write gaps (`rss`/`tss`, `effective_power`, `target_rss`)
- **Where:** CLAUDE.md freeze policy mandates dual-writing canonical + legacy. The code
  comment at `fitnessSnapshots.js:312-317` documents a real past window where Garmin rows
  had `tss` but NULL `rss`, which dropped rides to lower tiers and double-counted terrain.
- **Impact:** Any remaining rows with canonical NULL but legacy present (or vice-versa)
  silently mis-tier RSS or break projections.
- **DATA-DEPENDENT:** Confirm via data queries #3 and #7. Cannot rate severity without
  row counts.
- **Suggested fix:** Backfill canonical from legacy where divergent; audit writers in
  `api/correction-proposal-apply.js`, `api/garmin-activities.js` backfill paths.

### M3. Inconsistent adaptive-tau usage between real-time and historical paths
- **Where:** Real-time path reads per-athlete `tfi_tau`/`afi_tau` (`api/process-deviation.js`),
  but historical/projection paths hard-code 42/7: `api/utils/tfiProjection.js:16`,
  `api/utils/computeFitnessMetrics.js`, `src/utils/trainingPlans.ts`.
- **Impact:** TFI projections and recomputed history diverge from live values for any
  athlete whose tau ≠ default.
- **DATA-DEPENDENT:** Only matters if any athlete actually has a non-default tau
  (data query #5). If none do today, this is latent/low.

### M4. FuelCard NaN propagation on zero/missing duration (NEEDS CONFIRMATION)
- **Where:** `src/components/fueling/FuelCard.jsx:115` (`Math.floor(plan.durationMinutes/60)`)
  and `:162` (`plan.carbs.totalGramsMin-totalGramsMax`). No guard if `durationMinutes` or
  carb values are NaN → would render "NaNh" / "NaN-NaNg carbs".
- **Open question:** Whether `src/utils/fueling.ts` (`calculateRetrospectiveFuelPlan` etc.)
  already guards zero duration. Not yet verified — listed for completeness.

---

## Low / cosmetic

- **L1.** `Dashboard.jsx:41` initial `useState({ rides: 0, ... })` uses the stale key
  `rides`; everything downstream reads `activities`. Harmless but confusing — rename for
  consistency.
- **L2.** `GearItemCard.jsx:67` renders distance at precision 0 (`formatDistance(..., 0)`)
  while other surfaces use 1 decimal. Minor inconsistency. (Shoe progress bar is fine —
  threshold is a non-zero constant.)
- **L3.** `RideHistoryTable.jsx:144-153` uses two different labels ("Unknown" for null,
  "Invalid" for out-of-range dates) with no visual distinction — minor.
- **L4.** Form-Score day-1 fallback (`api/utils/trainingLoad.js:71-73`) uses *today's*
  TFI−AFI instead of NULL when no prior row exists. Code calls this intentional; spec
  implies NULL. Judgment call — only affects an athlete's very first day.

---

## Debunked (verified NOT bugs — recorded to avoid re-checking)

- **kJ tier divide-by-zero / infinite power** — guarded at `fitnessSnapshots.js:349,351`
  (`moving_time` truthy AND `hours > 0`). The old `|| 1` pattern is gone.
- **Form-Score `fs_confidence` weighting "inverted"** — correct. `calculateFormScoreConfidence`
  (`fitnessSnapshots.js:419-426`) expects oldest→newest with weights `[0.05…0.30]`; the
  caller (`trainingLoad.js:59`) feeds oldest-first. Working as specified.
- **WeekChart "always 0/0 RIDES"** — overstated; consumers read `activities` correctly.
  Only the unused initial-state key is stale (see L1).
- **GearItemCard shoe-progress divide-by-zero** — non-issue; `RUNNING_SHOE_THRESHOLDS.replace`
  = 400 × 1609.344 = 643,737 m, never 0.
- **PowerDurationCurve "all-zero curve"** — mostly handled by the `average_watts > 0`
  filter; the real concern is H2 (estimate-presented-as-measured), not a zero curve.

---

## BLOCKED — production-data sweep (run when Supabase MCP is approved)

The Supabase MCP tools returned "MCP tool call requires approval" and did not execute in
this session. Once enabled, these SELECT-only queries finalize severity on M1–M3 and may
surface new Critical items (real corrupted rows). Ready to run:

1. **`training_load_daily`** — NULL/negative/absurd `tfi/afi/form_score/rss`; `rss <> rss`
   (NaN); `rss > 1000`; counts by `rss_source` and `confidence < 0.5`.
2. **`activities`** — zero `moving_time` with non-zero distance; negative `average_watts`/
   `max_power`; `max_power > 2500`; km-vs-m magnitude sanity; `effective_power` present but
   `rss` AND `tss` both NULL.
3. **Canonical/legacy divergence** — `rss IS NULL AND tss IS NOT NULL` (+ EP/RI twins).
4. **`fitness_snapshots`** — NULL/absurd fitness columns; weeks missing `rss_source`.
5. **`user_profiles`** — count non-default `tfi_tau`/`afi_tau`; count `ftp IS NULL OR ftp = 0`.
6. **FTP coverage** — active athletes who would hit the 200/150 W fallback.
7. **`planned_workouts`** — `target_rss IS NULL AND target_tss IS NOT NULL` (and reverse).

Plus `get_advisors` (security + performance) for RLS gaps and missing indexes that matter
at larger beta scale.

---

## Recommended order of fixes (after this report is reviewed)

1. **H1** (divergent TSS estimator) — concrete, isolated, high trust impact.
2. **H2** (label/recompute power curve) — pick "label as estimate" (cheap) vs. "compute
   from streams" (better).
3. Whatever the data sweep promotes from M2/M1 to Critical.
4. M3, M4, then the L-tier polish.
