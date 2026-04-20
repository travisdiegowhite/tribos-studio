# Tribos Training Stats Reference

Quick reference for planning sessions. For full formulas see `TRIBOS_METRICS_SPECIFICATION.md`.

---

## Naming — Legacy → Canonical

| Legacy | Tribos Name | Abbrev | DB column | JS variable |
|--------|------------|--------|-----------|-------------|
| TSS | Ride Stress Score | RSS | `rss` | `rss` |
| CTL | Training Fitness Index | TFI | `tfi` | `tfi` |
| ATL | Acute Fatigue Index | AFI | `afi` | `afi` |
| TSB | Form Score | FS | `form_score` | `formScore` |
| NP | Effective Power | EP | `effective_power` | `effectivePower` |
| IF | Ride Intensity | RI | `ride_intensity` | `rideIntensity` |
| FTP | FTP | FTP | `ftp` | `ftp` |

Code is in dual-write phase: DB has both columns; readers use `rss ?? tss`, `tfi ?? ctl`, etc. Internal JS variable names still use legacy identifiers pending §3b sweep.

---

## Core Load Metrics

### RSS — Ride Stress Score
`RI² × duration_hours × 100 × terrain_multiplier` (× 1.3 for MTB)

**Source tier cascade** (`api/utils/fitnessSnapshots.js:estimateTSSWithSource`):

| Tier | Source tag | Confidence | Condition |
|------|-----------|-----------|-----------|
| 1 | `device` | 0.95 | stored `rss` on activity |
| 2 | `hr` | 0.65 | running activity (pace/HR heuristic) |
| 3 | `power` | 0.95 | `effective_power` + FTP |
| 4 | `kilojoules` | 0.75 / 0.50 | kJ + duration (with/without FTP) |
| 5 | `inferred` | 0.40 | duration + elevation + avg watts |

TS client (`src/lib/training/fatigue-estimation.ts:estimateTSS`) has a parallel cascade: power → HR stream (Edwards TRIMP, calibrated 0.55–0.80) → avg HR → RPE → type inference.

Terrain multiplier (`gradientFactor × steepFactor × vamFactor`, capped 1.40) applies **only** to kilojoules and inferred tiers (D4).

**Tables:** `training_load_daily.rss`, `activities.rss`

---

### TFI — Training Fitness Index
`TFI_today = TFI_yesterday + (RSS_today − TFI_yesterday) / τ_tfi`

τ_tfi = `42 × ageFactor × historyFactor` (historyFactor 1.05 if 6-month TFI variance > 20; NULL age defaults to 42).

Age brackets: <30 → 0.90, <45 → 1.00, <55 → 1.10, ≥55 → 1.20

**Calc files:** `api/utils/fitnessSnapshots.js:calculateCTL`, `api/utils/adaptiveTau.js:calculateTFITimeConstant`, `src/lib/training/adaptive-tau.ts`

**Tables:** `training_load_daily.tfi`, `user_profiles.tfi_tau`

---

### AFI — Acute Fatigue Index
`AFI_today = AFI_yesterday + (RSS_today − AFI_yesterday) / τ_afi`

τ_afi = `7 × ageFactor × loadFactor` (loadFactor 1.10 if TFI > 100; NULL age defaults to 7).

Age brackets: <30 → 0.85, <45 → 1.00, <55 → 1.15, ≥55 → 1.30

**Calc files:** `api/utils/fitnessSnapshots.js:calculateATL`, `api/utils/adaptiveTau.js:calculateAFITimeConstant`

**Tables:** `training_load_daily.afi`, `user_profiles.afi_tau`

---

### FS — Form Score
`FS = TFI_yesterday − AFI_yesterday` (yesterday's values — readiness going INTO today)

Confidence: weighted avg of last 7 days RSS confidence, weights `[0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.30]` (oldest → newest).

Display labels (from `src/lib/fitness/translate.ts:translateTSB`):

| Range | Label | Color token |
|-------|-------|-------------|
| > 15 | Tapered — ready to go | gold |
| 3 to 15 | Primed to perform | gold |
| −10 to 2 | Training sweet spot | teal |
| −20 to −10 | Digging in | orange |
| < −20 | In the hole | coral |

Show `~` prefix when `fs_confidence < 0.85`.

**Calc files:** `api/utils/trainingLoad.js`, `api/utils/fitnessSnapshots.js:calculateFormScoreConfidence`

**Tables:** `training_load_daily.form_score`, `training_load_daily.fs_confidence`

---

## Per-Activity Power Metrics

### EP — Effective Power
30s rolling avg of power stream → 4th-power mean → 4th root. Filters coasting (power=0, speed>5 km/h).

**Current state:** populated from provider NP (`weighted_average_watts` from Strava, stored NP from FIT). Stream-based recompute is implemented in `filterZeroPowerPoints` but not wired to ingestion (deferred §2c).

**Calc file:** `api/utils/advancedRideAnalytics.js`  **Table:** `activities.effective_power`

### RI — Ride Intensity
`RI = EP / FTP`  **Table:** `activities.ride_intensity`

### VI — Variability Index
`VI = EP / avg_power`  **Table:** `activities.ride_analytics.variability_index` (JSONB)

### EF — Efficiency Factor
`EF = EP / avg_HR`  **Table:** `activities.ride_analytics.efficiency_factor` (JSONB)

### FTP — Functional Threshold Power
Set manually or estimated: 95% of best 20-min power, or 75% of best 5-min power.

**Calc file:** `api/utils/advancedRideAnalytics.js:estimateDynamicFTP`  **Table:** `user_preferences.ftp`

---

## Proprietary Metrics

### TWL — Terrain-Weighted Load
`TWL = RSS × mTerrain`  
`mTerrain = 1 + 0.10 × min(1.5, vam/1000) + 0.03 × GVI + 0.05 × max(0, (meanElevM − 1000) / 1000)`

GVI (Gradient Variability Index) = std dev of smoothed grade stream.

**Calc files:** `api/utils/metricsComputation.js:computeTWLFromActivity`, `src/lib/metrics/twl.ts`  
**Table:** `activity_twl`

### EFI — Execution Fidelity Index
`EFI = (0.30 × VF + 0.40 × IFS + 0.30 × CF) × 100` (0–100)

- **VF** (Volume Fidelity): 1.0 if actual/planned RSS is 0.85–1.10; tapers outside that band
- **IFS** (Intensity Fidelity): `1 − Σ(zone_weight × |planned_zone% − actual_zone%|) / 2.8`, zone weights Z1:0.5 Z2:1.5 Z3:1.0 Z4:1.2 Z5:1.3
- **CF** (Consistency Fidelity): 28-day rolling avg of `min(1, actual / (0.85 × planned))`

**Calc files:** `api/utils/metricsComputation.js:computeEFIFromData`, `src/lib/metrics/efi.ts`  
**Table:** `activity_efi` (session score + `efi_28d`)

### TCAS — Training Capacity Acquisition Score
`TCAS = clamp((0.55 × HE + 0.45 × AQ) × TAA × 50, 0, 100)`

- **HE** (Hours Efficiency): `min(2, (TFI_now − TFI_6w_ago) / 6 / (weeklyHours × 0.30))`
- **AQ** (Adaptation Quality): `0.40 × EFT + 0.30 × ADI + 0.30 × PPD` (capped 1.2)
  - EFT: efficiency factor trend; ADI: aerobic decoupling improvement; PPD: 20-min peak power development
- **TAA** (Training Age): `1 + 0.05 × yearsTraining`

Requires ≥8 weeks of history.

**Calc files:** `api/utils/metricsComputation.js`, `src/lib/metrics/tcas.ts:computeTCAS`  
**Table:** `weekly_tcas`

---

## Supporting Analytics

All computed in `api/utils/advancedRideAnalytics.js`, stored in `activities.ride_analytics` (JSONB), surfaced in coach context only (not displayed in primary UI).

| Metric | Brief |
|--------|-------|
| Training Monotony | `mean(daily_RSS_7d) / stddev(daily_RSS_7d)` — >1.5 watch; >2.0 + strain >5000 = high risk |
| Training Strain | `weekly_RSS × monotony` |
| Running rTSS | Pace + HR + elevation heuristic, ~60 rTSS/hr base; `fitnessSnapshots.js:estimateRunningTSS` |
| HR Zones | 5-zone Edwards model (% max HR); time + avg HR per zone |
| Pacing | Split ratio, power fade %, quarterly NP; strategy classification |
| MMP Progression | Best power at 5s/1m/5m/10m/20m/60m, 90-day rolling |
| Cadence | Avg, peak, coasting %, distribution by rpm bucket |
| Fatigue Resistance | Q4/Q1 avg power ratio; cardiac drift |
| Terrain class | `flat` <8 m/km, `rolling` <15, `hilly` <25, `mountainous` ≥25 |

---

## Where Stats Are Displayed

| Route | Component | Stats shown | UI label | Data field |
|-------|-----------|-------------|----------|------------|
| `/` | `StatusBar.jsx` | TFI, AFI, FS, Trend | FITNESS / FATIGUE / FORM / TREND | `tfi ?? ctl`, `afi ?? atl`, `form_score ?? tsb` |
| `/` | `FitnessBars.jsx` | TFI, AFI, FS | bar widths + colour | same |
| `/` | `FitnessCurveChart.jsx` | TFI, AFI, FS (6-week) | labeled axes | same |
| `/` | `YesterdayTodayAhead.jsx` | Yesterday RSS, today target | "RSS [n]" | `rss ?? tss`, `target_tss` |
| `/` | `ProprietaryMetricsBar.tsx` | EFI 28d, TCAS 6w | "EFI 28-day" / "TCAS 6-week" | `efi.score`, `tcas.score` |
| `/` | `FSTargetBadge.tsx` | FS target for next race | race-type chip | `race_goals` + `form_score` — **not yet wired (§2b)** |
| `/train` | `PeriodizationView.tsx` | Planned vs actual RSS per week | weekly bars | `plannedTSS` / `actualTSS` |
| `/train` | `PlanCalendarOverview.tsx` | RSS heat tint per workout | bg colour | `target_tss` |
| `/train` | `CheckInWeekBar.tsx` | Daily planned vs actual RSS | day-by-day | `target_tss` / `rss ?? tss` |
| `/train` tab trends | `TrainingDashboard.jsx` | TFI, AFI, FS 90-day | labeled lines | `tfi ?? ctl`, `afi ?? atl`, `form_score ?? tsb` |
| `/train` tab coach | `DeviationCard.tsx` | RSS delta, projected FS | "+n RSS over planned" | `rss`, projected `form_score` |
| Activity detail | `ActivityMetrics.jsx` | EP, RI, VI, RSS, avg/max power, W/kg | EP / RI / VI labels | `effective_power ?? normalized_power`, `ride_intensity ?? intensity_factor`, `rss ?? tss` |
| `/metrics` | `MetricsCalculatorPage.tsx` | EFI, TWL, TCAS interactive | sliders | educational only |

---

## Translation Layer

`src/lib/fitness/translate.ts` — pure functions, no API calls:

| Function | Input | Output |
|----------|-------|--------|
| `translateCTL(ctl)` | TFI value | label + color (e.g. "Solid fitness") |
| `translateATL(atl, ctl)` | AFI + TFI (ratio-based) | label + color (e.g. "Legs are fresh") |
| `translateTSB(tsb)` | FS value | label + color (see FS table above) |
| `translateTrend(ctlDeltaPct, ctl)` | 4-week CTL % change | direction + subtitle |
| `translateTSS(tss)` | Single-ride RSS | label (e.g. "Big day") |

Note: function names still use legacy identifiers pending §3b sweep.

---

## Key Calculation Files

| File | Responsibility |
|------|---------------|
| `api/utils/fitnessSnapshots.js` | RSS estimation (5-tier), TFI/AFI EWA, FS confidence, terrain classification |
| `api/utils/adaptiveTau.js` | Per-user τ_tfi / τ_afi computation + nightly upsert |
| `api/utils/trainingLoad.js` | `upsertTrainingLoadDaily` — writes TFI, AFI, FS, rss_source |
| `api/utils/metricsComputation.js` | TWL, EFI (+ auto-match), triggers TCAS |
| `api/utils/advancedRideAnalytics.js` | EP, VI, EF, MMP, pacing, cadence, monotony/strain |
| `src/lib/training/fatigue-estimation.ts` | Client-side RSS estimation (4-tier), terrain multiplier |
| `src/lib/training/adaptive-tau.ts` | TS mirror of adaptive tau formulas |
| `src/lib/training/tsb-projection.ts` | Forward FS simulation for deviation cards |
| `src/lib/metrics/twl.ts` | TWL formula (TS) |
| `src/lib/metrics/efi.ts` | EFI formula (TS) |
| `src/lib/metrics/tcas.ts` | TCAS formula (TS) |
| `src/lib/fitness/translate.ts` | Display labels + color tokens |

---

## Known Gaps / Deferred Work

| Item | Status | Reference |
|------|--------|-----------|
| EP stream-based recompute | Implemented, not wired to ingestion | §2c, `METRICS_ROLLOUT_REMAINING.md` |
| `tfi_composition` wiring | Function exists, not called from `upsertTrainingLoadDaily` | §2a |
| `FSTargetBadge` | Component built, not wired to dashboard | §2b |
| `tfi_tau`/`afi_tau` on daily rows | Columns exist, not passed in upsert payload | §2d |
| Legacy JS identifier sweep | `tss/ctl/atl/tsb` internal vars still in src/ + api/ | §3b |
| `tsb-projection.ts` internals rename | `ProjectionState.{ctl,atl,tsb}` still use legacy keys | §3a |
| Legacy DB column drops | 6 tables in dual-write; DROP blocks commented out | §1a–§1f |

Full sequenced PR list: `docs/METRICS_ROLLOUT_REMAINING.md`
