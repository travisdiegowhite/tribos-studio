# Metrics Rollout — FREEZE Policy

**Filed**: 2026-05-09
**Decision owner**: Travis
**Supersedes**: the "complete the §3b cut-overs and §2c drops" plan in
`docs/METRICS_ROLLOUT_REMAINING.md`.

## TL;DR

The B0–B10 metrics rollout (TSS→RSS, CTL→TFI, ATL→AFI, TSB→FormScore,
NP→EP, IF→RI) is **frozen in its current state**. The user-visible work
(coach voice, dashboard labels, FS confidence badge) shipped in B6/B7/B8
and stays. The remaining engineering work — reader cut-overs and legacy
column drops in migrations 074–080 — is **abandoned, not deferred**. The
two production bugs the rollout left behind are fixed in the same PR
that introduces this doc.

## What's frozen

| Item | Status under freeze |
|------|---------------------|
| Canonical columns added by migrations 069–073 | **Stay.** Live in production, dual-written or canonical-only-written depending on call site. |
| `training_load_daily` legacy column drop (migration 071, B4) | **Stays dropped.** Cut-over completed cleanly in B3; no rollback. |
| Deferred drop migrations 074–080 (`activities`, `fitness_snapshots`, `workout_adaptations`, `plan_deviations`, `planned_workouts`, `training_segments`, `user_profiles.weekly_tss_estimate`) | **Will not run.** The DROP blocks at the bottom of each file stay commented out indefinitely. The legacy columns coexist with their canonical twins as the long-term schema. |
| Reader cut-overs listed in `METRICS_ROLLOUT_REMAINING.md` §1a–§1f | **Will not happen.** Readers continue to use the `canonical ?? legacy` fallback pattern. No big-bang rename PRs. |
| `tsb-projection.ts` internal rename (§3a) | **Will not happen.** Internal JS keys (`{ctl, atl, tsb}`) stay; the bridge in `process-deviation.js` translates at the DB boundary. |
| `src/utils/trainingPlans.ts` and friends — internal JS identifier sweep (§3b) | **Will not happen.** User-invisible variable names stay legacy. |
| `tfi_composition` wiring (§2a), `FSTargetBadge` wiring (§2b), stream-based EP recomputation (§2c), `tfi_tau`/`afi_tau` per-row snapshot (§2d) | **Out of scope of the freeze, evaluate independently.** These are feature enhancements, not rename plumbing. None block. |

## Why freeze

1. **The user-visible deliverables already shipped.** Coach prompts (B7),
   dashboard labels (B8), FS confidence badge (A2) — anything an athlete
   actually reads is already on canonical names. The remaining work is
   internal naming hygiene.
2. **Each remaining PR carries sequencing risk for zero user value.** The
   `target_rss` gap (production 400 in `correction-proposal-apply.js`)
   is exactly the failure mode the cut-over PRs would re-introduce: a
   reader expecting a column the writer never populated. We don't need
   more chances to land that bug.
3. **The dual-write / fallback-soup steady state is stable.** PostgreSQL
   doesn't care about extra NULL columns. The JS reader pattern
   `canonical ?? legacy` is well-understood and consistently applied.
   Nothing rots if we leave it alone.
4. **Rollback path stays cheap.** Keeping the legacy columns means any
   §3b code can be reverted without a data restore.

## What's fixed by the freeze PR

The two production bugs that motivated this decision are closed in the
same PR that introduces this doc:

1. **`planned_workouts.target_rss` schema gap**
   - Migration 089 adds the column and backfills from `target_tss`.
   - `api/correction-proposal-apply.js` now dual-writes `target_tss` +
     `target_rss` on every mutation site (lines for `skip`, `extend`,
     `reduce`, `swap`, `add`).
   - `api/utils/eventAnchoredCalendarBridge.js` switches from the
     `target_tss`-only workaround to dual-writing both columns.
   - `src/types/training.ts` comment for `target_rss` rewritten to
     describe the actual freeze state (not a transitional spec §3b
     shim, just a coexisting canonical twin).
   - Closes the silent `target_rss || 0` zero-coercion in
     `api/utils/tfiProjection.js:42` (the projection now sees real
     values from the backfill).
   - Resolves the `42703` 400 in `api/utils/temporalAnchor.js:279`.

2. **`plan_deviations` dual-write gap**
   - `api/process-deviation.js` now writes both legacy
     (`planned_tss / actual_tss / tss_delta`) and canonical
     (`planned_rss / actual_rss / rss_delta`) on every insert. Future
     readers that prefer canonical will see populated values; current
     readers on legacy continue to work unchanged.

## Rules for new code under the freeze

These supersede the "Read canonical-first, write canonical only" guidance
that CLAUDE.md inherited from the §3b plan.

1. **Read canonical-first with legacy fallback.** Pattern:
   `row.canonical ?? row.legacy`. Apply to every read of a renamed column.
2. **Write both columns whenever a row is mutated.** This is the change
   from the previous policy. New writers should populate canonical AND
   legacy on insert/update so neither side is NULL. This eliminates the
   sequencing risk that caused the `target_rss` and `plan_deviations`
   bugs.
   - The exception is `useTrainingPlan.ts` and `ActivityLinkingModal.jsx`,
     which currently write only `actual_rss`. Leave them as-is — readers
     handle the fallback, and those rows are never read by legacy-only
     callers in practice. Don't add new canonical-only writers.
3. **Don't add new canonical-only readers.** If a piece of code SELECTs a
   canonical column without including its legacy twin in the SELECT list
   or the JS fallback, you are creating a future `target_rss`-style bug.
4. **Don't rename internal JS identifiers.** `ctl`, `atl`, `tsb`, `tss`,
   `np`, `if` as variable names inside `trainingPlans.ts`,
   `tsb-projection.ts`, etc. are off-limits for opportunistic refactoring.
5. **Don't run migrations 074–080.** If a future change makes them
   genuinely necessary, that gets its own scoped PR with explicit user
   approval — not as a cleanup pass. Same rule already applies under
   CLAUDE.md.

## Spec consistency check

The spec §7 "consistency checklist" in `docs/TRIBOS_METRICS_SPECIFICATION.md`
asks for `grep -ri "\.tss\b\|\.ctl\b\|\.atl\b\|\.tsb\b" src/` to return
zero hits. **Under the freeze, that check no longer applies.** The
canonical names are the user-visible names; the legacy JS identifiers
are internal plumbing and are explicitly allowed to stay.

## Status of the rollout-tracking docs

- `docs/METRICS_ROLLOUT_STATUS.md` — historical record of B0–B10. Keep
  for context. The "Known production bugs" section is closed by this PR.
- `docs/METRICS_ROLLOUT_REMAINING.md` — describes the abandoned tail.
  Keep as historical context for what *would* have been done; do not
  treat as a roadmap.
- `docs/planned-workouts-target-rss-followup.md` — closed by this PR.
  Keep for the postmortem trail.

## When to revisit

The freeze is indefinite, not provisional. Revisit only if:

- A future feature genuinely requires dropping a legacy column (e.g. a
  CHECK constraint on `actual_rss` that conflicts with `actual_tss`
  being NULL) — handle case-by-case.
- A new TSS-style bug appears that's traceable to the dual-naming
  surface. If one comes up, address that single column rather than
  resuming the rollout.
- The Supabase row size becomes a problem (it won't — the legacy columns
  are integer/numeric and trivially small).

The default answer to "should we revive the rollout?" is **no**.
