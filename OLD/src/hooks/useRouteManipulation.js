import { useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { polylineDistance } from '../utils/geo';
import { getElevationData, calculateElevationMetrics } from '../utils/elevation';
import { getSmartCyclingRoute } from '../utils/smartCyclingRouter';


/**
 * Custom hook for route manipulation functions
 * Extracted from ProfessionalRouteBuilder for better code organization
 * Handles waypoint management, route snapping, elevation, and history
 */
export const useRouteManipulation = ({
  waypoints,
  setWaypoints,
  history,
  setHistory,
  historyIndex,
  setHistoryIndex,
  selectedWaypoint,
  setSelectedWaypoint,
  snappedRoute,
  setSnappedRoute,
  elevationProfile,
  setElevationProfile,
  elevationStats,
  setElevationStats,
  routingProfile,
  snapping,
  setSnapping,
  snapProgress,
  setSnapProgress,
  error,
  setError,
  useImperial,
  userPreferences = null, // NEW: User preferences for traffic avoidance
  useSmartRouting = false, // NEW: Toggle for smart routing
}) => {

  // === Add Waypoint ===
  const addWaypoint = useCallback((lngLat) => {
    const newWaypoint = {
      id: `wp_${Date.now()}`,
      position: [lngLat.lng, lngLat.lat],
      type: waypoints.length === 0 ? 'start' : 'end',
      name: waypoints.length === 0 ? 'Start' : `Waypoint ${waypoints.length}`,
    };
    
    const updatedWaypoints = [...waypoints];
    if (updatedWaypoints.length > 0) {
      updatedWaypoints[updatedWaypoints.length - 1].type = 'waypoint';
    }
    updatedWaypoints.push(newWaypoint);
    
    setWaypoints(updatedWaypoints);
    setHistory([...history.slice(0, historyIndex + 1), waypoints]);
    setHistoryIndex(historyIndex + 1);
  }, [waypoints, history, historyIndex, setWaypoints, setHistory, setHistoryIndex]);

  // === Fetch Elevation Profile ===
  const fetchElevation = useCallback(async (coordinates) => {
    try {
      if (!coordinates || coordinates.length < 2) return;
      
      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
      
      // Use the new elevation data fetching with real terrain data
      const elevationData = await getElevationData(coordinates, mapboxToken);
      
      // Calculate cumulative distance for each point
      let cumulativeDistance = 0;
      const elevationProfile = elevationData.map((point, index) => {
        if (index > 0) {
          const [prevLon, prevLat] = coordinates[index - 1];
          const [currLon, currLat] = coordinates[index];
          const segmentDistance = polylineDistance([[prevLon, prevLat], [currLon, currLat]]) * 1000; // Convert to meters
          cumulativeDistance += segmentDistance;
        }
        
        // Convert distance to current units for chart display (meters to miles/km)
        const convertedDistance = useImperial ? cumulativeDistance * 0.000621371 : cumulativeDistance / 1000;
        
        return {
          coordinate: [point.lon, point.lat],
          elevation: point.elevation, // Use absolute elevation in meters for calculations
          distance: convertedDistance, // Converted for display
          absoluteElevation: point.elevation // Keep absolute elevation in meters
        };
      });
      
      setElevationProfile(elevationProfile);
      
      // Calculate elevation stats using new metrics function
      const stats = calculateElevationMetrics(elevationProfile, useImperial);
      setElevationStats(stats);
      
    } catch (err) {
      console.error('Failed to fetch elevation:', err);
    }
  }, [useImperial, setElevationProfile, setElevationStats]);

  // === Snap to Roads using Smart Cycling Router or Mapbox Directions API ===
  const snapToRoads = useCallback(async () => {
    if (waypoints.length < 2) {
      toast.error('Need at least 2 waypoints');
      return;
    }

    setSnapping(true);
    setSnapProgress(0);
    setError(null);

    try {
      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
      if (!mapboxToken) {
        throw new Error('Mapbox token not configured');
      }

      const waypointCoordinates = waypoints.map(wp => wp.position);
      let snappedCoordinates;
      let routeDistance = 0;
      let routeDuration = 0;

      // NEW: Use smart cycling routing when enabled and profile is a cycling type
      const cyclingProfiles = ['road', 'gravel', 'mountain', 'commuting'];
      if (useSmartRouting && cyclingProfiles.includes(routingProfile)) {
        const isGravel = routingProfile === 'gravel';
        const isMountain = routingProfile === 'mountain';
        console.log(`🧠 Using smart ${routingProfile} routing`);
        console.log('📋 User preferences:', userPreferences);

        setSnapProgress(0.2);

        const smartRoute = await getSmartCyclingRoute(waypointCoordinates, {
          profile: isGravel ? 'gravel' : isMountain ? 'mountain' : 'bike',
          preferences: (isGravel || isMountain) ? null : userPreferences, // Gravel/Mountain have their own logic
          trainingGoal: routingProfile === 'commuting' ? 'recovery' : 'endurance',
          mapboxToken: mapboxToken
        });

        if (smartRoute && smartRoute.coordinates && smartRoute.coordinates.length > 0) {
          snappedCoordinates = smartRoute.coordinates;
          routeDistance = smartRoute.distance || 0;
          routeDuration = smartRoute.duration || 0;

          console.log(`✅ Smart route generated via: ${smartRoute.source}`);

          // Check for warnings (e.g., rural areas without bike lanes)
          if (smartRoute.warnings && smartRoute.warnings.length > 0) {
            console.warn('⚠️ Route warnings:', smartRoute.warnings);
            toast.warning(smartRoute.warnings.join(' • '), {
              duration: 8000,
              style: {
                maxWidth: '500px'
              }
            });
          } else {
            toast.success(`Route optimized using ${smartRoute.source === 'graphhopper' ? 'cycling-aware' : 'standard'} routing`);
          }

          setSnapProgress(0.6);
        } else {
          console.warn('Smart routing failed, falling back to basic Mapbox');
          throw new Error('Smart routing unavailable, using fallback');
        }
      } else {
        // Use standard Mapbox Directions API
        const coordinates = waypoints.map(wp => `${wp.position[0]},${wp.position[1]}`).join(';');
        const cyclingTypes = ['road', 'gravel', 'mountain', 'commuting'];
        const profile = cyclingTypes.includes(routingProfile) ? 'cycling' :
                        routingProfile === 'walking' ? 'walking' : 'driving';

        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?` +
          `geometries=geojson&` +
          `overview=full&` +
          `steps=false&` +
          `annotations=distance,duration&` +
          `access_token=${mapboxToken}`;

        setSnapProgress(0.3);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Directions API error: ${response.status}`);
        }

        const data = await response.json();
        setSnapProgress(0.6);

        if (!data.routes || !data.routes.length) {
          throw new Error('No routes found');
        }

        const route = data.routes[0];
        snappedCoordinates = route.geometry.coordinates;
        routeDistance = route.distance || 0;
        routeDuration = route.duration || 0;
      }
      
      // Ensure the route ends exactly at our final waypoint
      const finalWaypoint = waypoints[waypoints.length - 1].position;
      const routeEnd = snappedCoordinates[snappedCoordinates.length - 1];

      // If the route doesn't end close enough to our final waypoint, add it
      const endDistance = Math.abs(routeEnd[0] - finalWaypoint[0]) + Math.abs(routeEnd[1] - finalWaypoint[1]);
      if (endDistance > 0.0001) { // ~11 meters
        console.log('Adding final waypoint to ensure complete route coverage');
        snappedCoordinates = [...snappedCoordinates, finalWaypoint];
      }

      setSnappedRoute({
        coordinates: snappedCoordinates,
        distance: routeDistance,
        duration: routeDuration,
        confidence: 1.0,
        waypointCount: waypoints.length, // Track how many waypoints were snapped
      });
      
      setSnapProgress(0.8);
      
      // Fetch elevation data
      await fetchElevation(snappedCoordinates);
      
      setSnapProgress(1.0);
      toast.success('Route snapped to roads successfully!');
      
    } catch (err) {
      console.error('Route snapping failed:', err);
      toast.error(`Failed to snap route: ${err.message}`);
      setError(err.message);
    } finally {
      setSnapping(false);
      setSnapProgress(0);
    }
  }, [waypoints, routingProfile, setSnapping, setSnapProgress, setError, setSnappedRoute, fetchElevation, useSmartRouting, userPreferences]);

  // === Clear Route ===
  const clearRoute = useCallback(() => {
    setWaypoints([]);
    setSnappedRoute(null);
    setElevationProfile([]);
    setElevationStats(null);
    setError(null);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedWaypoint(null);
  }, [setWaypoints, setSnappedRoute, setElevationProfile, setElevationStats, setError, setHistory, setHistoryIndex, setSelectedWaypoint]);

  // === Undo/Redo ===
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setWaypoints(history[historyIndex - 1]);
    }
  }, [historyIndex, history, setHistoryIndex, setWaypoints]);
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setWaypoints(history[historyIndex + 1]);
    }
  }, [historyIndex, history, setHistoryIndex, setWaypoints]);

  // === Reverse Route ===
  const reverseRoute = useCallback(() => {
    const reversed = [...waypoints].reverse();
    if (reversed.length > 0) {
      reversed[0].type = 'start';
      reversed[reversed.length - 1].type = 'end';
      reversed.slice(1, -1).forEach(wp => wp.type = 'waypoint');
    }
    setWaypoints(reversed);
    toast.success('Route reversed');
  }, [waypoints, setWaypoints]);

  // === Remove Waypoint ===
  const removeWaypoint = useCallback((waypointId) => {
    const filtered = waypoints.filter(wp => wp.id !== waypointId);
    if (filtered.length > 0) {
      filtered[0].type = 'start';
      if (filtered.length > 1) {
        filtered[filtered.length - 1].type = 'end';
        filtered.slice(1, -1).forEach(wp => wp.type = 'waypoint');
      }
    }
    setWaypoints(filtered);
    setSelectedWaypoint(null);
  }, [waypoints, setWaypoints, setSelectedWaypoint]);

  return {
    addWaypoint,
    snapToRoads,
    fetchElevation,
    clearRoute,
    undo,
    redo,
    reverseRoute,
    removeWaypoint,
  };
};