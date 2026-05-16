# Route Builder 2.0 — Phase 1 scaffolding (P1.1)

Phase 1 of the Route Builder rebuild ships the new UI in parallel with the
existing `RouteBuilder.jsx`. P1.1 is scaffolding only — a routed, near-empty
page behind an env-level feature flag. Real functionality lands in P1.2+.

## What's here today

- **Route:** `/route-builder-2` (`src/pages/RouteBuilder2.tsx`)
- **Flag:** `VITE_ROUTE_BUILDER_V2_ENABLED` — set to `"true"` in `.env.local`
  to see the BUILDER 2.0 BETA tab in the primary nav.
- **Existing Route Builder:** `/ride/new` and `/ride/:routeId` remain
  byte-unchanged. They are the production route builder until Phase 3
  cutover.

## Flag behavior

| `VITE_ROUTE_BUILDER_V2_ENABLED` | Nav shows BUILDER 2.0 tab | `/route-builder-2` URL works |
|---|---|---|
| `"true"`  | yes | yes |
| `"false"` / unset | no  | yes (direct URL is always accessible) |

The flag only gates **nav visibility**. The URL is always live so beta users
can bookmark or share it. Per-user beta cohort gating arrives in P1.5.

## What this page must not contain (P1.1)

- No Route Builder UI (map, waypoints, chat, overlays)
- No imports from `src/routing/executor/`
- No telemetry events
- No modifications to `RouteBuilder.jsx` or `routeBuilderStore.js`

See `ROUTE_BUILDER_PHASE_1_2_PLAN.md` for the full Phase 1 roadmap.
