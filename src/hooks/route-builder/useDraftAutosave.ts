/**
 * useDraftAutosave — server-side crash safety for the in-progress route.
 *
 * The localStorage mirror only survives same-browser reloads; this hook
 * additionally autosaves the route to the user's single draft row in
 * Supabase (migration 103) so work survives quota failures, cleared site
 * data, and moves across devices.
 *
 * Behavior:
 *  - While the route has unsaved changes, a trailing debounce pushes the
 *    current snapshot to `save_draft` (upserting the one draft row).
 *  - All failures are silent (console-only): autosave is a safety net, not
 *    a user-facing operation, and it must never toast on flaky networks.
 *  - `restoreIfEmpty()` fetches the draft once and loads it into the store
 *    when the builder opens with no route (e.g. a different device).
 *  - `discardDraft()` deletes the row — call after a manual save supersedes
 *    it or the user clears the route.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import * as routesService from '../../utils/routesService';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

const AUTOSAVE_DEBOUNCE_MS = 15_000;

interface DraftRow {
  id: string;
  name?: string;
  description?: string | null;
  geometry?: unknown;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  estimated_duration_minutes?: number | null;
  waypoints?: unknown[] | null;
  updated_at?: string;
}

const saveDraftSvc = routesService.saveDraft as (data: unknown) => Promise<unknown>;
const getDraftSvc = routesService.getDraft as () => Promise<DraftRow | null>;
const deleteDraftSvc = routesService.deleteDraft as () => Promise<unknown>;

export interface UseDraftAutosaveReturn {
  /**
   * Load the server draft into the store if the store has no route.
   * Resolves true when a draft was restored.
   */
  restoreIfEmpty: () => Promise<boolean>;
  /** Fire-and-forget draft deletion (after manual save / clear). */
  discardDraft: () => void;
}

export function useDraftAutosave(hasUnsavedChanges: boolean): UseDraftAutosaveReturn {
  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const setRouteFromStore = useRouteBuilderStore((s) => s.setRoute);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const coords = (routeGeometry as { coordinates?: unknown[] } | null)?.coordinates;
    if (!hasUnsavedChanges || !Array.isArray(coords) || coords.length < 2) return;

    timerRef.current = setTimeout(() => {
      // Snapshot at fire time, not schedule time — the debounce means the
      // store may have moved on since this effect ran.
      const s = useRouteBuilderStore.getState();
      if (!s.routeGeometry) return;
      const duration_s = s.routeStats?.duration_s ?? null;
      saveDraftSvc({
        name: s.routeName || 'Unsaved draft',
        description: s.routeDescription || null,
        geometry: s.routeGeometry,
        distance_km: s.routeStats?.distance_km ?? null,
        elevation_gain_m: s.routeStats?.elevation_gain_m ?? null,
        estimated_duration_minutes: duration_s != null ? Math.round(duration_s / 60) : null,
        route_type: s.routeType,
        training_goal: s.trainingGoal,
        surface_type: s.routeProfile,
        generated_by: 'rb2',
        waypoints: s.waypoints?.length ? s.waypoints : null,
      })
        .then(() => trackRb2('draft_autosaved', {}))
        .catch((e) => console.warn('[draft-autosave] failed:', e));
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [routeGeometry, hasUnsavedChanges]);

  const restoreIfEmpty = useCallback(async (): Promise<boolean> => {
    const s = useRouteBuilderStore.getState();
    const coords = (s.routeGeometry as { coordinates?: unknown[] } | null)?.coordinates;
    if (Array.isArray(coords) && coords.length > 0) return false;
    try {
      const draft = await getDraftSvc();
      const draftCoords = (draft?.geometry as { coordinates?: unknown[] } | null)?.coordinates;
      if (!draft || !Array.isArray(draftCoords) || draftCoords.length < 2) return false;
      setRouteFromStore({
        geometry: draft.geometry,
        name: draft.name,
        description: draft.description ?? '',
        stats: {
          distance_km: draft.distance_km ?? 0,
          elevation_gain_m: draft.elevation_gain_m ?? 0,
          duration_s: draft.estimated_duration_minutes
            ? draft.estimated_duration_minutes * 60
            : 0,
        },
        waypoints: draft.waypoints ?? [],
        source: 'draft',
      });
      trackRb2('draft_restored', {});
      return true;
    } catch (e) {
      console.warn('[draft-autosave] restore failed:', e);
      return false;
    }
  }, [setRouteFromStore]);

  const discardDraft = useCallback(() => {
    deleteDraftSvc().catch((e) => console.warn('[draft-autosave] discard failed:', e));
  }, []);

  return { restoreIfEmpty, discardDraft };
}

export default useDraftAutosave;
