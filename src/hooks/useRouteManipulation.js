import { useCallback, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { getElevationData, calculateElevationStats } from '../utils/elevation';
import { getSmartCyclingRoute } from '../utils/smartCyclingRouter';

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
    historyRef.current.push(JSON.parse(JSON.stringify(waypointState)));
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
  const reverseRoute = useCallback(() => {
    if (waypoints.length < 2) {
      notifications.show({
        title: 'Cannot reverse',
        message: 'Need at least 2 waypoints to reverse route',
        color: 'yellow',
      });
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

    notifications.show({
      title: 'Route reversed',
      message: 'Start and end points swapped',
      color: 'green',
    });

    return reversed;
  }, [waypoints, setWaypoints, routeGeometry, setRouteGeometry, elevationProfile, setElevationProfile, pushToHistory]);

  // === Clear Route ===
  const clearRoute = useCallback(() => {
    setWaypoints([]);
    setRouteGeometry(null);
    setRouteStats(null);
    setElevationProfile([]);
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistoryIndex(-1);
    setHistoryLength(0);

    notifications.show({
      title: 'Route cleared',
      message: 'All waypoints removed',
      color: 'blue',
    });
  }, [setWaypoints, setRouteGeometry, setRouteStats, setElevationProfile]);

  // === Undo ===
  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      setHistoryIndex(historyIndexRef.current);
      const previousState = historyRef.current[historyIndexRef.current];
      setWaypoints(JSON.parse(JSON.stringify(previousState)));

      notifications.show({
        title: 'Undo',
        message: 'Reverted to previous state',
        color: 'blue',
      });

      return previousState;
    } else {
      notifications.show({
        title: 'Cannot undo',
        message: 'No more history to undo',
        color: 'yellow',
      });
      return waypoints;
    }
  }, [waypoints, setWaypoints]);

  // === Redo ===
  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      setHistoryIndex(historyIndexRef.current);
      const nextState = historyRef.current[historyIndexRef.current];
      setWaypoints(JSON.parse(JSON.stringify(nextState)));

      notifications.show({
        title: 'Redo',
        message: 'Restored next state',
        color: 'blue',
      });

      return nextState;
    } else {
      notifications.show({
        title: 'Cannot redo',
        message: 'No more history to redo',
        color: 'yellow',
      });
      return waypoints;
    }
  }, [waypoints, setWaypoints]);

  // === Check if can undo/redo (derived from reactive state) ===
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  // === Snap to Roads ===
  const snapToRoads = useCallback(async (waypointsToSnap = waypoints) => {
    if (waypointsToSnap.length < 2) {
      notifications.show({
        title: 'Cannot snap',
        message: 'Need at least 2 waypoints to create a route',
        color: 'yellow',
      });
      return null;
    }

    try {
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!mapboxToken) {
        throw new Error('Mapbox token not configured');
      }

      const waypointCoordinates = waypointsToSnap.map(wp => wp.position);
      let snappedCoordinates;
      let routeDistance = 0;
      let routeDuration = 0;
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
          routeDistance = smartRoute.distance || 0;
          routeDuration = smartRoute.duration || 0;
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
        routeDistance = route.distance || 0;
        routeDuration = route.duration || 0;
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

      // Set route stats
      const stats = {
        distance: routeDistance,
        duration: routeDuration,
        confidence: 1.0,
        waypointCount: waypointsToSnap.length,
        routingSource,
      };
      setRouteStats(stats);

      // Fetch elevation data
      const elevation = await getElevationData(snappedCoordinates);
      if (elevation) {
        setElevationProfile(elevation);
        const elevStats = calculateElevationStats(elevation);
        setRouteStats(prev => ({ ...prev, ...elevStats }));
      }

      notifications.show({
        title: 'Route calculated',
        message: `${(routeDistance / 1000).toFixed(1)} km route snapped to roads`,
        color: 'green',
      });

      return {
        geometry,
        stats,
        elevation,
      };
    } catch (err) {
      console.error('Route snapping failed:', err);
      notifications.show({
        title: 'Route calculation failed',
        message: err.message,
        color: 'red',
      });
      return null;
    }
  }, [waypoints, routingProfile, useSmartRouting, setRouteGeometry, setRouteStats, setElevationProfile]);

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
    fetchElevation,
  };
};

export default useRouteManipulation;
