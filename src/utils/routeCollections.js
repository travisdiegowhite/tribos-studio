/**
 * Route library collections, built on routes.tags (api/utils/routeTags.js
 * normalises them on write). Matching is case-insensitive, like the server's
 * de-duplication.
 */

/** Every tag across the routes with how many routes carry it, biggest first. */
export function collectionCounts(routes) {
  const byKey = new Map();
  for (const route of routes || []) {
    for (const tag of Array.isArray(route?.tags) ? route.tags : []) {
      if (typeof tag !== 'string' || !tag.trim()) continue;
      const key = tag.toLowerCase();
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { tag, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Is this route in the collection? `'all'` or empty matches every route. */
export function routeInCollection(route, collection) {
  if (!collection || collection === 'all') return true;
  const want = String(collection).toLowerCase();
  return (Array.isArray(route?.tags) ? route.tags : []).some(
    (t) => typeof t === 'string' && t.toLowerCase() === want,
  );
}
