import { useCallback, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { getElevationData, calculateElevationStats } from '../utils/elevation';
import { getSmartCyclingRoute } from '../utils/smartCyclingRouter';
import { M_TO_KM, assertKm, haversineMeters } from '../utils/distanceUnits';

/**
 * Custom hook for route manipulation functions
 * Shared between AI Route Builder and Manual Route Builder
 * Handles waypoint management, route snapping, elevation, and history (undo/redo)
 */
export const useRouteManipulation = ({
  waypoints,
  setWaypoints,
  routeGeometry,
  setRouteGeometry,
  routeStats,
  setRouteStats,
  elevationProfile,
  setElevationProfile,
  routingProfile = 'road',
  useSmartRouting = true,
}) => {
  // History for undo/redo
  // Refs hold the actual data (no re-render on change), state drives UI reactivity
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const [historyLength, setHistoryLength] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // === Push to History ===
  const pushToHistory = useCallback((waypointState) => {
    // Truncate any future history if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(structuredClone(waypointState));
    historyIndexRef.current = historyRef.current.length - 1;
    // Sync reactive state for canUndo/canRedo
    setHistoryIndex(historyIndexRef.current);
    setHistoryLength(historyRef.current.length);
  }, []);

  // === Add Waypoint ===
  const addWaypoint = useCallback((lngLat) => {
    const newWaypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      position: [lngLat.lng, lngLat.lat],
      type: waypoints.length === 0 ? 'start' : 'end',
      name: waypoints.length === 0 ? 'Start' : `Waypoint ${waypoints.length}`,
    };

    const updatedWaypoints = [...waypoints];
    if (updatedWaypoints.length > 0) {
      // Change previous end to waypoint
      updatedWaypoints[updatedWaypoints.length - 1].type = 'waypoint';
    }
    updatedWaypoints.push(newWaypoint);

    pushToHistory(updatedWaypoints);
    setWaypoints(updatedWaypoints);

    return updatedWaypoints;
  }, [waypoints, setWaypoints, pushToHistory]);

  // === Remove Waypoint ===
  const removeWaypoint = useCallback((waypointId) => {
    const filtered = waypoints.filter(wp => wp.id !== waypointId);

    // Re-assign types
    if (filtered.length > 0) {
      filtered[0].type = 'start';
      if (filtered.length > 1) {
        filtered[filtered.length - 1].type = 'end';
        filtered.slice(1, -1).forEach(wp => wp.type = 'waypoint');
      }
    }

    pushToHistory(filtered);
    setWaypoints(filtered);

    return filtered;
  }, [waypoints, setWaypoints, pushToHistory]);

  // === Update Waypoint Position (for dragging) ===
  const updateWaypointPosition = useCallback((waypointId, newPosition) => {
    const updated = waypoints.map(wp =>
      wp.id === waypointId
        ? { ...wp, position: [newPosition.lng, newPosition.lat] }
        : wp
    );

    pushToHistory(updated);
    setWaypoints(updated);

    return updated;
  }, [waypoints, setWaypoints, pushToHistory]);

  // === Reverse Route ===
  // The `options.silent` flag suppresses Mantine notifications so callers
  // (notably Route Builder 2.0's chat-driven flows) can own their own user
  // feedback without double-toasting. Default false preserves v1 behavior.
  const reverseRoute = useCallback((options = {}) => {
    if (waypoints.length < 2) {
      if (!options.silent) {
        notifications.show({
          title: 'Cannot reverse',
          message: 'Need at least 2 waypoints to reverse route',
          color: 'yellow',
        });
      }
      return waypoints;
    }

    const reversed = [...waypoints].reverse();

    // Re-assign types
    reversed[0].type = 'start';
    reversed[reversed.length - 1].type = 'end';
    reversed.slice(1, -1).forEach(wp => wp.type = 'waypoint');

    pushToHistory(reversed);
    setWaypoints(reversed);

    // Also reverse the route geometry if it exists
    if (routeGeometry?.coordinates) {
      const reversedGeometry = {
        ...routeGeometry,
        coordinates: [...routeGeometry.coordinates].reverse(),
      };
      setRouteGeometry(reversedGeometry);

      // Reverse elevation profile
      if (elevationProfile?.length > 0) {
        const totalDistance = elevationProfile[elevationProfile.length - 1]?.distance || 0;
        const reversedElevation = [...elevationProfile].reverse().map((point, i, arr) => ({
          ...point,
          distance: totalDistance - point.distance,
        }));
        setElevationProfile(reversedElevation);
      }
    }

    if (!options.silent) {
      notifications.show({
        title: 'Route reversed',
        message: 'Start and end points swapped',
        color: 'green',
      });
    }

    return reversed;
  }, [waypoints, setWaypoints, routeGeometry, setRouteGeometry, elevationProfile, setElevationProfile, pushToHistory]);

  // === Clear Route ===
  const clearRoute = useCallback((options = {}) => {
    setWaypoints([]);
    setRouteGeometry(null);
    setRouteStats({ distance_km: 0, elevation_gain_m: 0, duration_s: 0 });
    setElevationProfile([]);
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistoryIndex(-1);
    setHistoryLength(0);

    if (!options.silent) {
      notifications.show({
        title: 'Route cleared',
        message: 'All waypoints removed',
        color: 'blue',
      });
    }
  }, [setWaypoints, setRouteGeometry, setRouteStats, setElevationProfile]);

  // === Undo ===
  const undo = useCallback((options = {}) => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      setHistoryIndex(historyIndexRef.current);
      const previousState = historyRef.current[historyIndexRef.current];
      setWaypoints(structuredClone(previousState));

      if (!options.silent) {
        notifications.show({
          title: 'Undo',
          message: 'Reverted to previous state',
          color: 'blue',
        });
      }

      return previousState;
    } else {
      if (!options.silent) {
        notifications.show({
          title: 'Cannot undo',
          message: 'No more history to undo',
          color: 'yellow',
        });
      }
      return waypoints;
    }
  }, [waypoints, setWaypoints]);

  // === Redo ===
  const redo = useCallback((options = {}) => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      setHistoryIndex(historyIndexRef.current);
      const nextState = historyRef.current[historyIndexRef.current];
      setWaypoints(structuredClone(nextState));

      if (!options.silent) {
        notifications.show({
          title: 'Redo',
          message: 'Restored next state',
          color: 'blue',
        });
      }

      return nextState;
    } else {
      if (!options.silent) {
        notifications.show({
          title: 'Cannot redo',
          message: 'No more history to redo',
          color: 'yellow',
        });
      }
      return waypoints;
    }
  }, [waypoints, setWaypoints]);

  // === Check if can undo/redo (derived from reactive state) ===
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  // === Snap to Roads ===
  const snapToRoads = useCallback(async (waypointsToSnap = waypoints, options = {}) => {
    if (waypointsToSnap.length < 2) {
      if (!options.silent) {
        notifications.show({
          title: 'Cannot snap',
          message: 'Need at least 2 waypoints to create a route',
          color: 'yellow',
        });
      }
      return null;
    }

    try {
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!mapboxToken) {
        throw new Error('Mapbox token not configured');
      }

      const waypointCoordinates = waypointsToSnap.map(wp => wp.position);
      let snappedCoordinates;
      // routeDistance_m and routeDuration_s are RAW from the routing API
      // (meters and seconds). They get converted at the boundary before
      // being written to the routeStats state below.
      let routeDistance_m = 0;
      let routeDuration_s = 0;
      let routingSource = 'mapbox';

      // Use smart cycling routing when enabled
      const cyclingProfiles = ['road', 'gravel', 'mountain', 'commuting'];
      if (useSmartRouting && cyclingProfiles.includes(routingProfile)) {
        console.log(`🧠 Using smart ${routingProfile} routing`);

        const smartRoute = await getSmartCyclingRoute(waypointCoordinates, {
          profile: routingProfile === 'gravel' ? 'gravel' :
                   routingProfile === 'mountain' ? 'mountain' : 'bike',
          mapboxToken: mapboxToken,
        });

        if (smartRoute?.coordinates?.length > 0) {
          snappedCoordinates = smartRoute.coordinates;
          routeDistance_m = smartRoute.distance_m ?? smartRoute.distance ?? 0;
          routeDuration_s = smartRoute.duration_s ?? smartRoute.duration ?? 0;
          routingSource = smartRoute.source || 'smart';

          console.log(`✅ Smart route generated via: ${routingSource}`);
        } else {
          throw new Error('Smart routing unavailable, using fallback');
        }
      } else {
        // Use standard Mapbox Directions API
        const coordinates = waypointsToSnap.map(wp => `${wp.position[0]},${wp.position[1]}`).join(';');
        const profile = cyclingProfiles.includes(routingProfile) ? 'cycling' :
                        routingProfile === 'walking' ? 'walking' : 'driving';

        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?` +
          `geometries=geojson&overview=full&steps=false&access_token=${mapboxToken}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Directions API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.routes?.length) {
          throw new Error('No routes found');
        }

        const route = data.routes[0];
        snappedCoordinates = route.geometry.coordinates;
        routeDistance_m = route.distance || 0;
        routeDuration_s = route.duration || 0;
      }

      // Ensure the route ends exactly at our final waypoint
      const finalWaypoint = waypointsToSnap[waypointsToSnap.length - 1].position;
      const routeEnd = snappedCoordinates[snappedCoordinates.length - 1];
      const endDistance = Math.abs(routeEnd[0] - finalWaypoint[0]) + Math.abs(routeEnd[1] - finalWaypoint[1]);

      if (endDistance > 0.0001) {
        snappedCoordinates = [...snappedCoordinates, finalWaypoint];
      }

      // Set route geometry
      const geometry = {
        type: 'LineString',
        coordinates: snappedCoordinates,
      };
      setRouteGeometry(geometry);

      // Set route stats — converted at the boundary to the canonical
      // unit contract: KM, meters elevation, seconds duration.
      const distance_km = M_TO_KM(routeDistance_m);
      assertKm(distance_km, 'snapToRoads.distance_km');
      const stats = {
        distance_km,
        duration_s: routeDuration_s,
        confidence: 1.0,
        waypointCount: waypointsToSnap.length,
        routingSource,
      };
      setRouteStats(stats);

      // Fetch elevation data — calculateElevationStats returns gain/loss in meters
      const elevation = await getElevationData(snappedCoordinates);
      if (elevation) {
        setElevationProfile(elevation);
        const elevStats = calculateElevationStats(elevation);
        setRouteStats(prev => ({
          ...prev,
          elevation_gain_m: elevStats.gain,
          elevation_loss_m: elevStats.loss,
          elevation_min_m: elevStats.min,
          elevation_max_m: elevStats.max,
        }));
      }

      if (!options.silent) {
        notifications.show({
          title: 'Route calculated',
          message: `${distance_km.toFixed(1)} km route snapped to roads`,
          color: 'green',
        });
      }

      return {
        geometry,
        stats,
        elevation,
      };
    } catch (err) {
      console.error('Route snapping failed:', err);
      if (!options.silent) {
        notifications.show({
          title: 'Route calculation failed',
          message: err.message,
          color: 'red',
        });
      }
      return null;
    }
  }, [waypoints, routingProfile, useSmartRouting, setRouteGeometry, setRouteStats, setElevationProfile]);

  // === Build Freehand Route (straight lines between waypoints) ===
  // The freehand counterpart to snapToRoads: no routing engine, just direct
  // segments between waypoints. Distance is the summed haversine; duration is a
  // nominal estimate (no engine to ask). Elevation is still sampled along the
  // line. Returns the same { geometry, stats, elevation } shape as snapToRoads.
  const buildFreehandRoute = useCallback(async (waypointsToUse = waypoints, options = {}) => {
    if (waypointsToUse.length < 2) {
      if (!options.silent) {
        notifications.show({
          title: 'Cannot build',
          message: 'Need at least 2 waypoints to create a route',
          color: 'yellow',
        });
      }
      return null;
    }

    try {
      const coordinates = waypointsToUse.map(wp => wp.position);

      let routeDistance_m = 0;
      for (let i = 1; i < coordinates.length; i++) {
        const [lng1, lat1] = coordinates[i - 1];
        const [lng2, lat2] = coordinates[i];
        routeDistance_m += haversineMeters(lat1, lng1, lat2, lng2);
      }

      const geometry = { type: 'LineString', coordinates };
      setRouteGeometry(geometry);

      const distance_km = M_TO_KM(routeDistance_m);
      assertKm(distance_km, 'buildFreehandRoute.distance_km');
      // No routing engine to estimate time — assume a nominal 20 km/h.
      const duration_s = distance_km > 0 ? (distance_km / 20) * 3600 : 0;
      const stats = {
        distance_km,
        duration_s,
        confidence: 0.5,
        waypointCount: waypointsToUse.length,
        routingSource: 'freehand',
      };
      setRouteStats(stats);

      const elevation = await getElevationData(coordinates);
      if (elevation) {
        setElevationProfile(elevation);
        const elevStats = calculateElevationStats(elevation);
        setRouteStats(prev => ({
          ...prev,
          elevation_gain_m: elevStats.gain,
          elevation_loss_m: elevStats.loss,
          elevation_min_m: elevStats.min,
          elevation_max_m: elevStats.max,
        }));
      }

      if (!options.silent) {
        notifications.show({
          title: 'Route built',
          message: `${distance_km.toFixed(1)} km freehand route`,
          color: 'green',
        });
      }

      return { geometry, stats, elevation };
    } catch (err) {
      console.error('Freehand route build failed:', err);
      if (!options.silent) {
        notifications.show({
          title: 'Route build failed',
          message: err.message,
          color: 'red',
        });
      }
      return null;
    }
  }, [waypoints, setRouteGeometry, setRouteStats, setElevationProfile]);

  // === Fetch Elevation (standalone) ===
  const fetchElevation = useCallback(async (coordinates) => {
    if (!coordinates || coordinates.length < 2) return null;

    try {
      const elevation = await getElevationData(coordinates);
      if (elevation) {
        setElevationProfile(elevation);
        const stats = calculateElevationStats(elevation);
        setRouteStats(prev => ({ ...prev, ...stats }));
        return elevation;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch elevation:', err);
      return null;
    }
  }, [setElevationProfile, setRouteStats]);

  return {
    // Waypoint operations
    addWaypoint,
    removeWaypoint,
    updateWaypointPosition,
    reverseRoute,
    clearRoute,

    // History operations
    undo,
    redo,
    canUndo,
    canRedo,

    // Route operations
    snapToRoads,
    buildFreehandRoute,
    fetchElevation,
  };
};

export default useRouteManipulation;
