# TFI Duality — Decision Memo

**Filed:** 2026-05-11
**Author:** claude/fix-tfi-computation-duality-BrvzR
**Status:** Decision pending — implementation deferred to a separate PR.
**Supersedes:** the per-surface fixes implied by `docs/metric-audit.md` §6
"Next Steps" (Apr 26 / May 3 race protocol).

## TL;DR

Production has two TFI sources that disagree:

1. **Server TFI** — `training_load_daily.tfi` + `fitness_snapshots.tfi`,
   written by `api/utils/trainingLoad.js` and
   `api/utils/fitnessSnapshots.js`. Spec-faithful: terrain × MTB
   multipliers (§3.1), per-athlete `tfi_tau` (§3.4), persistent
   prior-day state (no cold start), `rss_source` tier tracking.
2. **Client TFI** — `src/utils/computeFitnessSnapshots.ts` ⇒
   `calculateTFI` in `src/utils/trainingPlans.ts`, driven by the
   Dashboard `useMemo` (`src/pages/Dashboard.jsx:285–330`) and
   `src/views/today/useTodayData.ts:266–329`. No terrain or MTB
   multiplier; hard-coded `tau = 42`; 90-day window with cold-start
   at 0.

**Recommendation:** **Option (a) — Promote server TFI to canonical
display**, with two prerequisite fixes that must land in the same PR.
This ends the duality, aligns the displayed number with the
source-of-truth that already feeds coach, projection, sequencer, and
deviation, and stays inside the freeze policy (no rename, no
migration 074–080, no `tsb-projection.ts` touch).

Sections below: (1) actual measured delta, (2) reader inventory,
(3) option scoring, (4) recommended implementation sketch,
(5) open questions for approval.

---

## 1. Measured delta — best available without production access

I could not call `/internal/metrics-audit` from this sandbox (no
JWT / no network to the email-gated endpoint). The delta below is
reconstructed by formula and confirmed against the only first-party
data point in-tree: the audit-day snapshot in `docs/metric-audit.md`
(Apr 23). **A real CSV pull before merge is a prerequisite** — flagged
in §5.

| Source            | Formula inputs                                                                  | Travis (Apr 23, pre-Bug-A)       | Travis (post-Bug-A, post-dc43a5c) — estimated |
|-------------------|---------------------------------------------------------------------------------|----------------------------------|-----------------------------------------------|
| ActionRow / dash  | Tier-5 fallback for Garmin rows, 90-day, tau=42, cold-start 0                   | **~38**                          | **~135–150** (Tier 1 device RSS now hits)     |
| BanisterChart     | Same code path as ActionRow (commit de71d57 collapsed them)                     | **~38–68**                       | **~135–150**                                  |
| Server `training_load_daily.tfi` | rss + terrain + MTB × 1.3 + per-athlete tau + persistent state | **~70–160** (hilly/MTB inflation) | **~150–200**                                  |

**Magnitudes of the components**, measured against the same daily RSS series:

- **Persistent vs 90-day cold-start.** 1 − e^(−90/42) ≈ 0.883 → 12%
  steady-state undercount for the client. (Audit Bug B.)
- **Terrain multiplier (§3.1).** Cap 1.40. Applied **only to kJ +
  inferred tiers** (D4 amendment). For Travis, almost every ride hits
  Tier 1 (device RSS) or Tier 3 (power + FTP), so terrain
  contributes **~0%** to his delta. For users without power meters
  riding hilly terrain, this can be up to **+40%**.
- **MTB × 1.3.** Applied to **every** RSS tier server-side. Zero on
  the client. Travis's mix is mostly road, so this is **0–10%**
  averaged; for predominantly MTB users it's a flat **+30%**.
- **Per-athlete `tfi_tau`.** For ages 30–45 the adaptive tau is 42 —
  identical to the client default. No delta for Travis. Older
  athletes (≥45) would see a slightly slower-building server TFI;
  younger (<30) slightly faster.

**Net for Travis:** post-Bug-A, expected server vs client delta is
**+15–25%** (cold-start convergence dominates; terrain ~0). For a
heavy-MTB rider with no power meter, it could be **+60–80%**.

This is significantly smaller than the audit's "70-160 vs 38"
snapshot, because that snapshot was taken with Bug A active (client
falling to Tier 5 heuristic). Bug A's fix in 86116d0 already closed
most of the duality. **What remains is mostly cold-start (Bug B) plus
multiplier semantics.**

---

## 2. Reader inventory

### 2a. Readers of `training_load_daily.tfi` / `.afi` / `.form_score`

| File                                          | Use                                                                 | Survives option (b)? |
|-----------------------------------------------|---------------------------------------------------------------------|----------------------|
| `api/coach-ride-analysis.js:162,191`          | Post-ride coach narrative ("TFI: 142 · AFI: 138 · FS: +4")          | **No** — coach loses fitness context |
| `api/training-load-projection.js:40,48`       | Seeds projection state from latest row                              | **No** — falls back to (42, 42, 0); breaks projections |
| `api/process-deviation.js:59,67,201,242`      | Seeds `tsb-projection.ts` state; writes back updated state          | **No** — and per CLAUDE.md `tsb-projection.ts` is **deferred / off-limits** |
| `api/utils/sequencerContext.js:119–133`       | 14-day daily stats feed for sequencer block engine                  | **No** — `sequencerBlockOps.js:30–31` divides by `snap.tfi`; null/zero → Infinity |
| `api/utils/checkInContext.js:204`             | Check-in flow context                                               | **No** — check-in renders "fitness unknown" |
| `api/strava-webhook.js:507`<br>`api/garmin-webhook-process.js:557`<br>`api/coros-webhook-process.js:197` | Webhook-side post-upsert reads for notification + trend deltas | **No** — push notifications lose load-delta copy |
| `src/components/progress/FitnessProgressChart.jsx:202,293,327` | Charts SERVER tfi as a second line next to client CTL    | **No** — chart loses its second series |
| `api/internal/fitness-audit.js:53`            | Travis-only audit endpoint                                          | N/A (debug) |
| `src/hooks/useFormConfidence.ts:28`           | Reads `fs_confidence` only — not `tfi`                              | Yes (orthogonal) |
| `src/hooks/useTodayTerrain.ts:37`             | Reads `terrain_class` only                                          | Yes (orthogonal) |

### 2b. Readers of `fitness_snapshots.tfi`

| File                                          | Use                                                          | Survives option (b)? |
|-----------------------------------------------|--------------------------------------------------------------|----------------------|
| `api/coach-ride-analysis.js:173`              | Coach trend context                                          | **No** |
| `api/coach-correction-trigger.js:236`         | `ctl:tfi` alias — adaptation trigger context                 | **No** |
| `api/utils/fitnessHistoryTool.js:221,300,672,813` | Coach historical-fitness tool ("how am I vs 6 months ago") | **No** |
| `api/utils/metricsComputation.js:530`         | TCAS computation (`ctl:tfi` alias)                           | **No** — TCAS drops out |
| `api/utils/checkInContext.js:138`             | Check-in (`ctl:tfi` alias)                                   | **No** |
| `src/views/today/useTodayData.ts:510`         | 4-week sparkline trend                                       | **No** — sparkline empty |
| `src/components/HistoricalInsights.jsx:582`   | Historical-insights chart                                    | **No** |
| `src/utils/adaptationTrigger.ts:341`          | Adaptation trigger trend                                     | **No** |

**Verdict for option (b):** ~14 server reader sites would all need
to be retrofitted to compute TFI client-side or read activities and
fold their own EWA. Plus `tsb-projection.ts` is explicitly deferred
under the freeze and cannot be touched. **Option (b) is not viable.**

---

## 3. Options scored

| Option | What it does | Pros | Cons |
|--------|--------------|------|------|
| **(a) Promote server** | Switch Dashboard `trainingMetrics`, `useTodayData` `buildAthleteMetrics`, and `FitnessProgressChart`'s second line to read `training_load_daily.tfi` / `fitness_snapshots.tfi` with a client-computed fallback when rows are missing. | Single source of truth. Inherits spec-correct math (terrain/MTB/τ). Closes Bug B by construction (server has persistent state). All downstream consumers (coach, projection, sequencer, deviation) already agree. | UX jump: ~15–25% upward for Travis, up to ~60–80% for MTB-heavy users with no power. Apr 27 – May 9 Garmin window has known bad server TFI (canonical-only Tier-1 reader bug at `api/utils/fitnessSnapshots.js:313`). `training_load_daily` is sparse — users without recent webhook events have stale or missing rows. |
| **(b) Demote server** | Stop writing `tfi/afi/form_score` on `training_load_daily` and `fitness_snapshots`. Client becomes the only source. | Smallest UX impact (numbers stay where athletes have seen them). | Breaks ~14 server consumers including projection, sequencer, deviation, coach — and the freeze forbids touching `tsb-projection.ts`. Effectively requires rebuilding the proprietary metrics pipeline on the client. **Out of scope.** |
| **(c) Reconcile formulas** | Port the server's terrain + MTB + per-athlete τ + 180-day window into `computeFitnessSnapshots.ts`. | Both sources agree by construction; no UX jump beyond what (a) would also cause. | Largest engineering surface in client code: need `sport_type, average_gradient_percent, percent_above_6_percent, tfi_tau` in every client query (Dashboard, useTodayData, FitnessProgressChart). Still doesn't fix the Apr 27 – May 9 server hole. Still leaves two parallel implementations that must be kept in sync forever — the original mistake. |

---

## 4. Recommended implementation (option a)

Sequence for the implementation PR (don't open without a CSV pull
from `/internal/metrics-audit` confirming the §1 estimates within
±20%):

1. **Fix the server canonical-only Tier-1 reader** in
   `api/utils/fitnessSnapshots.js:313`. Change to
   `const stored = activity.rss ?? activity.tss; if (stored && stored > 0) ...`
   — exact pattern the client already uses post-86116d0. This closes
   the Apr 27 – May 9 Garmin hole and any future regression where
   canonical is NULL but legacy is populated.
2. **Backfill** `training_load_daily` for Apr 27 – May 9 for all
   users with Garmin webhook activity in that window. Re-run the
   `upsertTrainingLoadDaily` writer for each affected day. Scope:
   one-shot script in `scripts/`, not a migration.
3. **Switch the client display surfaces** to read server TFI first,
   client-compute as fallback:
   - `src/pages/Dashboard.jsx:285–330` — fetch the latest
     `training_load_daily` row, use `row.tfi / row.afi / row.form_score`
     when present; fall through to the existing `useMemo` when null.
   - `src/views/today/useTodayData.ts:266–329` (`buildAthleteMetrics`) —
     same pattern; keep `tfiHistory` for the 28-day sparkline by
     joining `training_load_daily` rows over the window.
   - `src/components/progress/FitnessProgressChart.jsx:264–314` —
     no change needed (already prefers server `tld.tfi` for its
     dedicated TFI series). Audit copy/tooltips for the relabel.
4. **Add a one-time release note + UI affordance.** Athletes whose
   displayed TFI jumps need a single in-app explainer ("Tribos now
   shows your full-spec TFI including terrain, MTB, and your
   personal time constant — see Settings → Metrics"). Avoid a
   "phased rollout" — the duality is the bug; another month of
   running two numbers is worse than a single explanatory bump.
5. **Don't touch `tsb-projection.ts`, `src/utils/trainingPlans.ts`
   internal identifiers, or any migration 074–080.** Freeze rules
   still apply.

Estimated PR size: 4 files changed in `src/`, 1 in `api/utils/`, 1
backfill script. ~250 LOC net.

---

## 5. Open questions for approval

1. **CSV pull required.** Implementation should not proceed before
   someone with Travis's JWT exports `/internal/metrics-audit?debug=true`
   for the last 90 days and confirms the §1 deltas (Travis ~+15–25%,
   plus any MTB-heavy comparison user) within ±20%. If the real
   delta is materially larger (e.g. ≥50% for Travis), reconsider —
   the UX bump may merit a longer explainer cycle.
2. **MTB-heavy user check.** §1's "+60–80%" estimate for a
   no-power-meter MTB rider is a worst case. Pull a second audit
   row for an actual MTB user (or skip if Travis is the only
   audit-gated account); if the worst-case is real and there are
   such users in the active cohort, scope a per-user "show me what
   changed" view alongside the release note.
3. **Apr 27 – May 9 backfill scope.** Should we backfill all users,
   or only users with Garmin webhook events in that window? Cheaper
   to filter; safer to do all.
4. **Sparse-rows fallback policy.** When `training_load_daily` is
   missing the last 1–3 days (sparse webhook), do we (i) hold the
   last server row and show "as of N days ago", or (ii) fall through
   to client-compute for those missing days? Recommend (ii) — keeps
   the FORM cell live for athletes who manually log workouts.
5. **Branch reconciliation.** This memo lives on
   `claude/fix-tfi-computation-duality-BrvzR` per the session's
   designated branch. The task prompt asked for
   `claude/tfi-duality-decision-XXXX` off `main`; please confirm
   whether to rename / recreate before merge.

**End of memo — no production code in this session.**
