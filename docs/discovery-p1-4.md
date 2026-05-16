# P1.4 — Discovery Note

Read of P1.3's chat panel + P1.2 hooks before wiring real chat behavior.

## Chat surface (P1.3) — what's wireable, what needs lift

- `ChatBody.tsx` owns its own `useState` for `draft` and `showHint`; the
  bubbles come from `PLACEHOLDER_BUBBLES`. It does not accept any props
  for the message list or submit handler today. **Lift required**: turn
  it into a controlled component (`messages`, `isProcessing`,
  `exampleHint`, `showAfterRefuseHint`, `onSubmit`).
- `ChatPanel.tsx` (desktop) and `ChatDrawer.tsx` (mobile) both render
  `<ChatBody fillHeight />`. They will pass the new chat-state props
  through. They already own their open/minimize state — keep that.
- `ChatShell.tsx` is the responsive root and currently owns no chat
  state. P1.4 makes it the prop conduit: takes `messages`,
  `isProcessing`, `exampleHint`, `showAfterRefuseHint`, `onSubmit` and
  threads them to whichever child renders.
- `chatPlaceholder.ts` (`PLACEHOLDER_BUBBLES`) is referenced **only** by
  `ChatBody.tsx`. P1.4 deletes the reference; the file stays only as
  long as the `ChatPanel.test.tsx` expectation matches. The test asserts
  the three placeholder strings — those expectations are P1.3-era and
  get updated as part of the wiring.

## Form panel — imperative expand API

- `FormPanel.tsx` keeps its `expanded` state internal. There is no
  `forwardRef` today. P1.4 adds `forwardRef` + `useImperativeHandle`
  exposing `{ expand: () => void }` so the cold-start path can pop the
  form open from the chat handler.

## Hooks (P1.2) — match what `submitChatMessage` will call

- `useAIGeneration.generate(input, count?)` — `count` defaults to 1.
  P1.4 doesn't call this directly on cold-start (the locked spec says
  expand the form so the user can confirm). The hook is still consumed
  for the visible processing flag (`isGenerating`) via the page's
  existing `LoadingState`.
- `useRouteEditing.applyMutation(mutation)` returns `Promise<ExecutorResult>`.
  Success: `{ ok: true, route, metadata }`. Failure:
  `{ ok: false, reason: ExecutorFailure }`. `reason.kind` enumerates
  `router_unavailable | constraint_infeasible | waypoint_unreachable |
  mutation_not_supported | context_missing | internal_error`. P1.4 reads
  `result.route.stats.distance_km` / `elevation_gain_m` for the ack.
- `useRouteEditing.applyAIEdit(text)` exists today and calls the stub
  `executorAdapter.interpretChatInput` (which returns `null`). P1.4
  bypasses this path entirely — keyword translation happens in the new
  chat module and calls `applyMutation` directly. The stub stays
  exactly as-is (the spec says don't modify it).

## Current-route check

There is no `currentRoute` on `routeBuilderStore`. The page derives
"has a route" from `routeGeometry.coordinates.length > 0`. P1.4 mirrors
that — `submitChatMessage` accepts a `hasRoute: boolean` instead of a
`RouteSnapshot`, because `applyMutation` itself snapshots from the store
internally.

## Mutation types — only what's documented

The `change_surface_mix` mutation's `target` is `SurfaceMix` =
`{ road?, gravel?, path?, trail? }`. The spec value
`{ road: 0.4, gravel: 0.5, path: 0.1 }` is type-compatible.

`avoid_segment` takes a `segment_id` string — hardcoded `"us-287"` is
fine.

`increase_climbing` / `reduce_climbing` magnitude is a literal union
`'small' | 'moderate' | 'large'` — `"moderate"` is on-spec.

## Telemetry

The existing `trackRb2` helper is a fire-and-forget wrapper around
`posthog.capture(...)` and never throws. No new mock needed for tests;
the helper swallows errors when posthog isn't configured.

## Estimate

15 minutes of discovery; ~3-4 hours of build + tests + docs.
