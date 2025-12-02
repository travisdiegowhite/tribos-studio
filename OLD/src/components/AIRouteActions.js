import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Group,
  Stack,
  TextInput,
  Textarea,
  Text,
  Divider,
  Alert,
  Modal,
  LoadingOverlay,
  Menu,
  Tooltip,
} from '@mantine/core';
import {
  Save,
  Download,
  Share2,
  AlertCircle,
  CheckCircle,
  Send,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { pointsToGPX } from '../utils/gpx';
import { useUnits } from '../utils/units';
import garminService from '../utils/garminService';
import wahooService from '../utils/wahooService';
import toast from 'react-hot-toast';

const AIRouteActions = ({ route, onSaved }) => {
  const { user } = useAuth();
  const { formatDistance } = useUnits();
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [routeName, setRouteName] = useState(route?.name || '');
  const [routeDescription, setRouteDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Bike computer connection states
  const [garminConnected, setGarminConnected] = useState(false);
  const [wahooConnected, setWahooConnected] = useState(false);
  const [sendingToDevice, setSendingToDevice] = useState(null); // 'garmin' | 'wahoo' | null
  const [savedRouteId, setSavedRouteId] = useState(null);

  // Check if route has valid data for saving/exporting
  const hasValidRoute = route && route.coordinates && route.coordinates.length >= 2;

  // Check bike computer connections on mount
  useEffect(() => {
    const checkConnections = async () => {
      try {
        const [garmin, wahoo] = await Promise.all([
          garminService.isConnected(),
          wahooService.isConnected()
        ]);
        setGarminConnected(garmin);
        setWahooConnected(wahoo);
      } catch (err) {
        console.log('Could not check bike computer connections:', err);
      }
    };
    if (user) {
      checkConnections();
    }
  }, [user]);

  // Export GPX
  const exportGPX = () => {
    if (!hasValidRoute) {
      toast.error('No valid route to export');
      return;
    }

    try {
      const gpxData = pointsToGPX(route.coordinates, {
        name: route.name || routeName || 'AI Generated Route',
        creator: 'Cycling AI App'
      });

      const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(route.name || routeName || 'ai_route').replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.gpx`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('GPX file downloaded successfully!');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export GPX file');
    }
  };

  // Save route to database
  const saveRoute = async () => {
    if (!routeName.trim()) {
      toast.error('Please enter a route name');
      return;
    }

    if (!hasValidRoute) {
      toast.error('No valid route to save');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Calculate basic stats
      const distanceKm = route.distance || calculateDistance(route.coordinates);
      const elevationGain = route.elevation_gain || 0;

      // Prepare track points for the routes table format
      const track_points = route.coordinates.map((coord, index) => ({
        point_index: index,
        longitude: coord[0],
        latitude: coord[1],
        elevation: route.elevationProfile?.[index]?.elevation || null,
        time_seconds: index, // Simple placeholder - could calculate based on distance/speed
        distance_m: index > 0 ? calculateDistance(route.coordinates.slice(0, index + 1)) * 1000 : 0,
      }));

      const routeData = {
        user_id: user.id,
        name: routeName.trim(),
        description: routeDescription.trim() || null,
        distance_km: distanceKm,
        elevation_gain_m: elevationGain,
        activity_type: 'ride',
        imported_from: 'manual', // AI-generated routes are considered manual creations
        route_type: route.routeType || 'loop',
        difficulty_rating: route.difficulty === 'easy' ? 2 : route.difficulty === 'hard' ? 4 : 3,
        // Do NOT set recorded_at - this is a planned route, not a completed ride
        has_gps_data: true,
        track_points_count: track_points.length,
        // Store AI metadata in analysis_results field (JSONB)
        analysis_results: {
          ai_generated: true,
          ai_prompt: route.prompt || '',
          ai_reasoning: route.reasoning || '',
          generated_at: new Date().toISOString(),
          surface_type: route.surfaceType,
          routing_provider: route.routingProvider,
        },
        // Set bounding box if available
        start_latitude: route.coordinates[0]?.[1],
        start_longitude: route.coordinates[0]?.[0],
        end_latitude: route.coordinates[route.coordinates.length - 1]?.[1],
        end_longitude: route.coordinates[route.coordinates.length - 1]?.[0],
      };

      console.log('Saving AI-generated route:', routeData);

      const { data, error: saveError } = await supabase
        .from('routes')
        .insert([routeData])
        .select()
        .single();

      if (saveError) throw saveError;

      // Save track points separately
      if (data?.id) {
        const trackPointsWithRouteId = track_points.map(point => ({
          ...point,
          route_id: data.id,
        }));

        const { error: trackPointsError } = await supabase
          .from('track_points')
          .insert(trackPointsWithRouteId);

        if (trackPointsError) {
          console.warn('Failed to save track points:', trackPointsError);
          // Don't throw - route is saved, just missing detailed track data
        }
      }

      console.log('Route saved successfully:', data);
      toast.success('Route saved successfully!');
      setSaveModalOpen(false);
      setSavedRouteId(data.id); // Track saved route ID for device sync

      // Defer callback to avoid React error #185
      if (onSaved) {
        setTimeout(() => onSaved(data), 0);
      }

    } catch (err) {
      console.error('Save failed:', err);
      setError(`Failed to save route: ${err.message}`);
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Share route
  const shareRoute = () => {
    if (!hasValidRoute) {
      toast.error('No route to share');
      return;
    }

    // Create a shareable description
    const shareText = `Check out this AI-generated cycling route: ${route.name || 'Unnamed Route'}\n\nDistance: ${route.distance ? formatDistance(route.distance, 1) : 'Unknown'}\n\nGenerated by Cycling AI`;

    if (navigator.share) {
      navigator.share({
        title: route.name || 'AI Generated Cycling Route',
        text: shareText,
        url: window.location.href,
      }).catch(err => console.log('Share failed:', err));
    } else {
      navigator.clipboard.writeText(`${shareText}\n\n${window.location.href}`);
      toast.success('Route details copied to clipboard!');
    }
  };

  // Send route to Garmin
  const sendToGarmin = async () => {
    if (!savedRouteId) {
      toast.error('Please save the route first before sending to Garmin');
      return;
    }

    if (!garminConnected) {
      toast.error('Garmin is not connected. Go to Settings to connect your account.');
      return;
    }

    setSendingToDevice('garmin');
    try {
      const result = await garminService.sendCourse(savedRouteId, 'json');
      toast.success(`Route sent to Garmin! Course ID: ${result.courseId}`);
      console.log('Garmin sync result:', result);
    } catch (err) {
      console.error('Failed to send to Garmin:', err);
      toast.error(`Failed to send to Garmin: ${err.message}`);
    } finally {
      setSendingToDevice(null);
    }
  };

  // Send route to Wahoo
  const sendToWahoo = async () => {
    if (!savedRouteId) {
      toast.error('Please save the route first before sending to Wahoo');
      return;
    }

    if (!wahooConnected) {
      toast.error('Wahoo is not connected. Go to Settings to connect your account.');
      return;
    }

    setSendingToDevice('wahoo');
    try {
      const result = await wahooService.sendRoute(savedRouteId);
      toast.success(`Route sent to Wahoo!`);
      console.log('Wahoo sync result:', result);
    } catch (err) {
      console.error('Failed to send to Wahoo:', err);
      toast.error(`Failed to send to Wahoo: ${err.message}`);
    } finally {
      setSendingToDevice(null);
    }
  };

  // Basic distance calculation for routes without distance
  const calculateDistance = (coordinates) => {
    if (!coordinates || coordinates.length < 2) return 0;

    let distance = 0;
    for (let i = 1; i < coordinates.length; i++) {
      distance += haversineDistance(
        coordinates[i-1][1], coordinates[i-1][0],
        coordinates[i][1], coordinates[i][0]
      );
    }
    return distance / 1000; // Convert to km
  };

  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  if (!hasValidRoute) {
    return (
      <Card p="md" mt="md">
        <Alert icon={<AlertCircle size={16} />} color="gray" variant="light">
          <Text size="sm">Generate a route to enable save and export options</Text>
        </Alert>
      </Card>
    );
  }

  return (
    <>
      <Card p="md" mt="md">
        <Stack spacing="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">Route Actions</Text>
            <CheckCircle size={16} color="green" />
          </Group>

          <Divider />

          <Stack spacing="xs">
            <Button
              leftSection={<Save size={16} />}
              variant="filled"
              onClick={() => setSaveModalOpen(true)}
              fullWidth
            >
              Save Route
            </Button>

            <Button
              leftSection={<Download size={16} />}
              variant="outline"
              onClick={exportGPX}
              fullWidth
            >
              Export GPX
            </Button>

            <Button
              leftSection={<Share2 size={16} />}
              variant="light"
              onClick={shareRoute}
              fullWidth
            >
              Share Route
            </Button>

            {/* Send to Bike Computer */}
            {(garminConnected || wahooConnected) && (
              <>
                <Divider my="xs" label="Send to Device" labelPosition="center" />
                {garminConnected && (
                  <Tooltip
                    label={savedRouteId ? "Send to your Garmin device" : "Save route first to send to Garmin"}
                    position="left"
                  >
                    <Button
                      leftSection={<Send size={16} />}
                      variant="outline"
                      color="orange"
                      onClick={sendToGarmin}
                      loading={sendingToDevice === 'garmin'}
                      disabled={!savedRouteId || sendingToDevice !== null}
                      fullWidth
                    >
                      Send to Garmin
                    </Button>
                  </Tooltip>
                )}
                {wahooConnected && (
                  <Tooltip
                    label={savedRouteId ? "Send to your Wahoo device" : "Save route first to send to Wahoo"}
                    position="left"
                  >
                    <Button
                      leftSection={<Send size={16} />}
                      variant="outline"
                      color="blue"
                      onClick={sendToWahoo}
                      loading={sendingToDevice === 'wahoo'}
                      disabled={!savedRouteId || sendingToDevice !== null}
                      fullWidth
                    >
                      Send to Wahoo
                    </Button>
                  </Tooltip>
                )}
              </>
            )}
          </Stack>

          {route.distance && (
            <Text size="xs" c="dimmed" ta="center">
              {formatDistance(route.distance, 1)} • {route.routeType || 'Generated Route'}
            </Text>
          )}
        </Stack>
      </Card>

      {/* Save Modal */}
      <Modal
        opened={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Save AI Generated Route"
        size="md"
      >
        <LoadingOverlay visible={saving} />

        <Stack spacing="md">
          <TextInput
            label="Route Name"
            placeholder="Enter a name for your route"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            required
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Add notes about this route..."
            value={routeDescription}
            onChange={(e) => setRouteDescription(e.target.value)}
            minRows={3}
          />

          {route.prompt && (
            <Alert color="blue" variant="light">
              <Text size="sm" fw={500}>AI Prompt:</Text>
              <Text size="sm">{route.prompt}</Text>
            </Alert>
          )}

          {error && (
            <Alert icon={<AlertCircle size={16} />} color="red">
              {error}
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={() => setSaveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveRoute}
              loading={saving}
              leftSection={<Save size={16} />}
            >
              Save Route
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default AIRouteActions;