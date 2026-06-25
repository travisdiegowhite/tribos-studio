/**
 * useRouteBuilderV2Access — env-level gate for Route Builder 2.0 + the
 * routing-first Today page.
 *
 * Access is now driven solely by the env kill-switch:
 *   VITE_ROUTE_BUILDER_V2_ENABLED === 'true'
 *
 * The per-user beta cohort layer (user_profiles.route_builder_v2_enabled) was
 * removed when the beta opened to everyone — that column is retained in the DB
 * but no longer read. Flipping the env flag to 'false' instantly reverts every
 * user to v1 (the /route-builder-2 guard redirects to /ride/new) and the live
 * Today (TodayEntry falls back to TodayView). Fails closed when the flag is off.
 *
 * The return shape ({ hasAccess, isLoading }) is unchanged so every consumer —
 * the App.jsx route guard, TodayEntry, and the "which builder to link to" call
 * sites — keeps working without edits.
 */

const ENV_FLAG = import.meta.env.VITE_ROUTE_BUILDER_V2_ENABLED === 'true';

export interface RouteBuilderV2Access {
  hasAccess: boolean;
  isLoading: boolean;
}

export function useRouteBuilderV2Access(): RouteBuilderV2Access {
  // ENV_FLAG is a build-time constant, so access is resolved synchronously —
  // no DB read, no auth dependency, never loading.
  return {
    hasAccess: ENV_FLAG,
    isLoading: false,
  };
}
