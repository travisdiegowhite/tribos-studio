# Metric Audit — TFI / AFI / FS

**Author:** claude/audit-fitness-metrics-cLcHY  
**Date:** 2026-04-23  
**Scope:** Diagnosis of TFI=68 vs. felt fitness ~162+ going into Boulder Roubaix (Apr 26, 2026).  
**Strategy:** Run standard CTL alongside TFI through Boulder Roubaix and BWR, collect race-day felt-fitness data, decide post-BWR which to keep as primary.

---

## 1. How TFI Is Actually Computed (as of audit date)

### 1.1 What the dashboard *displays*

`src/pages/Dashboard.jsx:284-329` runs a `useMemo` on every render:

1. Fetches the **last 90 days** of activities from `activities` table (`select('*')`).
2. For each activity, calls `estimateActivityTSS(activity, userFtp)` from `src/utils/computeFitnessSnapshots.ts:98-140`.
3. Aggregates daily totals, runs `calculateCTL(tssArray)` (= `calculateTFI`) with **hardcoded tau = 42**, EWA initialised at 0.
4. The resulting `ctl` value is stored in `trainingMetrics.ctl` and shown in `StatusBar` as "FITNESS / TFI".

**This is entirely client-side.** It does NOT read `training_load_daily.tfi`.

---

### 1.2 `estimateActivityTSS` — the 5-tier RSS cascade (client-side)

File: `src/utils/computeFitnessSnapshots.ts:98-140`

| Tier | Check | Column read | Confidence |
|------|-------|-------------|-----------|
| 1 | `activity.tss > 0` | `tss` (legacy) | 0.95 |
| 2 | `RUNNING_TYPES.includes(activity.type)` | `moving_time`, `distance`, `average_heartrate` | varies |
| 3 | `activity.normalized_power > 0 && ftp > 0` | `normalized_power` (legacy) | 0.95 |
| 4 | `activity.kilojoules > 0 && activity.moving_time` | `kilojoules`, `moving_time` | ~0.75 |
| 5 | fallback | `moving_time`, `total_elevation_gain`, `average_watts` | 0.40 |

**Critical problem:** The `ActivityInput` interface (`src/utils/computeFitnessSnapshots.ts:15-28`) does NOT declare `rss` or `effective_power`. Neither field is read at any tier.

The canonical columns introduced in migration 072 (`activities.rss`, `activities.effective_power`) are completely ignored by the client-side estimation function.

---

### 1.3 Which activities hit which tier

| Source | `activity.tss` | `activity.normalized_power` | `activity.effective_power` | `activity.rss` | Tier hit |
|--------|---------------|----------------------------|--------------------------|---------------|----------|
| Garmin (FIT with device TSS) | NULL | NULL | NULL | **SET** | Tier 5 (heuristic) — `rss` ignored |
| Garmin (FIT, power meter, no device TSS) | NULL | NULL | NULL | NULL (computed later by server) | Tier 4 (kilojoules if available) |
| Strava (power meter) | NULL | **SET** (B9 dual-write) | **SET** (B9 dual-write) | NULL | Tier 3 (normalized_power) ✓ |
| Strava (no power) | NULL | NULL | NULL | NULL | Tier 5 (heuristic) |
| FIT upload (with device TSS) | NULL | NULL | NULL | **SET** (`pm.trainingStressScore`) | Tier 5 (heuristic) — `rss` ignored |

Evidence: `garmin-webhook-process.js:320,690` and `garmin-activities.js:978,1384,1720` write `activityUpdate.rss = pm.trainingStressScore`, but `strava-activities.js` never writes `tss`. The Garmin activityBuilder (`api/utils/garmin/activityBuilder.js`) never writes `normalized_power` or `tss`.

---

### 1.4 Formula: `calculateTFI` / `calculateCTL`

File: `src/utils/trainingPlans.ts:460-474` (TypeScript source), alias at line 500.  
Server-side mirror: `api/utils/fitnessSnapshots.js:23-31`.

```
TFI_n = TFI_(n-1) + (RSS_n − TFI_(n-1)) / tau
```

- **tau (client-side):** hardcoded `42`. Ignores `user_profiles.tfi_tau`.
- **tau (server-side):** reads `profile.tfi_tau ?? 42` (`computeWeeklySnapshot` line 698).
- **Initial value:** 0 (cold-start problem — see §2.2).
- **Input window (client-side):** last 90 days only.

---

### 1.5 Adaptive tau (exists but unused in display path)

`src/lib/training/adaptive-tau.ts:54-74` implements `calculateTFITimeConstant(age, tfiVariance6Months)`:

```
tau = round(42 × ageFactor × historyFactor)
```

- age < 30: ageFactor = 0.90 → tau ≈ 38
- 30 ≤ age < 45: ageFactor = 1.00 → tau = 42
- 45 ≤ age < 55: ageFactor = 1.10 → tau ≈ 46
- age ≥ 55: ageFactor = 1.20 → tau ≈ 50

**historyFactor:** 1.05 if 6-month TFI variance > 20, else 1.00.

Server-side nightly recompute: `api/utils/adaptiveTau.js:109-191` (`recomputeUserTauConstants`).  
The computed tau is stored in `user_profiles.tfi_tau` but the Dashboard `useMemo` never reads it.

---

### 1.6 AFI (Acute Fatigue Index)

Same client-side pattern as TFI. Formula: `AFI_n = AFI_(n-1) + (RSS_n − AFI_(n-1)) / tau`, tau = 7.  
`calculateATL` alias in `src/utils/trainingPlans.ts:501`.  
Reads same `estimateActivityTSS` values — suffers from the same tier mis-hits as TFI.

---

### 1.7 FS (Form Score)

File: `api/utils/trainingLoad.js:65-73` (server-written).  
`FS = TFI_yesterday − AFI_yesterday` (spec §3.6 — freshness going INTO today).  
Written to `training_load_daily.form_score` on each daily upsert.

Client display (`src/pages/Dashboard.jsx:319-320`):  
`const tsb = calculateTSB(ctlYesterday, atlYesterday)` — also client-computed from flawed RSS series.

FS itself has no feedback into TFI or AFI; freshness double-counting (H3) is ruled out by inspection.

---

### 1.8 Server-stored TFI (not displayed)

Written by server-side cron / webhook processors via `upsertTrainingLoadDaily` (`api/utils/trainingLoad.js:45-98`).  
Stored in `training_load_daily.tfi`.  
Uses correct `activity.rss ?? estimateTSS(activity)` read, per-athlete tau, and 90-day window starting from stored prior values (not cold-start 0).  
**Not used by the dashboard.** Only consumed by `useFormConfidence` (fs_confidence), `useTodayTerrain`, and the AI coach context.

---

## 2. Confirmed Bugs

### Bug A — Client ignores canonical `rss` column (HIGH SEVERITY)

**File:** `src/utils/computeFitnessSnapshots.ts:15-28, 98-140`

The `ActivityInput` interface doesn't declare `rss` or `effective_power`. `estimateActivityTSS` reads `activity.tss` (Tier 1) and `activity.normalized_power` (Tier 3). Both are NULL for Garmin activities and `tss` is NULL for all activities.

For Garmin rides where the Garmin device computed a training stress score (`pm.trainingStressScore`), the correct value is stored in `activities.rss` and completely bypassed. The client falls to Tier 5 heuristic (~50 RSS/hr). A 5-hour power-meter ride at FTP computes:

- Device RSS: ~500 (standard TSS formula)
- Heuristic RSS (Tier 5): 5h × 50 = 250 (50% of correct value)

At tau=42, a sustained 50% undercount on RSS would produce a TFI roughly **50% of the correct value**.

**Fix:** Add `rss?: number | null` and `effective_power?: number | null` to `ActivityInput`; change Tier 1 to `const storedRSS = activity.rss ?? activity.tss`; change Tier 3 to check `activity.effective_power ?? activity.normalized_power`.

---

### Bug B — 90-day cold-start window (MEDIUM SEVERITY)

**File:** `src/pages/Dashboard.jsx:105-106`

`Dashboard.jsx` fetches only 90 days of activities and the EWA starts at 0. Convergence formula:

```
TFI_90 ≈ avg_daily_RSS × (1 − e^{−90/42}) ≈ avg_daily_RSS × 0.883
```

An athlete with a high training load would be at ~88% of steady-state at day 90. For a correct TFI of 162, this underestimates by ~19 points.

Compounded with Bug A: if Bug A causes RSS to be halved, TFI converges toward ~81 instead of ~162 (half of 162 × 0.883 ≈ 71 — consistent with the observed 68).

**Fix:** Extend the activities fetch window from 90 → 180 days (within the Dashboard's `trainingMetrics` `useMemo` only; do not change other queries using 90-day window).

---

### Bug C — Adaptive tau not applied (LOW SEVERITY)

**File:** `src/pages/Dashboard.jsx:313` calls `calculateCTL(tssValues)` with default tau=42.  
`user_profiles.tfi_tau` is never read in the Dashboard path.  
Effect: minor compared to A and B. Longer tau (older athletes) would build TFI *more slowly* but also make it more stable. Shorter tau (younger) would make it more reactive. Since Travis is in the 30–45 bracket, tau=42 is the correct default anyway — this bug is likely neutral for Travis.

---

## 3. Hypothesis Test Results

| Hypothesis | Result | Evidence |
|------------|--------|---------|
| H2 — Intensity penalty / wrong tier cascade | **CONFIRMED** (root cause) | `estimateActivityTSS` ignores `activity.rss`; Garmin activities fall to Tier 5 heuristic. `computeFitnessSnapshots.ts:103,111` |
| H1 — 90-day cold-start | **CONFIRMED** (amplifier) | `Dashboard.jsx:105-106`; 90-day window gives ~88% convergence; ~12% undercount alone, larger combined with H2 |
| H3 — Freshness double-counting | **RULED OUT** | FS = `TFI_yesterday − AFI_yesterday`; FS not fed back into TFI calculation (`trainingLoad.js:65-73`) |
| H4 — Derivative / ramp-rate term | **RULED OUT** | EWA formula has no derivative terms (`trainingPlans.ts:460-474`, `fitnessSnapshots.js:23-31`) |
| H5 — Adaptive tau mismatch | **NOT APPLICABLE** (Travis 30–45 bracket → tau=42 is the default; no deviation) |

---

## 4. Server-side TFI vs. Client-side TFI

| Metric | Where computed | RSS source | Window | Starting value | Tau |
|--------|----------------|-----------|--------|----------------|-----|
| `training_load_daily.tfi` | Server (cron/webhook) | `activity.rss ?? estimateTSS()` (canonical-first) | Rolling (prior row preserved) | Prior row's tfi | `user_profiles.tfi_tau` |
| `trainingMetrics.ctl` (displayed) | Client (useMemo) | `activity.tss` only (legacy, mostly NULL) | Last 90 days only | 0 | 42 (hardcoded) |

The server-stored TFI in `training_load_daily.tfi` should be significantly higher. The diagnostic page will reveal the exact delta.

---

## 5. CTL Baseline (Standard)

For race-day comparison, standard CTL is computed by `api/utils/computeFitnessMetrics.js` with:
- 180-day window
- Fixed tau = 42 (no adaptive — baseline for comparison)
- `activity.rss ?? activity.tss` canonical-first read
- EWA starts at 0 at day 0 (same math, longer window, better convergence)

---

## 6. Next Steps

- [ ] Deploy `/internal/metrics-audit` and inspect 180-day daily table (server TFI vs CTL vs raw RSS)
- [ ] Apr 26: Record pre-race felt fitness, CTL value, server-stored TFI, displayed TFI
- [ ] Apr 26: Post-race record race outcome and felt-fitness calibration
- [ ] May 3: Same protocol for BWR
- [ ] Week of May 4: Decide whether to fix-and-keep TFI or promote CTL to primary
- [ ] Propagate Bug A + Bug B fixes to all users only after post-BWR validation

---

## 7. File Reference Map

| File | Line(s) | Role |
|------|---------|------|
| `src/pages/Dashboard.jsx` | 284–329 | Client-side TFI/AFI/FS computation (displayed value) |
| `src/utils/computeFitnessSnapshots.ts` | 15–28 | `ActivityInput` type — missing `rss`, `effective_power` |
| `src/utils/computeFitnessSnapshots.ts` | 98–140 | `estimateActivityTSS` — tier cascade, reads legacy cols only |
| `src/utils/trainingPlans.ts` | 460–502 | `calculateTFI/AFI/FS` + `calculateCTL/ATL/TSB` aliases |
| `api/utils/fitnessSnapshots.js` | 23–55 | Server-side EWA formulas (canonical-first, correct) |
| `api/utils/fitnessSnapshots.js` | 305–391 | `estimateTSS` — server cascade, reads `activity.rss` at line 313 |
| `api/utils/trainingLoad.js` | 45–98 | `upsertTrainingLoadDaily` — writes `training_load_daily.tfi` |
| `api/utils/adaptiveTau.js` | 39–74 | Server-side tau constants (used by `computeWeeklySnapshot`) |
| `src/lib/training/adaptive-tau.ts` | 54–112 | TypeScript tau formulas |
| `api/garmin-webhook-process.js` | 320, 690 | Writes `activities.rss = pm.trainingStressScore` |
| `api/garmin-activities.js` | 978, 1384, 1720 | Writes `activities.rss` from FIT TSS |
| `api/strava-activities.js` | 366–368 | Dual-writes `normalized_power` + `effective_power` but NOT `rss` |
| `api/utils/garmin/activityBuilder.js` | 154–227 | Garmin builder — NO `tss`, `normalized_power`, `rss` written |
| `database/migrations/071_drop_legacy_load_columns.sql` | — | Confirms `training_load_daily.tss/ctl/atl/tsb` are already DROPPED |
| `database/migrations/072_activities_snapshots_rename.sql` | — | Adds `activities.rss`, `effective_power` (DROP still commented) |
| `database/migrations/074_drop_activities_legacy.sql` | — | DROP still commented (§3b not yet landed) |
