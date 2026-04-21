# Tribos Stats Bible

**The single source of truth for every training metric in Tribos — what it is, why it exists, how it's computed, where it's stored, how it's displayed, and how to change it.**

---

## ⚠️ This document must be kept current

**Every code change that touches a metric must update this file in the same pull request.** That includes:

- Adding, renaming, or retiring a metric
- Changing a formula, constant, or time window
- Changing a source cascade, confidence weight, or tau modifier
- Adding or changing a storage table, column, or cache pattern
- Adding or changing an API endpoint that returns a metric
- Adding or changing a UI surface that displays a metric
- Changing display copy, color rules, valence, or zone bands
- Closing a known gap listed in §12

If you're writing a pull request that would make any part of this document wrong, you are writing an incomplete pull request. Update the bible in the same commit. If the change is large enough that the bible update is its own commit, that commit should land first.

This rule exists because metric drift is silent and expensive. A formula change nobody documents becomes a bug report three months later that nobody can triage. The bible is the antidote — but only if it stays true.

**Last updated:** 2026-04-20
**Maintained by:** Tribos core team (solo founder + AI coding agents)
**Applies to:** Tribos production — Vite + React Router 7 + Supabase

---

## Table of contents

1. [Metric taxonomy](#1-metric-taxonomy)
2. [Naming — legacy → canonical](#2-naming--legacy--canonical)
3. [Core load metrics](#3-core-load-metrics)
4. [Per-activity power metrics](#4-per-activity-power-metrics)
5. [Proprietary metrics](#5-proprietary-metrics)
6. [Supporting analytics](#6-supporting-analytics)
7. [Relationships & dependency map](#7-relationships--dependency-map)
8. [Where stats are displayed](#8-where-stats-are-displayed)
9. [Translation & copy layer](#9-translation--copy-layer)
10. [Color & valence rules](#10-color--valence-rules)
11. [Key calculation files](#11-key-calculation-files)
12. [Known gaps & deferred work](#12-known-gaps--deferred-work)
13. [Dual-write & migration state](#13-dual-write--migration-state)
14. [Change log](#14-change-log)
15. [Pre-flight checklist for new metrics](#15-pre-flight-checklist-for-new-metrics)
16. [How to update this document](#16-how-to-update-this-document)

---

## 1. Metric taxonomy

Tribos metrics fall into four families. Every metric belongs to exactly one family.

| Family | Purpose | Members |
|--------|---------|---------|
| **Core load** | Industry-standard training load model (Banister). Answers "how much training am I absorbing, and how fresh am I?" | RSS, TFI, AFI, FS |
| **Per-activity power** | Single-ride power analytics. Answers "how hard was that ride and how efficient was I?" | EP, RI, VI, EF, FTP |
| **Proprietary** | Tribos signals that go beyond industry standard. Each answers a distinct question the Banister model can't. | TWL, EFI, TCAS, [FAR — planned] |
| **Supporting analytics** | Deep-dive computations surfaced in coach context, not primary UI. | Monotony, Strain, MMP, HR zones, Pacing, Cadence, Fatigue Resistance, Terrain class |

**Design principle:** Every proprietary metric must answer a question no existing metric already answers. See §15 pre-flight checklist for new metrics.

---

## 2. Naming — legacy → canonical

Tribos renamed industry-standard metrics to more approachable, Tribos-branded terms. Code is in a **dual-write phase**: DB has both columns; readers use coalesce patterns (`rss ?? tss`, `tfi ?? ctl`). See §13 for migration state.

| Legacy (industry) | Tribos canonical | Abbrev | DB column | JS variable |
|-------------------|------------------|--------|-----------|-------------|
| TSS | Ride Stress Score | RSS | `rss` | `rss` |
| CTL | Training Fitness Index | TFI | `tfi` | `tfi` |
| ATL | Acute Fatigue Index | AFI | `afi` | `afi` |
| TSB | Form Score | FS | `form_score` | `formScore` |
| NP | Effective Power | EP | `effective_power` | `effectivePower` |
| IF | Ride Intensity | RI | `ride_intensity` | `rideIntensity` |
| FTP | FTP | FTP | `ftp` | `ftp` |

**Why renamed:** "CTL" / "ATL" / "TSB" are jargon that alienate newer users and hide intent. "Training Fitness Index" tells the user what the number represents without requiring them to look up an acronym. The Tribos canonical names are the only names used in user-facing copy. Code still uses legacy JS variable names pending the §3b sweep.

**Never use legacy names in:** UI copy, onboarding, coach descriptions, tooltips, marketing, documentation intended for users.

**Still OK to use legacy names in:** internal JS variables (pending rename), code comments, developer-facing error messages, literature references.

---

## 3. Core load metrics

The Banister fitness-fatigue-form model, with Tribos-canonical names and per-user adaptive time constants.

---

### 3.1 RSS — Ride Stress Score

**Question answered:** "How hard was this ride?"

**Intent:** Per-activity load quantification. Every ride, run, or indoor session gets an RSS so it can feed TFI/AFI. RSS is the atomic input to the entire load model — if RSS is wrong, every downstream metric is wrong.

**Formula:**
```
RSS = RI² × duration_hours × 100 × terrain_multiplier   (× 1.3 for MTB)
```

**Source tier cascade** (`api/utils/fitnessSnapshots.js:estimateTSSWithSource`):

| Tier | Source tag | Confidence | Condition |
|------|------------|------------|-----------|
| 1 | `device` | 0.95 | Stored `rss` on activity (trusted provider value) |
| 2 | `hr` | 0.65 | Running activity (pace/HR heuristic) |
| 3 | `power` | 0.95 | `effective_power` + FTP present |
| 4 | `kilojoules` | 0.75 / 0.50 | kJ + duration (with/without FTP) |
| 5 | `inferred` | 0.40 | Duration + elevation + avg watts only |

**TS client cascade** (`src/lib/training/fatigue-estimation.ts:estimateTSS`): power → HR stream (Edwards TRIMP, calibrated 0.55–0.80) → avg HR → RPE → type inference.

**Terrain multiplier** (`gradientFactor × steepFactor × vamFactor`, capped 1.40) applies **only** to kilojoules and inferred tiers (D4). Power-based tiers already capture terrain through actual wattage.

**Interpretation bands:**

| RSS range | Label | Notes |
|-----------|-------|-------|
| 0–40 | Easy spin | Recovery / Z1-low Z2 |
| 40–80 | Moderate | Typical endurance ride |
| 80–150 | Big day | Tempo or long endurance |
| 150–250 | Huge day | Threshold or long hard ride |
| 250–400 | Epic | Rare; century+, long race |
| 400+ | Exceptional | Validate data — likely outlier or ultra event |

**Display:** `translateTSS(tss)` in `src/lib/fitness/translate.ts`.

**Minimum data to compute:** Any single activity with duration and at least one of (power, HR, RPE, kJ).

**Data quality warnings:**
- HR-only rides (tier 2/inferred) systematically under-report RSS by ~10-20% vs. power-based.
- Rouvy indoor rides sync through Strava summary-only (no raw power stream) — currently uses device tier but lacks terrain context. See §12 for indoor accuracy work.
- Stale FTP inflates RI and therefore RSS — see FTP data quality note (§4.5).

**Valence:** Neutral. Higher RSS is not "good" or "bad" — it's descriptive.

**Storage:**
- `training_load_daily.rss` — daily aggregate
- `activities.rss` — per-activity value
- Source tag stored as `rss_source` enum

**Edge cases:**
- Missing all inputs: RSS is `null`, confidence 0, flagged for user review
- Activity < 5 minutes: RSS computed but flagged as "too short to be reliable"
- Power spikes (> 2000W sustained): filtered as data corruption before RSS computation

---

### 3.2 TFI — Training Fitness Index

**Question answered:** "How fit am I right now?"

**Intent:** The long-term accumulation of training stress, dampened to the time scale that matches physiological adaptation. Tribos-canonical name for CTL. Foundation for the Tribos fitness model — almost every other downstream metric uses TFI either as input or reference.

**Formula:**
```
TFI_today = TFI_yesterday + (RSS_today − TFI_yesterday) / τ_tfi
```

**Adaptive time constant:**
```
τ_tfi = 42 × ageFactor × historyFactor
```

- `ageFactor`: `<30 → 0.90`, `<45 → 1.00`, `<55 → 1.10`, `≥55 → 1.20`
- `historyFactor`: `1.05` if 6-month TFI variance > 20, else `1.00`
- NULL age defaults to 42 (canonical Banister)

**Why adaptive tau:** Older athletes and athletes with more variable training history adapt more slowly; the time constant should reflect that. Default 42 comes from Banister/Coggan literature; modifiers are Tribos-empirical and deserve further tuning as cohort data grows.

**Interpretation bands:**

| TFI range | Label | User context |
|-----------|-------|--------------|
| 0–20 | Building baseline | New to training or returning |
| 20–40 | Recreational | Consistent fitness, can ride for fun |
| 40–60 | Trained | Can handle structured training blocks |
| 60–80 | Competitive | Race-ready fitness |
| 80–100 | High performance | Pro/elite range |
| 100+ | Elite/WorldTour | Very rare; validate data |

**Display:** `translateCTL(ctl)` in `src/lib/fitness/translate.ts`. Always rounded to integer for display.

**Minimum data to compute:** 1 day (but meaningful only after ~42 days of consistent data to asymptote).

**Valence:** High = good (more fitness), but with context — high TFI paired with negative FS means overtrained, not "good."

**Storage:**
- `training_load_daily.tfi` — one row per user per day
- `user_profiles.tfi_tau` — cached personal tau value

**Edge cases:**
- Cold start: TFI seeds at 0, takes ~4 months to asymptote to real value — flag to user that "TFI is still calibrating" for first 90 days
- Long layoff: TFI correctly decays, but the decay rate may feel wrong to athletes with deep base — the historyFactor partially addresses this
- Data gaps: interpolate linearly for gaps ≤ 2 days; flag for gaps > 2 days (see FS confidence for downstream impact)

---

### 3.3 AFI — Acute Fatigue Index

**Question answered:** "How tired am I right now?"

**Intent:** Short-window training stress accumulation. Tribos-canonical name for ATL. Paired with TFI to produce FS.

**Formula:**
```
AFI_today = AFI_yesterday + (RSS_today − AFI_yesterday) / τ_afi
```

**Adaptive time constant:**
```
τ_afi = 7 × ageFactor × loadFactor
```

- `ageFactor`: `<30 → 0.85`, `<45 → 1.00`, `<55 → 1.15`, `≥55 → 1.30`
- `loadFactor`: `1.10` if TFI > 100, else `1.00`
- NULL age defaults to 7 (canonical Banister)

**Why adaptive tau:** Fatigue recovers more slowly with age and with higher chronic loads. The loadFactor reflects that high-CTL athletes need more recovery time per unit of acute stress.

**Interpretation bands:**

| AFI / TFI ratio | Label | Meaning |
|-----------------|-------|---------|
| < 0.7 | Fresh | Under-reaching; fatigue is much lower than fitness |
| 0.7–0.9 | Typical | Normal training balance |
| 0.9–1.1 | Accumulated | Fatigue is matching fitness; monitor |
| 1.1–1.3 | Overloaded | Short-term overload; fine briefly, concerning if sustained |
| > 1.3 | Deep fatigue | Alarm state; back off |

**Display:** `translateATL(atl, ctl)` in `src/lib/fitness/translate.ts` — display is ratio-based, not absolute.

**Minimum data to compute:** 1 day (meaningful after ~7 days).

**Valence:** Inverse — high AFI by itself is concerning, but context matters (paired with TFI and FS).

**Storage:**
- `training_load_daily.afi` — one row per user per day
- `user_profiles.afi_tau` — cached personal tau value

**Edge cases:**
- Single huge ride spikes AFI sharply; users should expect and not panic
- AFI can exceed TFI temporarily during overreach blocks; this drives FS deeply negative

---

### 3.4 FS — Form Score

**Question answered:** "Am I ready to perform today?"

**Intent:** Freshness state. Tribos-canonical name for TSB. Uses *yesterday's* values because FS represents readiness going INTO today — today's activity hasn't happened yet when the user checks the dashboard.

**Formula:**
```
FS = TFI_yesterday − AFI_yesterday
```

**Confidence score:**
```
fs_confidence = weighted_avg(last_7_days_rss_confidence,
                             weights: [0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.30])
                             (oldest → newest)
```

Display rule: prefix value with `~` when `fs_confidence < 0.85`.

**Display labels** (`src/lib/fitness/translate.ts:translateTSB`):

| FS range | Label | Color token |
|----------|-------|-------------|
| > 15 | Tapered — ready to go | gold |
| 3 to 15 | Primed to perform | gold |
| −10 to 2 | Training sweet spot | teal |
| −20 to −10 | Digging in | orange |
| < −20 | In the hole | coral |

**Minimum data to compute:** 1 day of TFI + AFI (but confidence is low until 7+ days).

**Valence:**
- High positive (> 15): good for racing, but sustained means you're losing fitness — "fresh" is not unconditionally good.
- Near zero (−5 to 5): training sweet spot; most training happens here.
- Deeply negative: necessary for building but risky if sustained > 2-3 weeks.

**Storage:**
- `training_load_daily.form_score`
- `training_load_daily.fs_confidence`

**Edge cases:**
- Low confidence: show `~` prefix and tooltip explaining the recent-data gap
- FS at race goal: `FSTargetBadge` component exists but **not yet wired** — see §12

---

## 4. Per-activity power metrics

All computed per-ride, stored on `activities` table. Require power data to be meaningful — users without power meters see reduced metric coverage.

---

### 4.1 EP — Effective Power

**Question answered:** "What was the physiologically-representative power for this ride?"

**Intent:** 30-second-smoothed, 4th-power-weighted average that represents the metabolic cost of a ride with surges and coasting. Tribos-canonical name for Normalized Power (NP).

**Formula:**
1. 30-second rolling average of power stream
2. Raise each value to the 4th power
3. Take the mean
4. Take the 4th root of the mean
5. Filter coasting points (power = 0, speed > 5 km/h)

**Current state:** Populated from provider NP values (`weighted_average_watts` from Strava, stored NP from FIT). Stream-based recompute is implemented in `filterZeroPowerPoints` but **not wired to ingestion** — see §12.

**Interpretation:** Not directly interpreted as a standalone — used as input to RI, VI, EF.

**Storage:** `activities.effective_power`

**Data quality warnings:**
- When provider NP is used (current default), any provider inconsistency propagates into EP
- Stream-based recompute will eliminate this — priority gap

---

### 4.2 RI — Ride Intensity

**Question answered:** "How hard was this ride relative to my threshold?"

**Intent:** Intensity as a fraction of FTP. Tribos-canonical name for Intensity Factor (IF). Critical input to RSS (`RSS = RI² × duration × ...`).

**Formula:**
```
RI = EP / FTP
```

**Interpretation bands:**

| RI range | Effort |
|----------|--------|
| < 0.55 | Recovery / easy |
| 0.55–0.75 | Endurance Z2 |
| 0.75–0.90 | Tempo / Sweet spot |
| 0.90–1.05 | Threshold |
| 1.05+ | Above threshold (intervals / short rides) |

**Storage:** `activities.ride_intensity`

---

### 4.3 VI — Variability Index

**Question answered:** "How steady was my pacing?"

**Intent:** Ratio of EP to average power. Low VI = steady ride (TT, flat endurance). High VI = surgey ride (crit, rolling terrain). Useful for race analysis and coaching.

**Formula:**
```
VI = EP / avg_power
```

**Interpretation:**
- `< 1.05`: Very steady (TT, trainer)
- `1.05–1.10`: Typical endurance
- `1.10–1.20`: Rolling or group ride
- `> 1.20`: Surgey (crit, CX, MTB)

**Storage:** `activities.ride_analytics.variability_index` (JSONB)

---

### 4.4 EF — Efficiency Factor

**Question answered:** "How well is my aerobic engine doing?"

**Intent:** Power-per-heartbeat ratio. Used in aerobic-endurance tracking — if EF trends up at similar RI, aerobic base is improving. Input to TCAS's EFT component.

**Formula:**
```
EF = EP / avg_HR
```

**Interpretation:** Context-dependent; best interpreted as a trend over time for a given user, not as an absolute.

**Storage:** `activities.ride_analytics.efficiency_factor` (JSONB)

---

### 4.5 FTP — Functional Threshold Power

**Question answered:** "What's my sustainable hour-long power?"

**Intent:** The anchor for nearly all power-derived metrics. Set manually by user, or estimated from activity history.

**Formula / estimation** (`api/utils/advancedRideAnalytics.js:estimateDynamicFTP`):
- 95% of best 20-minute power, OR
- 75% of best 5-minute power

**Update cadence:** Manual when user updates. Auto-estimate runs on new best-power events; does not overwrite manual values without confirmation.

**Storage:** `user_preferences.ftp`

**Data quality warnings — critical:**
- **Stale FTP is the silent killer of every power-derived metric.** If FTP is too low, RI and RSS inflate; if too high, they deflate. TFI drifts accordingly. Every metric that depends on RSS is affected.
- Users who haven't updated FTP in > 90 days should be prompted — not yet implemented (worth adding).
- Seasonal athletes with large fitness swings can have FTP wrong by 10%+ for months.

**Downstream impact of FTP error:** RI → RSS → TFI/AFI/FS → TCAS/EFI/TWL. Eleven downstream metrics depend on FTP being correct.

---

## 5. Proprietary metrics

Tribos signals beyond the Banister industry standard. Each answers a distinct question. The family is closed unless a new metric passes the §15 pre-flight checklist.

---

### 5.1 TWL — Terrain-Weighted Load

**Question answered:** "How hard was this ride accounting for the terrain I rode over?"

**Intent:** RSS assumes flat, non-technical riding for its baseline. Riding 100 RSS on rolling hills with variable grade is physiologically harder than 100 RSS on a flat time trial. TWL adjusts for that. Especially relevant for terrain-heavy events (gravel races, hilly road races, mountain events) where RSS systematically under-reports the physiological demand of the ride.

**Formula:**
```
TWL = RSS × mTerrain

mTerrain = 1
         + 0.10 × min(1.5, vam / 1000)
         + 0.03 × GVI
         + 0.05 × max(0, (meanElevM − 1000) / 1000)
```

Where `GVI` (Gradient Variability Index) = standard deviation of smoothed grade stream.

**Constants origin:** Empirically tuned within Tribos. 0.10/0.03/0.05 weights are first-pass guesses; need validation against cohort data.

**Interpretation:** TWL / RSS ratio tells the story:
- Ratio ~1.0: Flat ride, RSS captures it well
- Ratio 1.1–1.3: Rolling terrain or high VAM, meaningful terrain penalty
- Ratio > 1.3: Mountainous or very choppy, TWL is the better load measure

**Storage:** `activity_twl`

**Calc files:** `api/utils/metricsComputation.js:computeTWLFromActivity`, `src/lib/metrics/twl.ts`

**Edge cases:**
- Indoor rides: mTerrain = 1.0 (no terrain data)
- Missing grade stream: falls back to elevation-only, reduced accuracy

---

### 5.2 EFI — Execution Fidelity Index

**Question answered:** "Am I executing the training I was prescribed?"

**Intent:** Distinguishes users who follow their plan from users who improvise. A user with great fitness but low EFI is getting fit despite the plan, not because of it — that's useful coach context. High EFI + low fitness progression points at plan quality, not user compliance.

**Formula:**
```
EFI = (0.30 × VF + 0.40 × IFS + 0.30 × CF) × 100   (0–100)
```

Components:

- **VF (Volume Fidelity):** `1.0` if `actual/planned RSS ∈ [0.85, 1.10]`, tapers outside that band
- **IFS (Intensity Fidelity):** `1 − Σ(zone_weight × |planned_zone% − actual_zone%|) / 2.8`
  Zone weights: Z1:0.5, Z2:1.5, Z3:1.0, Z4:1.2, Z5:1.3 (Z2 weighted highest because polarized training depends on Z2 volume)
- **CF (Consistency Fidelity):** 28-day rolling average of `min(1, actual / (0.85 × planned))`

**Weighting origin:** 0.30/0.40/0.30 weights and zone weights are Tribos-empirical, not literature-derived. Candidates for tuning once cohort data grows.

**Interpretation bands:**

| EFI range | Label | Meaning |
|-----------|-------|---------|
| 90–100 | Dialed in | Executing plan precisely |
| 75–89 | Consistent | Small deviations, on track |
| 60–74 | Flexible | Modifying plan regularly; maybe coach-discuss |
| 40–59 | Drifting | Plan and reality are diverging |
| < 40 | Disengaged | Plan not being followed; fitness gains are despite, not because of, plan |

**Valence:** High = good (executing plan). But very high EFI + flat fitness points at plan issue, not user issue.

**Storage:** `activity_efi` (session score + `efi_28d` rolling)

**Calc files:** `api/utils/metricsComputation.js:computeEFIFromData`, `src/lib/metrics/efi.ts`

**Edge cases:**
- No plan exists: EFI undefined, show "No plan to measure against"
- Workout auto-match failed: EFI undefined for that session
- User completes unplanned activity: contributes to CF denominator penalty only

---

### 5.3 TCAS — Training Capacity Acquisition Score

**Question answered:** "Am I training efficiently for the hours I'm putting in?"

**Intent:** Time-crunched athletes want to know if they're getting maximum return on their available training hours. TCAS rewards efficient adaptations (EF trend up, decoupling improving, peak power developing) and penalizes diminishing returns. Requires power data to be meaningful.

> **Historical note (2026-04-20):** An earlier draft of a new "TCAS" metric (fitness acquisition rate, uncapped 0–130+, built from CTL trajectory alone) was speculated without consulting this reference. It would have conflicted with existing TCAS. The new concept was renamed **FAR — Fitness Acquisition Rate** (see §5.4) and TCAS stays as-is. This is why the §15 pre-flight checklist exists.

**Formula:**
```
TCAS = clamp((0.55 × HE + 0.45 × AQ) × TAA × 50, 0, 100)
```

Components:

- **HE (Hours Efficiency):** `min(2, (TFI_now − TFI_6w_ago) / 6 / (weeklyHours × 0.30))`
  Rewards TFI gain per hour of training, relative to a baseline of 0.30 TFI/hour/week as "expected."

- **AQ (Adaptation Quality):** `0.40 × EFT + 0.30 × ADI + 0.30 × PPD` (capped at 1.2)
  - **EFT (Efficiency Factor Trend):** Is EF trending up at similar RI?
  - **ADI (Aerobic Decoupling Improvement):** Is HR drift during long rides decreasing?
  - **PPD (Peak Power Development):** Is 20-minute peak power developing?

- **TAA (Training Age Adjustment):** `1 + 0.05 × yearsTraining`
  Veterans need more signal to move TCAS; newcomers adapt fast and see bigger swings.

**Minimum data:** ≥8 weeks of history required. Under 8 weeks, TCAS is undefined.

**Scale:** Clamped 0–100. This is a deliberate design choice — TCAS is "how efficient," not "how fast" — and efficiency naturally bounds at "as efficient as possible given constraints."

**Window:** 6 weeks. Cadence: weekly.

**Interpretation bands:**

| TCAS range | Label | Meaning |
|------------|-------|---------|
| 85–100 | Elite efficiency | Max return on hours |
| 70–84 | Strong efficiency | Training is productive |
| 55–69 | Good efficiency | Solid return, room to optimize |
| 40–54 | Moderate efficiency | Look at workout quality / plan fit |
| < 40 | Low efficiency | Plan or execution gap — coach attention |

**Valence:** High = good. Unlike some metrics, high TCAS has no downside.

**Storage:** `weekly_tcas`

**Calc files:** `api/utils/metricsComputation.js`, `src/lib/metrics/tcas.ts:computeTCAS`

**Data quality warnings:**
- A TCAS value in the "Low efficiency" range (< 40) for a user with partial power data coverage may reflect data gaps, not actual low efficiency. For example: users whose indoor rides sync via summary-only providers (no raw power stream) will have degraded EP and EF inputs, which suppresses TCAS artificially. When surfacing TCAS to users with incomplete power data, include an interpretation caveat.
- Requires consistent power data. HR-only users get degraded or undefined TCAS.

**Edge cases:**
- < 8 weeks history: undefined, show "Building baseline — TCAS available at 8 weeks"
- No power data: undefined, show "TCAS requires power data"
- Sudden FTP change: EF trend distorts temporarily; suppress TCAS recompute for 7 days after FTP update

---

### 5.4 FAR — Fitness Acquisition Rate

**Status:** Phase 1 (MVP, universal ceiling) shipped 2026-04-21. Feature-flagged behind `VITE_FEATURE_FAR`. Phase 2 (race projection) and Phase 3 (personalized ceiling) are pending — see `FAR_implementation_checklist.md` for remaining work.

**Question answered:** "How fast am I building fitness, and is that rate sustainable?"

**Intent:** Complement to TCAS. Where TCAS asks about *efficiency* per hour (requires power data), FAR asks about *pace* of fitness gain relative to a personal sustainable ceiling (works for any user with TFI history). Answers the dashboard's "is my fitness climbing fast enough?" question directly. Built to be the hero metric for the TODAY page — universally applicable, interpretable on a 0–130+ scale anchored to sustainable build rate.

**Distinction from TCAS:**

| Dimension | TCAS | FAR |
|-----------|------|-----|
| Question | "Am I training efficiently for my hours?" | "How fast am I building fitness?" |
| Inputs | TFI + EF + decoupling + peak power + hours | TFI only (+ profile for ceiling) |
| Scale | 0–100 clamped | 0–130+, uncapped, zoned |
| Window | 6 weeks | 28 days + 7 days momentum |
| Cadence | Weekly | Daily |
| Coverage | Needs power data | Works for any user with TFI history |
| Primary surface | `/progress` (post-FAR rollout) | `/` (TODAY hero) |

**Combinatorial coaching coverage (TCAS × FAR):**

| | **Low TCAS** | **High TCAS** |
|---|---|---|
| **Low FAR** | Inefficient + not building. Plan / execution gap. Coach focus: workout quality. | Efficient but hours-limited. Coach focus: add volume if life allows. |
| **High FAR** | Building fast but inefficient. Coach focus: watch for burnout. | Everything clicking. Coach focus: maintain. |

**Formula — Primary FAR (28-day trailing):**

```
FAR = (ΔTFI_28d / 28) × 7 / personal_ceiling_weekly_rate × 100

equivalent:
weekly_rate = ΔTFI_28d / 4
FAR = (weekly_rate / personal_ceiling_weekly_rate) × 100
```

Where:
- `ΔTFI_28d` = `TFI_today` − `TFI_28_days_ago`
- `personal_ceiling_weekly_rate` = user's sustainable build ceiling in TFI/week (see below). Defaults to `1.5` (Friel canonical) for cold-start users.
- **Reads from canonical column only:** `training_load_daily.tfi`. Does NOT coalesce to legacy `ctl`. Prerequisite for FAR: verify TFI is populated for all active users (see §12 gap).

**Formula — Momentum FAR (7-day trailing):**

```
FAR_7d = ΔTFI_7d / personal_ceiling_weekly_rate × 100
```

Momentum flag logic:

```
if FAR_7d < FAR × 0.85: "decelerating"
if FAR_7d > FAR × 1.15: "accelerating"
else:                   "steady"
```

**Clamping:** FAR is **uncapped**. Values above 100 indicate overreach; values below 0 indicate detraining. Extreme values (`> 150` or `< −50`) clamp display at the bound with a warning flag and log for investigation.

**Personal ceiling model:**

```
personal_ceiling_weekly_rate =
  base_ceiling × experience_mod × consistency_mod × age_mod
```

- `base_ceiling` = 1.5 TFI/week (Friel canonical)
- `experience_mod` = `1.0 + min(0.15, years_training × 0.01) + min(0.15, max(0, historical_peak_TFI − 40) × 0.01)`. Range `[1.00, 1.30]`.
- `consistency_mod` = computed from trailing 180-day TFI variance + long-gap count + recent training density. Range `[0.85, 1.10]`. Full formula in implementation checklist.
- `age_mod` = age bracket lookup (`<40 → 1.00`, `<50 → 0.97`, `<60 → 0.95`, `≥60 → 0.92`). `+0.02` bonus if `masters_cat ≥ 2`.

**Coefficient provenance:** All ceiling modifiers are Tribos-empirical seed values, not literature-derived. Flagged for tuning against cohort data once production signal is available.

**Recompute cadence:** Monthly cron (first of month). Profile field changes trigger on-demand recompute. Change > ±5% triggers user notification. Daily recompute is explicitly avoided — ceiling stability is a trust signal.

**Minimum data to compute:** 28 days of TFI history. Under 28 days, FAR is undefined. Personal ceiling transitions from universal (1.5) to personalized at 90 days.

**Gap handling:**

Gaps in the 28-day window are detected via `rss_source IS NOT NULL` on `training_load_daily` rows (not `rss > 0` — rest days have legitimate zero RSS with a source tag, and must not be mis-classified as sync gaps).

| Gap in window | Behavior | UI treatment |
|---------------|----------|--------------|
| 0–2 days | Silent, trust TFI EWMA smoothing | Normal render |
| 3–5 days | Compute FAR, attach caveat | Prepend "Based on partial data:" to status copy; confidence 0.7 |
| 6–13 days | Compute FAR, prominent warning | Render hero number in gray (not teal/coral); banner "Data incomplete — FAR may be stale" |
| ≥ 14 days | Suppress FAR entirely | Cold-start placeholder: "Rebuilding baseline — FAR available in {N} days after consistent sync" |
| Gap at window boundary (today or today−28) | Always suppress or degrade | "Waiting for most recent sync" — boundary dates are load-bearing for delta math |

**Critical:** Sync gap vs. training gap distinction is essential. A genuine 10-day training break (illness, travel) should show FAR correctly going negative (detraining). A 10-day sync outage should suppress FAR. The `rss_source` tag is the signal that separates them.

**Zone definitions:**

| Zone | FAR range | Color | Semantic |
|------|-----------|-------|----------|
| Detraining | `< 0` | coral | Losing fitness |
| Maintaining | `0` – `< 40` | gray (neutral) | Holding |
| Building | `40` – `< 100` | teal | Sustainable fitness gain |
| Overreaching | `100` – `< 130` | orange | Accumulating risk; monitor |
| Danger | `≥ 130` | coral | Injury / illness risk; back off |

Zone labels in UI copy:

```
detraining   → "LOSING FITNESS"
maintaining  → "MAINTAINING"
building     → "BUILDING"
overreaching → "OVERREACHING — MONITOR"
danger       → "DANGER — BACK OFF"
```

**Status line modifiers** (combined zone + ceiling-relative context):

```
if zone == 'building' && score >= 95:         "BUILDING — AT SUSTAINABLE MAX"
if zone == 'overreaching' && score <= ceiling: "OVERREACHING — WITHIN PERSONAL ENVELOPE"
if zone == 'overreaching' && score > ceiling:  "OVERREACHING — ABOVE PERSONAL CEILING"
```

**Relationship to FS status copy:** On TODAY page Tier 1, the hero status line is **FAR-derived**, not FS-derived. FS retains its own labels (§3.4) and surfaces as a secondary signal on race readiness card and elsewhere — but does not compete with FAR for the top-line narrative.

**Valence:** High = generally good within the Building zone (40–100). Above 100, high becomes a warning (overreach). Below 0, FAR goes coral (detraining). Unlike TCAS (where high is unconditionally good), FAR is zone-sensitive.

**Storage:**

- `far_daily` — new table, one row per user per day, cached nightly
- `personal_ceiling_history` — new table, tracks ceiling recompute over time
- `user_profiles.years_training` — new column, collected in onboarding
- `user_profiles.masters_cat` — new column, collected in onboarding (optional)
- `user_profiles.personal_ceiling_override_weekly_rate` — new column, for coach / advanced overrides

**Calc files (planned):**

- `src/lib/metrics/far.ts` — TS implementation
- `api/utils/metricsComputation.js` — new `computeFARFromTFI` function
- `api/utils/farCeiling.js` — new file for personal ceiling computation and recompute cron

**API surface:** `GET /functions/v1/get_far_summary` returns score, score_7d, zone, zone_label, description, momentum_flag, personal_ceiling, personal_ceiling_basis, trend_6w, next_race projection, caveats. Full shape in implementation checklist.

**Onboarding additions:** Two new optional questions to collect ceiling inputs:
- "How many years have you been training seriously?" (number input)
- "Racing category (optional)" (dropdown: Cat 5 / Cat 4 / Cat 3 / Cat 2 / Cat 1 / Pro / Unranked)

Missing values use conservative defaults: `years_training` defaults to 2, `masters_cat` defaults to 0 (no bonus). Ceiling calc handles NULL gracefully.

**UI surfaces (planned):**

| Route | Component | Role |
|-------|-----------|------|
| `/` | `FARCard.tsx` (new) | Hero card on TODAY, Tier 2 |
| `/progress` | `FARHistoryChart.tsx` (new) | Long-window FAR history with zone bands |

**Data quality warnings:**

- Relies on TFI being populated in canonical column — not `ctl` legacy column. Users in dual-write state without TFI backfilled will get undefined FAR until backfill completes.
- Depends on consistent activity sync. FAR is the most visible metric to sync outages — a Garmin webhook failure that went undetected on the old dashboard will now show up as a "data incomplete" warning in the hero slot, which is a feature, not a bug.

**Edge cases:**

- `< 28 days` of TFI history → undefined, placeholder message
- Cold start (`< 90 days` of data) → `personal_ceiling_basis = 'universal'`, ceiling = 1.5
- Detraining (negative FAR) → hero number in coral, not teal
- Extreme values (`> 150` or `< −50`) → clamp display, log investigation
- No race within 60 days → projection row on card hides entirely
- TFI column NULL (backfill incomplete) → undefined, prompt user to contact support

---

## 6. Supporting analytics

Computed in `api/utils/advancedRideAnalytics.js`, stored in `activities.ride_analytics` (JSONB). **Surfaced in coach context only** — not displayed in primary UI.

| Metric | Formula / brief | Usage |
|--------|-----------------|-------|
| **Training Monotony** | `mean(daily_RSS_7d) / stddev(daily_RSS_7d)` | Warning at > 1.5; > 2.0 combined with weekly strain > 5000 = high risk |
| **Training Strain** | `weekly_RSS × monotony` | Risk flag for overtraining |
| **Running rTSS** | Pace + HR + elevation heuristic, ~60 rTSS/hr base | Running load estimation (`fitnessSnapshots.js:estimateRunningTSS`) |
| **HR Zones** | 5-zone Edwards model (% max HR) | Zone time + avg HR per zone per ride |
| **Pacing** | Split ratio, power fade %, quarterly NP | Race strategy analysis |
| **MMP Progression** | Best power at 5s / 1m / 5m / 10m / 20m / 60m | 90-day rolling |
| **Cadence** | Avg, peak, coasting %, rpm distribution | Form and efficiency context |
| **Fatigue Resistance** | Q4 / Q1 avg power ratio; cardiac drift | Endurance quality indicator |
| **Terrain Class** | `flat` <8 m/km, `rolling` <15, `hilly` <25, `mountainous` ≥25 | Ride categorization; feeds TWL context |

**Design note:** These live in coach context because surfacing all of them in primary UI would overwhelm users. If you need to promote one to primary UI, that's a product decision, not a code decision — discuss first.

---

## 7. Relationships & dependency map

```
FTP ──┬──► RI ──► RSS ──┬──► TFI ──┬──► FS
      │                 │          │
      │                 │          ▼
      └──► EP ──┬──► VI │         (used by FS confidence chain)
                │       │
                │       ▼
                │      AFI ──┘
                │
                └──► EF ──► TCAS.EFT

RSS ──► TFI, AFI, FS, Monotony, Strain, EFI.VF, EFI.CF, TWL.base
EP  ──► RI, VI, EF, TCAS.PPD (via MMP)
TFI ──► TCAS.HE (delta over 6w), AFI.loadFactor, FAR.numerator (when shipped)
AFI ──► FS
FS  ──► race readiness projection, FSTargetBadge
```

**Critical dependencies:**

- **FTP wrong → 11 downstream metrics wrong.** RI, RSS, TFI, AFI, FS, TWL, EFI (via RSS), TCAS (via TFI and EF), and all FS-derived projections.
- **RSS wrong → 8 downstream metrics wrong.** TFI, AFI, FS, EFI.VF, EFI.CF, TWL, TCAS.HE, FAR.
- **EP wrong → 5 downstream metrics wrong.** RI (and through RI, RSS cascade), VI, EF, TCAS.EFT, TCAS.PPD.

**Integration failure cascades:**

- **Garmin webhook outage** → activities not synced → RSS gaps → TFI/AFI underestimate current state → FS confidence drops.
- **Strava summary-only sync (Rouvy)** → no raw power stream → EP uses provider NP (tier 1 device) → degraded accuracy for VI, EF, TCAS components.
- **Stale FTP** → silent drift across entire metric stack. This is the highest-priority data quality watch.

---

## 8. Where stats are displayed

Every surface where a metric appears must be listed here. When a new UI component displays a metric, add a row.

| Route | Component | Stats shown | UI label | Data field |
|-------|-----------|-------------|----------|------------|
| `/` | `StatusBar.jsx` | TFI, AFI, FS, Trend | FITNESS / FATIGUE / FORM / TREND | `tfi ?? ctl`, `afi ?? atl`, `form_score ?? tsb` |
| `/` | `FitnessBars.jsx` | TFI, AFI, FS | bar widths + color | same |
| `/` | `FitnessCurveChart.jsx` | TFI, AFI, FS (6-week) | labeled axes | same |
| `/` | `YesterdayTodayAhead.jsx` | Yesterday RSS, today target | "RSS [n]" | `rss ?? tss`, `target_tss` |
| `/` | `ProprietaryMetricsBar.tsx` | EFI 28d, TCAS 6w | "EFI 28-day" / "TCAS 6-week" | `efi.score`, `tcas.score` |
| `/` | `FSTargetBadge.tsx` | FS target for next race | race-type chip | `race_goals` + `form_score` — **not yet wired** (see §12) |
| `/train` | `PeriodizationView.tsx` | Planned vs actual RSS per week | weekly bars | `plannedTSS` / `actualTSS` |
| `/train` | `PlanCalendarOverview.tsx` | RSS heat tint per workout | bg color | `target_tss` |
| `/train` | `CheckInWeekBar.tsx` | Daily planned vs actual RSS | day-by-day | `target_tss` / `rss ?? tss` |
| `/train` (trends tab) | `TrainingDashboard.jsx` | TFI, AFI, FS 90-day | labeled lines | `tfi ?? ctl`, `afi ?? atl`, `form_score ?? tsb` |
| `/train` (coach tab) | `DeviationCard.tsx` | RSS delta, projected FS | "+n RSS over planned" | `rss`, projected `form_score` |
| Activity detail | `ActivityMetrics.jsx` | EP, RI, VI, RSS, avg/max power, W/kg | EP / RI / VI labels | `effective_power ?? normalized_power`, `ride_intensity ?? intensity_factor`, `rss ?? tss` |
| `/metrics` | `MetricsCalculatorPage.tsx` | EFI, TWL, TCAS interactive | sliders | educational only |

**Planned additions (spec locked, not yet shipped):**

- `FARCard.tsx` on `/` (TODAY page) — hero position, Tier 2 (see redesign spec)
- `FARHistoryChart.tsx` on `/progress` (new page)
- `ProgressPreviewStrip.tsx` on `/` (TODAY Tier 4) — teaser strip showing FIT/FAT/FORM with link to PROGRESS
- `BanisterChart.tsx` on `/progress` — relocated and expanded from `FitnessCurveChart.jsx`
- TCAS history view on `/progress`
- EFI trend view on `/progress`
- Acronym labeling compliance sweep on `ProprietaryMetricsBar.tsx` and any other component rendering bare acronyms (see §9 acronym labeling discipline)

When these ship, update this table.

---

## 9. Translation & copy layer

`src/lib/fitness/translate.ts` — pure functions, no API calls. These are the functions that convert raw metric values into display copy.

| Function | Input | Output |
|----------|-------|--------|
| `translateCTL(ctl)` | TFI value | label + color (e.g. "Solid fitness") |
| `translateATL(atl, ctl)` | AFI + TFI (ratio-based) | label + color (e.g. "Legs are fresh") |
| `translateTSB(tsb)` | FS value | label + color (see FS table in §3.4) |
| `translateTrend(ctlDeltaPct, ctl)` | 4-week TFI % change | direction + subtitle |
| `translateTSS(tss)` | Single-ride RSS | label (e.g. "Big day") |

**Note:** Function names still use legacy identifiers (`translateCTL`, `translateTSB`) pending the §3b sweep. Rename would be `translateTFI`, `translateFS`, etc.

**Copy discipline:** All user-facing metric strings should flow through this layer. Hard-coded strings in components are a bug waiting to become inconsistent — if you find one, refactor it into `translate.ts`.

### Tooltip and empty-state copy

When a metric has undefined or low-confidence value, the copy should never be blank. Required copy coverage per metric:

| Metric | Empty state (not yet computed) | Low confidence | Stale data (> 3d since sync) |
|--------|-------------------------------|----------------|------------------------------|
| RSS | "No ride today" | N/A (confidence built in) | (per-ride, no stale concept) |
| TFI | "Building baseline ({n} days to go)" | `~` prefix | "Last sync {n}d ago" banner |
| AFI | same as TFI | `~` prefix | same |
| FS | same as TFI | `~` prefix | same |
| EP / RI / VI / EF | "No power data for this ride" | N/A | N/A |
| FTP | "Set your FTP in settings" | N/A | "FTP not updated in {n} days — consider refreshing" *(not yet implemented)* |
| TWL | "Terrain data unavailable" | N/A | N/A |
| EFI | "No plan to measure against" | N/A | N/A |
| TCAS | "Building baseline — TCAS available at 8 weeks" | N/A | "Power data incomplete — TCAS may be low" |
| FAR | "Building baseline — Fitness Acquisition Rate available at 28 days" | "Based on partial data" prefix | "Data incomplete — FAR may be stale" (6–13d gap); suppress entirely (≥14d gap) |

**Copy requests must be reviewed against this table before shipping.** If a new empty state or error state is needed, add a row here first.

### Acronym labeling discipline

Every proprietary acronym (FAR, TCAS, EFI, TWL) and every renamed metric (TFI, AFI, FS, RSS, EP, RI) is unfamiliar to new users. Showing a bare three-letter code without its full name is a failure mode — users who don't already know the system see alphabet soup and bounce.

**Rules:**

1. **First mention per screen must include both.** The full name appears with the acronym on first appearance in any UI surface: `FITNESS ACQUISITION RATE · FAR`, `EXECUTION FIDELITY INDEX · EFI`. Subsequent references on the same screen may use the acronym alone.

2. **Every acronym must have a tooltip.** Hovering / tapping the acronym reveals: full name, one-sentence definition, optional "learn more" link to docs. No exceptions.

3. **Long-form copy (coach messages, email, notifications) uses full name first.** "Your Fitness Acquisition Rate (FAR) is at 100 — you're building at the sustainable maximum." Not "Your FAR is at 100."

4. **Onboarding introduces the metric family explicitly.** Before any acronym appears in the dashboard for a new user, onboarding must have explained what the Tribos proprietary metrics are and which question each answers.

5. **Internal / developer-facing copy can use acronyms alone.** API field names, DB columns, log messages, dev console — these are for engineers, not users. Acronyms are fine.

**Current state:** The `ProprietaryMetricsBar.tsx` component and several stat strips currently render bare acronyms (`EFI 52 · TCAS 21`). This is a known violation and should be fixed in the FAR rollout PR as a prerequisite — if new acronyms are going to appear, the labeling discipline should already be in place.

**Why this rule exists:** An acronym without context is a signal to stop reading. Users who feel excluded by jargon don't ask — they leave. The cost of adding a full name is a few more characters of text; the cost of leaving it out is lost users.

---

## 10. Color & valence rules

Tribos brand tokens (from brand system): teal `#2A8C82`, orange `#D4600A`, gold `#C49A0A`, coral `#C43C2A`, plus neutrals.

### Metric color rules

| Metric | When teal (primary) | When gold (achievement) | When orange (caution) | When coral (warning) | When neutral |
|--------|---------------------|-------------------------|------------------------|----------------------|--------------|
| **RSS** | Any value (neutral descriptor) | N/A | N/A | N/A | Default display color |
| **TFI** | Default value display | N/A | N/A | N/A | High = good, but no color signal |
| **AFI** | Normal range (ratio 0.7–1.1) | N/A | Ratio 1.1–1.3 | Ratio > 1.3 | N/A |
| **FS** | −10 to 2 ("sweet spot") | −20 to −10 ("digging in") — wait, this should be orange per existing translateTSB; keep the FS table in §3.4 authoritative | (see §3.4) | < −20 ("in the hole") | N/A |
| **EP / RI / VI / EF** | Default value display | N/A | N/A | N/A | Neutral |
| **TWL** | Default | N/A | TWL/RSS > 1.3 (very hilly, flag context) | N/A | N/A |
| **EFI** | ≥ 75 | 90–100 (dialed in) | 40–74 | < 40 | N/A |
| **TCAS** | 55–84 | 85–100 | 40–54 | < 40 | N/A |
| **FAR** | Building zone (40–100) | N/A | Overreach (100–130) | Danger (≥ 130) or detraining (< 0) | Maintaining (0–40); gray when data gap 6–13d suppresses confidence |

> **⚠️ Authoritative FS colors are in §3.4.** The row above is incomplete; refer to the FS display labels table for correct color assignments. When the §3.4 table and this §10 table disagree, §3.4 wins — fix §10 in the same commit that updates §3.4.

### Valence summary

- **Teal** is the default "healthy / normal" color — most metrics use teal when in expected range.
- **Gold** is achievement — reserved for peaks, PRs, "dialed in" states.
- **Orange** is attention — something worth noticing, not yet a problem.
- **Coral** is warning — actionable concern.
- **Gray / neutral** is descriptive — for metrics with no inherent valence (RSS, EP, VI).

**Never use coral casually.** Coral means "act on this." Overusing coral is the fastest way to train users to ignore warnings.

---

## 11. Key calculation files

| File | Responsibility |
|------|----------------|
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
| `src/lib/metrics/far.ts` | FAR formula (TS) *(planned — not yet implemented)* |
| `api/utils/farCeiling.js` | FAR personal ceiling computation + recompute cron *(planned)* |
| `src/lib/fitness/translate.ts` | Display labels + color tokens |

**Rule:** If you add a new file that computes or stores a metric, add a row here in the same commit.

---

## 12. Known gaps & deferred work

| Item | Status | Priority | Reference |
|------|--------|----------|-----------|
| EP stream-based recompute | Implemented in `filterZeroPowerPoints`, not wired to ingestion | High (affects RSS tier 3) | §2c, `METRICS_ROLLOUT_REMAINING.md` |
| `tfi_composition` wiring | Function exists, not called from `upsertTrainingLoadDaily` | Medium | §2a |
| `FSTargetBadge` | Component built, not wired to dashboard | Medium | §2b |
| `tfi_tau` / `afi_tau` on daily rows | Columns exist, not passed in upsert payload | Medium | §2d |
| Legacy JS identifier sweep | `tss`/`ctl`/`atl`/`tsb` internal vars still in src/ + api/ | Low (cosmetic) | §3b |
| `tsb-projection.ts` internals rename | `ProjectionState.{ctl,atl,tsb}` still use legacy keys | Low | §3a |
| Legacy DB column drops | 6 tables in dual-write; DROP blocks commented out | Low (cleanup) | §1a–§1f |
| Rouvy indoor RSS accuracy | Summary-only sync lacks power stream | High (affects all indoor users on summary-only providers) | Strava stream API fetch is long-term fix, manual TSS override is near-term |
| Stale FTP warning | Not implemented; FTP drift silently degrades metrics | High | New — recommend prompt at 90-day stale threshold |
| FAR Phase 2 (race projection) | Extend `get_far_summary` with projected TFI and form at next race | Medium | `FAR_implementation_checklist.md` §Phase 2 |
| FAR Phase 3 (personalized ceiling) | Personal ceiling model; requires `years_training`, `masters_cat` onboarding fields | Medium | `FAR_implementation_checklist.md` §Phase 3 |
| TODAY page redesign | Spec locked | Medium | `TODAY_PROGRESS_redesign_spec.md` |
| PROGRESS page | Spec locked | Medium | `TODAY_PROGRESS_redesign_spec.md` Part 3 |
| Acronym labeling compliance | `ProprietaryMetricsBar.tsx` renders bare acronyms; violates §9 discipline | Medium (prerequisite for FAR rollout) | Add full-name labels + tooltips before FAR ships |
| `masters_cat` column | Needed for FAR ceiling `age_mod`; column does not exist in `user_profiles` | Medium (required for FAR) | Add column + onboarding question in FAR Phase 3 |
| `years_training` column | Needed for FAR ceiling `experience_mod`; column does not exist in `user_profiles` | Medium (required for FAR) | Add column + onboarding question in FAR Phase 3 |

Full sequenced PR list: `docs/METRICS_ROLLOUT_REMAINING.md`

**When a gap is closed,** move the row to §14 (Change log) with the close date. Do not just delete it.

---

## 13. Dual-write & migration state

Tribos is mid-migration from legacy industry names to Tribos-canonical names. Dual-write means both columns are written; readers coalesce with `?? ` fallback.

### Tables in dual-write

| Table | Legacy column | Canonical column | Reader pattern |
|-------|---------------|------------------|----------------|
| `activities` | `tss` | `rss` | `rss ?? tss` |
| `activities` | `normalized_power` | `effective_power` | `effective_power ?? normalized_power` |
| `activities` | `intensity_factor` | `ride_intensity` | `ride_intensity ?? intensity_factor` |
| `training_load_daily` | `ctl` | `tfi` | `tfi ?? ctl` |
| `training_load_daily` | `atl` | `afi` | `afi ?? atl` |
| `training_load_daily` | `tsb` | `form_score` | `form_score ?? tsb` |

### DROP plan

DROP blocks for legacy columns are **commented out** in migration files pending:
1. All readers updated to use canonical column only (no `??` fallback)
2. Backfill verified at 100% coverage
3. One-week observation period with both columns present but only canonical written

Only then can the DROP run. Do not DROP ahead of schedule.

### Retirement criteria

A legacy column is eligible for DROP when:
- [ ] Every file in `api/` and `src/` that references it has been updated
- [ ] All reader fallbacks (`?? legacy`) have been removed
- [ ] A one-week monitoring period shows zero reads of the legacy column (log at query layer or view `pg_stat_user_tables`)
- [ ] Rollback plan documented

---

## 14. Change log

Every material change to this document gets a row here. Format: `YYYY-MM-DD · Change · Author`.

| Date | Change | Author |
|------|--------|--------|
| 2026-04-20 | Document created from `TRAINING_STATS_REFERENCE.md`, expanded with intent, interpretation bands, relationships, copy library, color rules, pre-flight checklist, change-maintenance instructions | Core team |
| 2026-04-20 | FAR (Fitness Acquisition Rate) added as planned §5.4 entry after naming collision with existing TCAS was caught — spec lives in `tcas-today-progress-spec.md` and will be renamed in that doc before implementation | Core team |
| 2026-04-20 | Scrubbed personal-user references throughout document (TWL intent, TCAS data quality warning, Rouvy gap description, change log attributions, pre-flight checklist); added §16 "Writing for this document" subsection codifying user-neutrality discipline for future edits | Core team |
| 2026-04-20 | FAR spec locked and expanded in §5.4 with full formula, personal ceiling model (experience/consistency/age modifiers), zone definitions, gap-handling rules (2/5/13/14-day thresholds), combinatorial coaching coverage matrix, onboarding additions (`years_training`, `masters_cat`), storage schema, and UI surface plan. Added §9 acronym-labeling discipline (full name with acronym on first mention, tooltips required, onboarding introduction). Updated §8 planned UI surfaces, §11 calc files, §12 gaps with FAR prerequisites | Core team |

---

## 15. Pre-flight checklist for new metrics

**Before proposing a new metric, every item below must be answered. If any answer is "I'm not sure," stop and find out.**

This checklist exists because proposing a metric without consulting §1-§7 is how naming collisions, redundant formulas, and silent data dependencies happen. The TCAS/FAR incident (2026-04-20) is the canonical example — a new metric was speced that collided with an existing metric because the existing metric wasn't checked first.

### The checklist

**Identity**
- [ ] What is the proposed name, abbreviation, and DB column?
- [ ] Is that name already used by another metric (check §2, §3, §4, §5, §6)?
- [ ] Is the abbreviation already in use anywhere in the codebase?
- [ ] What family does this belong to (§1)?

**Intent**
- [ ] What question does this metric answer, in a single user-facing sentence?
- [ ] Does any existing metric already answer that question? If yes, why isn't the existing metric sufficient?
- [ ] What user complaint or missing feature motivated this?

**Math**
- [ ] What's the full formula, in code or precise pseudocode?
- [ ] What are the inputs (with types, units, sources)?
- [ ] What's the window / lookback period and why that duration?
- [ ] What smoothing or weighting applies and why those constants?
- [ ] Is it clamped, uncapped, or normalized?
- [ ] Where did the constants come from (literature, empirical, guess)?

**Data dependencies**
- [ ] What's the minimum data required to compute meaningfully?
- [ ] What behavior when data is missing or partial?
- [ ] Which existing metrics does this depend on? (Add to §7 dependency map.)
- [ ] Which integrations feed it?
- [ ] Any known data quality gotchas?

**Interpretation**
- [ ] What does each value range mean in plain English?
- [ ] Are there zone bands? With labels and colors?
- [ ] What's "good" for typical users vs. edge cases?
- [ ] Valence: does high mean good, bad, or neutral?

**Personalization**
- [ ] Does the metric vary by user attributes (age, experience, discipline)?
- [ ] Cold-start behavior for new users?
- [ ] Manual override support?

**Storage & compute**
- [ ] What table stores it? (New table or existing?)
- [ ] Where is it computed (client / Edge Function / DB view / cron)?
- [ ] Compute cadence?
- [ ] Recompute triggers?

**API & UI**
- [ ] Which endpoints return it?
- [ ] Exact field name in response?
- [ ] Which pages / components display it?
- [ ] Tooltip, empty state, error state copy drafted?
- [ ] Color / valence rules defined?

**Edge cases**
- [ ] Cold start
- [ ] Data gaps
- [ ] Extreme values (clamping, logging)
- [ ] Stale data
- [ ] Detraining / negative values (if applicable)
- [ ] Missing dependencies (e.g., no power data)

**Documentation**
- [ ] This metric will be added to §5 (or appropriate family section) in the same PR as implementation
- [ ] Relationships added to §7
- [ ] UI surfaces added to §8
- [ ] Copy added to §9
- [ ] Color rules added to §10
- [ ] Calc files added to §11
- [ ] Change log entry in §14

**Final gate**
- [ ] A reviewer has read the above and signed off
- [ ] This checklist is attached to the implementation PR

---

## 16. How to update this document

### When to update

Update this document in the same pull request as any of the following:

- **Code changes** that add, rename, retire, or alter any metric — formula, constants, inputs, time windows, source cascades, confidence weights, tau modifiers, clamps.
- **Schema changes** that add, rename, or drop any metric-related table, column, or cache.
- **API changes** that add, remove, or rename metric fields in endpoint responses.
- **UI changes** that add, remove, or relocate a metric display surface.
- **Copy changes** that alter metric labels, tooltips, empty states, or error states.
- **Color / valence changes** that alter when a metric uses teal / gold / orange / coral.
- **Integration changes** that alter how data flows into a metric (new provider, changed webhook, new cascade tier).

### How to update

1. Find the section(s) affected by your change (§3 / §4 / §5 / §7 / §8 / §9 / §10 / §11 / §12 / §13 as applicable).
2. Edit the content so it describes the state of the codebase *after your PR merges*, not before.
3. Add a row to §14 (Change log) with date, 1-line summary, author.
4. If closing a known gap from §12, move the row to §14 rather than deleting it.
5. If adding a new metric, complete §15 (Pre-flight checklist) and attach to the PR.
6. Bump the `Last updated` date at the top of the document.

### Review discipline

- A PR that touches any metric code but does not update this document is incomplete and should be blocked in review.
- A PR that updates this document without the corresponding code change is acceptable (the doc can lead the code), but the follow-up code PR should reference the bible update.
- If you discover the bible is wrong or stale during a separate task, fix it in the same PR you're already writing, even if the fix is unrelated. Drift compounds silently; tiny corrections catch it early.

### Writing for this document

This bible is read by both humans and AI coding agents. Both audiences benefit from the same discipline: describe the system, not any single user's experience of it. The rules below exist because subtle personal anchoring creates silent bugs — an agent that reads "TCAS 21 is the current value" will happily produce test fixtures, empty states, or defaults that treat 21 as the typical case. That's the kind of mistake a solo founder reviewing agent-generated code is least likely to catch.

**Keep the document user-neutral.**

- Do not name specific users, real or hypothetical. No "Travis," no "Alice," no "our power user." If an example needs a subject, write "a user" or "the user."
- Do not reference specific races, locations, equipment, or events that identify a person. Generalize to categories: "terrain-heavy events" not "Boulder Roubaix"; "summary-only sync providers" not "Rouvy."
- Do not cite live metric values from any real user's account. "TCAS 21 (current value)" anchors agents to a specific number; "TCAS < 40 with partial power data" describes the condition that matters.
- Do not write "your FTP" or "your race" in narrative sections. Reserve second-person for (a) UI copy being specified for end users, and (b) instructions addressed to the developer or agent editing the doc.

**When a concrete example helps, make it clearly hypothetical.**

- Describe a condition, not a person: "a user with < 28 days of history," "a user whose FTP has not been updated in 90+ days," "an athlete with a historical peak TFI of 80+."
- Use range-based examples, not point values: "TCAS values below 40 may reflect..." rather than "a TCAS of 21 means..."
- If a specific value is essential to the explanation, frame it as an illustrative scenario: "consider a user whose TFI is 50 — if their AFI reaches 65, their FS drops to −15, which the translate layer renders as..." Make it clear no real user is being described.

**Keep technical system names concrete.**

- Integration names (Strava, Garmin, Rouvy) are fine — they're system references, not user references.
- File paths, table names, column names, function names — all fine, these are the codebase.
- Literature references (Banister, Coggan, Friel) — fine, these are sources, not users.
- Brand system tokens, color hex codes, CSS variables — fine.

**Test for neutrality before committing:**

Reading the doc as if you had no prior context, ask:
- Would an agent reading this be able to generate defaults, test fixtures, or empty states that work for any user — not just one specific profile?
- Does any sentence imply "the current user" has specific characteristics (age, category, equipment, race calendar, training history)?
- Would a new Tribos user reading this feel described, or feel like the system was built around someone else?

If any answer raises concern, rewrite.

### Why this discipline matters

Every hour spent keeping this document current saves ten hours of future archaeology. Metric drift doesn't announce itself — it shows up as bug reports nobody can triage, coach messages that contradict each other, and dashboard numbers that don't match what users expect. The bible is the single most load-bearing piece of Tribos documentation. Treat it like production code, because it's describing production code.

---

*End of Stats Bible. If you found a gap, fix it.*
