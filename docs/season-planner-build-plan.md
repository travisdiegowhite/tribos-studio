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

**Phase rules** (per A block, in date order). **(Gate 1, 2026-10-09)**

**A blocks:**
- A races at most 2 weeks apart (`A_BLOCK_MAX_GAP_WEEKS`) form one **block** that shares a single build.
- One race in the block is the **focus**. It defaults to the *last* race, with the earlier ones as springboards, and `focusConfirmed = false` so the UI asks the athlete which race matters more. The athlete's pick is passed in as `focus: true`.
- Where to store that pick is a Phase 2 schema question; `race_goals` has no column for it.

**Phases, aimed at the block's focus race at week `w`:**
- Taper `w-1`..`w`, plus every week from the block's first race to its last.
- Peak `w-3`..`w-2`.
- Build `w-9`..`w-4`.
- Recover the 2 weeks after the block's last race.
- The first 4 weeks of the season are Recover.
- Everything else is Base.

**Floors and overlaps:**
- The build starts no earlier than the end of the previous block's recovery, and no earlier than the end of the season-start Recover.
- When phases overlap, Taper > Recover > Peak > Build > Base. Recovery after a race comes before sharpening for the next one.

**Verdict rules:**

**First block of the season**, judged on its build:

| Build weeks | Verdict |
|---|---|
| 6 (full, `FULL_BUILD_WEEKS`) | On track |
| 3–5 | Tight |
| fewer than 3 | Conflict |

**Follow-on block** (any later block), judged on the gap since the previous block, not on a full build. Close A races are a normal season.

| Gap | Verdict |
|---|---|
| 4+ weeks (`FOLLOW_ON_ON_TRACK_GAP_WEEKS`) | On track ("recover, then carry that form into it", noting any rebuild weeks) |
| 3 weeks | Tight (recover and sharpen, no rebuild) |

**Other A races in a block** share the focus race's verdict, with a springboard / rides-the-form sentence.

**Event day:** a lower-priority race on the **same date** as a higher-priority one is one event (e.g. a run/bike combo), so it's On track.

**B or C race near an A race:**
- In the same week but on another day → Conflict.
- B 1–2 weeks before → Conflict (it lands in the taper).
- C 1–2 weeks before → Tight (ride it easy).
- B or C 1–2 weeks after → Tight (still recovering).

**General:**
- Outside the plan window → Conflict.
- When several rules hit one race, the worst verdict wins.
- On-track races still get a sentence (tune-up, sharpener, base check, recovery).
- What every verdict carries: `buildWeeks`, `gapWeeks`, `relatedRaceId`, and for A races `blockFocusId` and `focusConfirmed`.

**Sport:**
- Races carry `sport` (`bike` / `run` / `multi`, default `bike`).
- Every rule is sport-agnostic, so a run A race weighs the same as a bike A race.
- `race_goals.race_type` has no running types today; adding them (and mapping `race_type` → `sport`) is part of Phase 2/4.

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

## Year view UI

- **Calendar card:** month labels, a race marker lane, the 52-cell phase band, weekly hours bars and the today line. It scrolls horizontally below about 940 px.
- **Race list:** priority, name, date, discipline/distance, verdict chip and sentence, and earlier/later buttons. The selection is shared with the calendar.
- **Coach panel:** persona label, the selected race, the coach message, an "Also affected" list and an ask box.
- **Add a race:** a manual form, plus search in phase 6.

**Interaction.** Every move re-runs the engine locally and redraws. After a debounce of about 1 s, it saves to `race_goals` via `syncRaceEntry` and appends a `season_plan_events` row. Reset reverts to `discussed_snapshot`. At phone width the sidebar stacks under the calendar.

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

## Coach integration

The coach is called only on request. The engine's own sentence is shown first, so the page works with no AI calls.

**(P0)** It gets its own endpoint, `api/season-coach.js`:
- no tools;
- persona from `api/utils/personaData.js`;
- `rateLimitByUser` + `enforceAiQuota`;
- the same model as `api/coach.js`.

It does **not** go through `coach.js`, which carries the calendar write tool.

**Payload:**
- the persona;
- today as a formatted string;
- every race with its formatted date, verdict, reason and build weeks;
- the `PlanDiff` since `discussed_snapshot`;
- the optional question.

**Prompt rules:**
- Use only the dates and week counts in the payload.
- Give two to four sentences: the cost of the change plus one tradeoff or fix.
- Never contradict the verdict.
- No Peaksware terms.
- Stay in the persona.

After a reply, the current plan becomes the new `discussed_snapshot`, and the exchange is logged with the event ids.

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
4. **Editing:** add, move, re-prioritize, remove, debounced save, event log and Rebuild block. **Gate:** no date shifts in America/Denver vs UTC.
5. **Coach panel.** **Gate:** 10 sample replies across On track / Tight / Conflict.
6. **Race search.** **Gate:** 5 real searches.

## Acceptance tests

These are implemented in `src/lib/season/engine.test.ts`. The plan starts Monday 2026-10-05, and the fixture races fall in weeks 23 / 27 / 36 / 41 / 48.

| Case | Expected | Status |
|---|---|---|
| Baseline | Both A races On track; State RR is a mid-build tune-up | ✅ |
| Squeeze (June A +3 wk) | **Amended:** Fall A is an On-track follow-on with a 3-week rebuild; the diff lists the build change | ✅ |
| Collapse (June A +6 wk) | **Amended:** Fall A is an On-track follow-on, no rebuild | ✅ |
| Follow-on 3 weeks after an A race | Tight | ✅ |
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
