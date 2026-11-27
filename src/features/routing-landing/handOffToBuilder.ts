/**
 * Hand a landing route to Route Builder 2 (ROUTING-LANDING-SPEC "Send to
 * Garmin / Wahoo and save, through the RB2 guest plumbing").
 *
 * Writes the chosen loop into the persisted route-builder store, so it
 * survives the navigation and, for a guest, the signup round trip
 * (GuestSaveModal → /auth → returnTo). RB2 picks it up at
 * /ride/new?from=landing: it fits the map, backfills climbing and starts a
 * fresh edit history. Save and Send to Garmin / Wahoo live there.
 */
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import type { ComfortCandidate } from '../../utils/comfortLadder';
import { formatMiles } from '../../utils/comfortLadder';
import { PRODUCT_NAME } from '../../utils/product';
import type { LandingSurface } from './landingPrefs';

export const BUILDER_HANDOFF_PATH = '/ride/new?from=landing';

/** RB2 has road and gravel profiles; a mixed loop edits best as gravel. */
export function profileForSurface(surface: LandingSurface): 'road' | 'gravel' {
  return surface === 'road' ? 'road' : 'gravel';
}

export function handOffToBuilder(c: ComfortCandidate, surface: LandingSurface): void {
  const store = useRouteBuilderStore.getState();
  const profile = profileForSurface(surface);
  // Profile first: it sets the sport, and a sport switch clears the route.
  store.setRouteProfile(profile);
  const coordinates = c.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]);
  const waypoints = c.waypoints.map((position, i, all) => ({
    id: `wp-${i}`,
    position: [position[0], position[1]] as [number, number],
    type: i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'waypoint',
    name: '',
  }));
  store.setRoute({
    geometry: { type: 'LineString', coordinates },
    name: `${PRODUCT_NAME} ${formatMiles(c.distance_m)} loop`,
    description: '',
    // Climbing is backfilled by RB2 (the ladder doesn't carry elevation).
    stats: { distance_km: c.distance_m / 1000, elevation_gain_m: 0, duration_s: 0 },
    waypoints,
    source: 'landing',
    origin: null,
  });
  store.setRouteType('loop');
  store.setComfortLevel(c.level);
}
