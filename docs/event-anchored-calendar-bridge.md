# Event-Anchored Calendar Bridge

## Problem

Tribos has two parallel workout systems:

| System | Source of truth | Reader |
|---|---|---|
| **Legacy template plans** | `planned_workouts` (NOT NULL FK → `training_plans.id`) | `useTrainingPlan` (calendar at `/planner`), `useTodayData` (legacy TodaysBrief) |
| **Event-anchored sequencer** | `session_prescriptions` (FK → `block_instances.id`) | `useSequencerToday` → `SequencerPrescriptionCard` on `/today` |

When a user anchors a race, `api/sequencer-event-anchored-init.js` writes `session_prescriptions` rows (next 14 days) and the daily cron `api/sequencer-daily-rollover.js` keeps preloading +7 days. **None of these rows reach the calendar** at `/planner`, because the planner reads `planned_workouts` exclusively.

End result before this bridge: anchored prescriptions exist in the DB, render only on the TodayView card, and are invisible everywhere else.

## Decision: Option A — Server-side dual-write

The sequencer endpoints (init + daily rollover) write a "calendar projection" of each `session_prescriptions` row into `planned_workouts`, attached to a phantom `training_plans` row tagged `template_id = 'event_anchored'`. The existing planner UI reads `planned_workouts` and renders the projection like any other plan.

**Drift safeguards**

- `session_prescriptions` is **canonical**. `planned_workouts` is treated as a derived projection.
- The only writers to the projection are `api/sequencer-event-anchored-init.js` and `api/sequencer-daily-rollover.js`. Both go through `api/utils/eventAnchoredCalendarBridge.js`.
- Phantom plans are tagged with `template_id = 'event_anchored'` — grep that string before adding new logic that touches "real" training plans.
- The projection is a **non-fatal best-effort**: if writing `planned_workouts` fails, anchoring still succeeds and the next daily rollover heals the missing rows.

### Why Option A

- **Tiny blast radius.** All planner UI (drag-drop, completion checkboxes, week view, ICS export, gear inference, activity-to-workout matching) keeps working with zero changes. Server-side only.
- **Activity matching is free.** When a Strava/Garmin ride syncs, the existing matcher writes `planned_workouts.activity_id` + `actual_rss`. Compliance metrics, training-load calculations, and "you completed today's workout" UI all light up automatically.
- **Drag-and-drop is free.** Users can move a workout to another day; the `planned_workouts.scheduled_date` update is local to the projection. The canonical block plan in `session_prescriptions` is unaffected by user drags — which is fine, because the block plan represents *intent* and the projection represents *what's on the calendar today*.
- **Multi-plan UX already exists.** `PlannerPage` supports multiple active plans (`SegmentedControl` at `src/pages/PlannerPage.tsx:209`); the phantom plan slots in alongside any template-based plan the user has running.
- **Easy rollback.** Delete the phantom plan + its workouts and the user is back to status quo. Canonical data is untouched.

### Trade-offs accepted

- **Drift risk.** Two tables hold the same truth. Mitigated by routing all projection writes through `eventAnchoredCalendarBridge.js` and treating `session_prescriptions` as canonical (any divergence gets fixed by re-running the bridge).
- **Phantom training_plans rows feel like a hack.** They're a real row that has to be filtered out of any "real plans" surface (e.g. the templates browser). In practice the templates browser reads `training_plan_templates`, not `training_plans`, so this is mostly a labelling concern.
- **Skeletal intervals on the calendar tile.** `planned_workouts` doesn't store `prescribed_intervals`. The calendar tile shows duration + RSS + a session-type label. For full interval breakdowns the user clicks through to the prescription card on `/today`. Adding a `prescribed_intervals` JSONB column to `planned_workouts` would close this gap; see "When to revisit" below.

## Option B — Teach the calendar to read both tables (deferred)

Modify `useTrainingPlan` and `useTodayData` to UNION `planned_workouts` with `session_prescriptions`, rendering anchored sessions as a virtual plan in the calendar.

**Pros**

- Single source of truth. No duplication.
- Cleaner long-term data model.
- Interval-level detail renders directly in calendar tiles (no click-through needed).

**Cons (why not now)**

- ~10–15 file blast radius spanning hooks, planner UI, today UI, activity matcher.
- Every workout-touching surface needs branching for two row shapes (`planned_workouts` vs `session_prescriptions`).
- Drag-and-drop semantics conflict with the deterministic block plan — an anchored prescription isn't supposed to move, so the planner would need to either disable drag for anchored sessions (UX inconsistency) or implement a "move and regenerate" flow (significant work).
- Activity matcher writes `planned_workouts.activity_id` + `actual_rss`. There's no equivalent column on `session_prescriptions` — adding one or inventing a third "completion" table is a much larger change.
- PostgREST doesn't UNION; client-side merge per render across two tables.
- Higher chance of breaking the legacy template flow that all current users rely on.

## When to revisit Option B

Move to B when one or more of:

1. **The legacy template system is being sunset.** If `planned_workouts` itself is going away, the dual-write becomes a dual-write to a doomed table. Switch the readers first.
2. **Calendar tiles need interval-level detail.** The simplest A-compatible patch is adding `prescribed_intervals JSONB` to `planned_workouts` and writing it through the bridge. If that addition feels heavier than just teaching the calendar to read `session_prescriptions` directly, B wins.
3. **Drift becomes observable.** If the projection routinely diverges from canonical despite the safeguards (e.g. background jobs are writing `planned_workouts` outside the bridge), switch to a single-source-of-truth read path.
4. **A second projection consumer appears.** If we end up materializing `session_prescriptions` into a third table for another surface (mobile widget, analytics export), the drift surface widens — at that point a unified read makes more sense than N projections.

## Operational notes

- **Phantom plan identity:** one `training_plans` row per user, tagged `template_id = 'event_anchored'`, `status = 'active'`. Its `name` is updated on each anchor to `Race: <race name>`.
- **Re-anchor (`replace=true`):** the bridge deletes old projection rows for the affected date range before writing new ones. Stale rows do not linger on the calendar.
- **Sport type:** the phantom plan is created with `sport_type = 'cycling'`. If multi-sport anchoring lands later, derive this from the race or the user's primary sport.
- **Idempotency:** the projection writes are upserts keyed on `(plan_id, scheduled_date)`. Re-running the rollover for a given day is safe.
