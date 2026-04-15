# Tribos Metrics Rollout — Session Handoff

**Status as of this commit.** A fresh Claude session can pick up from here.

---

## What's shipped (on `main`)

| PR | Title | Migration | Commit |
|----|-------|-----------|--------|
| #643 | A1 — Adaptive EWA tau for CTL/ATL | 066 | `ce4b24f` |
| #644 | A2 — TSS source + confidence + FS gating | 067 | `189d33b` |
| #645 | A3 — design brief | — | `676b13a` |
| #646 | A3 — migration + estimator + tests | 068 | `9734359` |
| #647 | A3 — coach context surfaces | — | `cf41f55` |
| #648 | A3 — Dashboard StatusBar terrain chip | — | `ea72841` |
| #650 | B0 — canonical spec + CLAUDE.md pointer | — | `33d1b12` |
| B1 | B1 — adaptive-tau discrete brackets + user_profiles additive migration | 069 | _(pending)_ |

A3 is fully closed end-to-end: classification → persistence → scoped multiplier → coach prompts → UI chip.

**B1 delta** (additive / dual-write, no reader cut-over):
- `database/migrations/069_adaptive_tau_rename.sql` — adds `user_profiles.tfi_tau` (int) and `user_profiles.afi_tau` (numeric(4,1)) alongside the existing `ewa_long_tau` / `ewa_short_tau` columns.
- `src/lib/training/adaptive-tau.ts` + `api/utils/adaptiveTau.js` — adds `calculateTFITimeConstant` (spec §3.4) and `calculateAFITimeConstant` (spec §3.5) as discrete-bracket formulas. Legacy `calculateLongTimeConstant` / `calculateShortTimeConstant` stay in place (removed in B4).
- `recomputeUserTauConstants` dual-writes all four columns. Extends its activity lookback from 42 → 180 days so it can derive a TFI-series variance for §3.4's `tfiVariance6Months` input. Legacy `ewa_long_tau` / `ewa_short_tau` still feed the 42-day variance formula.
- `api/utils/fitnessSnapshots.js` (reader of tau) is deliberately untouched — reader cut-over is B3.

---

## What triggered the bigger rollout

The user shared the canonical **Tribos Metrics Specification** (TSS→RSS, CTL→TFI, ATL→AFI, TSB→FS, NP→EP, IF→RI rename plus formula changes). It is **not yet saved in the repo**. Saving it verbatim to `docs/TRIBOS_METRICS_SPECIFICATION.md` is the very first action (B0).

The full spec text is in the **user's chat message history** — look for the message starting `# Tribos Metrics System — Canonical Specification`. It is ~14 KB. Copy it verbatim into the target file.

---

## Five structural decisions — LOCKED (do not re-litigate)

1. **D1 — `rss_source` enum: keep 6 tiers** (`device`, `power`, `kilojoules`, `hr`, `rpe`, `inferred`). Tribos amendment to spec §3.1. Reason: the spec's 4-tier set (`power`, `hr`, `rpe`, `inferred`) would discard real Garmin/Wahoo `device` TSS values and Strava kJ-without-NP cases.
2. **D2 — confidence values: keep A2's calibrated values** (device 0.95, power 0.95, kJ-with-FTP 0.75, kJ-no-FTP 0.50, hr 0.65, inferred 0.40). Do NOT flatten to spec's 1.0/0.75/0.50/0.25.
3. **D4 — terrain multiplier scope: A3-conservative** — applies ONLY to kJ and inferred tiers. NP and HR already reflect grade-induced cost. Amendment to spec §3.1 which applies it to all tiers.
4. **Rename scope: full consistency** — all 11 tables carrying TSS/CTL/ATL/TSB/NP/IF get renamed, not just the two tables spec §4's migration script lists.
5. **Migration style: safe additive + cut-over** — add new columns → dual-write → cut readers → drop old columns. Zero-downtime. No hard `ALTER TABLE RENAME` mid-deploy.

The D-numbering refers to the fuller reconciliation analysis in `/root/.claude/plans/eager-baking-balloon.md` (the session plan file).

---

## The 11-PR sequence

Each PR is a separate session. Current active branch: `claude/b0-save-metrics-spec` (created, empty — ready for B0a).

| # | PR | Scope | Depends on |
|---|-----|-------|------------|
| **B0** | Save spec + CLAUDE.md pointer | `docs/TRIBOS_METRICS_SPECIFICATION.md` verbatim + `CLAUDE.md` pointer section with D1/D2/D4 amendments | — |
| B1 | Adaptive-tau formulas | Rewrite `src/lib/training/adaptive-tau.ts` with discrete age brackets (spec §3.4/§3.5); migration 069 additive add `profiles.{tfi_tau, afi_tau, metrics_age}` | B0 |
| B2 | `training_load_daily` additive migration + dual-write | Migration 070 adds `rss, tfi, afi, form_score, rss_source, tfi_composition, tfi_tau, afi_tau`; `upsertTrainingLoadDaily` writes both old + new columns | B1 |
| B3 | `training_load_daily` reader cut-over | Update all readers (coach files, webhooks, hooks) to pull new column names; rename internal JS/TS object keys | B2 |
| B4 | Drop old `training_load_daily` columns | Migration 071 drops `tss/ctl/atl/tsb/tss_source`; drop `profiles.ewa_long_tau/ewa_short_tau`; remove dual-write code | B3 |
| B5 | Terrain multiplier: spec §3.1 formula + MTB + EP zero-power filter | Replace A3's 4-class classifier with spec's `gradientFactor × steepFactor × vamFactor` (capped 1.40); MTB 1.3× multiplier; EP zero-power filter (GPS speed > 5 km/h); keep D4 scoping | B2 |
| B6 | FS uses yesterday's values + confidence weights + `tfi_composition` | Fix FS = previousTFI − previousAFI per spec §3.6; update `calculateFormScoreConfidence` weights to spec `[0.30, 0.20, 0.15, 0.12, 0.10, 0.08, 0.05]`; compute and persist `tfi_composition` jsonb | B2 |
| B7 | Coach prompt rewrites per spec §6 | Every `api/coach*.js` + `checkInContext.js` + `proactive-insights-process.js` + `trainingDataTool.js`: plain English first, Tribos abbreviations second; coach voice never emits raw "RSS" | B3 |
| B8 | UI labels + FS target badge + retire TWL display | StatusBar subtitles (FS/TFI/AFI); `FitnessSummary.jsx` prop renames; new `FSTargetBadge.tsx` for races within 21 days using `FS_TARGETS` table; remove TWL cell from `ProprietaryMetricsBar.tsx` | B3 |
| B9a–d | Rename `activities` + `fitness_snapshots` (additive + cut-over) | B9a: migration 073 adds `activities.effective_power`, `activities.ride_intensity`, dual-write at Strava/Garmin/Coros/FIT ingestion. B9b: reader cut-over. B9c: migration 074 drops old columns. B9d: same pattern for `fitness_snapshots.{ctl,atl,tsb,weekly_tss,avg_normalized_power}` | B4 |
| B10 | Rename remaining 7 tables | `activity_twl`, `activity_efi`, `weekly_tcas`, `cross_training_activities`, `workout_adaptations`, `training_segments`, `training_plan_templates`, `onboarding_profile` — each: additive → reader cut-over → drop | B9 |

**Estimated total: ~14 atomic sessions** (B9 and B10 each split into multiple mini-sessions).

---

## Active branch + exact next action

**Branch**: `claude/b0-save-metrics-spec` (already created on this repo, empty beyond this handoff file)

**Next session prompt** (copy/paste to kick off):

> Continue the Tribos Metrics rollout. Read `docs/METRICS_ROLLOUT_STATUS.md` for context, and `/root/.claude/plans/eager-baking-balloon.md` for the full plan.
>
> We're on branch `claude/b0-save-metrics-spec`. This session executes **B0a only**: write `docs/TRIBOS_METRICS_SPECIFICATION.md` verbatim from the spec text I pasted in chat history (starts with "# Tribos Metrics System — Canonical Specification"). Single Write call. DO NOT edit CLAUDE.md, do not commit, do not push in this session — just get the file on disk. End when the file exists.
>
> Then the next session will do B0b: verify the spec file, update CLAUDE.md with a Metrics pointer section (documenting D1/D2/D4 amendments), commit, push, open PR.

---

## Open data questions (to resolve during B5 / B6 implementation, not now)

- **B5**: are `averageGradientPercent` and `percentAbove6Percent` stored on `activities` rows, or do they need to be derived from `fit_coach_context` streams? Fall back to elevation/km if neither is available.
- **B5**: exact MTB identifier — verify `sport_type === 'MountainBikeRide'` against Strava + Garmin + Wahoo enum before committing the MTB 1.3× branch.
- **B5**: is GPS speed stream available in `activities.fit_coach_context.time_series`? Needed for EP zero-power filter. Skip filter when absent.
- **B6**: where does per-activity zone distribution live — `activities.ride_analytics.zone_distribution_seconds` or `activities.fit_coach_context.power_zone_distribution` or `activities.power_curve_summary`? Pick one canonical source before computing `tfi_composition`.

---

## Plan file

Full context (including the D-number reconciliation of every A1/A2/A3 divergence from the spec) lives in `/root/.claude/plans/eager-baking-balloon.md` on this host. That file is Claude-session scratch; the canonical roadmap is this handoff doc committed to the repo.
