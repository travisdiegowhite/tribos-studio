# Follow-up: `planned_workouts.target_rss` gap

**Filed**: 2026-05-09
**Discovered while**: wiring the event-anchored calendar bridge (PR on branch `claude/event-anchored-plan-generation-E3zpA`).
**Owner**: unassigned — pick this up in a fresh session.

## Context

The Tribos metrics rollout (B0–B10, see `docs/METRICS_ROLLOUT_STATUS.md`) renamed `tss → rss`, `ctl → tfi`, etc. across 11 tables via the safe additive + cut-over pattern. **For `planned_workouts`, only `actual_rss` was added — `target_rss` was deliberately deferred.**

The reasoning is documented in `database/migrations/078_drop_planned_workouts_legacy.sql:6-7`:

> "scope limited to actual execution fields; target_tss stays because it seeds plan templates and is not yet on the rename list — see workoutLibrary.ts static data"

i.e. `src/data/workoutLibrary.ts` defines ~100 workouts with `targetTSS` baked in, and the template-plan generators in `src/data/trainingPlanTemplates.ts` and `src/data/runningPlanTemplates.ts` propagate that into `planned_workouts.target_tss`. Renaming requires touching all of that template data plus every generator at the same time, which was bigger than the actuals-side rename and got punted.

## Live impact today

1. **`api/correction-proposal-apply.js`** — lines 130, 149, 156, 165, 170, 184 SELECT and UPDATE `target_rss` on `planned_workouts`. Every call returns a Supabase 400 (`column "target_rss" does not exist`) the moment the column is referenced. This means any "coach correction" workflow that tries to adjust a target intensity is broken in production. No one has filed a bug — likely because the failure is caught upstream and surfaces only as a generic toast.
2. **`api/utils/tfiProjection.js:42`** — also reads `w.target_rss` from `planned_workouts` rows. The fallback (`w.target_rss || 0`) silently coerces undefined to 0, so projections look like there's no planned load. Likely a quietly-degraded state, not a hard failure.
3. **`src/types/training.ts`** — the type comment claims `target_rss?: number | null` is "Dual-populated; optional during §3b transition." That comment is wrong; nothing populates it because the column doesn't exist.
4. **The event-anchored calendar bridge** (this branch) discovered the gap when the projection upsert started 400-ing. The bridge now writes `target_tss` as a workaround (`api/utils/eventAnchoredCalendarBridge.js:121-125`). That workaround should stay until this gap is closed, then flip to canonical.

## Two scoping options

### Option A — Minimal fix (~1 file + 1 migration)

Add the column, fix the readers/writers that already reference it, leave `workoutLibrary.ts` and the template generators alone (they keep using `target_tss`). The dual-write is honest at the column level even if some writers still only emit legacy.

- **Migration 088**: `ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS target_rss NUMERIC;` plus a backfill `UPDATE planned_workouts SET target_rss = target_tss WHERE target_rss IS NULL AND target_tss IS NOT NULL;`
- Update `api/correction-proposal-apply.js` to write both `target_tss` AND `target_rss` (mirror writes — the file already structures `updates.target_rss = …`; just add `updates.target_tss = …` alongside).
- Update `api/utils/eventAnchoredCalendarBridge.js:121-125` to write `target_rss` (canonical) and drop the workaround comment.
- Update the comment in `src/types/training.ts` to match reality.

**Trade-off**: drift between actuals (`actual_rss` canonical-twin populated) and targets (still legacy-anchored) lingers. Acceptable as a step toward Option B.

### Option B — Full rename (~10–15 files, larger surface)

In addition to Option A:

- Rewrite `src/data/workoutLibrary.ts` to store `targetRSS` instead of `targetTSS` (and keep a deprecated `targetTSS` getter mapping to it for legacy template-data consumers, or do a coordinated cut).
- Update every consumer in `src/data/trainingPlanTemplates.ts`, `src/data/runningPlanTemplates.ts`, `src/data/runningWorkoutLibrary.ts`, and the template-applying logic in `src/hooks/useTrainingPlan.ts` + `api/utils/planGenerator.js`.
- Cut readers across the planner UI to canonical-first.
- Eventually run a follow-up migration 089 that drops `target_tss` from `planned_workouts` (one of the deferred §2c drops).

**Trade-off**: completes the §3b transition for this table. Bigger blast radius and needs careful template-data testing.

## Recommended path

Do **Option A in a focused PR**. It unblocks the production bug in `correction-proposal-apply.js`, lets the event-anchored bridge write canonical, and stays small enough to review in a single sitting. Option B can land later as part of the broader §2c drop sequence (`074`–`080`), which CLAUDE.md already says is on hold pending 2–4 weeks of stable §3b production.

## Verification checklist (Option A)

- `npm run test:run` still passes (no test currently asserts `target_rss` on `planned_workouts`, but the projection helper has implicit coverage via the bridge tests if any are added).
- After deploy, run in Supabase SQL editor:
  ```sql
  SELECT scheduled_date, target_tss, target_rss, name
  FROM planned_workouts pw
  JOIN training_plans tp ON tp.id = pw.plan_id
  WHERE tp.user_id = '<test-user>' AND tp.template_id = 'event_anchored'
  ORDER BY scheduled_date;
  ```
  Expect `target_tss` and `target_rss` to be equal on every row written after the migration; rows from before should have `target_tss` populated and `target_rss` filled by the backfill.
- Trigger a correction-proposal apply (any workflow that hits `api/correction-proposal-apply.js`) and confirm no 400s in the network tab.

## Next-session prompt (copy/paste)

> Fix the `planned_workouts.target_rss` gap. Context lives in `docs/planned-workouts-target-rss-followup.md` — read that first; it summarizes why the column is missing and what's broken because of it.
>
> Scope: Option A from that doc. Specifically:
>
> 1. Write migration `database/migrations/088_planned_workouts_target_rss.sql` that adds the column and backfills from `target_tss`.
> 2. Update `api/correction-proposal-apply.js` so every site that writes `target_rss` also writes the same value to `target_tss` (dual-write). Look at lines 130, 149, 156, 165, 170, 184 in particular.
> 3. Update `api/utils/eventAnchoredCalendarBridge.js:121-125` to write `target_rss` (canonical) instead of `target_tss`. Remove the workaround comment that explains why we wrote legacy.
> 4. Fix the type comment in `src/types/training.ts` to describe the actual state (column now exists; backfilled; new writers should emit `target_rss`).
> 5. Run `npm run test:run` and confirm 725 tests still pass.
> 6. Commit on a fresh branch (`claude/planned-workouts-target-rss-XXXX`), push, and stop. Do not run the migration — it stays in `database/migrations/` for the user to execute in Supabase before the deploy.
>
> Do not touch `src/data/workoutLibrary.ts` or the template generators — that's Option B and is out of scope for this PR. Keep the diff small and surgical.
