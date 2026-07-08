# Training Stats Audit — July 2026

**Filed:** 2026-07-08
**Scope:** Every place training metrics (RSS/TSS, EP/NP, RI/IF, TFI/CTL, AFI/ATL,
FormScore/TSB, zones, ramp rate, EFI/TCAS/TWL) are *calculated* or *displayed*,
audited for (a) math correctness against `docs/TRIBOS_METRICS_SPECIFICATION.md`
(+ D1/D2/D4 amendments) and (b) cross-surface consistency.
**Method:** full-codebase sweep of `src/` and `api/`, then line-level verification
of every finding listed here. Findings marked **[verified]** were confirmed by
reading the exact code; anything not directly verified is marked as such.

Related prior art this audit builds on (and does not re-litigate):
`docs/METRICS_ROLLOUT_FREEZE.md`, `docs/tfi-duality-decision.md`,
`docs/METRICS_ROLLOUT_STATUS.md`.

---

## 1. Confirmed bugs (math/logic accuracy)

### B1 — Fabricated "Fitness vs 90 days ago" stat on /train [verified]
`src/pages/TrainingDashboard.jsx:1633`

```jsx
<Text size="xl" fw={700} c="teal">+{Math.round(trainingMetrics.ctl * 0.12)}%</Text>
<Text size="sm" c="dimmed">Fitness vs 90 days ago</Text>
```

The number is `CTL × 0.12` — it is not a comparison to anything, always renders
positive, and moves with today's CTL only. A rider losing fitness still sees a
green "+N%". Fix: compute a real delta (CTL now vs CTL at `dailyTSSData[0..len-90]`,
as `RampRateAlert` already does) or delete the tile.

### B2 — Today Spine Form Score fallback uses same-day values (spec §3.6 violation) [verified]
`src/views/today-spine/getTodaySpine.ts:318-321`

When `training_load_daily` has no row for today, the Spine computes
`fs = dTfi - dAfi` from **today's post-ride** TFI/AFI. Spec §3.6 (marked "Do not
change") requires **yesterday's** values — and `athleteMetrics.ts:139-147` (which
drives Today-Glance and the legacy Today) correctly uses
`tfiYesterday - afiYesterday`. Result: on any day with a logged ride and no
server row, `/today` and `/today/glance` show **different Form Scores for the
same athlete on the same day** — and the Spine's is wrong per spec (a hard ride
today should not reduce today's readiness-going-into-today).

Root cause is structural: `getTodaySpine.ts:266-297` re-implements the
`buildAthleteMetrics` EWA walk inline instead of calling it. The copy has
already drifted.

### B3 — Server RSS estimator Tier 3 is a canonical-only reader [verified]
`api/utils/fitnessSnapshots.js:335`

```js
if (activity.effective_power && activity.effective_power > 0 && ...)
```

No `?? normalized_power` fallback — the exact pattern freeze rule 3 forbids
("Don't add new canonical-only readers"). Migration
`072_activities_snapshots_rename.sql` adds `effective_power` with **no backfill**
from `normalized_power`, so every pre-B9 activity has `effective_power = NULL`.
Consequence: pre-B9 power-meter rides without a stored device TSS (typical
Strava rides — `weighted_average_watts` but no TSS) fall through to Tier 4
(kJ-derived, terrain-multiplied, confidence 0.75/0.50) instead of Tier 3
(power, 0.95). The client mirror `src/utils/computeFitnessSnapshots.ts:119`
**does** have the fallback (`effective_power ?? normalized_power`), so server
and client score the same historical ride differently. This affects every
server recompute over history: `computeWeeklySnapshot` (180-day windows),
`arcRefill`, `process-deviation`, TFI breakdowns. Note the Tier 1 twin of this
bug was already found and fixed at line 318 (see the comment there) — Tier 3
was missed.

One-line fix + optionally a backfill
(`UPDATE activities SET effective_power = normalized_power WHERE effective_power IS NULL AND normalized_power IS NOT NULL`
— additive data fix, not a rename; freeze-compatible but needs approval).

### B4 — Dashboard IntelligenceCard reads a column that doesn't exist [verified]
`src/components/today/IntelligenceCard.jsx:159-167`

```jsx
{workout.tss && ( ... TSS {workout.tss} ... )}
```

`workout` is a raw `planned_workouts` row (`Dashboard.jsx:179-183`, `select('*')`).
The table has `target_tss` / `target_rss` / `actual_tss` / `actual_rss` — there is
no `tss` column (`database/migrations/010_alter_training_plans.sql:53-87`). The
chip never renders. Should be `workout.target_rss ?? workout.target_tss` (and
the label should not say "TSS" — see §4).

### B5 — WeekSummaryGrid planned-TSS is always zero (same bug class as B4) [verified]
`src/components/train/WeekSummaryGrid.jsx:46`

```js
const plannedTSS = weekPlanned.reduce((sum, w) => sum + (w.tss || 0), 0);
```

`weekPlanned` rows come from `planned_workouts` (`TrainingDashboard.jsx:323-326`,
`select('*')`). `w.tss` is always `undefined`, so `plannedTSS` is always 0 and
the "completed/planned" readout silently degrades to completed-only. Should be
`w.target_rss ?? w.target_tss`.

Same pattern, not verified exhaustively: `src/components/AICoach.jsx:587,603`
maps `w.target_tss` with **no** `target_rss` fallback — rows written
canonical-only (`useTrainingPlan.ts` per the freeze doc's noted exception) would
read as missing.

### B6 — /train weekly stats use average power in the NP formula [verified]
`src/pages/TrainingDashboard.jsx:594-595` (also 2183, 2475)

```js
} else if (a.average_watts && ftp) {
  activityTSS = calculateTSS(a.moving_time, a.average_watts, ftp);
```

`calculateTSS(durationSeconds, normalizedPower, ftp)` expects NP. Passing
`average_watts` skips the `effective_power ?? normalized_power` tier entirely
and systematically underestimates stress for variable-effort rides (avg < NP
always). The *main* metrics path in the same file (line 189) correctly uses the
shared `estimateActivityTSS`; only `weeklyStats` and the two coach-context
builders use this divergent inline tiering. So on /train, the weekly TSS number
and the CTL chart can disagree about the same ride.

### B7 — Dead component with wrong math: RampRateBadge [verified]
`src/components/RampRateAlert.jsx:245-257`

`RampRateBadge` computes "CTL" as a weighted sum
`Σ tss·e^(−(n−i−1)/42) × (1/42)` — a different quantity from the iterative EWMA
used by `RampRateAlert` twenty lines above (and everywhere else). It is
imported by TrainingDashboard but **never rendered** — dead code today, a
landmine tomorrow. Delete it (or make it call `calculateCTLAtDay`).

Also dead with divergent math (flagged, verified as unmounted by import search):
`src/components/FormWidget.jsx` (own estimator reading nonexistent
`normalized_power_watts` columns, FTP hardcoded 200) and
`src/views/today/shared/FitnessBars.jsx`.

---

## 2. Cross-surface consistency — same number, different derivation

The fitness/fatigue/form triple is derived through **eight independent code
paths**. The table shows what each live surface actually does:

| Surface | Path | Server-preferred? | τ | Notes |
|---|---|---|---|---|
| `/today` (Spine) | `getTodaySpine.ts` inline EWA | Yes | 42/7 hardcoded | Copy of A with drift (B2) |
| `/today/glance`, legacy Today | `athleteMetrics.buildAthleteMetrics` | Yes | 42/7 hardcoded | Reference client impl |
| `/today/legacy` (Dashboard) | `Dashboard.jsx:304-406` inline | Yes | 42/7 hardcoded | Walks forward from latest server row |
| `/train` (TrainingDashboard) | `calculateCTL/ATL/TSB` over 90 days | **No** | 42/7 | Cold-start at 0 → ~12% steady-state undercount (per duality memo) |
| `/train` chart | `TrainingLoadChart.jsx` own EWA | **No** | 42/7 | Recomputes from the `dailyTSSData` array |
| `/progress` | `FitnessProgressChart.jsx` | Both, side by side | 42 + adaptive | Deliberate (client "CTL" vs server "TFI" lines) |
| HistoricalInsights | `computeWeeklySnapshots` | **No** | 42/7 | Client-only weekly EWA |
| Coach prompts | `enhancedContext.js` | Server **only** | n/a | Reads `training_load_daily` directly |
| Server writers | `trainingLoad.js`/`fitnessSnapshots.js` | — | **adaptive** (`user_profiles.tfi_tau/afi_tau`) | Terrain + MTB multipliers |

Concrete user-visible consequences:

1. **`/train` shows a lower CTL than `/today`** for the same rider: no server
   preference (misses terrain/MTB/adaptive-τ effects), 90-day window with
   cold-start at 0 (the duality memo quantifies this at ~12% steady-state, more
   for MTB/no-power riders). This is exactly the known "TFI duality"
   (`docs/tfi-duality-decision.md`, option (a) recommended, decision pending).
   The Today surfaces and Dashboard have since been made server-preferred;
   **TrainingDashboard, TrainingLoadChart, and HistoricalInsights were not.**
2. **The AI coach can discuss numbers the user isn't looking at.**
   `enhancedContext.js` feeds the coach server TFI/AFI/FS; on `/train` the user
   sees client-computed CTL/ATL/TSB (path D). Meanwhile
   `TrainingDashboard.jsx:2136` feeds its *own* path-D numbers into a *different*
   coach context, labeled `CTL:/ATL:/TSB:`.
3. **Adaptive τ is honored only at write time.** Every client EWA and every
   projection engine (`tsb-projection.ts`, `sequencerProjection.js`,
   `tfiProjection.js`) hardcodes 42/7. For an athlete ≥45 (τ_tfi≈46, τ_afi≈8+),
   client-filled tail days and all projections use different dynamics than the
   stored history they extend. (Freeze forbids renaming these files' internals;
   it does not forbid making them *read* τ — but that's a scoped enhancement,
   listed in §7.)
4. **Planned-workout stress reads three ways:** `target_rss ?? target_tss`
   (correct: `getToday.ts`, `getTodaySpine.plannedRowRSS`, Dashboard weekStats),
   `target_tss` only (`AICoach.jsx`), and nonexistent `.tss` (B4/B5).

Formula correctness across the duplicates: the TSS power formula
(`hours × IF² × 100`, 8 copies), the EWMA step (`x += (rss−x)/τ`, ~14 copies,
including `tfiProjection.js`'s algebraically-identical
`tfi·(1−1/τ) + rss/τ`), and the EP 30-second rolling 4th-power (2 copies) were
each checked and are **mutually consistent and spec-correct** — with the sole
exceptions already listed (B7's convolution, B6's avg-watts input).

---

## 3. Verdict-band inconsistencies (same value → contradictory words)

### Form Score words — five live band systems, none matching spec §5 [verified for the two main ones]

| FS = +18 | Surface | Verdict |
|---|---|---|
| `lib/fitness/translate.ts:28-34` (`>15` → gold) | Dashboard StatusBar | **"Tapered — ready to go"** (positive) |
| `todayVocabulary.ts:57-62` (`≥15` → gray) | Today/Glance/Spine cells | **"Stale"** (negative) |

The same rider is simultaneously told they're primed and stale. Further band
sets: `getTodaySpine.formWord` (10/5/−5/−20), `athleteState.formVerdict`
(15/5/−10/−20), `interpretTSB` in `trainingPlans.ts` (25/5/−10/−30, used on
/train), plus the orphaned `FormWidget`. **None** match spec §5's color zones
(>+20 yellow "too fresh", +10..+20 blue fresh, −5..+10 grey, −30..−5 green
optimal, <−30 red). Either the spec's table is stale or every implementation
is — this needs one decision and one shared module (`src/utils/formBands.ts`
already exists and would be the natural home).

### EFI / TCAS words — two band systems
`lib/metrics/translate.ts` (cuts at 40/60/80) vs `todayVocabulary.ts`
(35/60/85 for EFI, 30/60/85 for TCAS). EFI 82 reads "Dialed in" on the
Dashboard's ProprietaryMetricsBar but "On track" on Today.

---

## 4. Label/terminology drift vs spec §5/§6

The B8 relabel shipped, but surfaces built after it regressed:

- **The canonical `/today` Spine uses legacy jargon**: `FitnessNode.tsx`
  "FORM · TSB" (:198), "CTL · FITNESS" / "ATL · FATIGUE" (:292-294), "CLICK FOR
  CTL / ATL DETAIL" (:307), "CTL · 42-DAY FITNESS" / "ATL · 7-DAY FATIGUE"
  (:382,390); `SpinePanel.tsx` legend "FITNESS · CTL", "DAILY TSS" (:166-168).
  The values rendered are TFI/AFI. [verified]
- **`/train` is entirely legacy-labeled**: TrainingLoadChart legend
  "CTL (Fitness)" / "ATL (Fatigue)" / "TSB (Form)" / "Daily TSS"; chart legend
  "Fitness (CTL)" / "Fatigue (ATL)" (`TrainingDashboard.jsx:1580-1584`);
  FitnessMetricsBar "CTL:" / "ATL:" (:2094,2105); TodaysFocusCard "TSB: +N"
  (:1303); RampRateAlert copy "+N TSS/week". [verified]
- **Per-ride analysis** (`ActivityMetrics.jsx`): "NP", "IF", "TSS", "VI"
  labels throughout.
- **Planner**: "N TSS" chips (`WorkoutCard.tsx`, `WorkoutModal.tsx`,
  `WeekSummaryGrid`, `AICoach.jsx:855`).
- **Coach prompt contexts include trademarked abbreviations**:
  `CoachPanel.tsx:36-44` sends "Form Score (TSB) … TFI (CTL) … AFI (ATL)";
  `TrainingDashboard.jsx:2136` sends raw "CTL/ATL/TSB". Spec §6.1 says coach
  text must never use them; priming the prompt with them invites echoes.
- **Decimals**: spec §5 wants TFI/AFI/FS shown with 1 decimal; every surface
  rounds to integers. (Minor; may be a deliberate product choice — decide once
  and update the spec if so.)

By contrast, Dashboard `StatusBar.jsx` is fully compliant (FS/TFI/AFI labels,
`~` prefix + muted styling below the 0.85/0.60 confidence thresholds).

---

## 5. Zone-model inconsistencies

Three power-zone boundary sets coexist:

| Model | Zones | Z4-ish cut | Used by |
|---|---|---|---|
| `trainingPlans.ts TRAINING_ZONES` | 5 + Sweet Spot | Z4 95–105% | training pages, workout targets |
| `src/services/ftp.js calculateZones` | 7 (Coggan) | threshold 94–105% | FTP service / settings-adjacent |
| `RideZonesChart.jsx computePowerZones` | 5, hardcoded 55/75/90/105 | 90–105% | activity detail chart |
| `ActivityMetrics.getIFZone` | IF cuts 0.55/0.75/0.90/1.05/1.20 | — | per-ride IF badge |

A ride at 92% FTP is Z3 ("Tempo") in one model, sweet spot in another, Z4 in the
chart. HR zones similarly have three bases: Karvonen %HRR
(`fatigue-estimation.ts`), %maxHR Coggan-style (`advancedRideAnalytics.js`,
`RideZonesChart`), and naive maxHR fractions (`rideAnalysis.js`). FTP estimation
has a rigorous implementation (`advancedRideAnalytics.estimateDynamicFTP`) and a
crude `avgPower × 1.15` (`rideAnalysis.estimateFTP`).

(Not verified in this pass: which model the DB trigger behind
`user_profiles.power_zones` uses — worth checking before unifying.)

---

## 6. What checks out (no action)

- **Core formulas are spec-correct where implemented**: TSS/RSS power formula
  (all copies), EP 30s-rolling 4th-power (both copies, device value preferred),
  RI = EP/FTP, EWMA step, FS-confidence weights `[.30,.20,.15,.12,.10,.08,.05]`,
  adaptive-τ age brackets (both TS and JS copies), terrain multiplier
  (`gradient × steep × vam`, capped 1.40) with the D4 scoping (kJ/inferred
  tiers only), MTB ×1.3, and the D1 6-tier / D2 calibrated-confidence source
  model in `estimateTSSWithSource`. `deriveTss` is pinned by tests
  (IF 1.0 → 100 etc.).
- **Ingestion dual-writes** (Strava, Garmin, FIT upload) populate canonical +
  legacy columns per the freeze policy — spot-checked `strava-webhook.js`
  (:413-414 etc.).
- **`estimateActivityTSS` (client) and `estimateTSSWithSource` (server)** agree
  tier-for-tier except the *documented* terrain/MTB/τ gaps (duality memo) and
  the Tier-3 fallback bug (B3).
- The `/internal/metrics-audit` endpoint's fixed-τ same-day-TSB math is
  **intentional** (documented TrainingPeaks-equivalent baseline), not a bug.

---

## 7. Recommended fixes, prioritized

**P0 — small, unambiguous, freeze-compliant — ✅ FIXED (2026-07-08, this branch):**
1. B1 ✅: the fake tile now shows a real 4-week CTL delta (same iterative EWA
   as RampRateAlert), labeled "Fitness change (4 weeks)".
2. B4 + B5 ✅: IntelligenceCard and WeekSummaryGrid read
   `target_rss ?? target_tss`; AICoach's two `planned_workouts` insert sites
   now dual-write `target_rss` alongside `target_tss` (freeze rule 2).
3. B3 ✅: Tier 3 reads `effective_power ?? normalized_power`; regression
   tests added in `fitnessSnapshots.test.js`. (The optional backfill of
   `activities.effective_power` remains open — item 11.)
4. B2 ✅: Spine FS now uses the prior day's TFI/AFI for every day (past loop
   and future projection), preferring a server row's stored `form_score` for
   its own date; regression tests added in `getTodaySpine.test.ts`.
5. B7 ✅: `RampRateBadge`, `FormWidget.jsx`, `FitnessBars.jsx` deleted.
6. B6 ✅: TrainingDashboard's weeklyStats and both coach-context builders use
   the shared `estimateActivityTSS`; `calculateTSS`/`estimateTSS` imports
   removed.

**P1 — needs a product/owner decision first:**
7. **One Form-band authority.** Decide the canonical FS bands (spec §5 vs
   `todayVocabulary` vs `translate.ts`), put them in one module, delete the
   rest. Same for EFI/TCAS words.
8. **Finish the duality memo's option (a)** for `/train` +
   HistoricalInsights (server-preferred with client fallback). Blocked on the
   memo's prerequisite CSV pull from `/internal/metrics-audit`.
9. **Relabel the Spine and /train** per spec §5 (Fitness/TFI, Fatigue/AFI,
   Form/FS, Ride Stress/RSS) — and scrub CTL/ATL/TSB from coach prompt contexts.
10. **Zone unification** — pick one power-zone and one HR-zone model; needs the
    DB-trigger check first.
11. Optionally: backfill `activities.effective_power` from `normalized_power`
    (data-only UPDATE; complements fix 3).

**Explicitly out of scope (freeze):** column renames, migrations 074–080,
internal JS identifier renames in `trainingPlans.ts` / `tsb-projection.ts`.
