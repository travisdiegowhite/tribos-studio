# Season Planner — Build Plan

Oct 8, 2026 · @Travis · amended 2026-10-09 after the Phase 0 audit (`docs/season-planner-phase0-audit.md`). Amendments are marked **(P0)**.

## Goal and scope

Build a full-year season planner. The rider places races (A/B/C) and sees the season's phases computed from them. Each race gets a plain-language readiness verdict that updates instantly when races move. The coach comments on what a change costs, using a structured diff from the engine.

v1 includes:

- **Year view:** 52 weeks, a phase band, race markers, weekly hours bars and a "today" line.
- **Race list:** priority, date, verdict chip, verdict sentence, and earlier/later controls.
- **Planning engine:** deterministic pure functions, no AI. It lives in `src/lib/season/engine.ts`.
- **Coach panel:** narrates the engine's diff when asked.
- **Adding a race:** manually, or by search + confirm.

v1 plans and explains. **(P0)** The one exception: when a moved A race is the target of an active training arc, the rider may press **Rebuild block**. That re-runs the existing arc builder toward the new date, respecting pinned entries, and is never automatic.

**(P0) Placement:** a **Season** tab on `/train` (`?tab=season`), behind the `season_planner` feature flag. It sits beside the Calendar and does not replace it.

## Design principles

1. **The engine owns all dates and math.** Phase boundaries, build lengths, verdicts, week indexes and weekday names come from pure functions. The LLM never computes any of them.
2. **The coach narrates diffs, not state.**
3. **All dates are plain calendar dates.** **(P0)** The engine does week math on integer day numbers, so no timezone enters it. Timezone is used only to choose "today", which the UI passes in as a local `YYYY-MM-DD`.
4. **Verdicts, not PMC charts.** On track / Tight / Conflict plus one sentence. No CTL/ATL/TSB/TSS. Weekly hours is the only load number.
5. **Small and legible.** One engine module, one page.
6. **Approval gates** after each phase.

## Data model (P0: trimmed)

**Races stay in `race_goals`.** It already has `race_date DATE` and A/B/C `priority`, and is mirrored to `calendar_entries` via `syncRaceEntry`. There is no `season_races` table, and courses use the existing `route_id`.

New tables, starting at migration 128:

| Table | Purpose | Key columns |
|---|---|---|
| `season_plans` | One plan per rider per season | `id`, `user_id`, `name`, `start_date` (date, a Monday), `weeks` (default 52), `fallback_weekly_hours`, `discussed_snapshot` (jsonb, the coach baseline / Reset target), `created_at` |
| `season_plan_events` | Change log for coach diffs | `id`, `plan_id`, `race_id` → `race_goals.id`, `kind` (add/move/remove/priority), `before` / `after` jsonb, `created_at` |
| `race_directory` (phase 6) | Shared, deduplicated races | `id`, `name`, `race_date`, `discipline`, `distance_km`, `elevation_m`, `lat`, `lng`, `url`, `source`, `confirmed_count`, `last_confirmed_at` |

Notes:
- **No PostGIS.** It was dropped in migration 108. The dedupe key is normalized name + `race_date` + within 25 km, using haversine on lat/lng.
- **RLS.** Riders own their `season_plans` and events. `race_directory` is readable by signed-in users; inserts go through a Vercel `api/` function that dedupes.
- **Apply by hand and confirm.** Apply each migration manually and confirm with `npm run audit:schema`.

## Planning engine

`src/lib/season/engine.ts` imports nothing. Every rule is a named constant at the top.

**Race profiles.** **(Gate 1b, 2026-10-09)** Taper, peak and recovery lengths come from each race's profile, built by `src/lib/season/raceProfile.ts` (pure). They follow how long and hard a race is, more than its name: a 50 km gravel race and Unbound 200 share `race_type='gravel'`.

1. **Expected hours.**
   - The goal time if set.
   - Otherwise distance ÷ speed: bike types use `estimateGoalDurationMin` from `raceDemand.ts`; run and multisport types use a pace table.
   - Otherwise a per-type default.
2. **Effort hours** = expected hours × sport load factor (bike 1.0, multi 1.0, run 2.5). Running costs more recovery per hour.
3. **Band:** taper weeks include the race week.

| Band | Effort h | Examples | Taper | Peak | Recover |
|---|---|---|---|---|---|
| short | < 1.5 | crit, CX, TT, 5K, sprint tri | 1 | 1 | 1 |
| medium | 1.5–4 | road race, XC MTB, 10K, olympic tri | 2 | 2 | 1 |
| long | 4–8 | 100-mi gravel, century, BWR, half marathon, 70.3 | 2 | 2 | 2 |
| ultra | ≥ 8 | Unbound 200, marathon, Ironman, ultra run | 3 | 2 | 3 |

A race passed without a profile gets `DEFAULT_RACE_PROFILE`: taper 2, peak 2, recover 2. The build is 6 weeks for every band.

**A blocks.** **(Gate 1)**
- A races at most 2 weeks apart (`A_BLOCK_MAX_GAP_WEEKS`) form one **block** that shares a single build.
- One race in the block is its **focus**. It defaults to the *last* race, with the earlier ones as springboards, and `focusConfirmed = false` so the UI asks which race matters more. The athlete's pick arrives as `focus: true`, stored as `race_goals.is_focus` (Phase 2).

**Phases**, aimed at the block's focus race at week `w`, using its profile:
- **Taper:** the last `taper` weeks up to and including `w`, plus every week from the block's first race to its last.
- **Peak:** the `peak` weeks before the taper.
- **Build:** 6 weeks before the peak.
- **Recover:** the block's longest `recover` after its last race.
- **Season start:** the first 4 weeks are Recover.
- **Base:** everything else.
- **Floor:** the build starts no earlier than the end of the previous block's recovery, and no earlier than the end of the season-start Recover.
- **Overlaps:** Taper > Recover > Peak > Build > Base. Recovery after a race comes before sharpening for the next one.

**Verdict rules.**

**First block of the season**, judged on its build:

| Build weeks | Verdict |
|---|---|
| 6 (`FULL_BUILD_WEEKS`) | On track |
| 3–5 | Tight |
| fewer than 3 | Conflict |

**Follow-on block** (any later block): there is no fixed week count. It is **On track when `gap ≥ recover(previous block) + taper(this race)`**, i.e. the recovery and the taper both fit in the gap. The sentence notes any rebuild weeks. Otherwise it is **Tight**: "you go straight from recovering into the taper." Typical minimums:

| Sequence | Minimum gap |
|---|---|
| Road race → road race | 3 weeks |
| 100-mi gravel → 100-mi gravel | 4 weeks |
| Marathon → marathon | 6 weeks |

**Inside a block:** a race following an ultra (recovery > 2 weeks) is Tight, because it comes before you've recovered.

**Other A races in a block** share the focus race's verdict, with a springboard / rides-the-form sentence.

**Event day:** a lower-priority race on the **same date** as a higher-priority one is one event (e.g. a run/bike combo), so it's On track.

**B or C race near an A race:**
- In the same week but on another day → Conflict.
- Within the A race's taper (`gap ≤ taper(A)`): B → Conflict, C → Tight (ride it easy).
- Earlier, but `gap < recover(B/C) + taper(A)` → Tight (its recovery runs into the taper).
- After the A race, within `recover(A)` → Tight (still recovering).

**General:**
- Outside the plan window → Conflict.
- When several rules hit one race, the worst verdict wins.
- On-track races still get a sentence.
- What every result carries: `sport`, `profile`, `buildWeeks`, `gapWeeks`, `relatedRaceId`, and for A races `blockFocusId` and `focusConfirmed`.

**Sport.** Races carry `sport` (`bike` / `run` / `multi`, from `race_type` or set explicitly). Priority rules are identical across sports; only the profile differs, via the load factor and pace tables.

**Phase 2 schema/UI follow-ups from Gate 1b:**
- **Migration 128:** `race_goals.is_focus boolean not null default false`.
- **New race types in `src/utils/raceTypes.js`**, each entry tagged with `sport`:
  - run: `run_5k`, `run_10k`, `half_marathon`, `marathon`, `trail_run`, `ultra_run`;
  - multi: `duathlon`;
  - relabel `triathlon` from "Triathlon (Bike)".
  - The route builders (`RouteBuilder.jsx`, `RaceDetailsCard.tsx`) filter to bike/multi.
  - `race_type` is free TEXT, so no migration is needed for this.

**Weekly hours:** typical hours × the phase multiplier:

| Phase | Multiplier |
|---|---|
| Recover | 0.55 |
| Base | 1.0 |
| Build | 1.35 |
| Peak | 1.25 |
| Taper | 0.75 |

**(P0)** Typical hours is the median of the last 8 non-empty `fitness_snapshots.weekly_hours`, falling back to a rider-entered number.

**Diff:** `diffPlans(before, after)` returns:
- `changed` races, with signed weeks;
- `added` and `removed`;
- `priorityChanges` and `buildChanges`;
- `verdictChanges`, with the new reason.

All dates are pre-formatted, e.g. "Sat, Jun 19, 2027".

The browser runs the engine on every move. The server imports the same file (`await import('../src/lib/season/engine.ts')`) for saves and coach payloads.

## Year view UI — "the season as a ride" (built 2026-10-10)

The first read-only version (a 52-cell phase band with weekly bars) looked too much like TrainingPeaks' Annual Training Plan. Travis picked the "ride" direction from a mockup, and that replaced it.

**The profile:** `src/components/season/SeasonProfile.tsx` draws the year as a course.
- **The ridge:** weekly hours. Ridden weeks (from `fitness_snapshots`) are inked in; the plan is a dashed ridge over ground coloured by phase.
- **Today:** a "YOU ARE HERE" marker.
- **Races:** flags on the ridge. Goal races are pennants; target and tune-up races are diamonds, magenta when in conflict.
- **Coach notes:** up to three hand-lettered notes (`pickNotes`). The order is the first conflict, then a block's springboard, then the recovery valley after the next goal race.
- **On a phone** it scrolls sideways, opening at today.

**The window:** rolling, 8 weeks back + 52 ahead (`defaultSeasonStart`). Fixed seasons are still an open question.

**Vocabulary on the surface** (the engine keeps its names):
- priorities read **Goal / Target / Tune-up**;
- phases read **Recover · Base · Climb · Sharpen · Descend**.

**Race list and selected-race panel:** the panel shows the verdict, the engine's sentence, the taper/recover profile and linked races. On a phone it stacks under the profile.

**Parked:** the "race tickets" mockup. Travis likes it; it needs a home (Race tab or a race-week card on Today).

## Editing (Phase 4, built 2026-10-11)

**Controls** for an upcoming race, in the selected-race panel:
- **Week earlier / Week later:** keeps the weekday.
- **Goal / Target / Tune-up.**
- **This one matters more:** on a goal race in a back-to-back block; writes `race_goals.is_focus` and clears it on the rest of the block.
- **Edit details and Add race:** the existing `RaceGoalModal`.
- **Remove:** with an inline confirm.
- Past races show no controls.

**How a change flows:**
- Edits apply to local rows (`src/lib/season/edits.ts`, pure), so the engine re-runs and every verdict updates on the click.
- Changed races save together about 1 s after the last click (`useSeasonPlan`, `src/lib/season/seasonWrites.ts`):
  - the `race_goals` row, then `syncRaceEntry` with the **full row**;
  - then one `season_plan_events` row per change, against the athlete's `season_plans` record (created on first edit).
- Several clicks collapse into one event and one message.
- **Every save reports:** a toast with tap-to-undo, or a red toast saying what failed with the race put back. Leaving the tab saves anything pending.

**Rebuild block: deferred.**
- Nothing builds a training block toward a race any more (the coach's `buildArc` path was removed in the calendar rebuild).
- No active plan targets an upcoming race.
- A future "Plan toward this race" needs its own server endpoint writing to `calendar_entries` that respects pinned days.

**(P0) Visual language** follows `docs/DESIGN-OVERHAUL-PLAN-2026-09.md`, not TB-001. There is no orange or red.

| Phase | Token |
|---|---|
| Recover | `--color-easy` (light) |
| Base | sheet + rule |
| Build | `--color-signal` |
| Peak | `--color-ink` |
| Taper / race | `--color-highlight` |

| Verdict | Treatment |
|---|---|
| On track | `--color-done` + tick |
| Tight | ink outline |
| Conflict | signal fill; the screen's one stamp moment |

Fonts are Tribos Display, Archivo and Courier Prime.

## Coach integration (Phase 5, built 2026-10-11)

The coach is called only on request, never on a move. The engine's own sentence is shown first, so the page works with no AI calls.

**Where the code is:**

| Piece | File |
|---|---|
| Payload (browser, pure, tested) | `src/lib/season/coachPayload.ts` |
| Endpoint | `api/season-coach.js` |
| Validation + prompt text | `api/utils/seasonCoachPrompt.js` |
| Ask / Reset / baseline | `useSeasonPlan` (`askCoach`, `resetToDiscussed`), `saveDiscussedSnapshot` in `seasonWrites.ts` |
| Panel | `src/components/season/SeasonCoachPanel.tsx`, under the selected race |
| Gate samples | `scripts/season-coach-samples.mjs` (`--dry-run` prints the prompts without an API key) |

**The browser builds the payload** from the engine that is already running there, so the serverless function never imports `src/` TypeScript and never computes a date. The payload carries:
- today and the season window, as formatted strings;
- every upcoming race with its formatted date, role (Goal / Target / Tune-up), sport, effort band, verdict, reason, build weeks and a note for back-to-back blocks;
- what changed since `season_plans.discussed_snapshot`, as sentences: the engine's `PlanDiff` plus focus picks, which `PlanDiff` doesn't carry; with no baseline it's a first look;
- the optional question (≤ 500 characters).

**The server** (`api/season-coach.js`):
- POST only, `requireAuth`, `rateLimitByUser('SEASON_COACH', 10/5 min)`, `enforceAiQuota`;
- 413 above 30 KB, then `sanitizePayload` caps races at 60 and changes at 40, clips the text and drops unknown fields;
- adds the persona (`getCoachPersona` + `PERSONA_DATA` + the preferred name) and `buildCoachVoiceRules`;
- no tools, no calendar writes;
- logs both sides of the exchange to `coach_conversations` (`coach_type 'strategist'`, `context_snapshot.surface = 'season_planner'`), best effort.

**Model:** `claude-opus-5-5` at low effort, with server-side fallback (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`). That replaces P0's "same model as `coach.js`", which is still `claude-sonnet-4-6`. A refusal returns 502 with a "try rephrasing" message.

**Prompt rules:**
- Use only the dates, weekdays and week counts in the message; never compute or convert one.
- Give two to four sentences: what the change costs or buys, plus one concrete tradeoff or fix.
- Never contradict a verdict; if the coach would plan it differently, it says what it would change.
- No training-load metrics and no TrainingPeaks terms.
- The coach can't change the plan itself.

**After a reply**, the version the coach was shown becomes `discussed_snapshot` (`{ plan, rows: [{ id, race_date, priority, is_focus }] }`) and `discussed_at`. **Reset to what we discussed** puts date, priority and focus back through the normal edit path, so it saves, toasts and offers Undo like any other edit. Races added or removed since are left alone, and the toast names them.

## Race search v1 (phase 6)

1. Search `race_directory` first (`ILIKE` name + date window + distance from the rider).
2. If there are fewer than 3 hits, a Vercel `api/` function asks Claude with web search for structured candidates. Check the tool name and pricing against current docs when this phase starts.
3. Show the candidates as "unconfirmed", with source links.
4. The rider confirms or edits them. Only confirmed races are written to `race_goals` and upserted into `race_directory` (which bumps `confirmed_count`).

Guards:
- per-user rate limit;
- never auto-add a race;
- the confirmed date wins.

## Sequencing and gates

1. **Audit:** done; see the audit doc.
2. **Engine + tests, no UI:** `src/lib/season/engine.ts`, `engine.test.ts`, `scripts/season-print.mjs`. **Gate:** phases and verdicts look right on Travis's real races.
3. **Schema + read-only year view** behind `season_planner`. **Gate:** visual review.
4. **Editing:** built — add, move, re-prioritize, block focus, remove, debounced save, event log. Rebuild block deferred. **Gate:** no date shifts in America/Denver vs UTC (edits tests pass under Denver, UTC and UTC+14); re-plan well under 100 ms.
5. **Coach panel:** built: ask on request, a "since we last talked" list, Reset, logging. **Gate:** 10 sample replies across On track / Tight / Conflict (`node scripts/season-coach-samples.mjs`).
6. **Race search.** **Gate:** 5 real searches.

## Acceptance tests

These are implemented in `src/lib/season/engine.test.ts`. The plan starts Monday 2026-10-05, and the fixture races fall in weeks 23 / 27 / 36 / 41 / 48.

| Case | Expected | Status |
|---|---|---|
| Baseline | Both A races On track; State RR is a mid-build tune-up | ✅ |
| Squeeze (June A +3 wk) | **Amended:** Fall A is an On-track follow-on with a 3-week rebuild; the diff lists the build change | ✅ |
| Collapse (June A +6 wk) | **Amended:** Fall A is an On-track follow-on, no rebuild | ✅ |
| Follow-on where the recovery and taper overlap (3 wk, default profile) | Tight | ✅ |
| (Gate 1b) Race profiles: road 3 wk On track; 100-mi gravel 3 wk Tight / 4 On track; marathon 5 Tight / 6 On track; crit 1-week taper; long B race recovery into a taper → Tight | as above | ✅ |
| A block (A races ≤ 2 weeks apart) | One shared build; focus defaults to the later race; asks to confirm | ✅ |
| Same-date combo (run + bike) | The lower-priority race rides along, On track | ✅ |
| Travis's 2026 season | No conflicts | ✅ |
| B in taper | Conflict, naming the A race | ✅ |
| C in taper | Tight | ✅ |
| Post-A | Tight (recovering) | ✅ |
| Out of window | Conflict, "outside this season" | ✅ |
| Timezone | Identical in Denver and UTC; the suite also passes under `TZ=Pacific/Kiritimati` | ✅ |
| Round trip | Identical plan, empty diff | ✅ |
| (P0) Precedence, clipped first build, same week, worst verdict wins | as above | ✅ |

UI checks to come:
- verdicts update in under 100 ms;
- moving a race makes no AI call;
- the layout works at 390 px.

## Out of scope and open questions

**Out of scope:**
- day-level workout generation (beyond the Rebuild block button);
- course-aware routes;
- feeding evidence-engine verdicts into readiness;
- scraping;
- multi-season views.

**Open:**
- free vs paid (there is no tier infrastructure yet);
- a fixed or rolling season start;
- sequencing against the onboarding work;
- persona-specific rules: v1 uses one rule set.
