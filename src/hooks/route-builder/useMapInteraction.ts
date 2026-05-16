/**
 * useMapInteraction — Route Builder 2.0 map interaction hook.
 *
 * Owns viewport state (debounced via store writes) and translates
 * manual user actions (click/drag/add/remove/reverse/clear) into
 * `applyManualAction` calls through the executor adapter.
 *
 * P1.2 note: this hook takes canonical Coordinate (`[lng, lat]`) as
 * input and trusts it. P1.3 wires `react-map-gl` and provides the
 * conversion from Mapbox events via `mapboxEventToCanonical`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import * as executorAdapter from '../../features/route-builder-v2/adapters';
import type {
  Coordinate,
  ExecutorResult,
  ManualAction,
  ManualActionPayload,
  RouteSnapshot,
  RouteWaypoint,
} from '../../routing/executor';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

/** Viewport update debounce — too-frequent writes caused re-render jank in v1. */
export const VIEWPORT_DEBOUNCE_MS = 500;

export interface ViewportState {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface UseMapInteractionReturn {
  viewport: ViewportState;
  isApplying: boolean;
  lastError: string | null;
  setViewport: (next: ViewportState) => void;
  handleMapClick: (coord: Coordinate) => Promise<ExecutorResult | null>;
  handleWaypointDrag: (
    waypointIndex: number,
    newCoord: Coordinate,
  ) => Promise<ExecutorResult | null>;
  handleAddWaypointAtClick: (
    coord: Coordinate,
    insertAt?: number,
  ) => Promise<ExecutorResult | null>;
  handleRemoveWaypoint: (waypointIndex: number) => Promise<ExecutorResult | null>;
  handleReverseRoute: () => Promise<ExecutorResult | null>;
  handleClearRoute: () => Promise<ExecutorResult | null>;
}

function snapshotFromStore(state: ReturnType<typeof useRouteBuilderStore.getState>): RouteSnapshot | null {
  const { routeGeometry, routeStats, waypoints } = state;
  if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return null;
  const coords = routeGeometry.coordinates as Coordinate[];
  const wpList: RouteWaypoint[] = (Array.isArray(waypoints) ? waypoints : []).map(
    (wp: { position?: Coordinate | readonly [number, number] }) => ({
      coordinate: (wp.position ?? coords[0]) as Coordinate,
    }),
  );
  return {
    geometry: coords,
    waypoints: wpList,
    stats: {
      distance_km: routeStats?.distance_km ?? 0,
      elevation_gain_m: routeStats?.elevation_gain_m ?? 0,
      elevation_loss_m: 0,
      duration_s: routeStats?.duration_s ?? 0,
    },
  };
}

export function useMapInteraction(): UseMapInteractionReturn {
  const storeViewport = useRouteBuilderStore((s) => s.viewport);
  const setStoreViewport = useRouteBuilderStore((s) => s.setViewport);
  const setRouteGeometry = useRouteBuilderStore((s) => s.setRouteGeometry);
  const setRouteStats = useRouteBuilderStore((s) => s.setRouteStats);
  const setWaypoints = useRouteBuilderStore((s) => s.setWaypoints);
  const clearRouteInStore = useRouteBuilderStore((s) => s.clearRoute);

  // Local viewport mirrors store and writes through after debounce.
  const [localViewport, setLocalViewport] = useState<ViewportState>(storeViewport);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local→store on viewport change (debounced).
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

  const writeResultToStore = useCallback(
    (snap: RouteSnapshot) => {
      setRouteGeometry({ type: 'LineString', coordinates: snap.geometry });
      setRouteStats({
        distance_km: snap.stats.distance_km,
        elevation_gain_m: snap.stats.elevation_gain_m,
        duration_s: snap.stats.duration_s,
      });
      setWaypoints(
        snap.waypoints.map((wp, i) => ({
          id: `wp-${i}`,
          position: wp.coordinate,
          type:
            i === 0 ? 'start' : i === snap.waypoints.length - 1 ? 'end' : 'waypoint',
          name: '',
        })),
      );
    },
    [setRouteGeometry, setRouteStats, setWaypoints],
  );

  const runManual = useCallback(
    async (
      action: ManualAction,
      payload: ManualActionPayload,
    ): Promise<ExecutorResult | null> => {
      const current = snapshotFromStore(useRouteBuilderStore.getState());
      if (!current && action !== 'add_waypoint') {
        setLastError('No current route');
        trackRb2('manual_action_failed', {
          action,
          failure_kind: 'no_route',
        });
        return null;
      }
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const base: RouteSnapshot = current ?? {
          geometry: [],
          waypoints: [],
          stats: {
            distance_km: 0,
            elevation_gain_m: 0,
            elevation_loss_m: 0,
            duration_s: 0,
          },
        };
        const result = await executorAdapter.applyManualAction(base, action, payload);
        if (result.ok) {
          writeResultToStore(result.route);
          trackRb2('manual_action_applied', {
            action,
            duration_ms: Date.now() - startedAt,
          });
        } else {
          setLastError(`Action failed: ${result.reason.kind}`);
          trackRb2('manual_action_failed', {
            action,
            failure_kind: result.reason.kind,
          });
        }
        return result;
      } finally {
        setIsApplying(false);
      }
    },
    [writeResultToStore],
  );

  const handleMapClick = useCallback(
    (coord: Coordinate) => runManual('add_waypoint', { action: 'add_waypoint', coord }),
    [runManual],
  );

  const handleAddWaypointAtClick = useCallback(
    (coord: Coordinate, insertAt?: number) =>
      runManual('add_waypoint', { action: 'add_waypoint', coord, insert_at: insertAt }),
    [runManual],
  );

  const handleWaypointDrag = useCallback(
    (waypointIndex: number, newCoord: Coordinate) =>
      runManual('drag_waypoint', {
        action: 'drag_waypoint',
        waypoint_index: waypointIndex,
        new_coord: newCoord,
      }),
    [runManual],
  );

  const handleRemoveWaypoint = useCallback(
    (waypointIndex: number) =>
      runManual('remove_waypoint', {
        action: 'remove_waypoint',
        waypoint_index: waypointIndex,
      }),
    [runManual],
  );

  const handleReverseRoute = useCallback(
    () => runManual('reverse_route', { action: 'reverse_route' }),
    [runManual],
  );

  const handleClearRoute = useCallback(async (): Promise<ExecutorResult | null> => {
    // Clear bypasses the executor — there is no route to apply against.
    // We still mirror the action through the manual API for telemetry
    // and to keep the contract consistent.
    const result = await runManual('clear_route', { action: 'clear_route' });
    clearRouteInStore();
    return result;
  }, [clearRouteInStore, runManual]);

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
