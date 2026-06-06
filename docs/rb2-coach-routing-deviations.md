# RB2 Coach Routing — Deviations From Prior Plans

**Date:** 2026-06-02
**Branch / PR:** `claude/wonderful-curie-0r4A0` → [#794](https://github.com/travisdiegowhite/tribos-studio/pull/794)
**Scope:** Route Builder v2 (RB2) coach chat — fresh-route generation and the
three previously-deferred route-edit intents.

This document records where the **shipped implementation deliberately diverged
from the approved implementation plans**, and why. It exists so a future
contributor reading the code (or the plans, if they resurface) understands the
intent behind the choices and doesn't "fix" a deviation back into a regression.

It is a decisions log, not a spec. The canonical behavior is the code + tests.

---

## 1. Coach chat route generation (commit `42c9153`)

**Original plan:** generate routes from the coach by routing the prompt through
RB2's own generation hook (`useAIGeneration.generate`, i.e. the v1
`generateAIRoutes` engine the GenerateBar form uses), and add a new
lightweight NL parser/mapping layer to turn the chat text into form params.
The plan also called for changing `generate()` to return route snapshots the
chat could apply.

**What shipped instead:**

| Decision | Rationale |
|---|---|
| **Reuse RB1's natural-language builder** rather than build a new parser. Extracted the compute core of `RouteBuilder.jsx`'s `handleNaturalLanguageGenerate` into a new shared module `src/utils/naturalLanguageRouteBuilder.js`. | The user pointed out RB1 already has a working NL builder (Claude parse → start resolution → geocode → **iterative** routing). Rebuilding it would duplicate proven logic and produce different-shaped routes. |
| **Call the extracted RB1 core directly and write the RB2 store ourselves**, bypassing `useAIGeneration.generate`. The planned change to make `generate()` return snapshots was **dropped**. | "Like RB1" specifically means RB1's iterative loop builder, not RB2's v1 `generateAIRoutes`. Going through `generate()` would have used the wrong engine. |
| **Shared core is used by the coach only; RB1 is left untouched.** The algorithm now exists in two places (RB1's inline handler + the shared module). | Explicit user choice ("Shared core, coach only — leave RB1"). RB1 (`RouteBuilder.jsx`) is a large, critical-path file; rewiring it carried regression risk for no immediate benefit. **Known debt:** a future cleanup should unify RB1 onto the shared module. |
| **Strava-gated branches were NOT lifted** into the shared module: familiar-roads waypoints (`getFamiliarLoopWaypoints`), route familiarity scoring (`scoreRoutePreference`), and the non-iterative `generateSmartWaypoints` fallback. | The coach path passes no Strava `accessToken` and always sets `useIterativeBuilder: true`, so those branches are dead for RB2. Lifting them would have pulled extra imports for no exercised behavior. They can be added later by threading `accessToken` into the module's `context`. |
| **Dispatch rule:** the coach generates when the message matches build/create phrasing **OR** there is no current route; otherwise it edits. | Matches the user's intent that "build me…" and "from scratch with no route" both mean generate, while edits to an existing route keep the edit path. |

**Net effect on the plan's file list:** `useAIGeneration` was *not* modified;
`naturalLanguageRouteBuilder.js` was added; `submitChatMessage.ts` gained an
injected `onGenerateFromPrompt` callback; `RouteBuilder2.tsx` wires the page
context and applies the result to the store.

---

## 2. The three deferred coach route-edit intents (commit `2a166d7`)

Plan: wire `add_climbing`, `shift_direction`, and `add_waypoint` through the
existing `/api/route-coach` → `normalizeRouteEdit` → client `applyRouteEdit`
path. The shipped work matched the plan, with these deviations/additions:

| Decision | Rationale |
|---|---|
| **Added an out-of-plan fix to `buildComparison`** (`src/utils/aiRouteEditService.js`): it now reads `distance_km` / `elevation_gain_m` **canonical-first with legacy `distance` / `elevation` fallback**. | While testing `add_climbing` we found `buildComparison` read only the legacy fields, but RB2/route-coach passes the canonical ones — so the elevation delta was computed against **zero** for **every** intent (flatten's "Xm less climbing" was overstated too). This is the canonical-first-with-legacy-fallback pattern mandated by `CLAUDE.md` (Metrics Rollout — FROZEN), so it is **policy-compliant, not a freeze violation**. It changes the *messages* of all existing intents (now correct), which is why it's flagged here. |
| **`DEFERRED_INTENTS` left as an empty `Set` with its rejection guard intact**, rather than deleting the concept. | Keeps the "feed the error back so Claude recovers" mechanism available for any future deferral without re-plumbing. |
| **`shift_direction` semantics:** regenerate a **same-length loop** biased toward the compass bearing from the existing start; **point-to-point routes are guarded** ("try a detour instead"), not implemented. | "Shift west" has no clean re-route analog on an existing line. Regenerating a biased loop reuses existing helpers (`projectPoint`, `getSmartCyclingRoute`). The point-to-point guard mirrors the existing `applyLongerEdit` guard. **Open question for the future:** a lobe-preserving "nudge the existing geometry" variant was discussed but not built. |
| **`pickBestByElevation` now honors its `strategy` arg** (`'highest'` for add_climbing; `'lowest'` unchanged for flatten). The arg previously existed but was ignored. | Needed so `add_climbing` (mirror of flatten) keeps the *most*-climbing candidate. Flatten's behavior is unchanged. |
| **Repointed a route-coach test** that asserted `add_climbing` was deferred. | `add_climbing` is now implemented, so the "recover from a rejected edit" coverage was moved to a still-rejected case (`shift_direction` called without its required `direction` param). |

---

## Standing debts / follow-ups created by these deviations

> **Update (2026-06-06):** all four follow-ups below are now resolved. See the
> inline notes.

1. **RB1 ↔ shared-module duplication** — ✅ **Resolved.** `RouteBuilder.jsx`'s
   `handleNaturalLanguageGenerate` now delegates its compute to
   `generateRouteFromNaturalLanguage`; the handler keeps only notifications +
   form/store state-sync (via the module's new `onProgress` seam and `meta`
   return). Two intentional micro-divergences from the old RB1 behaviour:
   (a) when an NL request omits a duration, the module defaults to 60 min rather
   than falling back to the form's current `timeAvailable`; (b) `profile: 'road'`
   is passed explicitly to preserve RB1's old "non-gravel ⇒ road" routing.
2. **Strava-gated route features absent from the coach** — ✅ **Resolved.** The
   shared module gained familiar-roads waypoints, familiarity scoring, and the
   non-iterative smart-waypoints fallback behind `context.accessToken`; RB2 lifts
   the Supabase session token and threads it in, and the coach reply surfaces the
   familiarity percentage.
3. **`shift_direction` is loop-only** — ✅ **Resolved.** Point-to-point routes now
   bow their midpoint toward the requested compass bearing (keeping start/end
   fixed) and reroute through it, via `projectPoint` + `getSmartCyclingRoute`;
   loops keep the existing biased-lobe regeneration.
4. **`buildComparison` canonical-first fix / legacy-field audit** — ✅ **Resolved
   (no further changes needed).** A full audit of `aiRouteEditService.js` and
   `src/features/route-builder-v2/` found every distance/elevation read already
   canonical-first. (Backend note: `/api/elevation` may still emit a legacy
   `distance` alongside `distance_km`; consumers handle it defensively. Out of
   scope here.)

---

## Policy note

None of the above deviates from the documented freezes in `CLAUDE.md`:
- No legacy DB columns were dropped; no canonical-only readers were added.
- The `buildComparison` change follows the **read canonical-first, fall back to
  legacy** rule explicitly.
- No Supabase clients were created in `api/` (route-coach uses the singleton);
  no Realtime subscriptions were introduced.
