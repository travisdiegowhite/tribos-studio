# Season Planner — Phase 0 audit

2026-10-09 · read-only audit of the codebase against `docs/season-planner-build-plan.md`. The decisions it led to are recorded at the end.

## 1. Races already have a home

**`race_goals`** (`database/migrations/015_race_goals.sql`):
- `race_date DATE`, `priority` A/B/C (default `'B'`, no CHECK), `race_type`, `distance_km`, `elevation_gain_m`, `location` TEXT, `status` (upcoming/completed/cancelled/dns).
- `route_id` was added in 063 and `target_tfi_min/max` in 083.

**Mirrored into `calendar_entries`.** Every write is copied into `calendar_entries` (114) via `src/lib/calendar/raceEntrySync.ts` (`syncRaceEntry` / `deleteRaceEntry`):
- The mirror row has the same uuid, `type='race'` and `pinned=true`.
- Migration 115 backfilled the existing rows.

**Readers.** About 25 readers across `src/` and `api/`, including:
- the coach, `getTodaySpine`, `arc-refill`, `temporalAnchor` and `raceDemand`;
- `TrainingCalendar` and `RaceGoalModal` (the writer).

**Hygiene note.** Past races keep `status = 'upcoming'`; nothing rolls them to completed. The season planner should filter on date, not status.

**Decision:** no `season_races` table. The planner reads and writes `race_goals` through `syncRaceEntry`, so the coach, the calendar and the planner agree on race dates. The plan's `course_geom` maps to the existing `route_id`.

## 2. Dates

**Client.** `src/utils/dateUtils.js` (`formatLocalDate`, `parseLocalDate`, `weekStartKey`) is the timezone-safe client toolkit.

**Server.** `api/utils/temporalAnchor.js` (`toLocalDateStr`, `noonUTCFor`) is the server equivalent.

**Leftover risk.** About 113 `toISOString().split('T')[0]` sites remain in `src/` and `api/`. These are the known source of UTC off-by-one bugs. Do not copy them.

**The engine needs no timezone at all.** Plan start and race dates are plain dates, so week math is done on integer day numbers. Timezone matters only when the UI picks "today", which it passes in as a local date string.

## 3. Calendar UI

**Routes.** `/train` renders `TrainingDashboard.jsx` with `?tab=` tabs: calendar (default), coach, race, trends, …. There is no `/plan` route and no PLAN tab.

**Calendar component.** `TrainingCalendar.jsx` is a rolling four-week view. Nothing is reusable for a 52-week strip beyond the theme tokens.

**Placement.** The year view becomes a new **Season** tab (`?tab=season`).

## 4. Coach

**How it's called.** `api/coach.js`:
- `claude-sonnet-4-6`, non-streaming;
- the system prompt is built from about 20 `=== … ===` sections;
- the persona comes from `api/utils/personaData.js` (`PERSONA_DATA`), keyed by the athlete's `coaching_persona`;
- rate limits are `rateLimitByUser(…,'AI_COACH',…,10,5)` and `enforceAiQuota`.

**Why the season coach must not route through `coach.js`.** It carries the `calendar_change` write tool, plus a retry that forces a tool call when it detects calendar intent. v1 must not change workouts.

**Decision:** a separate small `api/season-coach.js` with no tools, reusing `PERSONA_DATA`, `rateLimitByUser` and `enforceAiQuota`.

## 5. Weekly hours

**Source.** `fitness_snapshots.weekly_hours` (026) has one row per Monday week, computed in `api/utils/fitnessSnapshots.js`.

**`training_load_daily` has no duration.** So the snapshots are the source.

**In the engine.** `typicalWeeklyHours()` takes the median of the last eight non-empty weeks, with the rider-entered number as the fallback.

## 6. Existing periodization

**The arc builder.** `api/utils/sequencerPlanner.js` (`buildEventAnchoredSequence`) builds blocks backward from **one** race: taper, race_specific, vo2, threshold, aerobic_build, then maintenance/reactivation.

**Where its output goes.** `api/utils/arcBuilder.js` stores the blocks on `training_plans.blocks`, and `derivePhaseFromBlocks` (`api/utils/contextHelpers.js`) drives Today's phase. The sequencer UI is behind the `event_anchored_planner` flag.

**Other phase lists.** `src/utils/trainingPlans.ts` `TRAINING_PHASES` and the template `phases` arrays are static lists, not computed.

**The gap.** Nothing plans across several races.

**Decision:** the season engine is display-only in v1. Its Recover/Base/Build/Peak/Taper vocabulary does not replace the arc's blocks, and Today's phase still comes from the arc. The future seam: the season engine picks the A race, and the arc builds toward it.

## 7. Infrastructure the plan assumed

| Plan says | Repo has | Use |
|---|---|---|
| Supabase edge function | No `supabase/` directory; all server code is Vercel `api/` | `api/season-*.js` |
| PostGIS `Point` / `LineString` | PostGIS dropped in 108 | `lat`/`lng` numeric; `route_id` for courses |
| Trigram name search | No `pg_trgm` | `ILIKE` + date window; add `pg_trgm` only if it's weak |
| Feature flag | `user_profiles.feature_flags` + `useFeatureFlag` (`src/utils/featureFlags.ts`) | new `season_planner` flag |
| Free vs paid | No tier infrastructure | Stays flag-gated; tiering is its own project |
| Shared engine on the server | `api/` already does `await import('../src/lib/…ts')` (`training-load-projection.js`) | same pattern |

The next migration number is **128**.

## 8. Design

**The plan's spec is superseded.** The plan names Barlow / DM Mono, teal-gold-orange-coral, an orange Build and a red Conflict. That is the TB-001 spec, which `docs/DESIGN-OVERHAUL-PLAN-2026-09.md` supersedes, and it rules out orange and red entirely.

**Remap using role tokens:**

| Element | Token |
|---|---|
| Recover | `--color-easy` (cyan, light fill) |
| Base | sheet `#F3F3F6` with a rule |
| Build | `--color-signal` (magenta fill) |
| Peak | `--color-ink` |
| Taper / race week | `--color-highlight` (lime) |
| On track | `--color-done` + hand-drawn tick |
| Tight | ink outline chip |
| Conflict | `--color-signal` fill; the screen's one stamp moment |

**Type:** Tribos Display for headings, Archivo for UI, Courier Prime for numbers and the coach's voice.

## 9. Known calendar bugs that touch this work

- **Stale race statuses** (see §1).
- **`toISOString` date sites** (see §2).
- **Moving an A race does not rebuild the arc** that targets it.

**Decision for v1:** a rider-initiated **Rebuild block** button that re-runs the arc builder toward the new date. It must respect `pinned` entries; `insertSessions` already skips filled days. It is never automatic. Before wiring it, confirm whether arcs are built via the coach's `generate_block` or the `event_anchored_planner` path.

## Decisions (Travis, 2026-10-09)

- **Races:** reuse `race_goals`; no `season_races`.
- **Moving an A race:** offer a rebuild button; never auto-rebuild.
- **Placement:** a Season tab on `/train`, behind a `season_planner` flag, alongside the Calendar.
- **Engine rule gaps** are resolved as recorded in the build plan's "Engine rules" section.
- **Still open:**
  - free vs paid;
  - a fixed or rolling season start;
  - sequencing against the onboarding work.
