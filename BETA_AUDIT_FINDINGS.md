# Beta-Readiness Audit — Stats & Data Outputs

**Date:** 2026-06-19
**Scope:** Training-load metrics, dashboard numbers, activity analysis, gear/fueling displays
**Status:** Code verification complete. **Production-data sweep PENDING** — Supabase MCP
access is gated in this session (see "Blocked" at bottom).

This report is deliberately conservative: every item was confirmed against current
source. Two parallel audit passes produced ~50 candidate issues; the ones that didn't
reproduce are listed under **Debunked** so we don't re-litigate them.

---

## Resolution status (2026-06-19)

**Fixed in this pass** (lint clean, type-check clean, 1532 existing tests pass + new
`FtpMissingBadge` test):
- **H1** — `RideHistoryTable` now uses the shared `estimateActivityTSS(ride, ftp)` (ftp
  wired from `TrainingDashboard`); the divergent private formula and the `|| 3600`
  fake-duration fallback are gone.
- **H2** — `PowerDurationCurve` now prefers real `power_curve_summary` (MMP) per activity
  and only estimates for activities lacking it; shows an "Estimated" badge when no real
  data exists.
- **M4** — `FuelCard` returns null on zero/NaN duration (no more "NaNh" / "NaN-NaNg").
- **M1** — new `FtpMissingBadge` ("Set FTP") shown on Dashboard and TrainingDashboard
  when FTP is unset. (Onboarding-flow change intentionally NOT done.)
- **L1** — `Dashboard` `weekStats` initial key fixed (`activities`).
- **L3** — `RideHistoryTable` bad-date labels unified to one sentinel.

**Deferred (need the blocked Supabase data sweep before action):**
- **M2** (canonical/legacy dual-write backfill) and **M3** (adaptive-tau unification).
  M3 also touches frozen metrics code. Run the queries below first to confirm affected
  rows exist, then scope a fix.

## Round 2 (2026-06-21) — "what else needs fixing"

Three more Explore passes (API/hygiene, remaining display surfaces, import/sync). Most
high-severity candidates were **false positives** removed on verification.

**Fixed** (lint clean, 1535 tests pass):
- **R1** — `api/road-segments.js:299`: `familiarityPercent` guarded against `totalKm === 0`
  (was returning `NaN` in a 200 response for routes with no matched segments).
- **R3** — `api/road-segments.js`: `parseInt(minRideCount) || 2` at all 3 sites (agent only
  spotted one).
- **R4** — lazy Resend init in `api/admin.js`, `api/email.js`, `api/email-tool.js` (was
  `new Resend(undefined)` at module load → would 500 every endpoint in the file if the key
  is unset).

**Verified PASS (no action):** Supabase connection hygiene (single `createClient`), writer
dual-write compliance, cron frequency all conform to CLAUDE.md.

**Debunked on verification (do NOT re-file):**
- `AthleteBenchmarking` weight÷0 — guarded by `if (!weight) return null` (246) + null-analysis
  empty state (321). Never divides without a positive weight.
- `RideAnalysisModal` W/kg (550/576/633) `{weight > 0 && …}`; IF/VI (591/608) `&&`-guarded.
- `ActivityPowerCurve` W/kg (71/93) — `weight ? … : null` (0 is falsy → null, no Infinity).
- `PersonalRecordsCard` (156) — `&&`-guarded.
- Garmin `start_date_local` "CRITICAL timezone" — intended Strava-compatible "local
  wall-clock as UTC" encoding, has a passing test.

**Still needs the (blocked) data sweep:** R6 (cross-provider duplicate merge not
re-triggering training-load recompute — likely mitigated by per-(user,date) upsert), plus
M2/M3. R5 (dead components in `TrainingDashboard.jsx`) left as optional cleanup.

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

## Production-data sweep — RESULTS (2026-06-23, Supabase MCP)

Ran read-only against project `xbziuusxagasizxnlwwn` (Tribos). Volume: **40,603
activities, 63 user_profiles, 899 fitness_snapshots, 1,418 planned_workouts.**

### Confirmed / promoted

- **S0 — `training_load_daily` is EMPTY (0 rows) — RESOLVED: by-design, not a blocker.**
  Follow-up code check (2026-06-23): the table is read by Dashboard/Today/FitnessProgressChart
  but its **only writer is `upsertTrainingLoadDaily`, called solely from
  `api/process-deviation.js`** (the sync webhooks only read it). Population of server-side
  TFI/AFI is **deliberately deferred** per `docs/tfi-duality-decision.md` (status: "implementation
  deferred"), and every reader **falls back to client-side compute from `activities`/
  `fitness_snapshots`** (`Dashboard.jsx:308–408`, with `serverLoadHistory.length > 0` guards).
  `fitness_snapshots` is healthy and fresh (899 rows, 53 users, updated today). → **Not a beta
  blocker.** The genuine open item it surfaces is the **TFI duality** (client vs server TFI
  disagree materially — see the memo) which is a pending product decision, already tracked.
- **M1 (FTP coverage) — CONFIRMED real.** 21/63 profiles have NULL/0 FTP; **15 of them
  have activities** → 15 active athletes get fallback-FTP (200/150 W) RSS, badge-only
  warning. Onboarding FTP prompt recommended before broad beta.
- **M2 (canonical/legacy divergence) — CONFIRMED, bounded, FIX WRITTEN.** Every divergent
  cohort ends on/before **2026-05-08** (the documented Garmin window); there is **no reverse
  divergence** (`tss IS NOT NULL AND rss IS NULL` reverse = 0), so no live writer is producing
  new bad rows. **Backfill migration written: `database/migrations/090_backfill_canonical_from_legacy.sql`**
  (idempotent UPDATEs, canonical ← legacy; not yet applied — review then run via MCP/psql):
  - `activities`: 64 rows `rss` NULL + `tss` present (Jan 22–May 8); 920 `effective_power`
    NULL + `normalized_power` present (2023–May 8); 64 `ride_intensity` NULL + `intensity_factor` present.
  - `fitness_snapshots`: 361 rows `weekly_rss` NULL + `weekly_tss` present (= the 361 `tfi` NULL).
  - `planned_workouts`: 92 rows `actual_rss` NULL + `actual_tss` present (through Jun 3);
    **target_rss/target_tss are clean (0 divergence).**
- **S1 — power activities with no rss/tss — RESOLVED: benign.** 2,387 activities have
  `effective_power` but neither `rss` nor `tss`; 1,652 (69%) belong to 31 FTP-set users, 116
  in the last 7d. Follow-up code check: both server (`fitnessSnapshots.js:318`,
  `computeFitnessMetrics.js:47`) and client (`computeFitnessSnapshots.ts:110`) read
  `activity.rss ?? activity.tss` and **fall through to the 6-tier `estimateTSSWithSource`
  estimator** (power → kJ → HR) when both are NULL. So these rides **do** contribute to
  fitness numbers (estimated live from power). Null stored `rss` = "not persisted," not
  "not counted." → **Not user-facing-wrong**; persisting would only be a perf/cleanliness win.
- **M3 (adaptive tau) — CONFIRMED, tiny.** 2 users with non-default `tfi_tau`, 1 with
  non-default `afi_tau`. Their projections/recomputed history diverge from live values.
  Low prevalence; fix when convenient (touches frozen metrics code).

### Minor data-quality (tiny counts; guards already shipped via H1/M4)

- 18 activities with zero/NULL `moving_time` but non-zero distance.
- 4 activities `max_watts > 2500`; 1 activity `distance > 1,000 km`. No negative `average_watts`.
- `training_load_daily` NaN/negative/absurd checks: all zero (table empty).

### Advisors (122 security lints, 750 performance lints)

**Security — ERROR (fix before beta):**
- **2 SECURITY DEFINER views** — `public.daily_training_load`, `public.garmin_completeness_audit`
  run with creator privileges and bypass the caller's RLS. **`daily_training_load` ties to
  S0** (it's the view over the empty `training_load_daily` table — likely the read path).
  Verify it doesn't leak other users' rows; recreate with `security_invoker = true`.
- `rls_disabled_in_public` on `spatial_ref_sys` (PostGIS system table) — accepted/low-risk.

**Security — WARN (auth-relevant):**
- **`function_search_path_mutable` on 52 functions** (e.g. `get_current_ftp`,
  `set_ftp_and_zones`, `calculate_tss`, `update_training_metrics`, `create_user_activation`).
  **Directly conflicts with the CLAUDE.md auth rule** (all `SECURITY DEFINER` fns must
  `SET search_path = public`). Prioritize any that touch `auth.users` / run as DEFINER.
- 26 DEFINER cleanup/maintenance fns EXECUTE-able by `anon`/`authenticated`
  (`cleanup_*`, `create_planned_workouts`) → `REVOKE EXECUTE FROM anon, authenticated`.
- `rls_policy_always_true` — always-true UPDATE policies on `coros_webhook_events` /
  `garmin_webhook_events` let any role rewrite webhook rows; tighten (signup/insert ones intentional).
- **Auth leaked-password protection is DISABLED** — enable before opening signups.
- INFO: 6 tables RLS-on-no-policy (deny-all) — confirm `track_points` (route/activity data)
  isn't read by the frontend, else it silently returns empty.

**Performance — WARN/INFO (beta scale):**
- **`auth_rls_initplan` — 235 policies** re-evaluate `auth.uid()` per-row. Biggest win:
  `activities` (9), `fitness_snapshots` (5), `planned_workouts` (5), `user_profiles` (3).
  Fix by wrapping as `(select auth.uid())`.
- **`multiple_permissive_policies` — 356**; `activities` and `fitness_snapshots` have **20 each**.
  Consolidate per action.
- **32 unindexed FKs** — incl. `activities.matched_planned_workout_id`,
  `planned_workouts.template_id`, and webhook `activity_id`/`integration_id` FKs. Cheap
  covering indexes, high value before traffic.
- 2 duplicate indexes (drop one each on `bike_computer_integrations`, `training_plans`);
  124 "unused" indexes (likely low-traffic false positives — review, don't bulk-drop).

(Full advisor payloads were ~101k/large; fetched via MCP and summarized — re-run
`get_advisors` directly for the complete object lists when actioning.)

### Recommended pre-beta order (post code-check)

S0 and S1 both **resolved to benign** on follow-up code inspection (see above) and drop off
the gating list. Remaining:

1. **M2 backfill — ✅ APPLIED (2026-06-23) & verified.** `migration 090` run against
   production; all five divergence counts now 0, reverse-divergence guard 0. (1,061 rows
   repaired: 64 rss, 920 effective_power, 64 ride_intensity, 361 weekly_rss, 92 actual_rss.)
2. **Security ERRORs — ✅ MOSTLY APPLIED (2026-06-23) via `migration 091`.** Both SECURITY
   DEFINER views (`daily_training_load`, `garmin_completeness_audit`) flipped to
   `security_invoker` (underlying RLS verified); `SET search_path = public` pinned on all
   SECURITY DEFINER functions in `public` missing it (PostGIS excluded; none referenced the
   `auth.` schema; the `create_user_activation` signup trigger already had it and was
   untouched). **Remaining (manual, no SQL surface):** enable Auth **leaked-password
   protection** in the Supabase dashboard before opening public signups. *Recommend a signup
   smoke-test on staging to confirm the `search_path` change is benign per CLAUDE.md.*
3. **M1 — ✅ ALREADY SATISFIED (no code needed).** Onboarding already prompts for FTP
   (`OnboardingModal.jsx` Screen 8 "Fitness Baseline"), `/api/onboarding-complete` persists
   it, and `FtpMissingBadge` is wired on Dashboard + TrainingDashboard. The 15 FTP-less users
   either skipped the optional field or pre-date the v2 modal; the badge already nudges them.
4. **Perf at scale — ✅ APPLIED (2026-06-23) via `migration 092`.** Added covering indexes
   for all 32 unindexed FKs; dropped the 2 confirmed duplicate indexes (`idx_integrations_user`,
   `idx_plans_user_status`). The `activities` cols=0 "duplicate" group was a false positive
   (distinct partial/expression indexes) and left intact. Verified: 0 unindexed FKs, 0 dups remaining.

### Still open (manual / product / dedicated-review — intentionally NOT auto-applied)

- **Auth leaked-password protection** — dashboard toggle, no SQL surface. Enable before public signups.
- **TFI duality** — a product decision per `docs/tfi-duality-decision.md` (client vs server TFI
   disagree on the displayed number). Needs Travis's call, not an auto-fix.
- **RLS `auth_rls_initplan` + permissive-policy consolidation** (235 + 356 policies) — the largest
   remaining perf win, but a mechanical-looking RLS rewrite at that scale has security blast radius
   (a wrong role/command = data exposure or lockout). Deserves its own focused, verified pass — NOT
   a blind bulk apply. Recommend doing it as a dedicated migration with per-policy diff review.
- **M3 adaptive tau** (3 users) and minor data-quality rows (18 zero-time, 4 max_watts>2500,
   1 distance>1000km) — low priority; guards already handle display.

---

## Recommended order of fixes (after this report is reviewed)

1. **H1** (divergent TSS estimator) — concrete, isolated, high trust impact.
2. **H2** (label/recompute power curve) — pick "label as estimate" (cheap) vs. "compute
   from streams" (better).
3. Whatever the data sweep promotes from M2/M1 to Critical.
4. M3, M4, then the L-tier polish.
