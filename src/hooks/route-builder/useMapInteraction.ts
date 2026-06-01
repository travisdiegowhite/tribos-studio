/**
 * useMapInteraction — Route Builder 2.0 map interaction hook.
 *
 * Thin wrapper around v1's `useRouteManipulation` hook. Map / waypoint
 * actions (click / drag / add / remove / reverse / clear) delegate to v1
 * with `silent: true` so notifications stay v1-only and v2's chat / status
 * surfaces own user feedback.
 *
 * Per the S2 spec's locked decision #4, v1's `useRouteManipulation`
 * gained an optional `silent?: boolean` parameter (strictly additive).
 * v2 plumbs Zustand-store-backed setters into v1's hook and calls every
 * method with `silent: true` to avoid double-toasting chat-driven flows.
 *
 * `handleAddWaypointAtClick` supports an `insertAt` index that v1's hook
 * doesn't offer; that single path is inlined and falls through to v1's
 * `snapToRoads` for the actual routing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import useRouteManipulation from '../useRouteManipulation';
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

/**
 * Minimal imperative surface the <Map> registers so search / import can
 * recenter the camera. Structurally satisfied by react-map-gl's MapRef
 * (which proxies the underlying mapbox-gl Map methods).
 */
export interface MapController {
  flyTo: (opts: { center: [number, number]; zoom?: number; duration?: number }) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    opts?: { padding?: number; duration?: number; maxZoom?: number },
  ) => void;
}

export interface UseMapInteractionReturn {
  viewport: ViewportState;
  isApplying: boolean;
  lastError: string | null;
  setViewport: (next: ViewportState) => void;
  /** Registers the live map instance (called by <Map> on load). */
  registerMap: (controller: MapController | null) => void;
  /** Animate the camera to a coordinate (e.g. a geocoded search result). */
  flyTo: (coord: Coordinate, zoom?: number) => void;
  /** Frame a set of coordinates (e.g. a freshly imported GPX track). */
  fitBounds: (coords: Coordinate[]) => void;
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
  handleReorderWaypoints: (
    fromIndex: number,
    toIndex: number,
  ) => Promise<MapActionResult>;
  handleReverseRoute: () => Promise<MapActionResult>;
  handleClearRoute: () => Promise<MapActionResult>;
}

interface StoreWaypoint {
  id: string;
  position: Coordinate;
  type?: string;
  name?: string;
}

function newWaypointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `wp-${crypto.randomUUID()}`;
  }
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function reassignTypes(waypoints: StoreWaypoint[]): StoreWaypoint[] {
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

export function useMapInteraction(): UseMapInteractionReturn {
  const storeViewport = useRouteBuilderStore((s) => s.viewport);
  const setStoreViewport = useRouteBuilderStore((s) => s.setViewport);
  const waypoints = useRouteBuilderStore((s) => s.waypoints) as StoreWaypoint[];
  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const setWaypoints = useRouteBuilderStore((s) => s.setWaypoints);
  const setRouteGeometry = useRouteBuilderStore((s) => s.setRouteGeometry);
  const setRouteStats = useRouteBuilderStore((s) => s.setRouteStats);
  const routingProfile = useRouteBuilderStore((s) => s.routeProfile) ?? 'road';

  // v2 doesn't keep `elevationProfile` in the route-builder store —
  // `useRouteAnalysis` derives it on demand. v1's `useRouteManipulation`
  // still calls `setElevationProfile` after every snap (and reads
  // `elevationProfile` for the in-place reverse path), so we provide a
  // private local setter to satisfy the contract without adding a
  // redundant store field.
  const [elevationProfile, setElevationProfile] = useState<unknown[]>([]);

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

  // Imperative camera control. The map is uncontrolled (initialViewState),
  // so store viewport writes don't move it — we drive flyTo/fitBounds on the
  // live instance and mirror the target into localViewport so the generation
  // form's viewport-center start fallback stays accurate.
  const mapControllerRef = useRef<MapController | null>(null);
  const registerMap = useCallback((controller: MapController | null) => {
    mapControllerRef.current = controller;
  }, []);

  const flyTo = useCallback((coord: Coordinate, zoom?: number) => {
    const controller = mapControllerRef.current;
    const targetZoom = zoom ?? 13;
    if (controller) {
      controller.flyTo({ center: [coord[0], coord[1]], zoom: targetZoom, duration: 1200 });
    }
    setLocalViewport({ longitude: coord[0], latitude: coord[1], zoom: targetZoom });
  }, []);

  const fitBounds = useCallback((coords: Coordinate[]) => {
    if (!coords || coords.length === 0) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    const controller = mapControllerRef.current;
    if (controller) {
      controller.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 60, duration: 1000, maxZoom: 15 },
      );
    }
    // Mirror the center; the map's onMove settles the precise zoom after the
    // animation, so we keep the current zoom as an approximation.
    setLocalViewport((prev) => ({
      longitude: (minLng + maxLng) / 2,
      latitude: (minLat + maxLat) / 2,
      zoom: prev.zoom,
    }));
  }, []);

  const manip = useRouteManipulation({
    waypoints,
    setWaypoints,
    routeGeometry,
    setRouteGeometry,
    routeStats,
    setRouteStats,
    elevationProfile,
    setElevationProfile,
    routingProfile,
    useSmartRouting: true,
  });

  /**
   * Snap a freshly-mutated waypoint list and report a typed result with
   * S2 telemetry. v1's `snapToRoads` already handles geometry + stats +
   * elevation writes via the setters we plumbed in.
   */
  const snapAndReport = useCallback(
    async (
      action: string,
      next: StoreWaypoint[],
      startedAt: number,
    ): Promise<MapActionResult> => {
      if (next.length < 2) {
        // No route to snap — wipe geometry/stats to match an empty waypoint list.
        setRouteGeometry(null);
        setRouteStats({ distance_km: 0, elevation_gain_m: 0, duration_s: 0 });
        trackRb2('manual_action_applied', {
          action,
          duration_ms: Date.now() - startedAt,
        });
        return { ok: true };
      }
      const snapped = await manip.snapToRoads(next, { silent: true });
      if (!snapped) {
        setLastError('routing_failed');
        trackRb2('manual_action_failed', { action, failure_kind: 'routing_failed' });
        return { ok: false, reason: 'routing_failed' };
      }
      trackRb2('manual_action_applied', {
        action,
        duration_ms: Date.now() - startedAt,
      });
      return { ok: true };
    },
    [manip, setRouteGeometry, setRouteStats],
  );

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
        return await snapAndReport(action, next, startedAt);
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
    [snapAndReport],
  );

  // Append a fresh waypoint via v1's hook (history-aware + sets store),
  // then snap silently.
  const handleMapClick = useCallback(
    async (coord: Coordinate): Promise<MapActionResult> => {
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const updated = manip.addWaypoint({ lng: coord[0], lat: coord[1] });
        return await snapAndReport('add_waypoint', updated, startedAt);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('manual_action_failed', {
          action: 'add_waypoint',
          failure_kind: 'thrown',
          error_message: message.slice(0, 200),
        });
        return { ok: false, reason: message };
      } finally {
        setIsApplying(false);
      }
    },
    [manip, snapAndReport],
  );

  // Insert at a specific index — v1's hook has no equivalent, so the
  // splice is inlined; snap still routes through v1.
  const handleAddWaypointAtClick = useCallback(
    (coord: Coordinate, insertAt?: number) =>
      runManual('add_waypoint', () => {
        const newWp: StoreWaypoint = {
          id: newWaypointId(),
          position: coord,
          type: 'waypoint',
          name: '',
        };
        const next = [...waypoints];
        if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= next.length) {
          next.splice(insertAt, 0, newWp);
        } else {
          next.push(newWp);
        }
        return reassignTypes(next);
      }),
    [runManual, waypoints],
  );

  const handleWaypointDrag = useCallback(
    async (waypointIndex: number, newCoord: Coordinate): Promise<MapActionResult> => {
      if (waypointIndex < 0 || waypointIndex >= waypoints.length) {
        setLastError('no current route');
        trackRb2('manual_action_failed', {
          action: 'drag_waypoint',
          failure_kind: 'no_route',
        });
        return { ok: false, reason: 'no_current_route' };
      }
      const wp = waypoints[waypointIndex];
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const updated = manip.updateWaypointPosition(wp.id, {
          lng: newCoord[0],
          lat: newCoord[1],
        });
        return await snapAndReport('drag_waypoint', updated, startedAt);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('manual_action_failed', {
          action: 'drag_waypoint',
          failure_kind: 'thrown',
          error_message: message.slice(0, 200),
        });
        return { ok: false, reason: message };
      } finally {
        setIsApplying(false);
      }
    },
    [manip, snapAndReport, waypoints],
  );

  const handleRemoveWaypoint = useCallback(
    async (waypointIndex: number): Promise<MapActionResult> => {
      if (waypointIndex < 0 || waypointIndex >= waypoints.length) {
        setLastError('no current route');
        trackRb2('manual_action_failed', {
          action: 'remove_waypoint',
          failure_kind: 'no_route',
        });
        return { ok: false, reason: 'no_current_route' };
      }
      const wp = waypoints[waypointIndex];
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const updated = manip.removeWaypoint(wp.id);
        return await snapAndReport('remove_waypoint', updated, startedAt);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('manual_action_failed', {
          action: 'remove_waypoint',
          failure_kind: 'thrown',
          error_message: message.slice(0, 200),
        });
        return { ok: false, reason: message };
      } finally {
        setIsApplying(false);
      }
    },
    [manip, snapAndReport, waypoints],
  );

  // Move a waypoint to a new position in the list, then re-route. The
  // splice has no v1 equivalent, so it's inlined; snapping still goes
  // through v1's router. reassignTypes re-derives start/end after the move.
  const handleReorderWaypoints = useCallback(
    async (fromIndex: number, toIndex: number): Promise<MapActionResult> => {
      if (fromIndex === toIndex) return { ok: true };
      if (
        fromIndex < 0 ||
        fromIndex >= waypoints.length ||
        toIndex < 0 ||
        toIndex >= waypoints.length
      ) {
        return { ok: false, reason: 'out_of_range' };
      }
      return runManual('reorder_waypoints', () => {
        const next = [...waypoints];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return reassignTypes(next);
      });
    },
    [runManual, waypoints],
  );

  // Reverse is a pure-geometry transform on v1's side — no router call,
  // no elevation re-fetch. Delegate directly.
  const handleReverseRoute = useCallback(async (): Promise<MapActionResult> => {
    if (waypoints.length < 2) return { ok: false, reason: 'no_current_route' };
    setIsApplying(true);
    setLastError(null);
    const startedAt = Date.now();
    try {
      manip.reverseRoute({ silent: true });
      trackRb2('manual_action_applied', {
        action: 'reverse_route',
        duration_ms: Date.now() - startedAt,
      });
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
      trackRb2('manual_action_failed', {
        action: 'reverse_route',
        failure_kind: 'thrown',
        error_message: message.slice(0, 200),
      });
      return { ok: false, reason: message };
    } finally {
      setIsApplying(false);
    }
  }, [manip, waypoints]);

  const handleClearRoute = useCallback(async (): Promise<MapActionResult> => {
    manip.clearRoute({ silent: true });
    trackRb2('manual_action_applied', { action: 'clear_route', duration_ms: 0 });
    return { ok: true };
  }, [manip]);

  return {
    viewport: localViewport,
    isApplying,
    lastError,
    setViewport,
    registerMap,
    flyTo,
    fitBounds,
    handleMapClick,
    handleWaypointDrag,
    handleAddWaypointAtClick,
    handleRemoveWaypoint,
    handleReorderWaypoints,
    handleReverseRoute,
    handleClearRoute,
  };
}
