import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext.jsx';
import { saveRoute as saveRouteToDb } from '../utils/routesService';
import { exportRoute, downloadRoute } from '../utils/routeExport';
import { parseGpxFile } from '../utils/gpxParser';

/**
 * Custom hook for route operations (save, export, import, share)
 * Shared between AI Route Builder and Manual Route Builder
 */
export const useRouteOperations = ({
  waypoints,
  routeGeometry,
  routeName,
  setRouteName,
  routeDescription = '',
  setRouteDescription,
  routeStats,
  elevationProfile,
  routingProfile = 'road',
  setWaypoints,
  setRouteGeometry,
  setRouteStats,
  setElevationProfile,
  onSaved,
  onImported,
  snapToRoads, // Optional function to snap after import
}) => {
  const { user } = useAuth();

  // === Export GPX ===
  const exportGPX = useCallback(() => {
    const coords = routeGeometry?.coordinates || waypoints.map(w => w.position);
    if (coords.length < 2) {
      notifications.show({
        title: 'Cannot export',
        message: 'Need at least 2 points to export',
        color: 'yellow',
      });
      return;
    }

    // Merge elevation data into coordinates if available
    let coordsWithElevation = coords;
    if (elevationProfile?.length === coords.length) {
      coordsWithElevation = coords.map((coord, i) => [
        coord[0],
        coord[1],
        elevationProfile[i]?.elevation || 0,
      ]);
    }

    // Build waypoints for export
    const exportWaypoints = waypoints.map(wp => ({
      lat: wp.position[1],
      lng: wp.position[0],
      name: wp.name,
      type: wp.type,
    }));

    const routeData = {
      name: routeName || 'My Route',
      description: routeDescription,
      coordinates: coordsWithElevation,
      waypoints: exportWaypoints,
      distanceKm: routeStats?.distance ? routeStats.distance / 1000 : 0,
      elevationGainM: routeStats?.gain || 0,
      elevationLossM: routeStats?.loss || 0,
    };

    try {
      const result = exportRoute(routeData, {
        format: 'gpx',
        includeWaypoints: true,
        includeElevation: true,
        author: 'Tribos Studio',
      });
      downloadRoute(result);

      notifications.show({
        title: 'GPX exported',
        message: `${routeName || 'Route'} downloaded successfully`,
        color: 'green',
      });
    } catch (err) {
      console.error('GPX export failed:', err);
      notifications.show({
        title: 'Export failed',
        message: err.message,
        color: 'red',
      });
    }
  }, [routeGeometry, waypoints, routeName, routeDescription, routeStats, elevationProfile]);

  // === Export TCX (Garmin format) ===
  const exportTCX = useCallback(() => {
    const coords = routeGeometry?.coordinates || waypoints.map(w => w.position);
    if (coords.length < 2) {
      notifications.show({
        title: 'Cannot export',
        message: 'Need at least 2 points to export',
        color: 'yellow',
      });
      return;
    }

    // Merge elevation data
    let coordsWithElevation = coords;
    if (elevationProfile?.length === coords.length) {
      coordsWithElevation = coords.map((coord, i) => [
        coord[0],
        coord[1],
        elevationProfile[i]?.elevation || 0,
      ]);
    }

    const exportWaypoints = waypoints.map(wp => ({
      lat: wp.position[1],
      lng: wp.position[0],
      name: wp.name,
      type: wp.type,
    }));

    const routeData = {
      name: routeName || 'My Route',
      description: routeDescription,
      coordinates: coordsWithElevation,
      waypoints: exportWaypoints,
      distanceKm: routeStats?.distance ? routeStats.distance / 1000 : 0,
      elevationGainM: routeStats?.gain || 0,
    };

    try {
      const result = exportRoute(routeData, {
        format: 'tcx',
        includeWaypoints: true,
        includeElevation: true,
        author: 'Tribos Studio',
      });
      downloadRoute(result);

      notifications.show({
        title: 'TCX exported',
        message: `${routeName || 'Route'} downloaded for Garmin`,
        color: 'green',
      });
    } catch (err) {
      console.error('TCX export failed:', err);
      notifications.show({
        title: 'Export failed',
        message: err.message,
        color: 'red',
      });
    }
  }, [routeGeometry, waypoints, routeName, routeDescription, routeStats, elevationProfile]);

  // === Import GPX ===
  const importGPX = useCallback(async (file) => {
    try {
      const text = await file.text();
      const gpxData = await parseGpxFile(text, file.name);

      if (!gpxData.trackPoints || gpxData.trackPoints.length < 2) {
        throw new Error('GPX file must contain at least 2 points');
      }

      // Convert track points to our waypoint format
      // For routes, we create waypoints at start, end, and periodically along the route
      const trackPoints = gpxData.trackPoints;
      const totalPoints = trackPoints.length;

      // Create waypoints: start, some intermediate points (for long routes), and end
      const waypointIndices = [0]; // Always include start

      // For longer routes, add intermediate waypoints every ~5km or so
      if (totalPoints > 100) {
        const step = Math.floor(totalPoints / 5);
        for (let i = step; i < totalPoints - step; i += step) {
          waypointIndices.push(i);
        }
      }

      waypointIndices.push(totalPoints - 1); // Always include end

      const newWaypoints = waypointIndices.map((index, i) => {
        const point = trackPoints[index];
        return {
          id: `wp_${Date.now()}_${i}`,
          position: [point.longitude, point.latitude],
          type: i === 0 ? 'start' : i === waypointIndices.length - 1 ? 'end' : 'waypoint',
          name: i === 0 ? 'Start' : i === waypointIndices.length - 1 ? 'End' : `Waypoint ${i}`,
        };
      });

      // Also create the full route geometry from all track points
      const routeCoordinates = trackPoints.map(p => [p.longitude, p.latitude]);

      // Build elevation profile if available
      let elevation = null;
      if (trackPoints[0].elevation != null) {
        let cumulativeDistance = 0;
        elevation = trackPoints.map((point, i) => {
          if (i > 0) {
            cumulativeDistance = point.distance || cumulativeDistance;
          }
          return {
            distance: cumulativeDistance / 1000, // Convert to km
            elevation: point.elevation,
            lat: point.latitude,
            lon: point.longitude,
          };
        });
      }

      // Update state
      setWaypoints(newWaypoints);

      if (setRouteGeometry) {
        setRouteGeometry({
          type: 'LineString',
          coordinates: routeCoordinates,
        });
      }

      if (setRouteName && gpxData.metadata?.name) {
        setRouteName(gpxData.metadata.name);
      }

      if (setRouteStats && gpxData.summary) {
        setRouteStats({
          distance: (gpxData.summary.totalDistance || 0) * 1000, // Convert km to meters
          duration: gpxData.summary.totalMovingTime || 0,
          gain: gpxData.summary.totalAscent || 0,
          loss: gpxData.summary.totalDescent || 0,
          routingSource: 'gpx_import',
        });
      }

      if (setElevationProfile && elevation) {
        setElevationProfile(elevation);
      }

      notifications.show({
        title: 'GPX imported',
        message: `Imported ${gpxData.metadata?.name || 'route'} with ${trackPoints.length} points`,
        color: 'green',
      });

      if (onImported) {
        onImported({
          waypoints: newWaypoints,
          coordinates: routeCoordinates,
          elevation,
          metadata: gpxData.metadata,
          summary: gpxData.summary,
        });
      }

      return {
        waypoints: newWaypoints,
        coordinates: routeCoordinates,
        elevation,
      };
    } catch (err) {
      console.error('GPX import failed:', err);
      notifications.show({
        title: 'Import failed',
        message: err.message,
        color: 'red',
      });
      return null;
    }
  }, [setWaypoints, setRouteGeometry, setRouteName, setRouteStats, setElevationProfile, onImported]);

  // === Save Route to Database ===
  const saveRoute = useCallback(async () => {
    if (!user) {
      notifications.show({
        title: 'Not logged in',
        message: 'Please log in to save routes',
        color: 'yellow',
      });
      return null;
    }

    if (!routeName?.trim()) {
      notifications.show({
        title: 'Name required',
        message: 'Please enter a route name',
        color: 'yellow',
      });
      return null;
    }

    const coords = routeGeometry?.coordinates || waypoints.map(w => w.position);
    if (coords.length < 2) {
      notifications.show({
        title: 'Cannot save',
        message: 'Route must have at least 2 points',
        color: 'yellow',
      });
      return null;
    }

    try {
      // Build track points for database
      const track_points = coords.map((coord, index) => ({
        order_index: index,
        longitude: coord[0],
        latitude: coord[1],
        elevation: elevationProfile?.[index]?.elevation || null,
        cumulative_distance: elevationProfile?.[index]?.distance || 0,
      }));

      const distanceKm = routeStats?.distance ? routeStats.distance / 1000 : 0;

      const routeData = {
        user_id: user.id,
        name: routeName,
        description: routeDescription || null,
        metadata: {
          name: routeName,
          description: routeDescription,
          created_at: new Date().toISOString(),
          routing_profile: routingProfile,
          confidence: routeStats?.confidence || 1.0,
          duration: routeStats?.duration || 0,
          builder_type: 'manual', // Indicate this was built with manual builder
        },
        track_points,
        summary: {
          distance: distanceKm,
          snapped: !!routeGeometry,
          elevation_gain: routeStats?.gain || 0,
          elevation_loss: routeStats?.loss || 0,
          elevation_min: routeStats?.min || null,
          elevation_max: routeStats?.max || null,
        },
        distance: distanceKm,
        elevation_gain: routeStats?.gain || 0,
        elevation_loss: routeStats?.loss || 0,
      };

      const savedRoute = await saveRouteToDb(routeData);

      notifications.show({
        title: 'Route saved',
        message: `${routeName} saved successfully`,
        color: 'green',
      });

      if (onSaved) {
        onSaved(savedRoute);
      }

      return savedRoute;
    } catch (err) {
      console.error('Save failed:', err);
      notifications.show({
        title: 'Save failed',
        message: err.message,
        color: 'red',
      });
      return null;
    }
  }, [user, routeName, routeDescription, routeGeometry, waypoints, routeStats, elevationProfile, routingProfile, onSaved]);

  // === Share Route (copy link) ===
  const shareRoute = useCallback(async (routeId) => {
    const shareUrl = routeId
      ? `${window.location.origin}/routes/${routeId}`
      : `${window.location.origin}/routes/new`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      notifications.show({
        title: 'Link copied',
        message: 'Share link copied to clipboard',
        color: 'green',
      });
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      notifications.show({
        title: 'Link copied',
        message: 'Share link copied to clipboard',
        color: 'green',
      });
    }
  }, []);

  // === Create file input and trigger GPX import ===
  const triggerGPXImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await importGPX(file);
      }
    };
    input.click();
  }, [importGPX]);

  return {
    // Export operations
    exportGPX,
    exportTCX,

    // Import operations
    importGPX,
    triggerGPXImport,

    // Save & share
    saveRoute,
    shareRoute,
  };
};

export default useRouteOperations;
