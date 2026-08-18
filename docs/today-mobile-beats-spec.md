# Today on mobile — the four-beat page

**Status:** draft for approval · 2026-08-18
**Scope:** `/today` on viewports ≤768px. Desktop `/today` is unchanged in v1.
**Source doc:** the "Four-Beat Voice Templates" draft (voice, register, glyph rules).
This spec is the implementation contract for it — what gets built, from which
data, in what order.

---

## 1. What this changes

Today `/today` renders `TodaySpine` (`src/views/today-spine/TodaySpine.tsx:65`).
On mobile it stacks four desktop zones into one column
(`TodaySpine.tsx:192-202`): the fitness node, the training-arc chart, a Mapbox
canvas (`RidesMap.tsx`), and the coach panel. That is a desktop instrument
reflowed onto a phone.

After this change, mobile `/today` is:

```
  PAGE HEADER (compact)
  GetStartedGuide          ← unchanged; self-gates (GetStartedGuide.jsx:138)
  BEAT 1  what you did     ← sentence + route-trace glyph + 7-day rhythm strip
  BEAT 2  how you feel     ← Flat / Normal / Strong, or defer
  BEAT 3  what to do       ← sentence + workout-silhouette glyph
  BEAT 4  need a route?    ← one button, pre-filled
  ── See the numbers ──    ← disclosure; reveals node + spine + map
```

Desktop keeps the spine exactly as it is. The beats are additive on mobile and
**not** rendered on desktop in v1 (see D3).

Nothing is deleted. `today-glance` and the orphaned `src/views/today` stay as
they are.

---

## 2. Decisions

These are the arguable parts, resolved. Each is cheap to reverse except D4.

**D1 — No AI on the beats in v1.** Every beat is a deterministic template.
`today_hero_paragraphs` (migration 081) was an AI-authored dashboard paragraph;
it shipped, PRs #675–#681 were reverted, and the table is orphaned. We are not
re-running that experiment as part of a layout change. The voice doc's
two-layer contract (code fills slots, AI connects) is preserved as a *function
shape* — `renderBeatN(slots): string` — so adding a phrasing layer later is a
swap of one function, not a rewrite.

**D2 — No new Today view directory.** The beats live in
`src/views/today-spine/beats/` and render from the existing `SpineData`. There
are already three Today implementations on disk; a fourth is how this becomes
unmaintainable.

**D3 — Mobile only in v1.** The desktop hero (`summaryLine`,
`getTodaySpine.ts:468-481`) is already a one-line plain-language summary, so
desktop is not suffering the problem this solves. Putting the beats on desktop
too is a follow-up worth doing, but bundling it doubles the review surface and
the layout risk of the first ship.

**D4 — Beat 2 writes a new table, and nothing reads it but this page.** The
felt-response is stored (`daily_feel`, §6) so the pattern is available later,
but in v1 it feeds **only** Beat 3's on-screen copy and Beat 4's pre-fill. It
does not enter the load model, does not adjust RSS, does not mutate
`planned_workouts`. Wiring subjective state into the fitness engine is a
separate project with its own evidence rules.

**D5 — Beat 3 never silently contradicts the plan.** `todayVocabulary.ts`
carries an explicit policy: a persistent surface *describes*; prescriptions
belong to the gated coach layer (see the block comment at
`src/utils/todayVocabulary.ts:95-99`, and note C6 in
`docs/todays-focus-narratives.md`). Beat 3 is a coach-zone surface, so it may
prescribe — but a downgrade must say out loud that it is a swap ("let's trade X
for Y"), and the plan row is never rewritten.

**D6 — "Strong" confirms, never escalates.** Per the voice doc. Feeling good
earns a green light on the planned session, not a bigger one.

**D7 — Temporal Tier 1 only.** "Your last ride", "your next hard day". No
"yesterday"/"Tuesday" anywhere in v1, including in the gap copy — see the
Beat 1 deviation note in §5.1. Day-numbers that *are* rendered ("3 quiet days
since") are code-computed integers, not day-words.

**D8 — The map comes off the mobile critical path.** `RidesMap.tsx` statically
imports `mapbox-gl` + `react-map-gl`, which `vite.config.js:23` bundles as the
`vendor-map` chunk. A static import means mobile Today pulls that chunk on load.
`RidesMap` becomes a `React.lazy()` import inside the disclosure, so it is
fetched only if the rider opens the numbers door. Beat 1's route trace needs no
map library — it decodes the polyline with the existing
`src/views/today/shared/decodePolyline.ts` and draws an SVG path.

**D9 — Light-mode only, same as today.** The spine's tokens are hardcoded light
hexes (`src/views/today-glance/tokens.ts`). The beats use the same tokens and
inherit the same limitation. Dark mode for Today is pre-existing debt; do not
try to fix it in this PR.

**D11 — Beat 2 asks on every visit, and deferring is an answer.** The prompt
is present each time the page mounts until the rider either answers or defers;
it is never a modal, a toast, or a badge — just an inline chip row that stops
being a question once it's dealt with. Two defer targets, "after my next ride"
and "tomorrow", so putting it off is a real choice rather than a dismissal.
The one re-ask after an answer is event-driven, never clock-driven: a new ride
landing is new information and earns a second, differently-worded prompt. Full
state machine in §5.2.

**D10 — Callbacks are deferred to v1.1.** The three triggers (effort match,
longest/best-since, repeated route) need activity-level history that
`SpineData` does not carry today. Shipping the beats without callbacks is
honest: the voice doc's own rule is that silence is the default and no filler
appears when no trigger fires.

---

## 3. Where the code lives

```
src/views/today-spine/
  beats/
    types.ts                  BeatsVM + slot types
    buildBeats.ts             pure: (SpineData, FeelState) → BeatsVM
    copy.ts                   the templates; every user-facing string
    feel.ts                   read/write daily_feel
    BeatsColumn.tsx           the mobile stack (composes 1-4 + the door)
    Beat1Recap.tsx
    Beat2Feel.tsx
    Beat3Call.tsx
    Beat4Route.tsx
    glyphs/
      RouteTrace.tsx
      RhythmStrip.tsx
      WorkoutSilhouette.tsx
    buildBeats.test.ts
    copy.test.ts
    Beat1Recap.render.test.tsx      (…one per beat, existing convention)
```

`TodaySpine.tsx` changes in exactly one place — the `isMobile` branch at
`TodaySpine.tsx:192` renders `<BeatsColumn />` plus the disclosure instead of
`nodeCard / spine / bottomRow`.

**All beat logic is pure and lives in `buildBeats.ts`.** Components render a
view-model and hold no derivation. This mirrors `nodeView.ts` and is what makes
the state matrix in §5 testable without React.

---

## 4. Data contract

`buildBeats(data: SpineData, feel: Feel | null): BeatsVM`. No new fetch, no new
hook. Everything below is already in `SpineData` except one field.

| Need | Source | Status |
|---|---|---|
| Last ride, days since | scan `data.days` back from `todayIndex` for `rss > 0` | derivable |
| Last ride geometry | `data.recentRides[0].polyline` (match by date key) | present |
| Distance / elevation / duration | `RecentRide` (`shared/recentRides.ts:10-19`) | present |
| Effort tier | day `rss` bands, same cuts as `labelActivity` (`getTodaySpine.ts:197-211`) | present |
| 7-day rhythm | last 7 `DayNode`s | derivable |
| Today's workout | `days[todayIndex].activity` + `todaysWorkout` | present |
| Plain workout name | `workoutTypeCopy()` (`todayVocabulary.ts:200`) | present |
| Form state words | `formPhrase` / `formStateText` | present |
| Rest day | `activity.tag === 'REST'` | present |
| Goal event | `data.event` | present |
| **`workoutId` for Beat 4** | `planned_workouts.id` | **missing — loader change 1** |
| **Latest activity identity** | last-50 activities read, `mapSource[0]` | **missing — loader change 2** |

**Loader change 1:** the planned-workouts select at `getTodaySpine.ts:575` does
not request `id`. Add `id` to the select and thread it onto `todaysWorkout` as
`workoutId: string | null`. `RouteBuilder2` already reads `workoutId`,
`duration` and `distance` from the query string
(`src/pages/RouteBuilder2.tsx:214-221`), so Beat 4 needs nothing else.

**Loader change 2:** Beat 2's "ask me after my next ride" deferral needs to know
*which* ride was the most recent when the rider deferred (§5.2). Add
`latestActivity: { id: string; startDate: string } | null` to `SpineData`,
taken from the first row of the last-50 activities read the loader already runs
(`getTodaySpine.ts:709-715`, before the polyline filter — an indoor ride still
counts as a ride).

Comparing activity **ids** rather than timestamps is deliberate: a ride that
starts at 08:00 and syncs at 10:00 would be invisible to a timestamp check made
at 09:00, and that is a common Garmin/Strava sync pattern, not an edge case.

Beyond those two fields, `buildBeats` takes `SpineData` whole rather than a
narrowed struct — it keeps the contract in one place.

---

## 5. The beats

Every string below lives in `copy.ts`. Slots in `{braces}` are code-filled and
pre-formatted; formatting goes through the existing
`formatDistanceKm` / `formatElevationM` / `formatDurationMin` helpers
(`today-spine/units.ts`) so mi/km match the rest of Today.

### 5.1 Beat 1 — what you did

**States** (from `lastRideDaysAgo`, computed over `days[]`):

| State | Condition | Copy |
|---|---|---|
| `ridden-today` | today's `rss > 0` | `{opener} today — {duration} with {stat_phrase}.` |
| `recent` | 1–6 days ago | `{opener} on your last ride — {duration} with {stat_phrase}.{gap_clause}` |
| `gap` | 7–20 days ago | `Your last ride was {duration} with {stat_phrase}. Quiet stretch since — no catching up to do.` |
| `long-gap` | 21+ days, or none in window | `Welcome back. No catching up to do — we start from where you are.` |
| `no-history` | `!data.hasHistory` | `Once you've got a couple of rides in, this is where I'll tell you what I'm seeing.` |

`{gap_clause}` — empty at 0–1 days; `" A couple of quiet days since — legs
should be coming back."` at 2; `" {n} quiet days since — legs should be coming
back."` at 3–6.

`{opener}` — a pool of 3–4 per effort tier (easy / steady / brisk / hard),
selected by a **stable hash of the ride's date**, never `Math.random()`. A
random pick re-rolls on every re-render, which reads as the page glitching.
(Voice-doc open question 1: start with 3 per tier, revisit after use.)

`{stat_phrase}` — one citation, chosen by rule, never two:
- climbing-heavy (`elevationM / distanceKm >= 12`) → `{elevation} of climbing`
- otherwise → `{distance}`

**Deviation from the voice doc — decided, keep the recap.** The doc replaces
Beat 1 entirely on off days ("A day off the bike — good."). We keep the
last-ride recap and append the gap as a clause instead, for two reasons:
(a) the doc's own visual rule makes the route trace the thing that opens the
page, and dropping the recap on non-riding days means most rest days open with
no glyph at all; (b) "a day off the bike" is a claim about yesterday, which is
the Tier-2 language D7 bans.

**Glyph:** route trace + rhythm strip (§7).

### 5.2 Beat 2 — how you feel

Chips: `Flat` · `Normal` · `Strong`. Prompt text depends on context:

- **pre-ride** (nothing ridden yet today) — *"How are the legs today?"*
- **post-ride** (a ride has landed) — *"How did that ride feel?"*

Beneath the chips, a muted defer line: *Later — **after my next ride** ·
**tomorrow***. Two tap targets, no menu, no depth.

**Cadence (D11).** The prompt is present on **every visit** until it is either
answered or deferred — the page re-asks on each mount, which is what makes it
"whenever you open the app". It never re-asks after an answer, and never
re-asks during an active deferral. Deferring is a first-class answer, not a
dismissal.

**State machine** — `resolveFeelPrompt(rowsToday, latestActivityId,
todayHasRide)`, pure, evaluated in this order against the most recent row for
the local date:

| # | Condition | Result |
|---|---|---|
| 1 | no rows today | `ask` · context = `todayHasRide ? 'post_ride' : 'pre_ride'` |
| 2 | last row deferred `next_day` | `deferred` — a new `local_date` has no rows, so tomorrow asks on its own |
| 3 | last row deferred `next_ride`, and `latestActivityId` differs from the row's `after_activity_id` | `ask` · context `post_ride` — the ride they deferred to has landed |
| 4 | last row deferred `next_ride`, same activity | `deferred` |
| 5 | last row has a `feel`, and `latestActivityId` differs from its `after_activity_id` | `ask` · context `post_ride` — they rode since answering, which is new information |
| 6 | last row has a `feel`, same activity | `answered` |

Rule 5 is the one that makes "ask whenever you look" not feel like nagging:
the re-ask is triggered by *something having happened*, not by the clock. And
because a post-ride answer stores the new `after_activity_id`, it can't loop.

**Rendering per state:**

- `ask` — prompt line, three chips, defer line.
- `answered` — chips stay visible with the answer selected and re-tappable
  (a correction appends a new row; latest wins). No prompt styling, no
  question mark, no badge.
- `deferred` — collapses to a single muted text button, *"How are the legs?"*,
  which re-opens the chips if tapped. Hiding it entirely would make the defer
  a dead end.

**The tap must change Beat 3 with no network round trip.** The write is
optimistic: set local state → re-run `buildBeats` → insert in the background.
A failed write logs and leaves the UI alone — no rollback, no toast. The
silhouette redraw is the cause-and-effect moment; a spinner in the middle of it
defeats the point.

Selected chip: teal fill, white text. Unselected: 1px border, zero radius.

**Two neighbouring things this is not:**

- `activities.rpe_score` (1–10 Foster, post-ride, via `api/activity-rpe.js`)
  measures how hard an effort *was*. Beat 2 measures how the rider *is*. Same
  rider, different question, deliberately different scale. Not reconciled in
  v1 — that's the project D4 defers.
- `coach_check_ins` (migration 051) runs the other direction: AI-generated
  check-ins from the coach to the rider on activity sync. No overlap.

### 5.3 Beat 3 — what to do

Input: today's `activity` / `todaysWorkout`, `feel`, `data.event`, form band.

| Day type | Feel = none/Normal | Feel = Flat | Feel = Strong |
|---|---|---|---|
| Planned hard (`threshold`, `sweet_spot`, `vo2max`, `anaerobic`, `race`) | `Today's a good day for {plain_name} — {why}.` | `You said the legs are flat, so let's trade {planned_plain} for {easier_plain}. It still counts.` | `Legs are good? Then {plain_name} as planned — green light.` |
| Planned moderate (`tempo`, `endurance`) | `Today's a good day for {plain_name} — {why}.` | `Legs are flat — make it {easier_plain} instead. It still counts.` | `{plain_name} as planned — green light.` |
| Planned easy (`recovery`) | `An easy spin today — {why}.` | `Perfect timing — today was already meant to be easy. Just spin.` | `Still an easy day. Save it.` |
| Rest day | `Nothing to do today but recover. That's the workout.` | same | same |
| **Already ridden today** | `That's today's work done. {rest_of_day_clause}` | `That's today's work done — and the legs know it. Eat, sleep, don't add to it.` | `That's today's work done. Banked.` |
| No plan | `No session on the calendar. You're {form_phrase} — {why}.` | `Legs are flat and nothing's scheduled. Easy spin or a day off, both fine.` | `Nothing scheduled, and the legs are good — {suggest_plain} would land well.` |
| `!hasHistory` | `I don't have enough riding to read you well yet — keep it easy and fun, and I'll have more to say soon.` | same | same |

**Row order matters.** `!hasHistory` wins over everything; **already ridden
today** is evaluated next, before the planned-workout rows. Today's `activity`
already reflects this — `labelActivity` falls through to actual-activity
labelling once `rss > 0`, so a completed ride never renders as `PLAN`
(`getTodaySpine.ts:180-191`). Beat 3 must not prescribe a session the rider has
already done; with Beat 2's post-ride prompt on the page, that mistake would be
directly above its own contradiction.

`{rest_of_day_clause}` is form-band derived — "Nothing else needed today." /
"An easy spin later wouldn't hurt, but it's optional."

`{plain_name}` / `{planned_plain}` / `{easier_plain}` come from
`workoutTypeCopy().phrase` — "hard, steady effort", "steady riding", "easy
spinning". Never the workout's raw name, never the type token.

**The downgrade ladder** (Flat only, one rung, never more):

```
race | anaerobic | vo2max | threshold | sweet_spot  →  endurance
tempo                                               →  endurance
endurance                                           →  recovery
recovery | rest                                     →  unchanged
```

`{why}` is one clause selected from the existing form-band vocabulary
(`formPhrase`) plus event proximity when `data.event` is inside 14 days — the
same inputs `recBody` already uses (`getTodaySpine.ts:486-504`). Do not invent
a second verdict engine.

**Glyph:** workout silhouette, which redraws on the Beat 2 tap. That redraw is
the cause-and-effect moment the whole beat is built around — it must be
instant, which is why §5.2's write is optimistic and off the critical path.

### 5.4 Beat 4 — need a route for that?

| State | Renders |
|---|---|
| Workout day (planned or downgraded) | `Want a route for that?` + **[Build my route]** → `/ride/new?workoutId={id}&duration={min}` |
| No plan | `Want a route?` + **[Build my route]** → `/ride/new?duration={min}` where `{min}` is the trailing 4-week median ride duration |
| Rest day | Button hidden. `Thinking ahead? Browse routes for your next ride.` → `/routes` |
| Already ridden today | Button hidden. `Thinking ahead? Browse routes for your next ride.` → `/routes` |

When Beat 2 = Flat downgraded the session, the pre-filled duration is the
**downgraded** one, not the plan's. The button must not promise a route for a
workout the page just talked the rider out of.

No route-preview glyph in v1 — that needs the route match
(`getTodayRoute` → `api/route-analysis`) and a second async state. Beat 4 is a
link in v1, per the voice doc's own "the dumb version still closes the loop".

### 5.5 The numbers door

A single underlined text link, `See the numbers`, at the bottom. Expands
in-place (no navigation) to reveal, in order: the fitness node (`FitnessNode`,
`compact`), the spine (`SpinePanel`, read-only — no scrub on mobile), and
`RidesMap` behind `React.lazy`. Collapsed by default on every load; the state
is not persisted in v1.

---

## 6. Beat 2 data model

New table, migration `111_daily_feel.sql`. Additive, nothing dropped, no
backfill, no cron. The table is inert until someone taps.

**It is an append-only log, not one row per day.** A rider can answer in the
morning, ride, and answer again — those are two facts, not a correction, and
overwriting the first would destroy the more interesting one. Deferrals are
rows too, which is what lets §5.2's state machine be a single "latest row for
today" read.

```sql
CREATE TABLE IF NOT EXISTS public.daily_feel (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The rider's LOCAL date, not UTC. See the note below.
  local_date         DATE NOT NULL,
  -- Exactly one of these is set: an answer, or a deferral.
  feel               TEXT CHECK (feel IN ('flat', 'normal', 'strong')),
  deferred_to        TEXT CHECK (deferred_to IN ('next_ride', 'next_day')),
  CONSTRAINT daily_feel_answer_xor_defer
    CHECK (num_nonnulls(feel, deferred_to) = 1),
  -- Which prompt this row answers.
  context            TEXT NOT NULL CHECK (context IN ('pre_ride', 'post_ride')),
  -- The most recent known activity at write time. A 'next_ride' deferral
  -- fires when this stops matching the current latest activity.
  after_activity_id  UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_feel_user_date
  ON public.daily_feel (user_id, local_date DESC, captured_at DESC);

ALTER TABLE public.daily_feel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feel rows"
  ON public.daily_feel FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feel rows"
  ON public.daily_feel FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.daily_feel IS
  'Append-only log of the rider''s self-reported readiness (Today Beat 2). '
  'Latest row for a local_date wins. Display-only in v1 — does not feed the '
  'load model (see docs/today-mobile-beats-spec.md D4).';
```

No UPDATE or DELETE policy: the log is append-only, and a correction is a new
row. Account deletion is handled by the `ON DELETE CASCADE` on `user_id`.

**Local date, not UTC.** `local_date` is computed client-side with the same
`fmtDate(new Date())` the spine uses (`getTodaySpine.ts:524`). A UTC date would
roll the prompt over at 5pm for US riders — the exact bug class the voice doc's
Tier-2 ban exists to avoid.

**Write path: frontend insert via the RLS'd browser singleton**, not a
serverless function. One round trip, no cold start, and the tap is optimistic
anyway. The fallback — a server twin of `api/activity-rpe.js` — is there if RLS
proves fussy under the anon-token race `getTodaySpine.ts:97` already guards
against.

**Read:** one query on mount, fired alongside the spine load and not blocking
it — `.eq('local_date', today).order('captured_at', { ascending: false })
.limit(5)`. The state machine only needs the newest row; the small limit is
cheap headroom for debugging. Beat 2 renders in its `ask` state until the read
resolves, then corrects itself. A slow read shows the prompt, never a wrong
selection.

## 7. Glyphs

Governing rule from the voice doc: **every mark is a projection of real data.**
If a glyph would render identically for two different riders, cut it. No icons,
no emoji, no decorative squiggles.

**Route trace** (Beat 1) — `decodePolyline(lastRide.polyline)` → normalized SVG
path, aspect preserved, ~72px tall, no tiles and no labels. Stroke color by
effort tier using the `labelActivity` cuts (`getTodaySpine.ts:197-211`):
`<45` teal at 60% opacity · `45–70` teal · `70–88` gold · `≥88` orange. Start dot in ink
(`#141410`). Renders nothing (not a placeholder box) when the last ride has no
polyline — indoor rides are common and a blank frame is worse than no frame.

**Rhythm strip** (Beat 1) — 7 cells, rolling, unlabeled. Reuse the visual
language already shipped in `today-glance/ConsistencyRibbon.tsx` (18×8 cells,
`1px` border for rest, hollow for today) but color filled cells by effort tier
rather than sport. Unlabeled is what keeps it date-agnostic; if it ever wants
axis labels, delete it.

**Workout silhouette** (Beat 3) — bars from the session's real shape. `SpineData`
carries duration and type but **not interval structure** (the planned-workouts
select has no structure column), so v1 draws a single block: width ∝
`duration_minutes`, height ∝ intensity from `workout_type`. That is still two
real dimensions of real data, so it satisfies the rule — but it is honestly
less than the doc describes, and it upgrades to true interval bars when
structure is threaded through (`today-glance/deriveIntervalSegments.ts` is the
precedent). Teal for easy, orange for hard. Redraws on the Beat 2 tap.

**Route preview** (Beat 4) — deferred, see §5.4.

No chart on this page grows an axis, gridline, or legend. Those live behind the
numbers door.

---

## 8. Explicitly out of v1

Not "forgotten" — deliberately cut, each with the reason:

| Cut | Why |
|---|---|
| AI-phrased beats | D1 — the reverted `today_hero_paragraphs` experiment |
| Callback triggers (effort match, best-since, repeated route) | D10 — needs activity-level history not in `SpineData`. The repeated-route trigger may build on the segment work (`segmentEffortComparison.ts`, `training_segment_traversals`) rather than fresh GIS |
| Beats on desktop | D3 |
| Feel feeding the load model | D4 |
| Route-preview glyph + elevation shading | needs the async route match |
| True interval silhouette | needs workout structure in the select |
| Dark mode | D9 — pre-existing |
| Weather as a Beat 4 input | voice-doc open question 4; scope creep |

---

## 9. Tests

Following the existing convention in `src/views/today-spine/`
(`*.render.test.tsx` for components, plain `.test.ts` for pure modules).

**`buildBeats.test.ts`** — the state matrix, no React:
- Beat 1 × 5 states (ridden-today / recent / gap / long-gap / no-history),
  plus gap-clause boundaries at 1, 2, 3, 6, 7, 20, 21 days.
- Beat 1 opener stability: same date in → same opener out, across calls.
- `stat_phrase` rule at the climbing threshold boundary.
- Beat 3 × (7 day types × 4 feel values) = the full table in §5.3.
- Beat 3 row precedence: a completed ride today outranks a planned workout, so
  the page never prescribes a session already done.
- Downgrade ladder: every rung, including the two no-ops.
- Beat 4 pre-fill uses the downgraded duration when feel = Flat.
- Rest day and ridden-today: Beat 4 renders the browse variant, never the button.
- `!hasHistory`: no beat claims a form state.

**`feel.test.ts`** — `resolveFeelPrompt` against the §5.2 table, no React and no
Supabase:
- Empty day → `ask`, and the context flips with `todayHasRide`.
- `next_day` deferral suppresses the rest of the day; a new `local_date` asks
  again.
- `next_ride` deferral holds while the latest activity id is unchanged, and
  fires to `post_ride` the moment it differs.
- An answer followed by a new ride re-asks once, in `post_ride`; answering that
  prompt does **not** re-ask again (the loop guard).
- A correction (second answer, same activity) lands in `answered`, latest wins.
- Rows arriving out of order resolve by `captured_at`, not array position.

**`copy.test.ts`** — a guard test asserting no template contains a day-word
(`yesterday|today's date|monday|tuesday|…`) outside the approved slots. D7 is
the kind of rule that erodes silently; make it fail CI instead.

**Render tests** — one per beat: renders its states without crashing, the Beat 2
chips are tappable, the defer line renders both targets, the `deferred` state
collapses to its re-open affordance, and the Beat 3 line changes when `feel`
changes.

**`getTodaySpine.test.ts`** — extend for the `workoutId` and `latestActivity`
threading.

`npm run test:run` and `npm run type-check` clean before each push.

---

## 10. Delivery slices

**PR 1 — the beats, deterministic.** `buildBeats` + copy + Beats 1/3/4 + the
three glyphs + the mobile branch + the numbers door + `RidesMap` lazy + both
loader changes (`workoutId`, `latestActivity`). No migration. Beat 2 is omitted
entirely rather than stubbed — a dead control teaches the wrong thing. Beat 3
renders its no-feel column, which is a complete page on its own. This is the
slice that answers "does the page feel right".

**PR 2 — Beat 2.** Migration 111, `feel.ts`, `resolveFeelPrompt`, the chip row
and defer line, the post-ride prompt variant, the instant Beat 3 recompute, the
optimistic write. Larger than it looks — the state machine, not the chips, is
the work.

**PR 3 — optional, after living with it.** Callbacks, and/or an AI one-line take
under Beat 3 only, deferred and upgrade-in-place behind the existing
`ai_consent` gate (`CoachPanel.tsx:98-110`) — never on Beat 1.

---

## 11. Open questions

1. ~~**The Beat 1 deviation**~~ — **resolved 2026-08-18:** keep the last-ride
   recap and append the gap as a clause (§5.1).
2. **Multi-ride days** — proposal: lead with the largest ride by RSS, and
   append a second clause only when the next ride is >25% of the day's load.
   Summarizing "the day" flattens a 3-hour ride and a commute into mush.
   (Voice-doc open question 2.)
3. **Does the felt-response surface anywhere?** Not in v1 (D4). Behind the
   numbers door is the obvious home for a feel-vs-form strip once there's
   enough data to be worth looking at. (Voice-doc open question 3.)
4. ~~**Beat 2 on a day the rider already rode**~~ — **resolved 2026-08-18:**
   yes, ask — on every visit until answered or deferred, with defer targets of
   "after my next ride" and "tomorrow", and post-ride wording once a ride has
   landed (D11, §5.2).

**Still open, and worth watching once it's live:** whether asking on every
visit reads as attentive or as pestering. The mitigation is built in — the
prompt is inline rather than modal, deferring is one tap, and the only re-ask
after an answer is event-driven. If it still grates, the first lever is
dropping rule 5 (the post-ride re-ask), which is a one-line change to
`resolveFeelPrompt` and no schema change.
