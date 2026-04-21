# FAR Implementation Checklist

**Status:** Spec locked 2026-04-20. Ready to build.
**Source of truth:** `TRIBOS_STATS_BIBLE.md` §5.4. If this checklist and the bible disagree, the bible wins — fix this file in the same PR that surfaces the disagreement.
**Related:** `TODAY_PROGRESS_redesign_spec.md` (UI integration spec)

---

## §15 Pre-flight checklist results

All items confirmed. Full metric spec in bible §5.4.

### Identity
- **Name:** Fitness Acquisition Rate
- **Acronym:** FAR
- **DB column prefix:** `far`
- **Collision check:** No conflicts with existing metrics, feature flags, or roadmap terms
- **Family:** Proprietary metric (alongside TCAS, EFI, TWL)

### Intent
- **Question answered:** "How fast am I building fitness, and is that rate sustainable?"
- **Distinction from TCAS:** TCAS measures efficiency per hour (requires power); FAR measures pace vs. personal ceiling (works for all users with TFI history). These are complementary, not competitive.
- **Motivating gap:** Existing dashboard has no single metric that answers "am I actually getting fitter?" in a way users can interpret without understanding CTL terminology.

### Math
- **Formula:** `FAR = (ΔTFI_28d / 28) × 7 / personal_ceiling_weekly_rate × 100`
- **Input:** `training_load_daily.tfi` (canonical column only — does NOT coalesce to legacy `ctl`)
- **Window:** 28 days primary, 7 days momentum overlay
- **Cadence:** Daily recompute
- **Clamping:** Uncapped; extreme values (`> 150`, `< −50`) clamp display with warning flag and logging
- **Seed coefficients:** Accepted as-is; tune empirically post-launch

### Data
- **Minimum data:** 28 days of TFI history
- **Gap handling:** 4-tier degradation (see §Gap handling logic below)
- **New profile fields:** `years_training`, `masters_cat`, `personal_ceiling_override_weekly_rate`
- **Prerequisite:** TFI must be populated in canonical column for all active users (see §Prerequisites)

### Interpretation
- **Zones:** Detraining (<0), Maintaining (0–40), Building (40–100), Overreaching (100–130), Danger (≥130)
- **Status copy source:** FAR-derived, not FS-derived — FAR owns the Tier 1 hero status line on TODAY
- **Valence:** Zone-sensitive (high is good within Building; becomes warning in Overreaching/Danger)

### Storage & compute
- **Tables:** `far_daily`, `personal_ceiling_history`
- **Calc files:** `src/lib/metrics/far.ts`, `api/utils/farCeiling.js`, extension to `api/utils/metricsComputation.js`
- **Ceiling recompute:** Monthly cron (first of month) + on profile change; change > ±5% triggers notification

### UI
- **Primary surface:** `FARCard.tsx` on `/` (TODAY hero, Tier 2)
- **Secondary surface:** `FARHistoryChart.tsx` on `/progress`
- **Acronym labeling:** Full name "Fitness Acquisition Rate" must accompany "FAR" on first mention per screen; tooltip required

---

## Prerequisites (block FAR ship until complete)

### P1 — Verify TFI population (blocking)

Before FAR can read from `training_load_daily.tfi`, verify the column is populated for all active users. Bible flags this as high-priority gap.

**Verification query:**
```sql
SELECT
  COUNT(DISTINCT user_id) AS users_total,
  COUNT(DISTINCT user_id) FILTER (WHERE tfi IS NOT NULL) AS users_with_tfi,
  COUNT(DISTINCT user_id) FILTER (WHERE tfi IS NULL AND ctl IS NOT NULL) AS users_needing_backfill
FROM training_load_daily
WHERE date >= CURRENT_DATE - INTERVAL '28 days';
```

**Action if `users_needing_backfill > 0`:** run backfill job copying `ctl → tfi` for affected rows before any FAR deployment. Do not skip this — FAR with NULL TFI will surface as "undefined" to those users even though they have usable data.

### P2 — Acronym labeling compliance (blocking)

Bible §9 requires every acronym to appear with its full name on first mention per screen. Current `ProprietaryMetricsBar.tsx` renders bare `EFI 52 · TCAS 21` — violation that must be resolved before adding FAR to the mix.

**Changes required:**
- Update `ProprietaryMetricsBar.tsx` to render full-name-plus-acronym on first display, acronym alone on subsequent repeat displays in same component
- Add tooltip support to the bar component; hover/tap on any acronym shows full name + one-sentence definition
- Update all other components currently showing bare acronyms (audit: `StatusBar.jsx`, `ActivityMetrics.jsx`, any coach message generators)

**Tooltip content library** (populate `src/lib/fitness/metricDescriptions.ts`):

```typescript
export const METRIC_DESCRIPTIONS = {
  RSS: {
    full: "Ride Stress Score",
    definition: "How hard a ride was, accounting for intensity and duration.",
  },
  TFI: {
    full: "Training Fitness Index",
    definition: "Your long-term training load — how fit you are right now.",
  },
  AFI: {
    full: "Acute Fatigue Index",
    definition: "Your short-term training load — how tired you are right now.",
  },
  FS: {
    full: "Form Score",
    definition: "Your readiness to perform. Positive = fresh, negative = fatigued.",
  },
  EP: {
    full: "Effective Power",
    definition: "The physiologically-representative power for a ride, accounting for surges.",
  },
  RI: {
    full: "Ride Intensity",
    definition: "How hard a ride was relative to your threshold.",
  },
  EFI: {
    full: "Execution Fidelity Index",
    definition: "How closely you executed your prescribed training.",
  },
  TWL: {
    full: "Terrain-Weighted Load",
    definition: "Training load adjusted for terrain difficulty.",
  },
  TCAS: {
    full: "Training Capacity Acquisition Score",
    definition: "How efficiently you're training for the hours you're putting in.",
  },
  FAR: {
    full: "Fitness Acquisition Rate",
    definition: "How fast you're building fitness, relative to a sustainable pace.",
  },
} as const;
```

### P3 — Onboarding additions

New onboarding questions to collect ceiling inputs. Add before FAR Phase 3 (personalized ceiling) ships — Phase 1 (MVP with universal ceiling) can ship without them.

**Question 1:**
- Text: "How many years have you been training seriously?"
- Input: number field, range 0–50
- Stored in: `user_profiles.years_training` (new INT column)
- Default if skipped: 2 (conservative newcomer)

**Question 2:**
- Text: "Racing category (optional)"
- Input: dropdown — Cat 5 / Cat 4 / Cat 3 / Cat 2 / Cat 1 / Pro / Unranked
- Stored in: `user_profiles.masters_cat` (new INT column: 0 = unranked, 1 = Cat 5, ..., 5 = Cat 1, 6 = Pro)
- Default if skipped: 0 (no bonus)

Existing users without these fields get defaults applied silently until they update their profile — no forced re-onboarding.

---

## Implementation phases

### Phase 1 — FAR MVP with universal ceiling (ship first)

Scope: FAR computed daily for all users with ≥28 days of TFI, using universal ceiling (1.5 TFI/week). No personalization yet.

**Database:**
- [ ] Migration: create `far_daily` table
  ```sql
  CREATE TABLE far_daily (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    score NUMERIC,
    score_7d NUMERIC,
    tfi_delta_28d NUMERIC,
    weekly_rate NUMERIC,
    zone TEXT,
    personal_ceiling_weekly_rate NUMERIC DEFAULT 1.5,
    personal_ceiling_basis TEXT DEFAULT 'universal',
    confidence NUMERIC DEFAULT 1.0,
    gap_days_in_window INT DEFAULT 0,
    computed_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, date)
  );
  ```
- [ ] RLS: user-scoped (`user_id = auth.uid()`)
- [ ] Index on `(user_id, date DESC)` for fast recent-day queries

**Compute:**
- [ ] Create `src/lib/metrics/far.ts` with `computeFAR(tfiSeries28d, ceiling)` and `computeFARMomentum(tfiSeries7d, ceiling)`
- [ ] Create `src/lib/metrics/farZones.ts` with `classifyFARZone(score)` and `getFARStatusLabel(score, ceiling, gapDays)`
- [ ] Extend `api/utils/metricsComputation.js` with `computeFARFromTFI(userId, date)` that reads `training_load_daily.tfi`, handles gaps, writes `far_daily`
- [ ] Create nightly cron job to compute FAR for all users with ≥28 days of TFI

**Gap handling logic** (see bible §5.4 for full rules):

```typescript
function assessFARGaps(loadDaily: TrainingLoadDaily[]): {
  gapDays: number,
  treatment: 'normal' | 'caveat' | 'warning' | 'suppress',
  confidence: number,
  boundaryGap: boolean,
} {
  // Count days without sync in the 28-day window
  // A day is a "sync gap" if rss_source IS NULL
  // A day with rss_source set but rss=0 is a legitimate rest day, NOT a gap

  const gapDays = loadDaily.filter(d => d.rss_source === null).length;
  const boundaryGap = (
    loadDaily[0]?.rss_source === null ||              // today
    loadDaily[loadDaily.length - 1]?.rss_source === null  // today - 28
  );

  if (boundaryGap) {
    return { gapDays, treatment: 'suppress', confidence: 0, boundaryGap: true };
  }

  if (gapDays >= 14) return { gapDays, treatment: 'suppress', confidence: 0, boundaryGap: false };
  if (gapDays >= 6)  return { gapDays, treatment: 'warning', confidence: 0.5, boundaryGap: false };
  if (gapDays >= 3)  return { gapDays, treatment: 'caveat', confidence: 0.7, boundaryGap: false };
  return { gapDays, treatment: 'normal', confidence: 1.0, boundaryGap: false };
}
```

**API:**
- [ ] Create Edge Function `get_far_summary` returning:
  ```typescript
  interface FARSummaryResponse {
    score: number | null;
    score_7d: number | null;
    tfi_current: number;
    tfi_delta_28d: number;
    weekly_rate: number;
    zone: 'detraining' | 'maintaining' | 'building' | 'overreaching' | 'danger' | null;
    zone_label: string;
    description: string;
    momentum_flag: 'accelerating' | 'steady' | 'decelerating';
    personal_ceiling: number;
    personal_ceiling_weekly_rate: number;
    personal_ceiling_basis: 'universal' | 'personalized' | 'manual';
    trend_6w: Array<{ date: string; far: number | null }>;
    next_race: {
      name: string;
      date: string;
      days_out: number;
      projected_tfi: number;
      target_tfi: number | null;
      projected_form: number;
      on_target: boolean;
    } | null;
    caveats: string[];
    confidence: number;
    computed_at: string;
  }
  ```

**UI:**
- [ ] Create `src/components/dashboard/FARCard/FARCard.tsx`
- [ ] Create `src/components/dashboard/FARCard/FARTrendChart.tsx` (mini chart with zone bands)
- [ ] Integrate into TODAY Tier 2 (see `TODAY_PROGRESS_redesign_spec.md`)
- [ ] Apply acronym-labeling discipline — first render is "FITNESS ACQUISITION RATE · FAR" header, subsequent refs use "FAR"
- [ ] Tooltip wiring via METRIC_DESCRIPTIONS library

**Tests:**
- [ ] Unit: `computeFAR` across positive/negative/zero/extreme rates
- [ ] Unit: `classifyFARZone` all boundaries
- [ ] Unit: `assessFARGaps` each tier (0/3/6/14 day scenarios, boundary gap, rest day vs sync gap)
- [ ] Integration: seeded test users (see Test user matrix below)
- [ ] Visual regression: FARCard across all states

---

### Phase 2 — Race readiness projection

Scope: extend `get_far_summary` with race projection; add projection row to FARCard.

- [ ] Extend Edge Function to compute `projected_tfi` and `projected_form` for next race within 60 days
- [ ] Heuristic for `target_tfi` when no coach-set target: `max(current_tfi, historical_peak_tfi × 0.85)`
- [ ] Valence coloring for `projected_form`:
  - `+5 to +25`: gold (fresh)
  - `> +25`: orange (too fresh, losing fitness)
  - `−5 to +5`: neutral
  - `< −5`: coral (carrying fatigue)
- [ ] Hide projection row entirely if no race within 60 days

---

### Phase 3 — Personalized ceiling

Scope: ship personal ceiling model end-to-end. Requires onboarding additions (P3 prerequisite).

**Database:**
- [ ] Migration: add columns to `user_profiles`:
  ```sql
  ALTER TABLE user_profiles ADD COLUMN years_training INT;
  ALTER TABLE user_profiles ADD COLUMN masters_cat INT;
  ALTER TABLE user_profiles ADD COLUMN personal_ceiling_override_weekly_rate NUMERIC;
  ```
- [ ] Migration: create `personal_ceiling_history` table
  ```sql
  CREATE TABLE personal_ceiling_history (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    weekly_rate NUMERIC NOT NULL,
    basis TEXT NOT NULL,  -- 'universal' | 'personalized' | 'manual'
    experience_mod NUMERIC,
    consistency_mod NUMERIC,
    age_mod NUMERIC,
    PRIMARY KEY (user_id, computed_at)
  );
  ```

**Compute:**
- [ ] Create `api/utils/farCeiling.js` implementing:
  ```
  experience_mod = 1.0 + min(0.15, years_training × 0.01)
                 + min(0.15, max(0, historical_peak_tfi - 40) × 0.01)

  consistency_mod = 1.0
                  - min(0.10, tfi_variance_180d × 0.005)
                  - min(0.05, long_gaps_365d × 0.05)
                  + (training_days_90d / 90 >= 0.80 ? 0.10 : 0)
  → clamp [0.85, 1.10]

  age_mod = {
    age < 40: 1.00,
    age 40-49: 0.97,
    age 50-59: 0.95,
    age >= 60: 0.92,
  } + (masters_cat >= 2 ? 0.02 : 0)

  personal_ceiling_weekly_rate = 1.5 × experience_mod × consistency_mod × age_mod
  ```
- [ ] Handle NULL profile fields with conservative defaults (`years_training` → 2, `masters_cat` → 0, age → no modifier)
- [ ] Historical peak TFI backfill job (one-time for existing users): `SELECT user_id, MAX(tfi) FROM training_load_daily GROUP BY user_id`

**Cron:**
- [ ] Monthly cron (first of month) recomputing personal ceiling for all users
- [ ] On-demand recompute when `years_training`, `masters_cat`, or `age` change
- [ ] Detect `|delta| > 5%` and flag for notification
- [ ] Transition `personal_ceiling_basis` from `'universal'` to `'personalized'` at 90-day mark

**Onboarding:**
- [ ] Add "Years training" question to onboarding flow
- [ ] Add "Racing category" question (optional, dropdown)
- [ ] Update onboarding intake function to write new fields

**UI:**
- [ ] Add personal ceiling horizontal line to FARTrendChart (dashed, label "YOUR CEILING · {value}")
- [ ] "Ceiling updated" toast notification when recompute delta > 5%
- [ ] Status label logic: personalized zone variants (see bible §5.4)
- [ ] Manual ceiling override UI in advanced settings

**Tests:**
- [ ] Unit: each ceiling modifier in isolation (age brackets, years saturation, peak TFI, masters bonus)
- [ ] Unit: consistency mod across variance / gap / density scenarios
- [ ] Unit: NULL field handling
- [ ] Integration: user archetypes (see Test user matrix)
- [ ] Integration: cron triggers notification at correct delta threshold

---

### Phase 4 — Polish & edge cases

- [ ] Detraining UI treatment (hero number in coral, recovery-oriented description copy)
- [ ] Extreme value clamping (`> 150` displays "150+", `< −50` displays "−50+", both log for investigation)
- [ ] Loading skeleton for FARCard
- [ ] Empty-state copy: "Building baseline — Fitness Acquisition Rate available in {N} days"
- [ ] Stale sync banner integration with FARCard
- [ ] Visual regression tests across all states

---

## Test user matrix

Seed these in the test environment. Each validates a specific FAR behavior.

| User ID | Profile | TFI trajectory | Expected FAR |
|---------|---------|----------------|--------------|
| `far_test_cold_start` | new user, 10 days of data | rising | undefined, placeholder shown |
| `far_test_building_baseline` | 60 days of data, universal ceiling | +1.0 TFI/wk | ~67, "Building" |
| `far_test_building_max` | 60 days, universal | +1.5 TFI/wk | 100, "Building — at sustainable max" |
| `far_test_overreaching` | 60 days, universal | +1.8 TFI/wk | 120, "Overreaching — monitor" |
| `far_test_danger` | 60 days, universal | +2.2 TFI/wk | 147, "Danger — back off" |
| `far_test_detraining` | 60 days, universal | −0.5 TFI/wk | −33, "Losing fitness" (coral) |
| `far_test_maintaining` | 60 days, universal | flat | ~0, "Maintaining" |
| `far_test_gap_short` | 60 days with 4-day sync gap | rising | computed, caveat attached, confidence 0.7 |
| `far_test_gap_medium` | 60 days with 8-day sync gap | rising | computed, warning banner, gray hero |
| `far_test_gap_long` | 60 days with 15-day sync gap | rising | suppressed, "Rebuilding baseline" |
| `far_test_gap_boundary` | gap on today or today−28 | rising | suppressed, "Waiting for most recent sync" |
| `far_test_rest_days` | 60 days with legitimate rest days (rss_source set, rss=0) | rising | normal FAR, NOT treated as gap |
| `far_test_personalized` | 12 months, years_training=15, peak_tfi=70, age=50, cat=2 | +1.7 TFI/wk | ~100 (ceiling ~1.73 inflates normalization), "Building — at sustainable max" |
| `far_test_veteran_detraining` | 12 months, experienced user, detraining | −1.0 TFI/wk | ~−60, coral |
| `far_test_race_imminent` | FAR building, race in 7 days | — | projection row populated, form_projection valenced |
| `far_test_race_none` | FAR building, no race in 60 days | — | projection row hidden |

---

## Open questions (resolve before or during implementation)

1. **TCAS migration from TODAY to PROGRESS** — when does this actually happen? Options: (a) same PR as FAR MVP, (b) FAR MVP ships first with TCAS still on TODAY, TCAS moves in Phase 2. Recommendation: (b) — FAR MVP is the bigger change, don't bundle TCAS relocation with it. Update `ProprietaryMetricsBar.tsx` to remove TCAS only when the PROGRESS page has a home for it.

2. **"TCAS may be low" interpretation caveat** — already in the bible's copy library. Should FAR have a similar caveat when displayed alongside TCAS to distinguish them? Probably unnecessary — the acronym labeling and tooltips should disambiguate. Revisit if users conflate them.

3. **Coach persona integration** — when a user in overreach territory opens coach chat, should coach personas reference FAR? Bible note says yes for The Scientist, The Pragmatist, The Hammer; not The Encourager. Wire this into coach context-builder in Phase 2.

4. **PROGRESS page FAR history** — deferred to PROGRESS page implementation. FAR MVP does not block PROGRESS work, but PROGRESS work does require FAR to be live.

5. **Mobile FARCard layout** — spec in `TODAY_PROGRESS_redesign_spec.md` mentions stacking rules. Confirm during implementation.

---

## Definition of done

Phase 1 is done when:

- [ ] All prerequisites (P1, P2) complete and verified in production
- [ ] FAR MVP ships behind a feature flag; rollout is gradual (internal → beta → all)
- [ ] Bible §5.4 "(PLANNED)" tag removed, entry reflects shipped state
- [ ] Bible §8 UI surfaces table updated with actual shipped components
- [ ] Bible §12 gaps table: FAR MVP row moved to §14 change log with ship date
- [ ] This checklist's Phase 1 items all checked
- [ ] Post-launch monitoring: FAR value distributions for first 100 users look sane (no mass-zero, no mass-above-100 without corresponding training data)

---

*End of FAR implementation checklist.*
