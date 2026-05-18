# Unit 1.5 — Soft-default prescription card on `/route-builder`

**Status:** Shipped to branch `claude/enhance-route-builder-LZLgA`
**Date:** 2026-05-18
**Builds on:** Unit 1 (`docs/UNIT_1_PRESCRIPTION_AND_FITNESS_WIRING.md`)

## What changed

When a logged-in user opens `/route-builder` directly (no `?from=calendar`
URL params) AND has an incomplete workout scheduled in `planned_workouts`
for today, the page now surfaces a soft-default card:

```
✨ Today's workout
   Foundation Miles • 60 min • endurance
   [ Use this workout ]   [ Something else ]
```

- **Use this workout** — runs the same pre-fill pipeline as the calendar
  handoff: sets `trainingGoal`, `timeAvailable`, `selectedWorkout`,
  `routeName`, `naturalLanguageInput`, and `calendarContext` so the
  generation downstream treats this exactly like a calendar-originated
  flow.
- **Something else** — hides the card AND sets a `suppressPrescription`
  flag that gets threaded all the way through `generateAIRoutes` →
  `generateClaudeRoutesOrThrow` → `gatherDetailedPreferences` →
  `prescription: null`. The next generation runs with the
  fitness-state block intact but no PRESCRIBED WORKOUT block.

The card does not appear when:
- The user came in via `?from=calendar` (that flow already pre-fills).
- The user is editing an existing route (`routeId` present).
- `getTodaysPrescription` returns null (no workout scheduled today, or
  today's workout is already completed).

## Why this matters

Unit 1 wired the prescription into the AI prompt server-side, but it
was invisible to Travis-as-user — the only way to verify it was reading
the prompt in the browser console. Unit 1.5 makes the smart Route
Builder feel intelligent on the direct-navigation path, which is the
path Travis himself uses most often.

It also gives the user explicit control: the prescription influences
routing by default, but one click suppresses it for users who want a
fresh take.

## Files touched

| File | Change | LOC |
|------|--------|-----|
| `src/pages/RouteBuilder.jsx` | New state, loader effect, two handlers, two banner instances (mobile + desktop), `EnhancedContextCollector` import | +130 |
| `src/utils/aiRouteGenerator.js` | Destructure + forward `suppressPrescription` | +3 |
| `src/utils/claudeRouteService.js` | Destructure `suppressPrescription` in both `generateClaudeRoutes` and `generateClaudeRoutesOrThrow` | +2 |
| `src/utils/enhancedContext.js` | Gate the prescription query on `baseParams.suppressPrescription` | +3 / −1 |

Total: ~140 lines net add. No new files. No schema changes.

## Implementation notes

- The card uses **terracotta with a dashed border**, distinct from the
  calendar banner's solid-teal styling, to signal "this is a
  suggestion, not a confirmed handoff."
- The card uses `Sparkle` from `@phosphor-icons/react` (already imported).
- The mobile variant stacks the CTAs vertically below the workout meta;
  the desktop variant places them inline on the right.
- The dependency array of the generation `useCallback` now includes
  `prescriptionSuppressed` so the flag is captured in the closure.
- `handleUsePrescription` derives `trainingGoal` from the workout's
  `category`: `recovery → recovery`, `vo2max|threshold → intervals`,
  `tempo → tempo`, `climbing → hills`, else `endurance`. This matches
  the calendar-handoff URL-param conventions.
- The card sets `calendarContext` when the user accepts, so the rest of
  the page (route-name auto-suffix, calendar badge in two places, the
  "Generate Route for Workout" button label) all light up correctly
  without needing to know about the prescription card.

## Verification (manual)

1. **Direct nav, no scheduled workout** — open `/route-builder`. No
   prescription card. Existing UI unchanged.
2. **Direct nav, scheduled workout** — insert a `planned_workouts` row
   for today (`completed = false`); open `/route-builder`. Card appears
   above the route-name input with the workout name + duration + category.
3. **Use this workout** — click; card disappears, calendar banner
   appears in its place with the workout details, `routeName` becomes
   "Route for [Workout]", training goal / duration / interval cues all
   pre-fill. Generate produces a prescription-aware route.
4. **Something else** — click; card disappears, no calendar banner.
   Generate produces a route whose prompt has the TRAINING CONTEXT
   block (fitness state still visible) but no PRESCRIBED WORKOUT
   block (verify via the browser console log of the prompt).
5. **From calendar** — open `/route-builder?from=calendar&...` as
   usual; verify the soft default card does NOT appear (calendar
   banner pre-empts it).
6. **Editing existing route** — open `/routes/:id`; card should not
   appear even if a workout is scheduled today.

## Out of scope (still)

- Persona voice — Unit 2.
- Conversational refinement — Unit 3+.
- URL-param handoff cleanup (`?from=calendar&...`) — the calendar tile
  could now post the `plannedWorkoutId` and skip the URL marshaling
  entirely. Defer to Unit 3 cleanup.
- `/route-builder-2` activation — still parked.
