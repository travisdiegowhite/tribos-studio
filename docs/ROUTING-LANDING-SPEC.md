# Routing Landing & Result — Front-end Spec

**Status:** Approved direction, Nov 2026. Hand-off spec for implementation.
**Companion:** `docs/COMFORT-ROUTING-SPEC.md` (rules, ladder, validator, harness).
**Design reference:** the "Comfort Routing Landing" design canvas, three boards: *Landing — the builder is the page*, *Route result — proof on the map*, *Phone — route result*.

## Why

Tribos is pivoting back to routing. A first-time visitor should get a route they trust in under a minute, with no account, no device connection and no explanation needed. The landing page **is** the route builder. Coaching and analytics stay in the product but move out of the front door.

## Copy rules

- No absolutes: no "never", "always", "guaranteed". Use "avoided", "kept off", "flagged".
- Describe roads the way a rider sees them: speed, lanes, bike lane, shoulder. No LTS, no "traffic stress", no metric vocabulary on these surfaces.
- The product name is a single constant (rebrand pending). Don't hard-code "Tribos" in new components.

## 1. Landing (`/` for signed-out visitors)

Replaces `<Landing />` in `RootRoute` (`src/App.jsx`). **The current marketing landing (`src/components/landing/`) becomes a first-visit card** (decided 2026-11-02), not a page:

- Shown once to a signed-out visitor on their first visit to `/` (localStorage flag, try/catch; if storage is unavailable, don't show it rather than showing it on every visit).
- A dismissible card alongside the builder, not a modal over it: desktop overlays the map column, phone sits above the form and collapses. The form stays usable while it's open.
- Content is a condensed take on today's landing: what Tribos does, the three proofs, and a "Got it" button. It's one zine moment for the screen (design-system rule: one per app screen).
- No `/welcome` route. Once the card ships, the unused `src/components/landing/` sections are retired.

Above the fold, left column:

- **Headline:** "Bike routes on roads you'll actually want to ride." **Subline:** "Pick a start and a distance. Every road on your route is checked for traffic first."
- **Form** (real `<form>`, labels, keyboard-usable):
  - **Start from:** geocoded text input (Mapbox geocoding, existing) + "use my location" button.
  - **How far:** 15 / 30 / 50 / 75 mi segmented control (+ custom later). Units follow the user's unit preference once known; miles by default in the US.
  - **Riding on:** Road / Gravel / Mixed.
  - **Traffic comfort:** 5-stop control (1 Calm … 5 Direct), **default 2**. Below it, a card that updates with the selection: headline, *Roads like*, *Short flagged stretches only*, *Kept off*, trade-off line. **All card text comes from `src/utils/comfortLevels.ts`**, the same module the router rules use (see routing spec §2).
  - **Make my route** (primary). Under it: "Free. No account needed to make a route."
- **Right column:** map preview with the comfort legend.
- **Below the fold:** three one-line proofs (Every road scored · No surprise highways · Straight to your bike computer) and a footer. Nothing else.

Behavior:

- **Generation is non-AI** (decided 2026-11-02). The form maps directly to a loop request on the routing engine plus the comfort validator. It doesn't call `api/claude-routes.js`, so there's no Claude cost, no 3-per-day guest AI cap, and lower latency. It still needs a per-IP guest rate limit of its own, since routing calls cost money. The AI builder stays in RB2 for signed-in users. Measure with `route_result` (`latency_ms`, `outcome`) and revisit if loops are poor.
- Reuse RB2's guest plumbing (`OpenRoute`, the `returnTo` stash) rather than building a parallel auth flow.
- Remember the last start, distance, surface and comfort in localStorage for guests (try/catch). After signup, write comfort to `user_road_preferences.traffic_tolerance` (now 1–5, see routing spec §5.4).
- Mobile: single column, form first, map after.

## 2. Route result

Can be RB2's result state restyled, or a dedicated `/ride/result` view. Pick whichever keeps RB2 as the single builder (CLAUDE.md: RB2 is canonical).

- **Header chips:** start · distance · surface · "Comfort N · Label" · *Change* (back to the form, values kept).
- **Map:** the route line is colored **relative to the rider's level**. This replaces the standard magenta route line on this view only:
  - within comfort, class ≤ L−1: cyan `#00C2FF`
  - at comfort, class = L: ultramarine `#2B2BFF`
  - flagged, class > L: magenta `#FF3DB8`, with a marker at each stretch
  - unknown-confidence data: grey dashed

  White casing as usual. Legend bottom-left. Colors come from `mapPalette.ts`.
- **Side panel / bottom sheet:**
  - **Headline stat:** "**98%** of this ride within your comfort" (distance at class ≤ L ÷ total). Second line: number of flagged stretches, e.g. "One short flagged stretch, shown below."
  - **Comfort strip:** a horizontal bar of the route from 0 to the total distance, colored as on the map, with mile ticks.
  - **Stats:** distance, climbing, estimated time (Courier Prime numbers).
  - **Heads-up card per flagged stretch:** "Heads up · mile 11", "0.4 mi on a 40 mph road", the plain reason line from the validator ("It's the only bridge over the creek nearby. There's a striped bike lane the whole way."), and *Show on map* (zooms to the stretch).
  - **Actions:** **Send to Garmin** (primary; existing route-push path, behind `garmin_data_consent_at` and `ConsentGate`), Send to Wahoo, Download GPX.
    - `pushRoute` needs an account, a Garmin connection, consent and COURSE_IMPORT, and Starter access caps connections at 1,000 (`GARMIN_MAX_CONNECTIONS`). **For a guest, Send to Garmin opens save → connect → consent** and then sends, keeping the route through the `returnTo` stash. **Download GPX** is the export that works with no account, so it sits next to the primary button for guests.
  - **Secondary:** *Try a different loop* · *Save it — free account* (in-place anonymous → account conversion; the auth flow rules in CLAUDE.md apply).

## 3. "No quiet way through" states (ladder, routing spec §4)

These have no design board yet; the next design pass covers them. Requirements:

- **Alternatives** (`outcome: 'alternatives'`): no route is drawn as "the" route. Show up to 3 cards, each with a mini map, its own % within comfort, and one line on what's different ("Clockwise instead," "26 mi instead of 30," "At Comfort 3: adds 1.2 mi of 40 mph road with a shoulder"). Picking one opens the normal result.
- **Refused** (`outcome: 'refused'`): plain message, e.g. "There isn't a route at Comfort 2 from here at this distance." Offer: the suggested nearby start (on the map), a shorter distance, or trying Comfort 3 (with a one-line description of what that adds).
- Neither state uses error styling. They're answers, not failures.

## 4. Navigation and the coaching move

- Signed-in default landing becomes routing (`/ride/new`), not `/today`. `RootRoute` redirects there.
- Nav order: **Ride** first. Today / Train move behind a flag (`training_lab`, PostHog feature flag or a user_profiles boolean, whichever matches existing practice). On for Travis and opted-in users, off by default for new users. Don't delete or restructure training code. This is a front-door change only.
- Onboarding: device connection moves out of the signup path. Prompt for it at the first "Send to Garmin/Wahoo," not before.

## 5. Analytics (PostHog)

Events, with properties:

- `landing_viewed`
- `route_requested`: distance, surface, comfort, has_location, is_guest
- `route_result`: outcome (`ok|alternatives|refused`), within_comfort_pct, flagged_stretches, flagged_mi, unknown_pct, latency_ms
- `alternative_chosen`: kind (`shape|distance|comfort_up`)
- `route_exported`: destination (`garmin|wahoo|gpx`)
- `account_created_from_route`

Funnel to watch: landing_viewed → route_requested → route_result(ok) → route_exported → account_created_from_route.

## 6. Build order

1. `comfortLevels.ts` (labels and card copy) + the landing form and comfort card. This can ship against today's router by mapping 1–5 to the old low/medium/high (1–2→low, 3→medium, 4–5→high) until the routing spec lands.
2. Result view restyle with the headline stat and comfort strip (needs the validator from the routing spec).
3. Heads-up cards (needs validator reasons).
4. Alternatives and refused states (needs the ladder) — design pass first.
5. Nav and `RootRoute` changes plus the `training_lab` flag.

## Acceptance

- A signed-out visitor on a phone gets from `/` to a route with "Send to Garmin" visible, and can download the GPX, without creating an account.
- The comfort card text and the router's rules come from one module. Changing a level's threshold changes both.
- No user-facing string on these surfaces contains "never", "always" or "guaranteed" (add a test that greps the copy module).
- Lighthouse accessibility ≥ 95 on the landing. All controls are keyboard-reachable with visible focus.
- Dark mode follows CLAUDE.md design-system rules. No orange or red.

## Out of scope

- Rebrand and name (the name is one constant).
- Changes to coaching, training, gear or community features beyond moving them behind the flag.
- Garmin sync stack (frozen per CLAUDE.md).
