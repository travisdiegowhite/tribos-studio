# Gear Tracker Strategy — from ledger to core loop

**Date:** 2026-09-08
**Status:** Proposal for review. Nothing here is implemented.
**Direction set by Travis:** Gear is gathered from the rider, not from Strava.
The daily check-in and the coach ask which bike was ridden. The rider photographs
the bike and we catalogue the parts. Ride history and weather do the rest.

---

## 1. Executive summary

The gear tracker today is a **manually-fed mileage ledger that nobody feeds**.
It has a sound schema, working webhook hooks, and a maintenance-alert engine,
but it sits behind the avatar menu, asks the rider to type everything, and is
invisible to the coach, the Today page, the landing page, and analytics.

| Signal (production, 2026-09-08) | Value |
|---|---|
| Users with at least one activity | 58 |
| Users with any gear item | 7 |
| Gear items (bikes / shoes) | 8 / 1 |
| Components tracked, all users | 2 (both chains) |
| Components with tire/wheel metadata | 0 |
| Activity→gear links | 762, every one `assigned_by = 'auto'` |
| Alert dismissals ever | 0 |
| `/gear` pageviews, last 30 days | 2 (vs 103 on `/today`, 92 on `/ride/new`) |

The opportunity is to make gear a **rider-sourced, coach-mediated, evidence-backed**
part of the daily loop:

1. **Capture through conversation, not forms.** The check-in asks "which bike?"
   only when the answer is ambiguous. The coach gets one gear tool so a rider can
   say "swapped the chain yesterday" and it lands in the ledger.
2. **Photograph the bike, catalogue the parts.** A guided three-shot photo flow
   (whole bike, drivetrain, front wheel) goes through Claude vision and comes back
   as a parts list the rider confirms with taps. This replaces the ten-field
   component form and is the demo moment for acquisition.
3. **Compute wear from what we already know.** 20,678 outdoor rides carry a start
   location and timestamp. We stamp each ride with the weather it was ridden in
   (Open-Meteo's free historical archive), classify surface from ride type and
   terrain analysis, and turn flat mileage thresholds into a wear model: wet miles,
   gravel miles, trainer miles count differently per component.
4. **Speak in sentences, on surfaces riders already open.** "Your chain has 1,380
   miles on it, 410 of them in the wet. Replace it before Saturday's race." — on
   Today, in the coach's context, as a push after a wet ride.

Sections 8 and 9 lay out a four-phase build and the acquisition mechanics that
hang off it (public tire-pressure calculator, the photo-to-parts demo, a
shareable bike report).

---

## 2. What exists today

### 2.1 Schema (`database/migrations/043_gear_tracking.sql`, `050_gear_component_metadata.sql`)

| Table | Purpose | Notes |
|---|---|---|
| `gear_items` | Bikes and shoes | `total_distance_logged` is METERS (unsuffixed legacy column per `audit-report.md`); `is_default` one-per-sport partial unique index; `strava_gear_id` text |
| `gear_components` | Parts on a bike | 10 `component_type` values; `distance_at_install` snapshot; per-row `warning_threshold_meters` / `replace_threshold_meters`; `metadata` JSONB for tires `{width_mm, tubeless, max_pressure_psi}` and wheels `{rim_width_mm, hookless}` |
| `activity_gear` | One gear item per activity | `assigned_by IN ('auto','manual','strava')`; `UNIQUE(activity_id)` |
| `gear_alert_dismissals` | Suppressed alerts | keyed by item/component/type, records distance at dismissal |
| `increment_gear_distance()` | RPC | atomic mileage increment, `SECURITY DEFINER` |

RLS is per-user on all four tables with a service-role bypass. Indexes are sensible.
**The schema is fine and should be kept.** Everything below is additive.

### 2.2 Server (`api/gear.js`, `api/utils/gear*.js`)

- `api/gear.js` — 14 POST actions (`list_gear`, `get_gear`, `create_gear`,
  `update_gear`, `retire_gear`, `delete_gear`, `create_component`,
  `update_component`, `replace_component`, `delete_component`,
  `reassign_activity_gear`, `get_alerts`, `dismiss_alert`, `recalculate_mileage`).
  Auth is bearer-token → `auth.getUser` → `userId` match. Uses the singleton.
- `api/utils/gearAssignment.js` — `assignGearToActivity()` runs after every
  activity insert in all three webhooks (`strava-webhook.js:482`,
  `garmin-webhook-process.js:841`, `wahoo-webhook.js:377`). Order: Strava gear-ID
  match → default gear for sport → nothing. Then increments mileage.
- `api/utils/gearAlerts.js` — `computeGearAlerts()`: shoe thresholds, per-component
  mileage thresholds (custom or default), bar tape as time-based (12 months), and
  an `info` nag for any bike with zero components.
- `api/utils/gearDefaults.js` — thresholds in miles converted to meters
  (chain 1,200/1,500; cassette 2,400/3,000; road tires 2,000/2,500; gravel tires
  1,200/1,500; rim pads 1,200/1,500; disc pads 1,600/2,000; cables 2,400/3,000;
  wheels none).

### 2.3 Client

- `src/hooks/useGear.ts` — reads `gear_items` directly under RLS, mutates via
  `api/gear`. Exposes `getDefaultBikeSetup()` returning tires + wheels for the
  default bike.
- `src/pages/GearPage.jsx` (`/gear`, `/gear/:gearId`) and a duplicate of the
  same UI inside `src/pages/Settings.jsx` "Gear" tab. **Not in the main nav**;
  reachable from the avatar dropdown (`AppShell.jsx:435-444`).
- `src/components/gear/*` — cards, a detail modal (cost per mile, recent
  activities, component table), and add forms. The add-gear form has a
  free-text **"Strava Gear ID — found in your Strava gear settings URL"** field.
- `AppShell.jsx:57` — every page mounts `useGear({ alertsOnly: true })` for the
  notification bell. Gear alerts are the only thing in the bell.
- `src/components/tire-pressure/TirePressureCard.jsx` — reads the default bike's
  tire width / tubeless / rim width and today's temperature to compute pressure.
  **Mounted only in the legacy `RouteBuilder.jsx` (`/ride/new/classic`).** RB2,
  the canonical builder, does not render it.

### 2.4 What is NOT wired

| Surface | Gear awareness |
|---|---|
| Coach (`api/coach.js`, every `api/utils/*Context*.js`) | none — the coach cannot see a bike exists |
| Daily check-in (`fatigue_checkins`, `FatigueCheckinCard.tsx`) | none |
| Today Spine (`src/views/today-spine/`) | none |
| Proactive insights, push notifications, emails | none |
| Activation steps (`useActivation.ts`) | none |
| Landing page (`FeatureCards.jsx`) | none — three cards: Routes, Coach, Training |
| PostHog | zero gear events; only `$pageview` on `/gear` |
| Share card (`renderShareCard.ts`) | none |

### 2.5 Data we already hold that a wear model can use

| Fact | Count | Source |
|---|---|---|
| Activities | 43,060 | all providers |
| Outdoor rides (Ride/Gravel/MTB/EBike, not trainer) with start lat/lng | 20,678 | `raw_data.start_latlng` (Strava) |
| Outdoor rides in the last 365 days | 5,884 | |
| Rides with device temperature | 14,657 | `raw_data.average_temp` (Strava) |
| Rides with GPS streams | 2,516 | `activity_streams.coords` (FIT) |
| Rides with a summary polyline | 39,078 | `map_summary_polyline` |
| Virtual / trainer rides | 6,013 | `type = 'VirtualRide'` (14% of all rides) |
| Gravel + MTB typed rides | 267 | `type` |
| Per-activity terrain classification | exists | `activity_route_analysis.terrain_type` (migration 023) |
| Per-record temperature in FIT files | parsed, not persisted | `fitParser.js:29` reads `r.temperature`; streams drop it |
| Weather at ride time | **none stored** | `route_context_history` (migration 013) has weather columns but nothing writes it |

### 2.6 Defects worth fixing regardless of strategy

1. **Trainer rides accrue tire wear.** `assignGearToActivity` links any cycling
   type to the default bike; 30 virtual/trainer rides are on gear mileage today.
   A smart trainer wears the chain but not the tires or brake pads.
2. **`useImperial = true` is hardcoded** in `GearPage.jsx:43` (already flagged in
   `docs/SITE_AUDIT_2026-07-16.md` P2 2.3).
3. **The "No components tracked" info alert never goes away** for a bike the
   rider does not want to itemise. It is the only alert most users will ever see.
4. **Two copies of the gear UI** (page + Settings tab) will drift.
5. **`TirePressureCard` is stranded** in the classic builder nobody sees.
6. **No analytics**, so none of the above can be measured.

---

## 3. Why it isn't working

- **It asks for data before it gives anything.** A new rider sees an empty
  "Add your first bike" screen. The value (alerts) arrives 1,500 miles later.
- **It is a form, in a product whose thesis is conversation.** The component
  form has ten fields including install date and two thresholds in miles.
  Two chains in the whole database says how that landed.
- **It lives in Settings.** Nothing on Today or in the coach ever mentions a
  bike, so there is no reason to go there.
- **Its alerts are numbers.** "Chain — approaching maintenance — 1,240 mi of
  1,500 mi" is exactly the metric-as-hero pattern the thesis audit
  (`docs/TRIBOS_THESIS_AUDIT_2026-08.md`) grades as a fail.
- **It knows nothing about how the miles were ridden.** A rainy gravel mile
  and a dry trainer mile count the same.

---

## 4. The product: "Your bike, known"

One sentence: **Tribos knows which bike you rode, what's on it, what it's been
through, and what it needs — because you told it in passing and showed it once.**

Three capture moments, one photo flow, one wear model, and three surfaces.

### 4.1 Capture moment 1 — the daily check-in asks "which bike?"

`FatigueCheckinCard` already runs on Today every morning. Add one row, shown
**only when the answer is not already known**:

```
Yesterday's ride — which bike?      [ Tarmac ]  [ Gravel rig ]  [ Trainer ]  [ Other… ]
```

Rules (mirror the calendar's "pinned means the athlete decided" principle):

- Show the row when there is at least one cycling activity since the last
  check-in whose `activity_gear` row is missing or `assigned_by = 'auto'`, AND
  the rider has two or more active bikes. One-bike riders are never asked; the
  default assignment is already right.
- Chips are the rider's active bikes ordered by recency of use, plus "Trainer"
  when the activity is `VirtualRide`/`trainer = true` (assigns to the bike
  flagged as trainer bike, or to a synthetic "Trainer" gear item, see §5).
- One tap writes `activity_gear` with `assigned_by = 'manual'` and adjusts
  mileage on both bikes via the existing `reassignActivityGear()`.
- If two or more rides are unassigned, ask about the most recent one and
  offer "same bike for all 3".
- **Never block the check-in on it.** Skipping is fine; the ride stays `auto`.

Cost to the rider: one tap on the days it matters, zero on the days it doesn't.

### 4.2 Capture moment 2 — the coach gets a gear tool

The coach's calendar rebuild established the pattern: one tool
(`calendar_change`, `api/utils/calendarChangeTool.js`) with typed operations,
every write reported, no silent writes. Gear gets the same treatment.

`gear_change` operations:

| op | Example rider phrase | Effect |
|---|---|---|
| `assign_ride` | "That was on the gravel bike" | `activity_gear` manual link + mileage move |
| `add_bike` | "I picked up a new road bike, a Cervélo" | insert `gear_items` (name/brand/model), offer photo flow |
| `replace_component` | "Put a new chain on yesterday" | existing `replaceComponent` semantics, `installed_date` from phrase |
| `log_service` | "Bled the brakes, new sealant" | insert `gear_service_log` (new, §5) — for items with no mileage model |
| `note_issue` | "Rear hub is clicking under load" | insert `gear_service_log` with `kind = 'issue'`, surfaces on Today until resolved |
| `set_default` | "The Tarmac's my main bike now" | `is_default` flip |

Every op returns a one-line receipt the coach must echo ("Logged: new chain on
the Tarmac, installed 2026-09-07. Old one did 1,612 miles."). The gate is the
same as the calendar's: anything ambiguous (which bike? which of two chains?)
becomes a question, not a guess.

The coach also receives a **gear section in its context** (`api/utils/
checkInContext.js` and the `/api/coach` assembly): active bikes, components with
wear percentage and wet-mile share, open issues, and anything due within the
next ~2 weeks at the rider's current weekly mileage. Under the persona voice
rules, "chain 87%" is context, not copy: the coach says "your chain's close to
done" in the persona's own words.

### 4.3 Capture moment 3 — the post-ride prompt

When a new activity lands and the bike is ambiguous, the existing proactive
insight card (`ProactiveInsightCard.jsx`) gets a one-tap footer: "Which bike?"
with the same chips as §4.1. The check-in row is the fallback for riders who
don't open the app the same day.

### 4.4 The photo flow — "Show me your bike"

This is the feature that replaces the component form and the one to demo.

**Flow (client, `src/components/gear/BikePhotoCapture.tsx`):**

1. Three guided shots, each optional after the first: **whole bike from the
   drive side**, **drivetrain close-up** (cassette, chain, rear derailleur),
   **front wheel and tire sidewall**. Overlay guides show the framing; on mobile
   `<input type="file" accept="image/*" capture="environment">` opens the camera.
2. Client-side resize to ≤1,600 px on the long edge, JPEG ~0.85 (a phone photo
   is 4–12 MB; Vercel's request body limit is 4.5 MB, and Claude's per-image
   limit is 5 MB / ~1,600 px is where accuracy plateaus anyway).
3. Upload to a **private Supabase Storage bucket `gear-photos`**, path
   `{user_id}/{gear_item_id}/{shot}-{ts}.jpg`, RLS on `storage.objects` scoped
   to `auth.uid()`. Created **in SQL** by the migration, per the lesson in
   CLAUDE.md about migration 099's uncreated bucket.
4. Call `POST /api/gear-vision` with the storage paths. Server signs short-lived
   URLs, calls Claude with all shots in one message (pattern already in
   `api/parse-training-plan.js`), and returns structured JSON.

**Extraction contract (server):**

```json
{
  "bike": { "brand": "Specialized", "model": "Tarmac SL7", "category": "road",
            "frame_material": "carbon", "color": "black/red", "confidence": 0.8 },
  "components": [
    { "component_type": "chain",           "brand": "Shimano", "model": "CN-M8100",
      "confidence": 0.45, "evidence": "12-speed chain, Shimano-style quick link visible" },
    { "component_type": "cassette",        "brand": "Shimano", "model": "11-34",
      "confidence": 0.6,  "evidence": "12 sprockets, largest ~34t" },
    { "component_type": "tires_road",      "brand": "Continental", "model": "GP5000 S TR",
      "metadata": { "width_mm": 28, "tubeless": true }, "confidence": 0.9,
      "evidence": "sidewall reads 28-622, 'TR' hotpatch" },
    { "component_type": "brake_pads_disc", "confidence": 0.95, "evidence": "hydraulic disc calipers front and rear" },
    { "component_type": "bar_tape",        "confidence": 0.9 },
    { "component_type": "wheels_road",     "brand": "Roval", "model": "Rapide CLX",
      "metadata": { "rim_width_mm": 21, "hookless": false }, "confidence": 0.5 }
  ],
  "groupset": { "brand": "Shimano", "tier": "Ultegra Di2", "speeds": 12, "confidence": 0.7 },
  "unreadable": ["chain brand — too small at this distance; a closer drivetrain shot would help"]
}
```

Rules:
- Vision **proposes, the rider disposes.** The confirm screen is a list of chips
  with the model prefilled where confidence ≥ 0.7 and blank where lower. One
  tap accepts a row; edits are inline. Nothing is written until "Save".
- Tire width, tubeless, and rim width feed `gear_components.metadata`, which
  the tire-pressure calculator already consumes. Reading "28-622" off a
  sidewall is the single highest-value extraction: it makes the pressure
  calculator work with zero typing.
- Components confirmed from a photo get `installed_date = NULL` and a wear
  baseline of "unknown, assume new-ish" until the rider says otherwise. The
  coach follows up once: "Roughly how old is the chain — new, a few months, or
  no idea?" and sets `distance_at_install` accordingly.
- Store the photo path on the bike (`gear_items.photo_path`) and the extraction
  JSON (`gear_items.vision_extraction`) so the catalogue can be redone later
  with a better model without re-shooting.
- Model: `claude-sonnet-5` for the extraction (vision quality matters more than
  latency here; expect roughly $0.01–0.03 per three-shot catalogue). Log to
  PostHog `$ai_generation` like the other coach calls.
- Photos are private product data: never rendered to other users, exported in
  `api/data-export.js`, deleted in `api/account-delete.js`.

### 4.5 The wear model — ride history + weather

Replace "meters since install" with **effective wear**, computed per component
from the rides it was on:

```
effective_wear_m = Σ over rides ( distance_m × surface_factor × wet_factor × indoor_factor )
```

| Factor | Chain | Cassette | Tires | Disc pads | Rim pads | Bar tape | Sealant |
|---|---|---|---|---|---|---|---|
| dry road | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | time | time |
| wet road | 2.0 | 1.5 | 1.1 | 1.6 | 2.5 | time | time |
| gravel / MTB | 1.6 | 1.4 | 1.8 | 1.5 | 2.0 | time | time |
| trainer / virtual | 0.8 | 0.8 | **0** | **0** | **0** | time | time |

Starting values are industry rules of thumb, not measurements; they are tunable
per component in `gearDefaults.js` and the point is that wet gravel miles stop
being invisible. Thresholds stay in meters (existing columns), so the UI change
is just "wear %" replacing "distance / threshold".

**Where each input comes from:**

- **Distance** — `activities.distance` (meters), as today.
- **Surface** — `activities.type` (`GravelRide`, `MountainBikeRide`) first;
  then `activity_route_analysis.terrain_type` where present; then the bike's own
  category (a gravel bike's untyped rides default to gravel). Rider correction
  via check-in/coach wins.
- **Indoor** — `trainer = true` or `type = 'VirtualRide'`.
- **Wet** — a new `activity_conditions` row per outdoor ride (§5), populated
  from **Open-Meteo's historical weather archive** (free, no key, hourly
  precipitation / rain / temperature / wind / humidity for any lat-lng back to
  1940) using `start_latlng` and `start_date` + `elapsed_time`. OpenWeatherMap's
  current-conditions API, which we already use, cannot look backwards; its
  One Call "timemachine" can but is metered. Strava's `average_temp` and the
  FIT per-record temperature are cross-checks, not the source.
- A ride is **wet** when precipitation over its window exceeds ~1 mm, or the
  preceding 6 hours exceed ~3 mm (wet roads without rain). Store the raw numbers
  and derive the flag so the threshold can move.

**Time-based items** (already the pattern for bar tape): tubeless sealant
(top up every 3–6 months, faster in heat), brake fluid (12–24 months), bar tape.
`gear_components.metadata.tubeless = true` is the trigger for sealant reminders.
These need no mileage, only an `installed_date` or a `log_service` entry.

**Projection:** rider's trailing 4-week weekly effective wear × remaining
headroom → "due in ~3 weeks". That number is what lets the coach say "before
Saturday's race" instead of "at 1,500 miles".

### 4.6 Surfaces — where this shows up

All copy follows the thesis: sentence first, number as a chip, no acronyms.

| Surface | What appears | When |
|---|---|---|
| **Today Spine** (new beat, or a line inside Beat 1) | "Your chain has 1,380 miles on it, 410 in the wet — due in about three weeks." | any component ≥ 80% wear, or an open issue |
| **Check-in card** | the "which bike?" row (§4.1) | ambiguous ride since last check-in |
| **Coach context** | gear section (§4.2) | every coach call |
| **Post-wet-ride push / insight** | "Rained on this morning's ride. Wipe and lube the chain tonight — wet miles wear it twice as fast." | `activity_conditions.wet = true` on a new outdoor ride |
| **Forecast crossover** (`useWeatherForecast` already on the calendar) | "Rain Saturday and the rain bike's pads are nearly done. Swap them this week?" | forecast wet day + component ≥ 90% on the bike the rider usually rides that day |
| **First-freeze / heat** | "First ride below freezing this season: tubeless sealant thickens — top up." | seasonal trigger from `activity_conditions` |
| **Gear page** (promoted to main nav as "Bikes") | per-bike: photo, wear bars in plain language, service log, wet/gravel/indoor mile split, cost per mile | |
| **Notification bell** | unchanged mechanism, rewritten copy | |
| **Tire pressure** | `TirePressureCard` moved into RB2's route panel and the Today beat when the day is a ride day; uses today's temperature and the catalogued tire | |

---

## 5. Data model changes

Additive only. New distance columns are suffixed per the T1.1 unit contract.
Every migration is applied by hand and confirmed with `npm run audit:schema`.

```sql
-- 122_activity_conditions.sql
CREATE TABLE activity_conditions (
  activity_id     uuid PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('open_meteo','strava_device','fit_device','manual')),
  temp_c          numeric,
  precip_mm       numeric,           -- during the ride window
  precip_prior_6h_mm numeric,        -- wet-road proxy
  wind_kmh        numeric,
  humidity_pct    numeric,
  is_wet          boolean GENERATED ALWAYS AS (coalesce(precip_mm,0) >= 1 OR coalesce(precip_prior_6h_mm,0) >= 3) STORED,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);
-- RLS: user_id = auth.uid(); service role full access. Index on (user_id).

-- 123_gear_capture.sql
ALTER TABLE gear_items
  ADD COLUMN category        text CHECK (category IN ('road','gravel','mtb','tt','commuter','trainer','other')),
  ADD COLUMN is_trainer_bike boolean NOT NULL DEFAULT false,
  ADD COLUMN photo_path      text,            -- storage object path, private bucket
  ADD COLUMN vision_extraction jsonb,         -- last raw extraction, for re-cataloguing
  ADD COLUMN catalogued_at   timestamptz;

ALTER TABLE gear_components
  ADD COLUMN effective_wear_m numeric NOT NULL DEFAULT 0,   -- weighted, see §4.5
  ADD COLUMN wet_distance_m   numeric NOT NULL DEFAULT 0,
  ADD COLUMN offroad_distance_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN indoor_distance_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','vision','coach')),
  ADD COLUMN confidence       numeric;

CREATE TABLE gear_service_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_item_id  uuid NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  component_id  uuid REFERENCES gear_components(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('service','replace','issue','resolved','note')),
  summary       text NOT NULL,
  occurred_on   date NOT NULL DEFAULT CURRENT_DATE,
  distance_at_m numeric,                  -- bike odometer at the time
  source        text NOT NULL CHECK (source IN ('rider','coach','check_in')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_gear
  ADD COLUMN surface_override text CHECK (surface_override IN ('road','gravel','mtb','indoor'));
-- and widen assigned_by: CHECK (assigned_by IN ('auto','manual','strava','check_in','coach'))

-- Storage bucket, created in SQL (lesson from migration 099/121):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gear-photos', 'gear-photos', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- storage.objects policies: owner-scoped select/insert/delete on (storage.foldername(name))[1] = auth.uid()::text
```

`strava_gear_id` and the `'strava'` assignment path stay in the schema and the
webhook (they cost nothing and are correct when present) but the **free-text
Strava Gear ID field is removed from the add-gear form**, per the decision not
to rely on Strava.

New crons (both under the 5-minute rule and using the singleton):

| Schedule | Path | Job |
|---|---|---|
| `*/10 * * * *` | `gear-conditions-process` | stamp `activity_conditions` for outdoor rides inserted in the last 24 h that lack a row; batched, ~20 per run |
| `15 3 * * *` | `gear-wear-rollforward` | recompute `effective_wear_m` and the split columns for components whose bike had new or reassigned rides yesterday; then evaluate alerts and queue Today/push copy |

Backfill of the ~5,900 outdoor rides from the last year is a one-off script
(`scripts/backfill-activity-conditions.mjs`), rate-limited to Open-Meteo's
free tier (10,000 calls/day; one call per ride), run once and then left alone —
same posture as `backfill-evidence.mjs`.

---

## 6. Voice and copy rules

Inherit the thesis (`docs/TRIBOS_THESIS_AUDIT_2026-08.md`) and the coach voice
bible. Concretely for gear:

- The sentence carries the verdict; the number is a chip. "Chain is nearly
  done" first, `1,380 mi · 410 wet` after.
- Every recommendation names the reason from the rider's own rides. "410 of
  those miles were in the wet" is the receipt.
- Ask, don't nag. The "no components tracked" info alert becomes a single
  invitation on the bike card ("Show me your bike and I'll list the parts")
  that goes away after one dismissal.
- Persona-consistent. The Hammer: "Chain's shot. Replace it before Saturday or
  don't complain about shifting." The Scientist: "Effective chain wear is at
  ~92% of the replacement threshold, driven by 410 wet miles; replacing it now
  protects the cassette."

---

## 7. Acquisition mechanics

Why gear can acquire riders when training plans and route builders are crowded:
every cyclist owns a bike and none of the incumbents (Strava gear mileage,
Garmin Connect gear, dedicated apps like ProBikeGarage) know how the miles were
ridden or can catalogue a bike from a photo.

1. **The demo is the photo.** Three photos → a parts list with tire widths read
   off the sidewall is a 30-second wow that works in a tweet, a reel, or at a
   group ride. Make it the first thing a new rider is invited to do after
   connecting a device (add `first_bike` to `ActivationStepKey`; the photo flow
   completes it).
2. **Public tire-pressure calculator.** `TirePressureCalculator.jsx` and
   `tirePressure.ts` already exist and are hidden behind auth. Mount them at
   `/learn/tire-pressure` next to `/learn/metrics`, with a "save this bike"
   CTA that lands in signup → photo flow. Tire pressure is one of the most
   searched cycling tools; this is the cheapest top-of-funnel we can build.
3. **Shareable bike report.** Reuse `renderShareCard.ts`: bike photo (rider's
   own), miles this year, wet/gravel split, parts replaced. Riders post bikes;
   let them post ours.
4. **Landing page card 04.** "A coach that knows your bike — tell it which bike
   you rode, show it a photo once, and it tells you what's due before it
   fails." Add to `FeatureCards.jsx`.
5. **Monthly "your bikes" email** via Resend: what you rode, in what weather,
   what's due. Retention first, forwarding second.
6. **Community.** A pod's "who's due for a chain" is a natural cafe post;
   optional, later.

---

## 8. Phasing

| Phase | Weeks | Scope | Done when |
|---|---|---|---|
| **0 — Foundations** | 1 | Fix §2.6 defects; "Bikes" in main nav; delete Settings duplicate; PostHog events (`gear_bike_added`, `gear_ride_assigned`, `gear_photo_captured`, `gear_component_confirmed`, `gear_alert_shown/acted`); `TirePressureCard` into RB2; remove Strava ID field; `category` + `is_trainer_bike` columns | events flowing; trainer rides no longer wear tires |
| **1 — Capture** | 2 | Check-in "which bike?" row (§4.1); post-ride prompt (§4.3); `gear_change` coach tool + gear context (§4.2); `gear_service_log` | a rider can run gear entirely from the check-in and the coach |
| **2 — Photo catalogue** | 2 | `gear-photos` bucket; `BikePhotoCapture`; `/api/gear-vision`; confirm screen; `first_bike` activation step | ≥70% of catalogued components accepted without edit on a 20-bike test set |
| **3 — Conditions + wear** | 2 | `activity_conditions` + cron + backfill; wear model; projection; rewritten alert copy; Today beat; wet-ride push; forecast crossover | wear % and wet-mile receipts on every bike |
| **4 — Acquisition** | 2 | public tire-pressure page; bike share card; landing card; monthly email | tracked in PostHog from `/learn/tire-pressure` → signup → `first_bike` |

Phases 1 and 3 can run in parallel; 2 depends on 0 only.

**Success metrics (PostHog + SQL):**

| Metric | Today | Target after Phase 3 |
|---|---|---|
| Active riders with ≥1 bike | 7 / 50 | 35 / 50 |
| Bikes with ≥3 components | 1 | 25 |
| Rides with rider-confirmed bike (`manual`/`check_in`/`coach`) | 0% | 60% of ambiguous rides |
| Gear alerts acted on (replace/dismiss with reason) | 0 | ≥50% of shown |
| `/learn/tire-pressure` → signup | n/a | measured |

---

## 9. Constraints and risks

- **Connection hygiene.** New endpoints import the singleton from
  `api/utils/supabaseAdmin.js`; no `createClient`, no Realtime; crons ≥ 5 min.
- **Migrations are applied by hand.** Both new migrations must be applied and
  confirmed with `audit:schema` before the code that reads them ships,
  otherwise the conditions cron will go green while writing nothing (the exact
  failure documented for migration 106).
- **Vision accuracy.** Chain and cassette brands are often unreadable; tire
  sidewalls, brake type, and groupset tier are reliable. The confirm step and
  the `confidence` column exist so a wrong guess is a tap, not a wrong alert.
  Never create an alert from a component with `confidence < 0.5` until the
  rider has confirmed it.
- **Photo privacy.** Private bucket, owner-scoped policies, signed URLs with a
  short TTL server-side only, included in export and deletion. No photo ever
  leaves the rider's own views unless they explicitly generate a share card.
- **Vercel body limit (4.5 MB).** Client resizes before upload; upload goes to
  Storage directly from the browser under RLS, and the API receives paths, not
  bytes.
- **Open-Meteo terms.** Free for non-commercial use up to 10k calls/day; the
  commercial tier is inexpensive and should be budgeted before launch. Keep the
  provider behind one module (`api/utils/rideConditions.js`) so it can be
  swapped.
- **Weather is a proxy.** "Rain at the start point during the ride window" is
  not "the chain got wet". Say "in the wet" not "in the rain", keep the raw
  numbers, and let the rider correct ("that one was dry").
- **Don't reintroduce a form.** If a capture path needs more than one tap or
  one sentence, it belongs in the coach, not a modal.

---

## 10. Open questions for Travis

1. **Trainer as a bike?** Model a smart trainer as a `gear_items` row with
   `is_trainer_bike = true` (so chain wear on the trainer bike accrues) or as a
   sink that accrues nothing? Proposal: a row, because riders who put a road
   bike on the trainer do wear the chain.
2. **Shoes.** Keep running shoes in scope (one row in production today) or
   focus the photo/coach work on bikes only for the first pass? Proposal: keep
   the data model, bikes only for the new capture paths.
3. **Who pays for vision?** Roughly 2–3 cents per catalogue is fine at current
   scale; do we want to cap re-catalogues per bike per month?
4. **Public calculator branding.** Does `/learn/tire-pressure` sit inside the
   "Department of Cycling Intelligence" field-guide framing like
   `/learn/metrics`, or is it a plainer SEO page?
5. **Persona copy.** Gear alerts go through the persona voice rules like every
   other coach surface, or stay in a neutral house voice? Proposal: persona,
   because a Hammer rider expecting "chain's shot" will find neutral copy
   off-brand.
