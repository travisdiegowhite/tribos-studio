/**
 * Replicated AI edit logic for the v2 chat surface.
 *
 * v1's `AIEditPanel.jsx` is a UI shell over two functions exported from
 * `src/utils/aiRouteEditService.js` — `classifyEditIntent(text)` and
 * `applyRouteEdit({ routeGeometry, routeProfile, routeStats,
 * editIntent, mapboxToken })`. v2's chat reuses both functions directly.
 *
 * Differences from v1's edit-panel flow:
 *   - No accept/reject preview. The chat applies the edit immediately;
 *     if the user dislikes the result they can issue another edit.
 *   - Distance/elevation comparisons come back from `applyRouteEdit` as
 *     deltas — we resolve them into a new `routeStats` snapshot and
 *     write to the store inline.
 *   - For intents that return `needsReroute: true` (currently
 *     `shorter`), v1 re-snaps with `getSmartCyclingRoute`. We do too.
 *
 * S2 replicates v1's behavior intentionally. Prompt design and the
 * conversational pipeline are S5 territory.
 */
import {
  classifyEditIntent,
  applyRouteEdit,
} from '../../../utils/aiRouteEditService';
import {
  computeDistanceKm,
  rerouteShortened,
  fetchElevationGain,
} from '../../../utils/routeMutation';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import type { Coordinate } from '../../../types/geo';

export type EditResult =
  | { ok: true; assistantText: string; distance_km: number; elevation_gain_m: number }
  | { ok: false; reason: string };

const MAPBOX_TOKEN: string =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_MAPBOX_TOKEN as string | undefined) ?? '';

/**
 * Apply a natural-language edit to the current route.
 *
 * Steps:
 *   1. Classify the user's text into a v1 edit intent.
 *   2. Pull the current route from the store.
 *   3. Delegate to v1's `applyRouteEdit`.
 *   4. On success, write the new geometry and stats back to the store.
 *      Recompute stats from the new coordinates (distance) + a fresh
 *      elevation fetch (gain) so chat-driven edits show real numbers.
 */
export async function applyAIEdit(text: string): Promise<EditResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty input' };
  }

  const editIntent = classifyEditIntent(trimmed);
  if (!editIntent || editIntent.intent === 'unknown') {
    return {
      ok: false,
      reason: "I didn't catch that one — try a phrase like \"make it flatter\", \"more gravel\", or \"reverse it\"",
    };
  }

  const state = useRouteBuilderStore.getState();
  const routeGeometry = state.routeGeometry;
  const routeStats = state.routeStats;
  const routeProfile = state.routeProfile ?? 'road';

  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
    return { ok: false, reason: 'no current route' };
  }

  const result = (await applyRouteEdit({
    routeGeometry,
    routeProfile,
    routeStats: routeStats ?? { distance_km: 0, elevation_gain_m: 0, duration_s: 0 },
    editIntent,
    mapboxToken: MAPBOX_TOKEN,
  })) as {
    success: boolean;
    editedRoute?: {
      coordinates?: Array<[number, number]>;
      needsReroute?: boolean;
    };
    message?: string;
  };

  if (!result?.success || !result.editedRoute?.coordinates) {
    return { ok: false, reason: result?.message || 'edit failed' };
  }

  let nextCoords = result.editedRoute.coordinates as Coordinate[];

  if (result.editedRoute.needsReroute) {
    nextCoords = await rerouteShortened(nextCoords, routeProfile);
  }

  const distance_km = computeDistanceKm(nextCoords);
  const elevation_gain_m =
    (await fetchElevationGain(nextCoords)) ?? routeStats?.elevation_gain_m ?? 0;

  const newStats = {
    distance_km,
    elevation_gain_m,
    duration_s: routeStats?.duration_s ?? 0,
  };

  state.setRouteGeometry({ type: 'LineString', coordinates: nextCoords });
  state.setRouteStats(newStats);

  return {
    ok: true,
    assistantText: result.message || 'Done.',
    distance_km: Math.round(distance_km),
    elevation_gain_m: Math.round(elevation_gain_m),
  };
}
