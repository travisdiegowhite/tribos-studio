# Route Builder 2.0 — Phase 1 scaffolding (P1.1) + S1 per-user gate

Phase 1 of the Route Builder rebuild ships the new UI in parallel with the
existing `RouteBuilder.jsx`. P1.1 is scaffolding only — a routed, near-empty
page behind a feature flag. Real functionality lands in P1.2+.

## What's here today

- **Route:** `/route-builder-2` (`src/pages/RouteBuilder2.tsx`)
- **Access (S1):** per-user. Requires both:
  1. `VITE_ROUTE_BUILDER_V2_ENABLED=true` in the deploy env (kill switch)
  2. `user_profiles.route_builder_v2_enabled = true` for the specific user
- **Existing Route Builder:** `/ride/new` and `/ride/:routeId` remain
  byte-unchanged. They are the production route builder until Phase 3
  cutover.

## Access behavior (S1)

When both requirements are met, the user sees the "BUILDER 2.0 BETA" nav link
and can reach `/route-builder-2`. Otherwise the link is hidden AND direct URL
access redirects to `/ride/new` (the v1 builder).

| Env flag | User column | Nav link | `/route-builder-2` |
|---|---|---|---|
| `true`  | `true`  | shown  | works                  |
| `true`  | `false` | hidden | redirects to `/ride/new` |
| `false` | any     | hidden | redirects to `/ride/new` |

The env flag is a defense-in-depth kill switch — flipping it off in the
deploy environment cuts off all access immediately, with no DB change needed.

## Granting access

To grant a user access, run this in Supabase Studio (or `psql`):

```sql
UPDATE user_profiles
SET route_builder_v2_enabled = TRUE
WHERE id = '<user uuid>';
```

There is no end-user UI for managing this flag in S1. The default is `FALSE`
for all existing and new users.

## Implementation

- Migration: `database/migrations/090_user_profiles_route_builder_v2_enabled.sql`
- Hook: `src/hooks/useRouteBuilderV2Access.ts` — returns `{ hasAccess, isLoading }`,
  fails closed on any read error.
- Nav: `src/components/AppShell.jsx` computes `navItems` per-render using the hook.
- Route guard: `RouteBuilderV2Guard` in `src/App.jsx` wraps the v2 route
  elements (including the dev harness) and redirects on denial.

## What this page must not contain (P1.1)

- No Route Builder UI (map, waypoints, chat, overlays)
- No imports from `src/routing/executor/`
- No telemetry events
- No modifications to `RouteBuilder.jsx` or `routeBuilderStore.js`

See `ROUTE_BUILDER_PHASE_1_2_PLAN.md` for the full Phase 1 roadmap.
