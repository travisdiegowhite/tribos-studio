# Fitness Stats Deep Dive — Findings & Rollback Notes

**Date:** 2026-04-04
**Branch:** `claude/fix-fitness-stats-sqEHD`
**PRs:** #623–#630 (all merged to main, all should be reverted)
**Direct main commits:** `8af8ac7`, `118aab6` (cache headers, also revert)

---

## What We Were Trying to Fix

The user's dashboard showed inflated fitness metrics:
- **CTL (Fitness):** 191 — should be much lower
- **ATL (Fatigue):** 304 — physically impossible
- **TSB (Form):** -113 — "In the hole" despite feeling great

The Year-over-Year CTL chart also showed suspicious values (ALL-TIME PEAK of 287, which is beyond pro cyclist levels).

---

## Confirmed Bugs Found

### 1. kJ-based TSS formula was ~3x too high
**Files:** `api/utils/fitnessSnapshots.js`, `src/utils/computeFitnessSnapshots.ts`

**Old formula:** `kJ / hours / 1.2` — this equals `avg_watts × 3`, producing TSS ≈ 600 for a normal 2h ride.

**Proposed fix:** `kJ / (FTP × 0.036)` — produces TSS ≈ 200 for same ride with FTP=200.

**Status: Likely correct direction, but needs more analysis.**

**Flag:** This formula is a LINEAR approximation (`IF × hours × 100`), not the standard QUADRATIC formula (`IF² × hours × 100`). It **overestimates** easy rides by 30-55% and is exact at threshold. The correct kJ-to-TSS formula requires both kJ AND duration:
```
avgPower = kJ × 1000 / moving_time_seconds
IF = avgPower / FTP
TSS = hours × IF² × 100
```
This should be evaluated in the next attempt.

### 2. Server-side CTL/ATL used wrong formula
**File:** `api/utils/fitnessSnapshots.js`

Server used batch exponential weighting (`Math.exp` sums × `decay`) while client used correct iterative EWA (`ctl + (tss - ctl) / 42`). The comment said they matched — they didn't.

**Status: Confirmed bug. The iterative EWA is the standard.**

### 3. Server-side ATL used only 7-day slice
**File:** `api/utils/fitnessSnapshots.js:318`

`calculateATL(tssArray.slice(-7))` — iterative EWA needs full history to converge, not just 7 days.

**Status: Confirmed bug.**

### 4. TSB should use yesterday's CTL/ATL
**Spec:** `TSB = CTL_yesterday - ATL_yesterday` (freshness going into today).

**Code used:** `TSB = CTL_today - ATL_today` (after today's training).

**Status: Confirmed per user's spec. The standard PMC model uses yesterday's values.**

### 5. TrendsTab crash — `ninetyDayActivityCount` not defined
**File:** `src/pages/TrainingDashboard.jsx:1594`

Variable defined in parent `TrainingDashboard` scope (line 635) but used inside `TrendsTab` child component (separate function scope). Pre-existing bug, not caused by our changes.

**Status: Confirmed bug, straightforward fix.**

### 6. Strava webhook doesn't import `weighted_average_watts`
**Files:** `api/strava-webhook.js`, `api/strava-activities.js`

Garmin activities get `normalized_power` from FIT files. Strava activities never store it despite Strava API providing `weighted_average_watts` (their NP equivalent).

**Status: Confirmed gap. Should be imported as `normalized_power`.**

**Flag:** This only affects activities with power meters. Without a power meter, Strava doesn't provide `weighted_average_watts`. Need to verify the user's actual setup before assuming this is the root cause of YoY differences.

### 7. Server-side `estimateTSS` had no NP+FTP tier
**File:** `api/utils/fitnessSnapshots.js`

Server went: stored TSS → running → kJ → duration heuristic. No NP+FTP calculation. Client had it but server didn't.

**Status: Confirmed gap.**

---

## Changes That Need More Thought

### TSS Tier Reordering
We reordered the TSS estimation tiers to prioritize NP+FTP and kJ+FTP over stored TSS from devices:

**Old order:** stored TSS → running → NP+FTP → kJ → duration heuristic
**New order:** running → NP+FTP → kJ → stored TSS → duration heuristic

**Rationale:** Stored TSS from Garmin devices uses whatever FTP was set on the device at the time. If FTP changed between years, stored TSS makes YoY comparison inconsistent.

**Concern:** This is a valid approach for YoY charts, but it changes TSS for ALL contexts (dashboard, AI coach, etc.). The stored device TSS might be more accurate for current-week metrics since it uses the device's calibrated power data. Consider:
- Using the reordered tiers ONLY for the YoY chart computation
- Keeping stored TSS as Tier 1 for the dashboard and AI coach

### HistoricalInsights — Client-Only Snapshots
Changed the merge logic to use client-computed snapshots exclusively instead of merging with server `fitness_snapshots` table.

**Concern:** We never confirmed whether the merge was actually the problem. The ALL-TIME PEAK of 287 persisted even after this change, which means either:
1. Client computation ALSO produces 287 (stored TSS values on activities drive it), OR
2. The change never took effect due to Cloudflare caching (confirmed later)

**Recommendation:** Keep the hybrid merge but ensure client data wins for core metrics (CTL/ATL/TSB). Don't discard server data entirely — it has advanced fields (zone distribution, monotony, strain) used elsewhere.

### Cache Headers in vercel.json
Added `Cache-Control: max-age=0, must-revalidate` for SPA routes to prevent Cloudflare from caching `index.html`.

**This change should be KEPT even after rollback.** It fixes a real deployment visibility issue where Cloudflare serves stale `index.html` referencing old JS chunks. This was the reason none of our changes were visible to the user despite being deployed.

**Pattern:** `/((?!api/|assets/.*)` — excludes API routes and content-hashed assets.

---

## Dead Ends & Traps to Avoid

### 1. Cloudflare Caching Makes Changes Invisible
**We spent significant time debugging why changes weren't appearing despite being deployed.** The root cause: Cloudflare cached `index.html` with old JS chunk references. Even hard refresh and Cloudflare cache purge didn't consistently work.

**Lesson:** Before debugging any frontend behavior, verify the JS chunk hash in the Network tab matches the latest build output. If not, the code isn't loaded — no amount of code changes will fix it.

**Fix:** The `vercel.json` cache header for SPA routes (added in this session) should prevent this going forward. This should survive the rollback.

### 2. Console.log Debugging Didn't Work
Multiple attempts to add diagnostic `console.log` and `console.warn` statements to `HistoricalInsights.jsx` produced no output in the browser. We confirmed the code was in the built JS chunk but it never executed.

**Root cause:** Cloudflare was serving old JS. The diagnostic code was deployed to Vercel but never reached the browser.

**Lesson:** Don't trust that deployed code = executed code when Cloudflare is in the path. Verify with Network tab chunk hashes first.

### 3. Don't Change Too Many Things at Once
We changed the kJ formula, server CTL/ATL formulas, TSB timing, TSS tier order, merge strategy, Strava NP import, FTP null handling, and cache headers — all in one session. When the YoY chart didn't improve, we couldn't tell which change (if any) was working because Cloudflare was caching old JS.

**Lesson:** Make ONE change at a time, verify it takes effect (check chunk hash!), then evaluate before making the next change.

### 4. Don't Push Directly to Main
Two commits (`8af8ac7`, `118aab6`) were pushed directly to main bypassing code review. This is unsafe for a production app.

**Lesson:** Always create a PR, even for "small" changes like cache headers.

### 5. The kJ Formula Math Needs Careful Analysis
The kJ-to-TSS approximation `kJ / (FTP × 0.036)` is LINEAR in power, while real TSS is QUADRATIC (IF²). For endurance rides (IF 0.65-0.80), this overestimates by 30-55%. For threshold work (IF ~1.0), it's exact.

The correct kJ-based formula:
```
avgPower = kJ × 1000 / duration_seconds
IF = avgPower / FTP
TSS = hours × IF² × 100
```

**Before the next attempt**, decide whether to use the linear approximation (simpler, overestimates easy rides) or the quadratic formula (correct, requires duration). Both are better than the original 3x-overestimated formula.

### 6. Verify User's Actual Data Before Assuming Root Causes
We speculated about Strava vs Garmin data differences, FTP settings, and missing activities without ever seeing the actual data. Key questions that remain unanswered:

- What FTP does the user have set in their profile?
- What provider(s) are their activities from (Strava, Garmin, both)?
- Do their activities have `kilojoules`, `normalized_power`, stored `tss`, or just `moving_time`?
- How many activities per year? Any gaps?
- Did their setup change between 2025 and 2026?

**Next attempt should start by querying the actual activity data** from Supabase to understand what fields are populated, rather than guessing from code.

---

## Files Changed (to revert)

| File | Changes Made |
|------|-------------|
| `api/utils/fitnessSnapshots.js` | kJ formula, CTL/ATL formulas, ATL slice, TSB yesterday, NP+FTP tier, FTP moved earlier |
| `api/utils/fitnessSnapshots.test.js` | NEW FILE — 21 tests |
| `api/strava-webhook.js` | Added `normalized_power: activity.weighted_average_watts` (3 locations) |
| `api/strava-activities.js` | Added `normalized_power: a.weighted_average_watts` (2 locations) |
| `src/utils/computeFitnessSnapshots.ts` | kJ formula, tier reorder, TSB yesterday, FTP null fix, diagnostic logging |
| `src/utils/computeFitnessSnapshots.test.ts` | NEW FILE — 10 tests |
| `src/components/HistoricalInsights.jsx` | Client-only snapshots, diagnostic logging |
| `src/pages/Dashboard.jsx` | TSB yesterday fix |
| `src/pages/TrainingDashboard.jsx` | `ninetyDayActivityCount` fix for TrendsTab |
| `vercel.json` | Cache headers for SPA routes (**KEEP THIS — don't revert**) |

---

## Recommended Approach for Next Attempt

1. **Fix the cache header first** (already done — keep the `vercel.json` change)
2. **Verify deployments are visible** by checking chunk hashes in Network tab before any code changes
3. **Query actual activity data** from Supabase to understand what fields are populated per year
4. **Fix one bug at a time**, verify each change is visible and working before proceeding:
   - Start with the kJ formula fix (clear, math-based, testable)
   - Then server CTL/ATL formula alignment
   - Then TSB yesterday
   - Then TrendsTab crash
   - Then evaluate YoY chart separately
5. **Keep test files** — the tests we wrote are valid regardless of implementation approach
6. **Don't change TSS tier order** until we understand the user's actual data (which tiers their activities hit)

---

## Spec Reference (User-Provided Formulas)

```
CTL_today = CTL_yesterday + (TSS_today − CTL_yesterday) × (1/42)
ATL_today = ATL_yesterday + (TSS_today − ATL_yesterday) × (1/7)
TSB = CTL_yesterday − ATL_yesterday
TREND = ((CTL_today − CTL_28_days_ago) / CTL_28_days_ago) × 100
TCAS = ΔCTL_6wk / total_hours_trained_6wk  (deferred to future work)
EFI = per-workout TSS adherence, 28-day window (not changed in this session)
TWL = TSS × terrain_multiplier (not changed in this session)
THIS_WEEK = completed_workouts / planned_workouts
```
