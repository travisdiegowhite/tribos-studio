/**
 * RouteAnalysisPanel - Analyze imported activities for training route suitability
 * Shows workout-matched routes with interactive map visualization
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Loader,
  Alert,
  Progress,
  Paper,
  ThemeIcon,
  Accordion,
  SimpleGrid,
  Box,
  Tooltip,
  ActionIcon,
  Modal,
  SegmentedControl,
  ScrollArea,
  Divider,
  RingProgress,
} from '@mantine/core';
import {
  IconRoute,
  IconRefresh,
  IconCheck,
  IconAlertCircle,
  IconChevronRight,
  IconMap,
  IconCalendar,
  IconClock,
  IconMountain,
  IconTrendingUp,
  IconTarget,
  IconX,
  IconDownload,
  IconPlayerPlay,
  IconFilter,
  IconChartBar,
} from '@tabler/icons-react';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getZoneColor, getZoneName } from '../../utils/intervalCues';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Segment type colors for map
const SEGMENT_COLORS = {
  flat: '#3b82f6',      // Blue
  climb: '#ef4444',     // Red
  descent: '#22c55e',   // Green
  rolling: '#f59e0b',   // Amber
  interval: '#a855f7',  // Purple
};

// Decode polyline to coordinates
function decodePolyline(encoded) {
  if (!encoded) return [];
  const coords = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

// Get bounds for coordinates
function getBounds(coords) {
  if (!coords || coords.length === 0) return null;
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return { minLng, maxLng, minLat, maxLat };
}

// Get match quality info
function getMatchQuality(score) {
  if (score >= 90) return { label: 'Excellent', color: 'green', emoji: '🥇' };
  if (score >= 75) return { label: 'Great', color: 'teal', emoji: '🥈' };
  if (score >= 60) return { label: 'Good', color: 'blue', emoji: '🥉' };
  if (score >= 45) return { label: 'Fair', color: 'yellow', emoji: '👍' };
  return { label: 'Limited', color: 'gray', emoji: '⚠️' };
}

// Category display names
const CATEGORY_NAMES = {
  recovery: 'Recovery',
  endurance: 'Endurance',
  tempo: 'Tempo',
  sweet_spot: 'Sweet Spot',
  threshold: 'Threshold',
  vo2max: 'VO2 Max',
  climbing: 'Climbing',
  intervals: 'Intervals',
};

// RouteMapModal - Full screen map view
function RouteMapModal({ opened, onClose, activity, analysis, workoutType }) {
  const [mapLoaded, setMapLoaded] = useState(false);

  const coords = useMemo(() => {
    if (!activity?.map_summary_polyline) return [];
    return decodePolyline(activity.map_summary_polyline);
  }, [activity]);

  const bounds = useMemo(() => getBounds(coords), [coords]);

  const initialViewState = useMemo(() => {
    if (!bounds) return { longitude: -122.4, latitude: 37.8, zoom: 10 };
    return {
      longitude: (bounds.minLng + bounds.maxLng) / 2,
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      zoom: 11,
    };
  }, [bounds]);

  // Create GeoJSON for the route
  const routeGeoJSON = useMemo(() => {
    if (coords.length === 0) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    };
  }, [coords]);

  // Create colored segments based on analysis
  const segmentsGeoJSON = useMemo(() => {
    if (!analysis) return null;

    const features = [];

    // Add flat segments
    const flatSegments = typeof analysis.flat_segments === 'string'
      ? JSON.parse(analysis.flat_segments)
      : analysis.flat_segments || [];

    flatSegments.forEach((seg, i) => {
      if (seg.coordinates?.length > 1) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'flat',
            color: SEGMENT_COLORS.flat,
            label: `Flat: ${seg.length?.toFixed(1) || '?'}km`,
          },
          geometry: { type: 'LineString', coordinates: seg.coordinates },
        });
      }
    });

    // Add climb segments
    const climbSegments = typeof analysis.climb_segments === 'string'
      ? JSON.parse(analysis.climb_segments)
      : analysis.climb_segments || [];

    climbSegments.forEach((seg, i) => {
      if (seg.coordinates?.length > 1) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'climb',
            color: SEGMENT_COLORS.climb,
            label: `Climb: ${seg.length?.toFixed(1) || '?'}km`,
          },
          geometry: { type: 'LineString', coordinates: seg.coordinates },
        });
      }
    });

    // Add rolling segments
    const rollingSegments = typeof analysis.rolling_segments === 'string'
      ? JSON.parse(analysis.rolling_segments)
      : analysis.rolling_segments || [];

    rollingSegments.forEach((seg, i) => {
      if (seg.coordinates?.length > 1) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'rolling',
            color: SEGMENT_COLORS.rolling,
            label: `Rolling: ${seg.length?.toFixed(1) || '?'}km`,
          },
          geometry: { type: 'LineString', coordinates: seg.coordinates },
        });
      }
    });

    // Highlight interval segments if workout type specified
    if (workoutType) {
      const intervalSegments = typeof analysis.interval_segments === 'string'
        ? JSON.parse(analysis.interval_segments)
        : analysis.interval_segments || [];

      intervalSegments
        .filter(seg => seg.suitableFor?.includes(workoutType))
        .forEach((seg, i) => {
          if (seg.coordinates?.length > 1) {
            features.push({
              type: 'Feature',
              properties: {
                type: 'interval',
                color: SEGMENT_COLORS.interval,
                label: `Interval Zone: ${seg.length?.toFixed(1) || '?'}km`,
              },
              geometry: { type: 'LineString', coordinates: seg.coordinates },
            });
          }
        });
    }

    return { type: 'FeatureCollection', features };
  }, [analysis, workoutType]);

  if (!activity) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconMap size={20} />
          <Text fw={600}>{activity.name || 'Route Analysis'}</Text>
        </Group>
      }
      size="xl"
      fullScreen
    >
      <Stack gap="md" h="calc(100vh - 120px)">
        {/* Map */}
        <Box style={{ flex: 1, minHeight: 400 }}>
          <Map
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={() => setMapLoaded(true)}
          >
            {/* Base route (if no segments) */}
            {mapLoaded && routeGeoJSON && !segmentsGeoJSON?.features?.length && (
              <Source id="route" type="geojson" data={routeGeoJSON}>
                <Layer
                  id="route-line"
                  type="line"
                  paint={{
                    'line-color': tokens.colors.electricLime,
                    'line-width': 4,
                    'line-opacity': 0.8,
                  }}
                />
              </Source>
            )}

            {/* Colored segments */}
            {mapLoaded && segmentsGeoJSON?.features?.length > 0 && (
              <Source id="segments" type="geojson" data={segmentsGeoJSON}>
                <Layer
                  id="segments-line"
                  type="line"
                  paint={{
                    'line-color': ['get', 'color'],
                    'line-width': 6,
                    'line-opacity': 0.9,
                  }}
                />
              </Source>
            )}

            {/* Start marker */}
            {coords.length > 0 && (
              <Marker longitude={coords[0][0]} latitude={coords[0][1]} anchor="bottom">
                <div style={{
                  backgroundColor: '#22c55e',
                  color: 'white',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 12,
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}>
                  S
                </div>
              </Marker>
            )}

            {/* End marker */}
            {coords.length > 1 && (
              <Marker longitude={coords[coords.length - 1][0]} latitude={coords[coords.length - 1][1]} anchor="bottom">
                <div style={{
                  backgroundColor: '#ef4444',
                  color: 'white',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 12,
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}>
                  E
                </div>
              </Marker>
            )}
          </Map>
        </Box>

        {/* Legend */}
        <Paper withBorder p="sm">
          <Group gap="lg">
            <Text size="sm" fw={500}>Segment Types:</Text>
            <Group gap="md">
              {Object.entries(SEGMENT_COLORS).map(([type, color]) => (
                <Group gap={4} key={type}>
                  <div style={{
                    width: 16,
                    height: 4,
                    backgroundColor: color,
                    borderRadius: 2,
                  }} />
                  <Text size="xs" tt="capitalize">{type}</Text>
                </Group>
              ))}
            </Group>
          </Group>
        </Paper>

        {/* Analysis Stats */}
        {analysis && (
          <SimpleGrid cols={4}>
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">Flat Distance</Text>
              <Text fw={600}>{(analysis.total_flat_km || 0).toFixed(1)} km</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">Longest Segment</Text>
              <Text fw={600}>{(analysis.longest_uninterrupted_km || 0).toFixed(1)} km</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">Terrain Type</Text>
              <Text fw={600} tt="capitalize">{analysis.terrain_type || 'Unknown'}</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">Best For</Text>
              <Group gap={4}>
                {(analysis.best_for || []).slice(0, 2).map(cat => (
                  <Badge key={cat} size="xs" variant="light">
                    {CATEGORY_NAMES[cat] || cat}
                  </Badge>
                ))}
              </Group>
            </Paper>
          </SimpleGrid>
        )}
      </Stack>
    </Modal>
  );
}

// RouteMatchCard - Display a single route match
function RouteMatchCard({ match, onViewMap, onSaveAsRoute, formatDist, formatElev }) {
  const { activity, analysis, matchScore, matchReasons, warnings } = match;
  const quality = getMatchQuality(matchScore);

  return (
    <Card withBorder p="sm" radius="md">
      <Stack gap="xs">
        {/* Header */}
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <Text size="lg">{quality.emoji}</Text>
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Text fw={500} size="sm" lineClamp={1}>
                {activity?.name || 'Unnamed Route'}
              </Text>
              <Text size="xs" c="dimmed">
                {activity?.start_date ? new Date(activity.start_date).toLocaleDateString() : 'Unknown date'}
              </Text>
            </Box>
          </Group>
          <Badge color={quality.color} variant="filled" size="lg">
            {matchScore}%
          </Badge>
        </Group>

        {/* Stats */}
        <Group gap="md">
          <Group gap={4}>
            <IconRoute size={14} />
            <Text size="xs">{formatDist ? formatDist((activity?.distance || 0) / 1000) : `${((activity?.distance || 0) / 1000).toFixed(1)} km`}</Text>
          </Group>
          <Group gap={4}>
            <IconMountain size={14} />
            <Text size="xs">{formatElev ? formatElev(activity?.total_elevation_gain || 0) : `${activity?.total_elevation_gain || 0}m`}</Text>
          </Group>
          <Badge size="xs" variant="light" tt="capitalize">
            {analysis?.terrain_type || 'Unknown'}
          </Badge>
        </Group>

        {/* Match Reasons */}
        {matchReasons && matchReasons.length > 0 && (
          <Stack gap={2}>
            {matchReasons.slice(0, 2).map((reason, i) => (
              <Group gap={4} key={i}>
                <IconCheck size={12} color="var(--mantine-color-green-6)" />
                <Text size="xs" c="dimmed">{reason}</Text>
              </Group>
            ))}
          </Stack>
        )}

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <Group gap={4}>
            <IconAlertCircle size={12} color="var(--mantine-color-yellow-6)" />
            <Text size="xs" c="yellow">{warnings[0]}</Text>
          </Group>
        )}

        {/* Actions */}
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconMap size={14} />}
            onClick={() => onViewMap(match)}
          >
            View Map
          </Button>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconDownload size={14} />}
            onClick={() => onSaveAsRoute(match)}
          >
            Save as Route
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

// Main RouteAnalysisPanel component
export default function RouteAnalysisPanel({
  plannedWorkouts = [],
  formatDist,
  formatElev,
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyses, setAnalyses] = useState([]);
  const [workoutMatches, setWorkoutMatches] = useState({});
  const [error, setError] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('workouts'); // 'workouts' | 'all'
  const [filterCategory, setFilterCategory] = useState(null);

  // Fetch analyses on mount
  useEffect(() => {
    if (user) {
      fetchAnalyses();
    }
  }, [user]);

  // Fetch matches when planned workouts change
  useEffect(() => {
    if (analyses.length > 0 && plannedWorkouts.length > 0) {
      fetchWorkoutMatches();
    }
  }, [analyses, plannedWorkouts]);

  const fetchAnalyses = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch('/api/route-analysis?action=get_analysis', {
        headers: {
          'Authorization': `Bearer ${currentSession?.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch analyses');
      }

      setAnalyses(data.analyses || []);
    } catch (err) {
      console.error('Error fetching analyses:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzeAll = async () => {
    setAnalyzing(true);
    setError(null);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch('/api/route-analysis', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'analyze_all' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze activities');
      }

      // Refresh the analyses
      await fetchAnalyses();
    } catch (err) {
      console.error('Error analyzing activities:', err);
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const fetchWorkoutMatches = async () => {
    if (plannedWorkouts.length === 0) return;

    try {
      // Filter to upcoming workouts (next 7 days)
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcomingWorkouts = plannedWorkouts
        .filter(w => {
          const date = new Date(w.scheduled_date);
          return date >= now && date <= weekFromNow && !w.completed;
        })
        .slice(0, 5)
        .map(w => ({
          id: w.id,
          name: w.workout_name || w.workout_type,
          category: w.workout_type,
          duration: w.target_duration || 60,
        }));

      if (upcomingWorkouts.length === 0) return;

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch('/api/route-analysis', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_matches',
          workouts: upcomingWorkouts,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setWorkoutMatches(data.matches || {});
      }
    } catch (err) {
      console.error('Error fetching workout matches:', err);
    }
  };

  const handleViewMap = useCallback((match) => {
    setSelectedMatch(match);
    setMapModalOpen(true);
  }, []);

  const handleSaveAsRoute = useCallback((match) => {
    // TODO: Implement save as route functionality
    console.log('Save as route:', match);
  }, []);

  // Group analyses by best workout type for the "All Routes" view
  const groupedAnalyses = useMemo(() => {
    const groups = {};

    analyses.forEach(analysis => {
      const bestFor = analysis.best_for || [];
      const primaryCategory = bestFor[0] || 'endurance';

      if (!groups[primaryCategory]) {
        groups[primaryCategory] = [];
      }
      groups[primaryCategory].push(analysis);
    });

    // Sort each group by score
    Object.keys(groups).forEach(category => {
      const scoreKey = `${category}_score`;
      groups[category].sort((a, b) => (b[scoreKey] || 0) - (a[scoreKey] || 0));
    });

    return groups;
  }, [analyses]);

  // Filtered analyses for the selected category
  const filteredAnalyses = useMemo(() => {
    if (!filterCategory) return analyses;
    return analyses.filter(a => (a.best_for || []).includes(filterCategory));
  }, [analyses, filterCategory]);

  // Upcoming workouts with matches
  const upcomingWorkoutsWithMatches = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return plannedWorkouts
      .filter(w => {
        const date = new Date(w.scheduled_date);
        return date >= now && date <= weekFromNow && !w.completed;
      })
      .slice(0, 5)
      .map(w => ({
        ...w,
        matches: workoutMatches[w.id] || [],
      }));
  }, [plannedWorkouts, workoutMatches]);

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon size="lg" radius="md" color="lime">
            <IconRoute size={20} />
          </ThemeIcon>
          <Box>
            <Text fw={600}>Route Analysis</Text>
            <Text size="xs" c="dimmed">
              {analyses.length} routes analyzed
            </Text>
          </Box>
        </Group>

        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: 'Workouts', value: 'workouts' },
              { label: 'All Routes', value: 'all' },
            ]}
          />
          <Button
            size="xs"
            variant="light"
            leftSection={analyzing ? <Loader size={14} /> : <IconRefresh size={14} />}
            onClick={analyzeAll}
            disabled={analyzing}
          >
            {analyzing ? 'Analyzing...' : 'Analyze All'}
          </Button>
        </Group>
      </Group>

      {/* Error Alert */}
      {error && (
        <Alert color="red" icon={<IconAlertCircle />} onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Paper withBorder p="xl" ta="center">
          <Loader size="lg" />
          <Text mt="md" c="dimmed">Loading route analyses...</Text>
        </Paper>
      )}

      {/* No Data State */}
      {!loading && analyses.length === 0 && (
        <Paper withBorder p="xl" ta="center">
          <ThemeIcon size={60} radius="xl" color="gray" variant="light">
            <IconRoute size={30} />
          </ThemeIcon>
          <Text mt="md" fw={500}>No Routes Analyzed Yet</Text>
          <Text size="sm" c="dimmed" mt="xs">
            Click "Analyze All" to scan your imported activities for training route recommendations.
          </Text>
          <Button
            mt="md"
            leftSection={<IconRefresh size={16} />}
            onClick={analyzeAll}
            disabled={analyzing}
          >
            Analyze Activities
          </Button>
        </Paper>
      )}

      {/* Workouts View */}
      {!loading && analyses.length > 0 && viewMode === 'workouts' && (
        <Stack gap="md">
          {upcomingWorkoutsWithMatches.length === 0 ? (
            <Paper withBorder p="lg" ta="center">
              <Text c="dimmed">No upcoming workouts in the next 7 days.</Text>
              <Text size="xs" c="dimmed" mt="xs">
                Switch to "All Routes" to browse routes by training type.
              </Text>
            </Paper>
          ) : (
            upcomingWorkoutsWithMatches.map(workout => (
              <Card key={workout.id} withBorder p="md" radius="md">
                <Stack gap="sm">
                  {/* Workout Header */}
                  <Group justify="space-between">
                    <Group gap="xs">
                      <IconCalendar size={16} />
                      <Text size="sm" c="dimmed">
                        {new Date(workout.scheduled_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </Group>
                    <Badge variant="light">
                      {CATEGORY_NAMES[workout.workout_type] || workout.workout_type}
                    </Badge>
                  </Group>

                  <Text fw={600}>{workout.workout_name || workout.workout_type}</Text>

                  {/* Matches */}
                  {workout.matches.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                      {workout.matches.slice(0, 3).map((match, i) => (
                        <RouteMatchCard
                          key={match.activity?.id || i}
                          match={match}
                          onViewMap={handleViewMap}
                          onSaveAsRoute={handleSaveAsRoute}
                          formatDist={formatDist}
                          formatElev={formatElev}
                        />
                      ))}
                    </SimpleGrid>
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      No matching routes found. Try analyzing more activities.
                    </Text>
                  )}
                </Stack>
              </Card>
            ))
          )}
        </Stack>
      )}

      {/* All Routes View */}
      {!loading && analyses.length > 0 && viewMode === 'all' && (
        <Stack gap="md">
          {/* Category Filter */}
          <Group gap="xs">
            <Text size="sm" fw={500}>Filter by type:</Text>
            <Button
              size="xs"
              variant={filterCategory === null ? 'filled' : 'light'}
              onClick={() => setFilterCategory(null)}
            >
              All
            </Button>
            {Object.keys(groupedAnalyses).map(category => (
              <Button
                key={category}
                size="xs"
                variant={filterCategory === category ? 'filled' : 'light'}
                onClick={() => setFilterCategory(category)}
              >
                {CATEGORY_NAMES[category] || category} ({groupedAnalyses[category].length})
              </Button>
            ))}
          </Group>

          {/* Routes List */}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {filteredAnalyses.map(analysis => {
              const activity = analysis.activities;
              const quality = getMatchQuality(
                Math.max(
                  analysis.threshold_score || 0,
                  analysis.endurance_score || 0,
                  analysis.intervals_score || 0
                )
              );

              return (
                <Card key={analysis.id} withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                      <Box style={{ minWidth: 0, flex: 1 }}>
                        <Text fw={500} size="sm" lineClamp={1}>
                          {activity?.name || 'Unnamed Route'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {activity?.start_date
                            ? new Date(activity.start_date).toLocaleDateString()
                            : 'Unknown date'}
                        </Text>
                      </Box>
                      <Badge size="xs" variant="light" tt="capitalize">
                        {analysis.terrain_type}
                      </Badge>
                    </Group>

                    {/* Stats */}
                    <Group gap="md">
                      <Group gap={4}>
                        <IconRoute size={14} />
                        <Text size="xs">
                          {formatDist
                            ? formatDist((activity?.distance || 0) / 1000)
                            : `${((activity?.distance || 0) / 1000).toFixed(1)} km`}
                        </Text>
                      </Group>
                      <Group gap={4}>
                        <IconMountain size={14} />
                        <Text size="xs">
                          {formatElev
                            ? formatElev(activity?.total_elevation_gain || 0)
                            : `${activity?.total_elevation_gain || 0}m`}
                        </Text>
                      </Group>
                    </Group>

                    {/* Best For */}
                    <Group gap={4}>
                      {(analysis.best_for || []).map(cat => (
                        <Badge key={cat} size="xs" variant="dot" color="lime">
                          {CATEGORY_NAMES[cat] || cat}
                        </Badge>
                      ))}
                    </Group>

                    {/* Actions */}
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconMap size={14} />}
                      onClick={() => handleViewMap({
                        activity,
                        analysis,
                        matchScore: 0,
                        matchReasons: [],
                      })}
                      fullWidth
                    >
                      View Map
                    </Button>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}

      {/* Map Modal */}
      <RouteMapModal
        opened={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        activity={selectedMatch?.activity}
        analysis={selectedMatch?.analysis}
        workoutType={null}
      />
    </Stack>
  );
}
