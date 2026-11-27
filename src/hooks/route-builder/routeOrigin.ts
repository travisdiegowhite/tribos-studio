/**
 * Route origin → routes.generated_by.
 *
 * RB2 used to save every route as 'rb2', so the library's "Smart Generated"
 * filter (MyRoutes, SavedRoutesDrawer: generated_by === 'ai') never matched a
 * route RB2's AI produced. The store's `routeOrigin` is set to 'ai' when an AI
 * generation is committed; everything else stays 'rb2'. Both values are
 * allowed by routes_generated_by_check (migration 097).
 */
export type RouteOrigin = 'ai' | null;

export function generatedByForOrigin(origin: RouteOrigin | string | null | undefined): 'ai' | 'rb2' {
  return origin === 'ai' ? 'ai' : 'rb2';
}
