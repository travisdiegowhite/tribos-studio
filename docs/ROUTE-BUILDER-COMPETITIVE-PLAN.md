# Route Builder — back to our roots

**Status:** plan, 2026-11-27. Nothing in it is built yet.
**Decision owner:** Travis.

## Contents

0. Decisions
1. Where we are
2. The market
3. Our gaps against table stakes
4. Where we beat them
5. Roadmap
6. Free-tier cost model and metrics
7. Guardrails
8. Open questions

## Why this doc

tribos started as a route builder. Over the last four months only about 12 of
roughly 146 commits touched routing code. Everything at the front door now
leads with training:

- **Landing hero:** "Your cycling, all in one place … a coach that reads all
  of it."
- **Nav order:** Today · Ride · Train · Coach · Garage.
- **Signed-in home:** `/today` (TodaySpine).

This document puts the route builder back at the centre, as a free product
good enough to beat Ride with GPS and Komoot for the rider who cares about
which roads they ride on. Training becomes the paid add-on.

## 0. Decisions already made

| Question | Decision |
|---|---|
| What is free | The route builder, library, sharing, export, device send, activity sync, ride history, the training calendar and fitness metrics |
| What is paid | The AI **Coach** and **structured training plans**. Nothing else |
| AI routing | Free with a daily cap (guests 3 a day, already built). Comfort routing without AI is unlimited |
| Phone navigation | **No.** Head units only. We beat the field on route quality and one-tap send, not on offline maps (which the no-service-worker rule makes hard in any case) |

---

## 1. Where we are

RB2 (`src/pages/RouteBuilder2.tsx`, 2,572 lines, plus about 18.5k lines in
`src/features/route-builder-v2/`) is the only route builder. It is open to
guests at `/ride/new`; saving opens the signup modal (`GuestSaveModal.tsx`).

### Works today

| Area | What we have | Key files |
|---|---|---|
| Editing | Click to add, drag, insert into the line, remove (✕, right-click, long-press), reorder, one undo/redo history for everything, snap or freehand, back to start, reverse, clip a spur, clear | `hooks/route-builder/useMapInteraction.ts`, `useRouteHistory.ts`, `hooks/useRouteManipulation.js`, `clip/` |
| Routing | Road / Gravel / Mountain / Commute / Walking, plus Run and Trail run. Chain: Stadia → BRouter → Mapbox, with GraphHopper first for gravel when its key is set. 5-minute cache, de-duplicated requests | `utils/smartCyclingRouter.js`, `brouter.js`, `stadiaMapsRouter.js`, `smartRunningRouter.js` |
| Comfort | Quiet / Balanced / Direct (3 steps) stored as `traffic_tolerance`. The store also holds a 1–5 `comfortLevel` | `hooks/route-builder/useRoadComfort.ts` |
| AI | Form generation (`aiRouteGenerator.js` → `api/claude-routes.js`). Chat generation: about 3 Claude-planned candidates, each routed, measured and ranked (`naturalLanguageRouteCandidates.ts`). Chat editing with 14 intents and a Keep/Revert card (`api/route-coach.js`). A "Fix target" chip | `chat/`, `api/utils/routeEditTools.js` |
| Analysis | Elevation colored by grade with a hover scrubber; layers for gradient, surface (with inference confidence), traffic stress, bike infrastructure and wind; quiet-roads % and bike-lane % | `components/ElevationPanel.tsx`, `layers/*` |
| Training bridge | Attach a planned or library workout so its intervals are drawn on the route; arriving from the calendar offers new route, saved route or a repeat of a past ride; fuel and tire-pressure panels | `layers/IntervalsLayer.tsx`, `arrival/` |
| Cues and ETA | Turn cues from Stadia (other engines are re-matched through Stadia), written as TCX/FIT course points. ETA personalized by speed profile or run pace | `utils/routeCues.ts`, `personalizedETA.js` |
| Persistence | Save, load, delete, server draft autosave plus a local copy, warning on unsaved changes; library with search, sort and thumbnails | `hooks/route-builder/useRoutePersistence.ts`, `api/routes.js`, `pages/MyRoutes.jsx` |
| Sharing | Making a route public gives a `/r/:id` page: read-only map and stats with "Open in Route Builder" | `pages/SharedRoute.tsx` |
| Export / send | GPX, TCX and FIT with elevation. Garmin Courses push (falls back to TCX), Wahoo push (falls back to FIT) | `utils/routeExport.ts`, `fitCourseEncoder.ts` |
| Import | GPX with editable control points; build from a past activity (`?from_activity=`) | `utils/gpxParser.js` |
| Mobile | Full-screen map with a 6-tab bottom sheet | `components/MobileControlSheet.tsx` |
| Comfort Phase 0 | Comfort levels 1–5 with their rules, classifier, validator and the `planComfortRoute` ladder; Tribos BRouter profiles. The harness shows **0 rule violations**, and 71% of riders get a route at their own level | `utils/comfort*.ts`, `routing-profiles/`, `docs/comfort-harness.md` |

### Broken or half-wired, found in this audit

| Problem | Where |
|---|---|
| The **Coffee** POI toggle returns nothing. `coffee` is a toggle id, but `POI_CATEGORIES` has no `coffee` key (cafés are under `food`), so the query comes back empty | `LayerToggles.tsx:50`, `utils/routePOIService.js` |
| **Familiar Segments** can never be turned on: `hasStravaConnection={false}` is hard-coded | `RouteBuilder2.tsx:1815`, `:2204` |
| The library's AI/manual filter checks `generated_by === 'ai'`, but RB2 saves `'rb2'`, so AI routes show up as manual | `MyRoutes.jsx:83`, `api/routes.js:437` |
| A guest opening `/ride/:id` gets an API error instead of the public route | `useRoutePersistence.ts` |
| `account_created_from_route` is defined but never sent, so the funnel's last step is blind | `routing-landing/landingTelemetry.ts` |
| The share page has no export and no send to device | `SharedRoute.tsx` |
| The `routes.tags TEXT[]` column exists and nothing uses it | `database/create_routes_table.sql:47` |
| `gravel_actual_pct` and `surface_mix` are declared in types but never written | `docs/route-quality-brainstorm.md` C15 |
| Comfort Phase 0 is used only by `/ride/start`. RB2 still shows the 3-step comfort choice and never runs the validator | — |
| Self-hosted BRouter is built (`deploy/brouter/`), but the repo can't tell us whether it is live. `VITE_BROUTER_TRIBOS_PROFILES` is off | `docs/brouter-self-host-runbook.md` |
| The Stadia key sits in the browser with no server-side limit. Each rider's browser calls Stadia directly | `stadiaMapsRouter.js` |

### Missing entirely

- Billing, entitlements and a pricing page. There is no code for any of them.

---

## 2. The market (scan of 2025–26)

Prices are list prices before tax. Two rows below are unverified and must be
checked on the vendors' own pages before we quote them publicly:

- whether Ride with GPS still sells a Basic tier
  ([/pricing](https://ridewithgps.com/pricing) shows only Starter and Premium;
  [/plans](https://ridewithgps.com/plans) still lists Basic);
- whether Komoot's device sync is free again for new users.

### At a glance

- **Ride with GPS.** Free web planner, device sync, cue sheets, Street View,
  clubs and events. **Paid:** the mobile planner, heatmaps, custom cues and
  POIs, offline maps and voice navigation.
  - Price: Premium $79.99/yr; Basic $59.99/yr if it still exists.
  - Untagged roads are assumed to be paved
    ([Gravel Cyclist](https://www.gravelcyclist.com/bicycle-tech/press-release-ride-with-gps-introduces-surface-types-paved-or-unpaved-know-before-you-go/)).
- **Komoot.** Bending Spoons bought it in March 2025 and since then:
  - GPX download, sending to devices and offline maps moved behind Premium
    (€59.99/yr) ([DC Rainmaker](https://dcrainmaker.com/2025/03/komoots-expanded-paywalls-trying-to-make-sense-of-it.html),
    [the5krunner](https://the5krunner.com/2025/03/11/komoot-confirms-we-dont-want-any-new-customers-in-ridiculous-pricing-move/));
  - heatmaps arrived in Dec 2025 (community) and Feb 2026 (personal), both
    Premium;
  - a ChatGPT route-planning app launched;
  - Live Sync with Wahoo launched.

  Strongest at a free breakdown of surface and way type, and at Highlights.
- **Strava.** Creating and editing routes is **paid** ($79.99/yr). Paid also
  covers AI and heatmap route suggestions, offline routes, and voice
  navigation (promised).
  - Free: plain-language route search (Oct 2026) and sync of saved routes.
  - Its advantage is a heatmap built from more than 150 million athletes.
- **Garmin Connect.** The Course Creator, popularity routing (Trendline), the
  heatmap and round-trip generation are free. Garmin sync only.
  - Connect+ ($69.99/yr) adds Trails and 3D.
  - Course Planner (aid stations and cut-offs) shipped around Feb 2026.
- **Wahoo.** Has **no route builder**. It imports routes from Komoot, Ride
  with GPS, Strava and Trailforks
  ([Wahoo support](https://support.wahoofitness.com/hc/en-us/articles/25937495218066)).
  That makes it a natural partner.
- **Hammerhead.** Its Dashboard is free with a Karoo and has a surface
  breakdown and warnings before a surface change. Untagged ways default to
  pavement.
- **Bikemap.** Free planner and loop planner. **Paid** (€39/yr): GPX export,
  offline, voice, and route weather and wind.
- **cycle.travel.** Free routing that is quiet on purpose: it uses traffic
  statistics in the UK and US. Also free in-app navigation, accommodation
  along the route and multi-day splits. **This is the closest competitor to
  our wedge.**
- **Plotaroute.** £20/yr. Street View split screen, free maps for event
  routes.
- **BRouter-web / bikerouter.de.** Free and open source. Custom profiles and
  detailed surface and smoothness analysis, but a clunky interface. Power users
  only.
- **Gaia GPS / Trailforks.** About $54–90/yr. MTB trail difficulty and
  conditions.
- **Mapy.com.** About €19/yr. Gravel mode, unlimited offline. A popular
  landing spot for people leaving Komoot.
- **Footpath.** Freehand drawing. $23.49/yr for cue sheets, voice and export.
- **Newcomers:**
  - **Wandrer**: routing that favours roads you haven't ridden, and routes
    that cover every road in an area.
  - **Low-stress apps for a single city**: Bike Streets, SafeCycle, Cyclers.
  - **AI generators**: Route Studio, CycleAI, Byway.

### Feature matrix

**Legend**

- ✓ = free · P = paid · ~ = partial · ✗ = none
- **tribos (today)**: `F` = free in our model, `!` = broken or half-wired

**Column abbreviations:** RW = Ride with GPS · Km = Komoot · St = Strava ·
Gm = Garmin · ct = cycle.travel · BM = Bikemap · BR = BRouter-web ·
Mapy = Mapy.com.

| Feature | RW | Km | St | Gm | ct | BM | BR | Mapy | **tribos (today)** |
|---|---|---|---|---|---|---|---|---|---|
| Web planner | ✓ | ✓ | P | ✓ | ✓ | ✓ | ✓ | ✓ | **F** |
| Mobile planner | P | ✓ | P | ✓ | ✓ | ✓ | ~ | ✓ | **F** (web, responsive) |
| Road/gravel/MTB profiles | ~ | ✓ | P | ✓ | ~ | ✓ | ✓ | ✓/P | **F** |
| Surface breakdown | ✓ | ✓ | P | ~ | ~ | ✓ | ✓ | ✓ | **F** (with confidence) |
| Traffic / comfort routing | ✗ | ~ | ✗ | ✗ | ✓ | ~ | ~ | ~ | **F** (3-step; 1–5 not yet wired) |
| Traffic-stress overlay | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **F** |
| Heatmap | P | P | P | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ (personal planned) |
| Loop generator | ✗ | ✓ | P | ✓ | ✗ | ✓ | ✓ | ✓ | ~ (AI only; non-AI on `/ride/start`) |
| AI / plain-language routing | ✗ | ✓ | P | ✗ | ✗ | ✗ | ✗ | ✗ | **F** (capped) |
| Chat editing of a route | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **F** (signed in) |
| Elevation profile by grade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **F** |
| Climb detection and categories | ✓ | ~ | ✓ | ✓ (ClimbPro) | ~ | ~ | ✗ | ~ | ✗ |
| Cue sheet | ✓/P | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **F** |
| POIs along route | P | ✓ | P | ✗ | ✓ | ✓ | ✗ | ✓ | **F** (Coffee **!**) |
| Weather and wind on route | ✗ | P | ✗ | ✗ | ✗ | P | ✗ | ~ | **F** (current only, no forecast) |
| Multi-day | ~ | P | ✗ | ✗ | ✓ | ✓ | ✗ | ~ | ✗ |
| Collections | ✓ | P | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ (`tags` unused) |
| Discover others' routes | ✓ | ✓ | ✓ | P | ✓ | ✓ | ✗ | ✓ | ✗ |
| GPX export | ✓ | P | ✓ | ✓ | ✓ | P | ✓ | ✓ | **F** (plus TCX and FIT) |
| Garmin / Wahoo send | ✓ | P? | ✓ | Garmin only | ✓ | ✓ | ✗ | ~ | **F** (Garmin and Wahoo; no Hammerhead or COROS) |
| Share link / embed | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ~ (link only, no embed) |
| Street View / imagery | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Routes shaped to a workout | ✗ | ✗ | ~ (criticized) | ✗ | ✗ | ✗ | ✗ | ✗ | **F** (intervals overlay) |
| Offline / phone navigation | P | P | P | device | ✓ | P | ✗ | ✓/P | ✗ (by decision) |
| Entry paid price per year | $60–80 | €60 | $80 | $70 | donation | €39 | free | €19 | **training only** |

### Table stakes: what every serious planner has

1. Routing that snaps to roads, with drag, undo, out-and-back, reverse and
   loop. **We have all of it except a manual out-and-back.**
2. Profiles by bike type, plus avoid options. **No avoid toggles.**
3. An elevation profile colored by grade, with climb detection. **No climb
   detection.**
4. A breakdown of surface and way type. **We have it.**
5. GPX, FIT and TCX in and out. **Export yes; only GPX import.**
6. One-click send to Garmin, Wahoo, Hammerhead and COROS. **We have Garmin
   and Wahoo.**
7. A heatmap or popularity overlay. **We don't have one.**
8. Discovery, a library and collections. **We have the library only.**
9. Phone navigation. **Out of scope by decision.**
10. Share links and embeds with privacy controls. **Links only.**

---

## 3. Our gaps against table stakes

In priority order:

1. **Climbs.** Detect and categorize climbs (length × average grade, the same
   method as ClimbPro), list them in the elevation panel, and write them as
   course points so they show on head units.
2. **Avoid toggles.** Highways and arterials, unpaved, busy roads above the
   rider's comfort level, and ferries (already always forbidden). Map them to
   Valhalla costing (`use_highways`, `avoid_bad_surfaces`) and to BRouter
   profile parameters.
3. **Loop generator without AI in RB2.** Distance and direction, reusing
   `planComfortRoute` from `/ride/start`. Today RB2 offers loops only through
   AI.
4. **Manual out-and-back** (one tap: "ride back the same way").
5. **Collections and tags** on the library (the `routes.tags` column already
   exists).
6. **Sharing:**
   - export and send to device from `/r/:id`;
   - an iframe embed and an oEmbed endpoint for clubs, blogs and event pages;
   - an "unlisted" level of visibility.
7. **Device send:**
   - **COROS**: find out whether it has a course or route upload API; the
     OAuth integration and webhook already exist;
   - **Hammerhead**: find out whether a partner API exists; until then, FIT
     download is the fallback;
   - **Strava**: its public API cannot create routes, so Strava gets GPX only.
8. **TCX and FIT import.**
9. **Forecast weather at the planned start time.** Today we show current
   conditions at the start only.
10. **POI categories:** coffee (fix), lodging, camping, grocery and resupply,
    repair stations.
11. **Imagery:** a Mapillary viewer (free, crowd-sourced) on any point of the
    route.
12. **Select a stretch of the elevation profile** to see metrics for just
    that stretch.

---

## 4. Where we beat them (the wedge)

**The top complaint across the market is "popular ≠ safe."**

- Garmin's popularity routing sends riders onto three-lane highways
  ([Garmin forums](https://forums.garmin.com/sports-fitness/cycling/f/edge-1040-series/378862/edge-1040-routing-still-very-very-bad---120-miles-instead-of-18)).
- Komoot admits its routing makes "strange" busy-road choices
  ([Komoot](https://www.komoot.com/adventure-hub/7whv02BZHhPnx4CDjWfkN/why-am-i-hiking-on-a-road-and-other-routing-mysteries-solved)).
- Only cycle.travel uses traffic data, and it is not a platform.

We already have the hard parts: a comfort classifier, a validator that refuses
a route rather than mislabel it, and a stress overlay nobody else ships.

What we build on top of that:

1. **Comfort routing as the headline.** A 1–5 comfort level everywhere (RB2,
   landing, settings). Every route carries a comfort strip that shows where
   and why it falls below your level. The ladder offers alternatives or
   honestly refuses instead of quietly routing you onto an arterial.
2. **"Why this road."** Tap any stretch to see its class, speed limit, lanes,
   shoulder and bike infrastructure, plus the reason the router chose it. No
   competitor explains its choices.
3. **Honest surface.** Show "unknown" as unknown, with a confidence level, and
   let riders correct it in one tap (`road_comfort_overrides`,
   `ROUTING-LANDING-SPEC.md` §6). Ride with GPS and Hammerhead assume
   untagged roads are paved, and gravel riders hate it.
4. **AI that obeys hard limits.** Distance ±X%, a climbing target, minimum
   gravel %, maximum comfort class. Every candidate is checked by the
   validator before it is shown. Strava's and Garmin's AI routes are publicly
   called "horrific" and "low-quality"
   ([DCR](https://www.dcrainmaker.com/2026/01/stravas-instant-workouts-actually.html)).
   Ours can be the first that keeps its promises.
5. **Wind-aware loops.** Ride into the wind going out and with it coming home,
   with a suggested start time from the forecast. Only Komoot and Bikemap show
   wind at all, and both charge for it.
6. **Multi-day and bikepacking.** Split a route into days by distance or
   climbing, with lodging, camping and resupply POIs near each break. Today
   this is either paid (Komoot) or available only on cycle.travel.
7. **A permanent free core, promised in public.** Planner, GPX/TCX/FIT, device
   send and comfort routing will always be free. This lands right after
   Komoot's paywall and Strava's charge for creating routes, while riders
   still remember them
   ([bikepacking.com](https://bikepacking.com/plog/when-we-get-komooted/)).
8. **Workout-shaped routes: the bridge to paid.** Strava is trying this and
   being criticized for it. We already draw a workout's intervals on the route
   and arrive from the calendar.
   - **Free:** shape a route to a workout from the library (flat stretch for
     intervals, repeatable climb, few stops).
   - **Paid:** routes shaped automatically to today's plan prescription, with
     the coach's reasoning.

---

## 5. Roadmap

Each bullet is a scoped PR. Phases 2 and 4 can run in parallel.

### Phase 0 — Fix what's broken (about 1 week)

- Map the Coffee toggle to a real POI category (an `amenity=cafe` subset
  split out of `food`).
- Familiar Segments: pass the real Strava/activity-history state instead of
  `false`, or remove the toggle.
- Library filter: treat `generated_by` values `ai` and `rb2`-with-AI-origin
  correctly. This needs a reliable origin field on save.
- Guest at `/ride/:id`: fall back to `get_public_route` and open it as an
  unsaved copy.
- Send `account_created_from_route` after a signup that started from a guest
  save.
- `/r/:id`: add GPX download and "Send to device" (for signed-in users with a
  connected account).
- **Not in scope:** moving the Garmin push to `garmin2-route-push`. The Garmin
  freeze applies.

### Phase 1 — Routing-first front door (about 2–3 weeks)

**Prerequisites**, from `ROUTING-LANDING-SPEC.md` ("before the flag goes on"):

1. Confirm the self-hosted BRouter is live, point `VITE_BROUTER_URL` at it,
   and apply migration 126 so the health monitor records results.
2. Add a guest rate limit for routing without AI: a thin proxy in `api/` for
   BRouter and Stadia calls, reusing `api/utils/rateLimit.js`. This also gets
   the Stadia key out of the browser.

**Then:**

3. Wire send-to-device and save on `/ride/start` through RB2's existing guest
   save path.
4. Turn on `VITE_ROUTING_LANDING`: `/ride/start` becomes `/` for signed-out
   visitors. Retire the training-centred marketing page into the first-visit
   card.
5. Nav:
   - order becomes **Ride** · Today · Train · Coach · Garage;
   - a signed-in user with no active plan lands on `/ride/new`;
   - users with a plan keep `/today`.
6. Comfort 1–5 in RB2 replaces Quiet/Balanced/Direct. Keep the dual write of
   `comfort_level` and `traffic_tolerance` (migration 139).
7. Run `comfortValidator` in RB2 and show the comfort strip and its warnings
   on every route.
8. Turn on `VITE_BROUTER_TRIBOS_PROFILES` once the harness diff against the
   committed baseline is clean.

### Phase 2 — Reach table stakes (about 4–6 weeks)

Items 1–12 of §3, in that order. The first five are the minimum that lets us
say "everything Ride with GPS's free tier does, plus comfort." Persist
`gravel_actual_pct` and `surface_mix` on save at the same time.

### Phase 3 — Beat them (about 6–10 weeks)

In order:

1. "Why this road" stretch inspector.
2. Rider corrections for surface and comfort (spec §6), fed back into
   classification and, where licensing allows, upstream to OSM.
3. Wind-optimized direction and start time.
4. AI generation with hard limits, checked by the validator.
5. Multi-day splitter.
6. **Public route discovery:**
   - only routes riders have made public;
   - ranked by comfort score and fit to the request;
   - lets clubs and shops curate collections (this fills the gap Ride Spot
     left).
7. **Personal heatmap** from the rider's own synced activities. A community
   heatmap built from synced data is **out**: the Strava API agreement and the
   Garmin program terms forbid aggregating their data across users.
8. **Phase 3c:** make BRouter the primary road router (`VITE_BROUTER_PRIMARY_ROAD`)
   after a week of green `brouter-health-monitor` checks.

### Phase 4 — Freemium plumbing (about 2–3 weeks, alongside Phase 2)

- **Schema:** a `user_entitlements` table keyed by user, with
  `tier ('free'|'coached')`, a status and the Stripe ids. Apply the migration
  by hand and confirm with `npm run audit:schema`.
- **Checks:**
  - server: a `requireEntitlement(user, 'coach')` helper in `api/utils/`;
  - browser: a `useEntitlement()` hook and an upgrade card that explains the
    feature instead of a bare lock.
- **Billing:** Stripe Checkout, a webhook endpoint (using the Supabase
  singleton), a customer-portal link in Settings and a `/pricing` page.
- **Gate only:**
  - the Coach: `api/coach.js`, the `/coach` page, and the training-aware
    persona and prescription context in `api/route-coach.js`;
  - structured plans: plan activation and the coach's `generate_block`.
- **Stay free:** the calendar, adding sessions by hand, fitness metrics and
  ride history.
- **Route chat edits** stay free and count against the AI cap
  (`api/utils/aiQuota.js`). Lower the free per-user daily cap from the current
  default of 1000 to a realistic number.
- **Grandfather** the beta users who were promised "$4/month pricing locked in
  forever" (`api/email.js`). Seed their entitlement rows before the gate
  ships.
- **Price:** about $5–8 a month, undercutting Ride with GPS Premium ($79.99),
  Strava ($79.99) and Komoot (€59.99), whose paid tiers are mostly about
  routing and navigation, which we give away.

---

## 6. Free-tier cost model and metrics

| Cost | Today | Exposure | Action |
|---|---|---|---|
| Claude (AI routes, chat edits) | Per-user hourly and daily caps, guests 3/day per IP, global ceiling (`aiQuota.js`) | Bounded | Lower the free daily cap; keep the global ceiling |
| BRouter | brouter.de (volunteer, throttled) or self-hosted at about $15/mo flat | Flat | Self-host (Phase 1) |
| Stadia / Valhalla | Key in the browser; free tier 10k routes/mo | **Unbounded** | Proxy plus rate limit (Phase 1); lean on BRouter (Phase 3c) |
| Mapbox tiles and geocoding | Public token, no limits | Grows with usage | Watch monthly; cache geocodes |
| Elevation | `api/elevation.js` proxies public OpenTopoData with no auth or limit | Their limits are our ceiling | Cache server-side by tile; consider self-hosting SRTM |
| OpenWeather | `api/weather*.js`, no limit | Low | Cache by grid cell and hour |

**North-star metric:** riders who export or send a route each week.

**Funnel** (all PostHog, mostly instrumented already):

```
landing_viewed → route_requested → route_result → route_exported /
route_pushed_to_device → account_created_from_route → upgrade_viewed → subscribed
```

**Guardrail metric:** routing cost per weekly active router.

---

## 7. Guardrails (from CLAUDE.md)

- **Garmin:** the Garmin freeze, and the Starter-tier rules: push only, no
  pulls on page load, and the AI-consent gate.
- **Infrastructure:**
  - never precache JS in a service worker;
  - one Supabase client in `api/`;
  - no Realtime;
  - model IDs only through `api/utils/claudeModels.js`.
- **Code conventions:** distances end in `_km` or `_m`; coordinates are
  canonical `[lng, lat]`.
- **Design:** no orange or red; flat zine style.
- **Migrations:** applied by hand, then `audit:schema`.
- **Comfort copy:** no absolutes in rider-facing copy (`comfortLevels.test.ts`
  enforces this).

## 8. Open questions

- Is the self-hosted BRouter on Fly live, and has migration 126 been applied?
- Ride with GPS tier split and Komoot free device sync. Check both before
  using them in marketing copy.
- Do COROS and Hammerhead offer route-push APIs to partners?
- Exact price, and whether there is an annual plan.
