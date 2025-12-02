import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { pointsToGPX, parseGPX } from '../utils/gpx';
import { toast } from 'react-hot-toast';

/**
 * Custom hook for route operations (save, export, import, share)
 * Extracted from ProfessionalRouteBuilder for better code organization
 */
export const useRouteOperations = ({
  waypoints,
  snappedRoute,
  routeName,
  routeDescription,
  routingProfile,
  autoRoute,
  routeStats,
  elevationProfile,
  elevationStats,
  setWaypoints,
  setRouteName,
  setRouteDescription,
  setSaving,
  setError,
  setSnappedRoute,
  onSaved,
  snapToRoads
}) => {
  const { user } = useAuth();

  // === Export GPX ===
  const exportGPX = useCallback(() => {
    const coords = snappedRoute?.coordinates || waypoints.map(w => w.position);
    if (coords.length < 2) {
      toast.error('Need at least 2 points to export');
      return;
    }
    
    const gpxData = pointsToGPX(coords, routeName || 'My Route', {
      description: routeDescription,
      elevationProfile,
    });
    
    const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${routeName || 'route'}_${new Date().toISOString().split('T')[0]}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('GPX file exported');
  }, [snappedRoute, waypoints, routeName, routeDescription, elevationProfile]);
  
  // === Import GPX ===
  const importGPX = useCallback(async (file) => {
    try {
      const text = await file.text();
      const { waypoints: importedWaypoints, name, description } = parseGPX(text);
      
      if (importedWaypoints.length < 2) {
        throw new Error('GPX file must contain at least 2 points');
      }
      
      // Convert to our waypoint format
      const newWaypoints = importedWaypoints.map((coord, index) => ({
        id: `wp_${Date.now()}_${index}`,
        position: coord,
        type: index === 0 ? 'start' : index === importedWaypoints.length - 1 ? 'end' : 'waypoint',
        name: index === 0 ? 'Start' : `Waypoint ${index}`,
      }));
      
      setWaypoints(newWaypoints);
      setRouteName(name || 'Imported Route');
      setRouteDescription(description || '');
      
      // Trigger auto-routing if enabled
      if (autoRoute && snapToRoads) {
        setTimeout(() => snapToRoads(), 500);
      }
      
      toast.success(`Imported ${importedWaypoints.length} points from GPX`);
      
    } catch (err) {
      console.error('GPX import failed:', err);
      toast.error(`Failed to import GPX: ${err.message}`);
    }
  }, [autoRoute, snapToRoads, setWaypoints, setRouteName, setRouteDescription]);
  
  // === Save Route ===
  const saveRoute = useCallback(async () => {
    if (!routeName.trim()) {
      toast.error('Please enter a route name');
      return;
    }
    
    if (waypoints.length < 2) {
      toast.error('Route must have at least 2 points');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const coords = snappedRoute?.coordinates || waypoints.map(w => w.position);
      const distanceKm = routeStats.distance / 1000; // Convert meters to km for database
      
      const track_points = coords.map((coord, index) => ({
        order_index: index,
        longitude: coord[0],
        latitude: coord[1],
        elevation: elevationProfile[index]?.elevation || null,
        cumulative_distance: elevationProfile[index]?.distance || 0,
      }));

      const metadata = {
        name: routeName,
        description: routeDescription,
        created_at: new Date().toISOString(),
        routing_profile: routingProfile,
        auto_routed: autoRoute,
        confidence: routeStats.confidence,
        duration: routeStats.duration,
      };

      const summary = {
        distance: distanceKm,
        snapped: !!snappedRoute,
        elevation_gain: elevationStats?.gain || 0,
        elevation_loss: elevationStats?.loss || 0,
        elevation_min: elevationStats?.min || null,
        elevation_max: elevationStats?.max || null,
      };
      
      const routeData = {
        user_id: user.id,
        metadata,
        track_points,
        summary,
        name: routeName,
        description: routeDescription || null,
        created_at: new Date().toISOString(),
        distance: distanceKm,
        elevation_gain: elevationStats?.gain || 0,
        elevation_loss: elevationStats?.loss || 0,
      };

      console.log('Saving route with data:', routeData);

      const { data, error: routeError } = await supabase
        .from('routes')
        .insert([routeData])
        .select()
        .single();

      if (routeError) throw routeError;

      console.log('Route saved successfully:', data);
      toast.success('Route saved successfully!');
      
      if (onSaved) {
        onSaved(data);
      }

    } catch (err) {
      console.error('Save failed:', err);
      setError(`Failed to save route: ${err.message}`);
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [
    routeName, waypoints, snappedRoute, routeStats, elevationProfile, elevationStats,
    routeDescription, routingProfile, autoRoute, user, setSaving, setError, onSaved
  ]);
  
  // === Share Route ===
  const shareRoute = useCallback(() => {
    const shareUrl = `${window.location.origin}/route/${Date.now()}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied to clipboard!');
  }, []);

  return {
    exportGPX,
    importGPX,
    saveRoute,
    shareRoute,
  };
};