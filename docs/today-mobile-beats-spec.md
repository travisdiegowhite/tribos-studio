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
  BEAT 2  how you feel     ← three chips: Flat / Normal / Strong
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
| **`workoutId` for Beat 4** | `planned_workouts.id` | **missing — see below** |

**The one loader change:** the planned-workouts select at
`getTodaySpine.ts:575` does not request `id`. Add `id` to the select and thread
it onto `todaysWorkout` as `workoutId: string | null`. `RouteBuilder2` already
reads `workoutId`, `duration` and `distance` from the query string
(`src/pages/RouteBuilder2.tsx:214-221`), so Beat 4 needs nothing else.

`SpineData` itself gains no new top-level field in v1 — the beats derive from
what is there. (`buildBeats` taking `SpineData` whole, rather than a narrowed
struct, is deliberate: it keeps the contract in one place.)

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

**Deviation from the voice doc, flagged for approval:** the doc replaces the
recap entirely on off days ("A day off the bike — good."). This spec keeps the
last-ride recap and appends the gap as a clause. Two reasons: (a) the doc's own
visual rule makes the route trace the thing that opens the page — dropping the
recap on any non-riding day means most rest days open with no glyph at all;
(b) "a day off the bike" is a claim about yesterday, which is exactly the Tier-2
language D7 bans. If you prefer the doc's version, it's a one-line change in
`copy.ts`.

**Glyph:** route trace + rhythm strip (§7).

### 5.2 Beat 2 — how you feel

Prompt: **"How are the legs today?"** · chips: `Flat` · `Normal` · `Strong`.

- Asked once per local day. Once answered, the chip row stays visible with the
  answer selected (so it can be corrected) but is never re-prompted.
- Skipping is silent and valid — no nag, no second ask, no badge.
- **The tap must change Beat 3 with no network round trip.** The write is
  optimistic: set local state → re-run `buildBeats` → upsert in the background.
  A failed write logs and leaves the UI as-is; it does not roll back or toast.
- Selected chip: teal fill, white text. Unselected: 1px border, zero radius.

Note there is already a subjective channel — `activities.rpe_score`, 1–10
Foster, captured post-ride via `api/activity-rpe.js`. Beat 2 is a different
moment (pre-ride readiness, not effort recall) and a different scale on
purpose. They are not reconciled in v1; if both eventually feed the evidence
layer, that's the project D4 defers.

### 5.3 Beat 3 — what to do

Input: today's `activity` / `todaysWorkout`, `feel`, `data.event`, form band.

| Day type | Feel = none/Normal | Feel = Flat | Feel = Strong |
|---|---|---|---|
| Planned hard (`threshold`, `sweet_spot`, `vo2max`, `anaerobic`, `race`) | `Today's a good day for {plain_name} — {why}.` | `You said the legs are flat, so let's trade {planned_plain} for {easier_plain}. It still counts.` | `Legs are good? Then {plain_name} as planned — green light.` |
| Planned moderate (`tempo`, `endurance`) | `Today's a good day for {plain_name} — {why}.` | `Legs are flat — make it {easier_plain} instead. It still counts.` | `{plain_name} as planned — green light.` |
| Planned easy (`recovery`) | `An easy spin today — {why}.` | `Perfect timing — today was already meant to be easy. Just spin.` | `Still an easy day. Save it.` |
| Rest day | `Nothing to do today but recover. That's the workout.` | same | same |
| No plan | `No session on the calendar. You're {form_phrase} — {why}.` | `Legs are flat and nothing's scheduled. Easy spin or a day off, both fine.` | `Nothing scheduled, and the legs are good — {suggest_plain} would land well.` |
| `!hasHistory` | `I don't have enough riding to read you well yet — keep it easy and fun, and I'll have more to say soon.` | same | same |

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
instant, which is why D4 keeps the write off the critical path.

### 5.4 Beat 4 — need a route for that?

| State | Renders |
|---|---|
| Workout day (planned or downgraded) | `Want a route for that?` + **[Build my route]** → `/ride/new?workoutId={id}&duration={min}` |
| No plan | `Want a route?` + **[Build my route]** → `/ride/new?duration={min}` where `{min}` is the trailing 4-week median ride duration |
| Rest day | Button hidden. `Thinking ahead? Browse routes for your next ride.` → `/routes` |

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

New table, migration `111_daily_feel.sql`. Additive, nothing dropped.

```sql
CREATE TABLE IF NOT EXISTS public.daily_feel (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  feel       TEXT NOT NULL CHECK (feel IN ('flat', 'normal', 'strong')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, local_date)
);

ALTER TABLE public.daily_feel ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_feel_owner_select ON public.daily_feel
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY daily_feel_owner_upsert ON public.daily_feel
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY daily_feel_owner_update ON public.daily_feel
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- `local_date` is the rider's local date, computed client-side with the same
  `fmtDate(new Date())` the spine uses (`getTodaySpine.ts:524`). A UTC date
  would move the prompt at 5pm for US riders — the exact bug class the voice
  doc's Tier-2 ban exists to avoid.
- **Write path: frontend upsert via the RLS'd browser singleton**, not a
  serverless function. One round trip, no cold start, and the tap is optimistic
  anyway. The alternative — a server twin of `api/activity-rpe.js` — is the
  fallback if RLS proves fussy under the anon-token race that
  `getTodaySpine.ts:97` already guards against.
- Read: one `maybeSingle()` on mount, fired alongside the spine load, not
  blocking it. Beat 2 renders unanswered until it resolves; a slow read shows
  the prompt, never a wrong selection.
- No cron, no backfill, no trigger. The table is inert until someone taps.

---

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
- Beat 3 × (6 day types × 4 feel values) = the full table in §5.3.
- Downgrade ladder: every rung, including the two no-ops.
- Beat 4 pre-fill uses the downgraded duration when feel = Flat.
- Rest day: Beat 4 renders the browse variant, never the button.
- `!hasHistory`: no beat claims a form state.

**`copy.test.ts`** — a guard test asserting no template contains a day-word
(`yesterday|today's date|monday|tuesday|…`) outside the approved slots. D7 is
the kind of rule that erodes silently; make it fail CI instead.

**Render tests** — one per beat: renders its states without crashing, the Beat 2
chips are tappable, and the Beat 3 line changes when `feel` changes.

**`getTodaySpine.test.ts`** — extend for the `workoutId` threading.

`npm run test:run` and `npm run type-check` clean before each push.

---

## 10. Delivery slices

**PR 1 — the beats, deterministic.** `buildBeats` + copy + Beats 1/3/4 + the
three glyphs + the mobile branch + the numbers door + `RidesMap` lazy + the
`workoutId` select change. No migration. Beat 2 renders as a disabled
placeholder or is omitted entirely (prefer omitted — a dead control teaches the
wrong thing). This is shippable on its own and is the slice that answers "does
the page feel right".

**PR 2 — Beat 2.** Migration 111, `feel.ts`, the chip row, the instant Beat 3
recompute, the optimistic write.

**PR 3 — optional, after living with it.** Callbacks, and/or an AI one-line take
under Beat 3 only, deferred and upgrade-in-place behind the existing
`ai_consent` gate (`CoachPanel.tsx:98-110`) — never on Beat 1.

---

## 11. Open questions

1. **The Beat 1 deviation** (§5.1) — keep the last-ride recap on off days, or
   follow the doc and replace it with "A day off the bike"? This spec assumes
   the former; it's one line either way.
2. **Multi-ride days** — proposal: lead with the largest ride by RSS, and
   append a second clause only when the next ride is >25% of the day's load.
   Summarizing "the day" flattens a 3-hour ride and a commute into mush.
   (Voice-doc open question 2.)
3. **Does the felt-response surface anywhere?** Not in v1 (D4). Behind the
   numbers door is the obvious home for a feel-vs-form strip once there's
   enough data to be worth looking at. (Voice-doc open question 3.)
4. **Beat 2 on a day the rider already rode** — still ask? Proposal: yes, but
   the copy shifts to "How did that feel?" and Beat 3 speaks to tomorrow. Or
   skip the beat entirely once today has a ride. Needs a call before PR 2.
