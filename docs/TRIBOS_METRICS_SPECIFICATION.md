# Tribos Metrics System — Canonical Specification
**For Claude Code: Read this entire document before touching any metric-related code.**

## 0. Why This Document Exists

Tribos has migrated away from TrainingPeaks trademarked terminology (TSS, CTL, ATL, TSB, NP, IF). All metric names, abbreviations, DB columns, TS variables, and UI labels must use the Tribos-canonical system defined here. FTP is retained — it is scientific literature terminology. This is not a cosmetic rename; several calculations have been enhanced. Every formula below is the single source of truth.

## 1. Audit Requirement — Read Before Coding

Before any changes, audit the codebase for: `tss`/`TSS`, `ctl`/`CTL`, `atl`/`ATL`, `tsb`/`TSB`, `normalizedPower`/`normalized_power`/`NP`, `intensityFactor`/`intensity_factor`/`IF`. Search `/src/**/*.ts(x)`, `/supabase/functions/**/*.ts`, `/supabase/migrations/**/*.sql`, any `.d.ts`, and `CLAUDE.md`/`AGENTS.md`/`README.md`. For each hit: note file/line, classify (calculation/DB column/variable/label/comment), apply Section 2 rename, verify calculation matches Section 3.

## 2. Name & Abbreviation Mapping

| Old Term (Trademarked) | Tribos Name | Abbrev | DB Column | TS Variable |
|---|---|---|---|---|
| TSS — Training Stress Score | **Ride Stress Score** | **RSS** | `rss` | `rss` |
| CTL — Chronic Training Load | **Training Fitness Index** | **TFI** | `tfi` | `tfi` |
| ATL — Acute Training Load | **Acute Fatigue Index** | **AFI** | `afi` | `afi` |
| TSB — Training Stress Balance | **Form Score** | **FS** | `form_score` | `formScore` |
| NP — Normalized Power | **Effective Power** | **EP** | `effective_power` | `effectivePower` |
| IF — Intensity Factor | **Ride Intensity** | **RI** | `ride_intensity` | `rideIntensity` |
| FTP — Functional Threshold Power | **FTP** | **FTP** | `ftp` | `ftp` ✅ retain |

### Existing Tribos Proprietary Metrics — Retain As-Is

| Metric | Abbrev | DB Column |
|---|---|---|
| Terrain-Weighted Load | TWL | `twl` |
| Execution Fidelity Index | EFI | `efi` |
| Training Capacity Acquisition Score | TCAS | `tcas` |

## 3. Canonical Calculations

### 3.1 RSS — Ride Stress Score

RSS is terrain-aware by default. TWL is not a separate post-hoc adjustment — it is baked into RSS. A flat 1-hour ride at exactly FTP = RSS 100.

```typescript
function calculateRSS(
  durationSeconds: number,
  effectivePower: number,  // EP, via calculateEP()
  ftp: number,
  terrainMultiplier: number  // from calculateTerrainMultiplier()
): number {
  const durationHours = durationSeconds / 3600;
  const ri = effectivePower / ftp;
  const baseRSS = ri * ri * durationHours * 100;
  return baseRSS * terrainMultiplier;
}

function calculateTerrainMultiplier(
  averageGradientPercent: number,
  percentAbove6Percent: number,
  vam: number,                   // vertical ascent m/hour, 0 if flat
  elevationPerKm: number
): number {
  const gradientFactor = 1 + (averageGradientPercent * 0.015);
  const steepFactor = 1 + (percentAbove6Percent * 0.002);
  const vamFactor = vam > 0 ? 1 + (vam / 10000) : 1.0;
  const multiplier = gradientFactor * steepFactor * vamFactor;
  return Math.min(multiplier, 1.40);  // cap prevents outlier inflation
}

// MTB sessions receive additional 1.3x multiplier on top of terrain.
// Tribos normalizes Garmin MOUNTAIN_BIKING and Wahoo mountain_biking to
// Strava's MountainBikeRide at ingestion, so a single check suffices.
function applyActivityTypeMultiplier(rss: number, activityType: string): number {
  if (activityType === 'MountainBikeRide') return rss * 1.30;
  return rss;
}
```

**When power data unavailable**, fall back in order:
1. HR-based: `rss = hrss * calibration_factor` (`fatigue_calibration.trimp_to_tss`)
2. RPE-based: `rss = sRPE_score * calibration_factor` (`fatigue_calibration.srpe_to_tss`)
3. Inferred: duration-based at assumed RI 0.65

Record source in `training_load_daily.rss_source` — **6 tiers (D1 locked, differs from original 4-tier spec)**:

| `rss_source` | Method | `confidence` |
|---|---|---|
| `device` | Stored RSS from the activity file | 0.95 |
| `power` | EP + FTP formula | 0.95 |
| `kilojoules` | kJ + duration (with FTP) | 0.75 |
| `kilojoules` | kJ + duration (no FTP, FTP=200 assumed) | 0.50 |
| `hr` | HR-based TRIMP / running pace estimate | 0.65 |
| `rpe` | Foster session-RPE (TS client only) | 0.50 |
| `inferred` | Duration + elevation + avg watts heuristic | 0.40 |

*(D2 locked — calibrated values, not the original 0.25 floor)*

### 3.2 EP — Effective Power

```typescript
function calculateEP(powerDataPoints: number[]): number {
  if (powerDataPoints.length < 30) return average(powerDataPoints);
  // Step 1: 30-second rolling average
  const rollingAvg = powerDataPoints.map((_, i) => {
    const window = powerDataPoints.slice(Math.max(0, i - 29), i + 1);
    return average(window);
  });
  // Step 2: 4th power, mean, 4th root
  const fourthPowers = rollingAvg.map(p => Math.pow(p, 4));
  const meanFourthPower = average(fourthPowers);
  return Math.pow(meanFourthPower, 0.25);
}
```

**Zero-power handling:** Filter points where `power === 0` AND GPS shows motion >5km/h before rolling avg. Removes coasting without removing intentional recovery intervals.

> **Current implementation:** `activities.effective_power` is populated
> from provider-computed NP (`weighted_average_watts` from Strava; stored NP
> from FIT files). The zero-power-filter + 30s rolling + 4th-power mean
> approach above is implemented in `filterZeroPowerPoints` / `recomputeEffectivePower`
> (exported from both `api/utils/fitnessSnapshots.js` and
> `src/lib/training/fatigue-estimation.ts`) but **not yet wired into
> ingestion**. Scope this as a separate spike — see §2c in
> `docs/METRICS_ROLLOUT_REMAINING.md`.

### 3.3 RI — Ride Intensity

```typescript
function calculateRI(effectivePower: number, ftp: number): number {
  return effectivePower / ftp;
}

// Duration context — for AI coaching only, not stored separately.
function getRIDurationContext(ri: number, durationHours: number): string {
  if (durationHours < 0.5)  return 'short_effort';
  if (durationHours < 1.5)  return 'standard_effort';
  if (durationHours < 3.0)  return 'long_effort';
  return 'ultra_effort';
}
// Pass both ri and context into coaching prompts — RI 0.85 for 'ultra_effort' vs 'short_effort' is physiologically very different.
```

### 3.4 TFI — Training Fitness Index

Adaptive time constant based on athlete profile (not fixed 42).

```typescript
function calculateTFITimeConstant(age: number, tfiVariance6Months: number): number {
  let ageFactor: number;
  if (age < 30)       ageFactor = 0.90;
  else if (age < 45)  ageFactor = 1.00;
  else if (age < 55)  ageFactor = 1.10;
  else                ageFactor = 1.20;
  const historyFactor = tfiVariance6Months > 20 ? 1.05 : 1.00;
  return Math.round(42 * ageFactor * historyFactor);
}

function calculateTFI(previousTFI: number, todayRSS: number, tauTFI: number): number {
  return previousTFI + (todayRSS - previousTFI) * (1 / tauTFI);
}
```

**TFI Composition Tracking** — store alongside TFI:

```typescript
// Stored in training_load_daily.tfi_composition (jsonb).
// Used by AI coaching to characterize TYPE of fitness, not just amount.
interface TFIComposition {
  aerobic_fraction: number;         // RSS-weighted fraction from Z1 + Z2
  threshold_fraction: number;       // RSS-weighted fraction from Z3 + Z4
  high_intensity_fraction: number;  // RSS-weighted fraction from Z5 + Z6 + Z7
}
```

Zone data source (resolved in §2a): `activities.fit_coach_context.power_zone_distribution`
(written by B5 FIT ingestion). Percentages converted to seconds via
`fit_coach_context.duration_seconds` and bucketed as above before being
RSS-weighted across the τ_tfi window. Activities without `fit_coach_context`
(pre-B5 rides, manual entries) are skipped. `computeTFIComposition()` in
`api/utils/fitnessSnapshots.js` receives raw-seconds entries and returns the
stored fractions.

> **Status:** `computeTFIComposition` exists but is not yet called from
> `upsertTrainingLoadDaily` callers — wiring is pending (§2a,
> `docs/METRICS_ROLLOUT_REMAINING.md`).

### 3.5 AFI — Acute Fatigue Index

Adaptive constant has MORE impact than TFI constant — AFI moves fast.

```typescript
function calculateAFITimeConstant(age: number, currentTFI: number): number {
  let ageFactor: number;
  if (age < 30)       ageFactor = 0.85;
  else if (age < 45)  ageFactor = 1.00;
  else if (age < 55)  ageFactor = 1.15;
  else                ageFactor = 1.30;
  const loadFactor = currentTFI > 100 ? 1.10 : 1.00;
  return +(7 * ageFactor * loadFactor).toFixed(1);
}

function calculateAFI(previousAFI: number, todayRSS: number, tauAFI: number): number {
  return previousAFI + (todayRSS - previousAFI) * (1 / tauAFI);
}

// HRV modulation — FUTURE, scaffold only. Store AFI pre-adjustment.
function applyHRVModulation(afi: number, hrvRecoveryFactor: number | null): number {
  if (hrvRecoveryFactor === null) return afi;
  return afi * hrvRecoveryFactor;
  // >1.0 = more fatigued than model thinks; <1.0 = fresher than model thinks
}
```

### 3.6 FS — Form Score

```typescript
// Uses YESTERDAY's TFI and AFI — readiness going INTO today, not after. Do not change.
function calculateFormScore(previousTFI: number, previousAFI: number): number {
  return previousTFI - previousAFI;
}

// FS Confidence — weighted avg of last 7 days RSS confidence. More recent weighted higher.
function calculateFSConfidence(last7DaysConfidence: number[]): number {
  const weights = [0.30, 0.20, 0.15, 0.12, 0.10, 0.08, 0.05];
  return last7DaysConfidence.reduce((sum, c, i) => sum + c * weights[i], 0);
}

// Event-type aware FS targets — display + coaching guidance.
const FS_TARGETS: Record<string, { min: number; max: number; label: string }> = {
  criterium:    { min: 15, max: 25, label: 'Very fresh — top-end snap required' },
  road_race:    { min: 5,  max: 20, label: 'Fresh — balance of fitness and pop' },
  gran_fondo:   { min: 0,  max: 15, label: 'Moderate — aerobic engine matters more than freshness' },
  stage_race:   { min: -5, max: 10, label: 'Slight fatigue OK — save fitness for later stages' },
  gravel_race:  { min: 5,  max: 15, label: 'Fresh — long sustained effort' },
  default:      { min: 5,  max: 20, label: 'General race readiness' },
};
```

## 4. Database Schema Changes

New Supabase migration. Do NOT modify existing migrations.

```sql
-- Migration: tribos_metrics_rename
ALTER TABLE training_load_daily RENAME COLUMN tss TO rss;
ALTER TABLE training_load_daily RENAME COLUMN ctl TO tfi;
ALTER TABLE training_load_daily RENAME COLUMN atl TO afi;
ALTER TABLE training_load_daily RENAME COLUMN tsb TO form_score;

ALTER TABLE training_load_daily
  ADD COLUMN IF NOT EXISTS rss_source text CHECK (rss_source IN ('power','hr','rpe','inferred')),
  ADD COLUMN IF NOT EXISTS tfi_composition jsonb,
  ADD COLUMN IF NOT EXISTS fs_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS tfi_tau integer DEFAULT 42,
  ADD COLUMN IF NOT EXISTS afi_tau numeric(4,1) DEFAULT 7.0;

COMMENT ON COLUMN training_load_daily.rss IS
  'Ride Stress Score: terrain-adjusted training stress (Tribos equivalent of TSS). Formula: RI² × duration_hours × 100 × terrain_multiplier.';
COMMENT ON COLUMN training_load_daily.tfi IS
  'Training Fitness Index: adaptive EWMA of RSS. Time constant personalized to athlete age and history.';
COMMENT ON COLUMN training_load_daily.afi IS
  'Acute Fatigue Index: adaptive 7-day EWA of RSS. Time constant personalized to age and current TFI.';
COMMENT ON COLUMN training_load_daily.form_score IS
  'Form Score: TFI_yesterday - AFI_yesterday. Readiness going into the day, not after training.';
COMMENT ON COLUMN training_load_daily.tfi_composition IS
  'JSON breakdown of TFI by zone: {aerobic_fraction, threshold_fraction, high_intensity_fraction}.';
COMMENT ON COLUMN training_load_daily.fs_confidence IS
  'Confidence 0.0-1.0 for Form Score, based on last 7 days RSS input quality.';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tfi_tau integer DEFAULT 42,
  ADD COLUMN IF NOT EXISTS afi_tau numeric(4,1) DEFAULT 7.0,
  ADD COLUMN IF NOT EXISTS metrics_age integer;

COMMENT ON COLUMN profiles.tfi_tau IS 'Personalized TFI time constant. Recalculated when age or 6-month variance threshold changes.';
COMMENT ON COLUMN profiles.afi_tau IS 'Personalized AFI time constant. Recalculated when age or TFI level crosses threshold.';
```

## 5. Display Rules — UI Consistency

Applies everywhere: dashboard, TODAY card, PROGRESS charts, ride recap, coach messages, tooltips, exports.

| Metric | Label | Abbrev | Decimals | Unit |
|---|---|---|---|---|
| RSS | Ride Stress | RSS | 0 | — |
| TFI | Fitness | TFI | 1 | — |
| AFI | Fatigue | AFI | 1 | — |
| FS | Form | FS | 1 | — |
| EP | Eff. Power | EP | 0 | W |
| RI | Intensity | RI | 2 | — |
| FTP | Threshold | FTP | 0 | W |
| EFI | Adherence | EFI | 0 | % |
| TCAS | Efficiency | TCAS | 1 | — |
| TWL | (retired as standalone — feeds RSS) | — | — | — |

**FS Confidence display:**
- `>= 0.85` → normal
- `0.60 <= x < 0.85` → prefix `~` (e.g., `~12.4`)
- `< 0.60` → prefix `~` + muted/italic style

**Form Score color zones:**
```
FS > +20       → Yellow  (Transition — too fresh, losing fitness)
+10 to +20     → Blue    (Fresh)
-5 to +10      → Grey    (Grey zone)
-30 to -5      → Green   (Optimal training load)
< -30          → Red     (High risk / overreached)
```

**FS target badge** — when race event within 21 days, display event-type target range from `FS_TARGETS` next to current FS. Example: `FS: 8.2  |  Target for Road Race: +5 to +20 ✓`

## 6. AI Coaching Layer — Metric Language Rules

1. **Never use trademarked abbreviations** in user-facing text. Always Tribos names.
2. **Plain English first**, abbreviation second on first reference per session.
   - ✅ "Your fitness (TFI) has grown 18% this month"
   - ❌ "Your CTL is up 12 points"
3. **RSS rarely in coach voice** — coaches talk about "ride stress" or "how hard that effort was," not a score.
4. **Always pass `ri_duration_context`** alongside RI for workout analysis.
5. **Always pass `tfi_composition`** for fitness characterization messages.
6. **Use `fs_confidence`** to soften language below 0.75:
   - High: "Your Form Score is +12 — you're primed."
   - Low: "Based on available data, your form looks around +12 — a few missed power files make this an estimate."

## 7. Consistency Verification Checklist

- [ ] `grep -ri "\.tss\b\|\.ctl\b\|\.atl\b\|\.tsb\b" src/` → zero results
- [ ] `grep -ri "\.tss\b\|\.ctl\b\|\.atl\b\|\.tsb\b" supabase/` → zero results
- [ ] Charts previously showing CTL now show TFI with correct formula
- [ ] Charts previously showing ATL now show AFI with correct formula
- [ ] TSB/Form chart uses `tfi_yesterday - afi_yesterday` (not today's)
- [ ] RSS calc in edge function matches §3.1 exactly including terrain multiplier
- [ ] EP calc in edge function matches §3.2 exactly including zero-power filter
- [ ] `tfi_tau` and `afi_tau` read from `profiles`, not hardcoded 42/7
- [ ] `tfi_composition` populated for every activity with power data
- [ ] `fs_confidence` computed and stored for every day in `training_load_daily`
- [ ] FS display shows `~` prefix when `fs_confidence < 0.85`
- [ ] FS target badge appears within 21 days of scheduled race
- [ ] CLAUDE.md and AGENTS.md updated to reflect new metric names throughout
- [ ] No coach message text contains "TSS", "CTL", "ATL", or "TSB"
- [ ] Migration runs cleanly on fresh branch without breaking existing data

## 8. What Is NOT Changing

- FTP calculation, storage, or display — retain as-is
- Coach personas: The Hammer, The Scientist, The Encourager, The Pragmatist, The Competitor. No proper names. Voice/tone only — no metric logic per persona.
- Garmin/Strava/Wahoo sync logic — only column names change at persistence layer
- Supabase project ref `xbziuusxagasizxnlwwn` — no infrastructure changes
- Vite + React Router 7 architecture — not Next.js, do not apply SSR patterns

---

*Document version: April 2026. Update whenever a metric calculation changes. This file is the single source of truth — codebase must match it, not the other way around.*
