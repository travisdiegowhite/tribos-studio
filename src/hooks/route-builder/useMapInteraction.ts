/**
 * useMapInteraction — Route Builder 2.0 map interaction hook.
 *
 * Thin wrapper around v1's routing services. Owns viewport state
 * (debounced via store writes) and translates manual user actions
 * (click/drag/add/remove/reverse/clear) into:
 *   1. Waypoint list mutations (add/remove/reorder), then
 *   2. A `getSmartCyclingRoute` call to recompute geometry, then
 *   3. An elevation backfill to keep `stats.elevation_gain_m` honest.
 *
 * S2 rewire: replaces executor-adapter `applyManualAction` calls with
 * direct v1 service calls. Snap, elevation, distance conversion all
 * happen inline using the same utils v1 uses.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { getSmartCyclingRoute } from '../../utils/smartCyclingRouter';
import { getElevationData, calculateElevationStats } from '../../utils/elevation';
import { M_TO_KM } from '../../utils/distanceUnits';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';
import type { Coordinate } from './types';

/** Viewport update debounce — too-frequent writes caused re-render jank in v1. */
export const VIEWPORT_DEBOUNCE_MS = 500;

export interface ViewportState {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapActionResult {
  ok: boolean;
  reason?: string;
}

export interface UseMapInteractionReturn {
  viewport: ViewportState;
  isApplying: boolean;
  lastError: string | null;
  setViewport: (next: ViewportState) => void;
  handleMapClick: (coord: Coordinate) => Promise<MapActionResult>;
  handleWaypointDrag: (
    waypointIndex: number,
    newCoord: Coordinate,
  ) => Promise<MapActionResult>;
  handleAddWaypointAtClick: (
    coord: Coordinate,
    insertAt?: number,
  ) => Promise<MapActionResult>;
  handleRemoveWaypoint: (waypointIndex: number) => Promise<MapActionResult>;
  handleReverseRoute: () => Promise<MapActionResult>;
  handleClearRoute: () => Promise<MapActionResult>;
}

interface StoreWaypoint {
  id: string;
  position: Coordinate;
  type?: string;
  name?: string;
}

function readWaypoints(): StoreWaypoint[] {
  const wps = useRouteBuilderStore.getState().waypoints;
  return Array.isArray(wps) ? (wps as StoreWaypoint[]) : [];
}

function assignTypes(waypoints: StoreWaypoint[]): StoreWaypoint[] {
  if (waypoints.length === 0) return waypoints;
  return waypoints.map((wp, i) => ({
    ...wp,
    type:
      i === 0
        ? 'start'
        : i === waypoints.length - 1
          ? 'end'
          : 'waypoint',
  }));
}

function newWaypointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `wp-${crypto.randomUUID()}`;
  }
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function snapWaypointsToRoute(
  waypoints: StoreWaypoint[],
  profile: string,
): Promise<{
  coordinates: Coordinate[];
  distance_km: number;
  duration_s: number;
  source: string | undefined;
} | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((wp) => wp.position) as Array<[number, number]>;
  const routerProfile =
    profile === 'gravel' ? 'gravel' : profile === 'mountain' ? 'mountain' : 'bike';
  const route = (await (
    getSmartCyclingRoute as unknown as (
      waypoints: Array<[number, number]>,
      options: { profile: string },
    ) => Promise<{
      coordinates?: Array<[number, number]>;
      distance_m?: number;
      distance?: number;
      duration_s?: number;
      duration?: number;
      source?: string;
    } | null>
  )(coords, { profile: routerProfile }));
  if (!route?.coordinates || route.coordinates.length < 2) return null;
  const distance_m = route.distance_m ?? route.distance ?? 0;
  const duration_s = route.duration_s ?? route.duration ?? 0;
  return {
    coordinates: route.coordinates as Coordinate[],
    distance_km: M_TO_KM(distance_m),
    duration_s,
    source: route.source,
  };
}

async function resnapAndPersist(
  waypoints: StoreWaypoint[],
): Promise<MapActionResult> {
  const state = useRouteBuilderStore.getState();
  const profile = state.routeProfile ?? 'road';
  state.setWaypoints(waypoints);
  if (waypoints.length < 2) {
    state.setRouteGeometry(null);
    state.setRouteStats({ distance_km: 0, elevation_gain_m: 0, duration_s: 0 });
    return { ok: true };
  }
  const snapped = await snapWaypointsToRoute(waypoints, profile);
  if (!snapped) {
    return { ok: false, reason: 'routing_failed' };
  }
  state.setRouteGeometry({ type: 'LineString', coordinates: snapped.coordinates });
  state.setRouteStats({
    distance_km: snapped.distance_km,
    elevation_gain_m: 0,
    duration_s: snapped.duration_s,
  });
  if (snapped.source) state.setRoutingSource(snapped.source);

  try {
    const elev = await getElevationData(snapped.coordinates as Array<[number, number]>);
    if (elev) {
      const stats = calculateElevationStats(elev);
      state.setRouteStats({
        distance_km: snapped.distance_km,
        duration_s: snapped.duration_s,
        elevation_gain_m: stats.gain,
        elevation_loss_m: stats.loss,
      });
    }
  } catch {
    /* keep zero elevation on failure */
  }
  return { ok: true };
}

export function useMapInteraction(): UseMapInteractionReturn {
  const storeViewport = useRouteBuilderStore((s) => s.viewport);
  const setStoreViewport = useRouteBuilderStore((s) => s.setViewport);

  // Local viewport mirrors store and writes through after debounce.
  const [localViewport, setLocalViewport] = useState<ViewportState>(storeViewport);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setStoreViewport(localViewport);
    }, VIEWPORT_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localViewport, setStoreViewport]);

  const [isApplying, setIsApplying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const setViewport = useCallback((next: ViewportState) => {
    setLocalViewport(next);
  }, []);

  const runManual = useCallback(
    async (
      action: string,
      mutate: () => StoreWaypoint[] | null,
    ): Promise<MapActionResult> => {
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const next = mutate();
        if (next === null) {
          setLastError('no current route');
          trackRb2('manual_action_failed', { action, failure_kind: 'no_route' });
          return { ok: false, reason: 'no_current_route' };
        }
        const result = await resnapAndPersist(next);
        if (result.ok) {
          trackRb2('manual_action_applied', {
            action,
            duration_ms: Date.now() - startedAt,
          });
        } else {
          setLastError(result.reason ?? 'unknown');
          trackRb2('manual_action_failed', {
            action,
            failure_kind: result.reason ?? 'unknown',
          });
        }
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('manual_action_failed', {
          action,
          failure_kind: 'thrown',
          error_message: message.slice(0, 200),
        });
        return { ok: false, reason: message };
      } finally {
        setIsApplying(false);
      }
    },
    [],
  );

  const handleMapClick = useCallback(
    (coord: Coordinate) =>
      runManual('add_waypoint', () => {
        const current = readWaypoints();
        const next: StoreWaypoint[] = [
          ...current,
          { id: newWaypointId(), position: coord, type: 'waypoint', name: '' },
        ];
        return assignTypes(next);
      }),
    [runManual],
  );

  const handleAddWaypointAtClick = useCallback(
    (coord: Coordinate, insertAt?: number) =>
      runManual('add_waypoint', () => {
        const current = readWaypoints();
        const newWp: StoreWaypoint = {
          id: newWaypointId(),
          position: coord,
          type: 'waypoint',
          name: '',
        };
        const next = [...current];
        if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= next.length) {
          next.splice(insertAt, 0, newWp);
        } else {
          next.push(newWp);
        }
        return assignTypes(next);
      }),
    [runManual],
  );

  const handleWaypointDrag = useCallback(
    (waypointIndex: number, newCoord: Coordinate) =>
      runManual('drag_waypoint', () => {
        const current = readWaypoints();
        if (waypointIndex < 0 || waypointIndex >= current.length) return null;
        const next = current.map((wp, i) =>
          i === waypointIndex ? { ...wp, position: newCoord } : wp,
        );
        return assignTypes(next);
      }),
    [runManual],
  );

  const handleRemoveWaypoint = useCallback(
    (waypointIndex: number) =>
      runManual('remove_waypoint', () => {
        const current = readWaypoints();
        if (waypointIndex < 0 || waypointIndex >= current.length) return null;
        const next = current.filter((_, i) => i !== waypointIndex);
        return assignTypes(next);
      }),
    [runManual],
  );

  const handleReverseRoute = useCallback(
    () =>
      runManual('reverse_route', () => {
        const current = readWaypoints();
        if (current.length < 2) return null;
        return assignTypes([...current].reverse());
      }),
    [runManual],
  );

  const handleClearRoute = useCallback(async (): Promise<MapActionResult> => {
    const state = useRouteBuilderStore.getState();
    state.clearRoute();
    trackRb2('manual_action_applied', { action: 'clear_route', duration_ms: 0 });
    return { ok: true };
  }, []);

  return {
    viewport: localViewport,
    isApplying,
    lastError,
    setViewport,
    handleMapClick,
    handleWaypointDrag,
    handleAddWaypointAtClick,
    handleRemoveWaypoint,
    handleReverseRoute,
    handleClearRoute,
  };
}
