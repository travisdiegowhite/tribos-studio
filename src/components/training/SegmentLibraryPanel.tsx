/**
 * SegmentLibraryPanel - Training segment library with segment cards, detail modal, and map
 *
 * Two-view layout via SegmentedControl:
 *   - "My Segments": segment library with cards, filters, and detail modal
 *   - "Route Analysis": existing RouteAnalysisPanel pass-through
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Loader,
  Alert,
  Paper,
  ThemeIcon,
  SimpleGrid,
  Box,
  Tooltip,
  ActionIcon,
  Modal,
  SegmentedControl,
  ScrollArea,
  RingProgress,
  TextInput,
  Select,
  Progress,
  Table,
  Center,
} from '@mantine/core';
import {
  IconRoute,
  IconRefresh,
  IconMountain,
  IconClock,
  IconTarget,
  IconBolt,
  IconMap,
  IconCheck,
  IconAlertCircle,
  IconEdit,
  IconX,
  IconActivity,
  IconRoad,
  IconTrendingUp,
  IconLayoutGrid,
} from '@tabler/icons-react';
import Map, { Source, Layer, Marker, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useSegmentLibrary } from '../../hooks/useSegmentLibrary';
import type { SegmentSummary, SegmentDetail, WorkoutMatch, SegmentProfile } from '../../hooks/useSegmentLibrary';
import RouteAnalysisPanel from './RouteAnalysisPanel';

const MAPBOX_TOKEN = (import.meta as any).env.VITE_MAPBOX_TOKEN;

// Segment type colors (reused from RouteAnalysisPanel)
const SEGMENT_COLORS: Record<string, string> = {
  flat: '#2A8C82',
  climb: '#C43C2A',
  descent: '#2A8C82',
  rolling: '#D4600A',
};

// Power zone display names and colors
const ZONE_DISPLAY: Record<string, { label: string; color: string }> = {
  recovery: { label: 'Recovery', color: 'sage' },
  endurance: { label: 'Endurance', color: 'teal' },
  tempo: { label: 'Tempo', color: 'gold' },
  sweet_spot: { label: 'Sweet Spot', color: 'terracotta' },
  threshold: { label: 'Threshold', color: 'terracotta' },
  vo2max: { label: 'VO2max', color: 'mauve' },
  anaerobic: { label: 'Anaerobic', color: 'dark' },
};

// Frequency tier labels
const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  primary: { label: 'Primary', color: 'teal' },
  regular: { label: 'Regular', color: 'sage' },
  occasional: { label: 'Occasional', color: 'gold' },
  rare: { label: 'Rare', color: 'gray' },
};

function getMatchQuality(score: number) {
  if (score >= 90) return { label: 'Excellent', color: 'green' };
  if (score >= 75) return { label: 'Great', color: 'teal' };
  if (score >= 60) return { label: 'Good', color: 'blue' };
  if (score >= 45) return { label: 'Fair', color: 'yellow' };
  return { label: 'Limited', color: 'gray' };
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + ' km';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// SEGMENT CARD
// ============================================================================

function SegmentCard({
  segment,
  onClick,
}: {
  segment: SegmentSummary;
  onClick: () => void;
}) {
  const profile = segment.training_segment_profiles;
  const terrainColor = SEGMENT_COLORS[segment.terrain_type] || SEGMENT_COLORS.flat;
  const zoneInfo = profile?.typical_power_zone
    ? ZONE_DISPLAY[profile.typical_power_zone]
    : null;
  const tierInfo = profile?.frequency_tier
    ? TIER_DISPLAY[profile.frequency_tier]
    : null;

  return (
    <Card
      withBorder
      p="sm"
      style={{
        cursor: 'pointer',
        borderRadius: 0,
        borderColor: 'var(--color-border)',
        transition: 'box-shadow 150ms ease',
      }}
      onClick={onClick}
      className="tribos-segment-card"
    >
      <Stack gap={8}>
        {/* Row 1: Name + terrain badge */}
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1 }}>
            {segment.display_name || segment.auto_name || 'Unnamed Segment'}
          </Text>
          <Badge
            size="xs"
            variant="light"
            style={{ backgroundColor: `${terrainColor}22`, color: terrainColor, borderRadius: 0 }}
          >
            {segment.terrain_type}
          </Badge>
        </Group>

        {/* Row 2: Stats */}
        <Group gap="xs">
          <Group gap={4}>
            <IconRoad size={14} style={{ color: 'var(--color-text-secondary)' }} />
            <Text size="xs" c="dimmed">{formatDistance(segment.distance_meters)}</Text>
          </Group>
          <Group gap={4}>
            <IconTrendingUp size={14} style={{ color: 'var(--color-text-secondary)' }} />
            <Text size="xs" c="dimmed">{segment.avg_gradient.toFixed(1)}%</Text>
          </Group>
          <Group gap={4}>
            <IconMountain size={14} style={{ color: 'var(--color-text-secondary)' }} />
            <Text size="xs" c="dimmed">{Math.round(segment.elevation_gain_meters)}m</Text>
          </Group>
        </Group>

        {/* Row 3: Ride count + last ridden + confidence */}
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {segment.ride_count} ride{segment.ride_count !== 1 ? 's' : ''}
          </Text>
          <Text size="xs" c="dimmed">
            {formatDate(segment.last_ridden_at)}
          </Text>
          {tierInfo && (
            <Badge size="xs" variant="outline" color={tierInfo.color} style={{ borderRadius: 0 }}>
              {tierInfo.label}
            </Badge>
          )}
          {(segment as any).data_quality_tier === 'geometry_only' && (
            <Tooltip label="Terrain detected from GPS track. Power data will be added when you ride this segment with a power meter." withArrow>
              <Badge size="xs" variant="light" color="gold" style={{ borderRadius: 0 }}>
                Building Profile
              </Badge>
            </Tooltip>
          )}
        </Group>

        {/* Row 4: Power zone + obstruction */}
        <Group justify="space-between">
          <Group gap="xs">
            {zoneInfo && (
              <Badge size="xs" color={zoneInfo.color} variant="filled" style={{ borderRadius: 0 }}>
                {zoneInfo.label}
              </Badge>
            )}
          </Group>
          <Tooltip label={`Obstruction: ${segment.obstruction_score}/100`} withArrow>
            <RingProgress
              size={36}
              thickness={4}
              roundCaps
              sections={[
                { value: segment.obstruction_score, color: segment.obstruction_score >= 70 ? 'teal' : segment.obstruction_score >= 40 ? 'gold' : 'red' },
              ]}
              label={
                <Text style={{ fontSize: 10 }} ta="center" fw={600}>{segment.obstruction_score}</Text>
              }
            />
          </Tooltip>
        </Group>
      </Stack>
    </Card>
  );
}

// ============================================================================
// SEGMENT DETAIL MODAL
// ============================================================================

function SegmentDetailModal({
  segment,
  opened,
  onClose,
  onNameUpdate,
  workoutMatches,
  matchesLoading,
  onComputeMatches,
  formatDistProp,
  formatElevProp,
}: {
  segment: SegmentDetail | null;
  opened: boolean;
  onClose: () => void;
  onNameUpdate: (name: string | null) => Promise<void>;
  workoutMatches: WorkoutMatch[];
  matchesLoading: boolean;
  onComputeMatches: () => void;
  formatDistProp?: (km: number) => string;
  formatElevProp?: (m: number) => string;
}) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  // Reset map state when modal opens
  useEffect(() => {
    if (!opened) {
      setMapLoaded(false);
      setEditingName(false);
    }
  }, [opened]);

  const geojsonData = useMemo(() => {
    if (!segment?.geojson) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: segment.geojson,
    };
  }, [segment]);

  const coords = useMemo(() => {
    if (!segment?.geojson?.coordinates) return [];
    return segment.geojson.coordinates;
  }, [segment]);

  const initialViewState = useMemo(() => {
    if (!coords.length) return { longitude: -122.4, latitude: 37.8, zoom: 10 };
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    coords.forEach(([lng, lat]: [number, number]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
    return {
      longitude: (minLng + maxLng) / 2,
      latitude: (minLat + maxLat) / 2,
      zoom: 13,
    };
  }, [coords]);

  const profile = segment?.training_segment_profiles;
  const rides = segment?.training_segment_rides || [];
  const terrainColor = SEGMENT_COLORS[segment?.terrain_type || 'flat'] || SEGMENT_COLORS.flat;

  const handleSaveName = async () => {
    setNameSaving(true);
    try {
      await onNameUpdate(editName.trim() || null);
      setEditingName(false);
    } finally {
      setNameSaving(false);
    }
  };

  // Zone distribution bar data
  const zoneDistribution = useMemo(() => {
    if (!profile?.zone_distribution) return [];
    const entries = Object.entries(profile.zone_distribution as Record<string, number>);
    return entries
      .filter(([, value]) => value > 0)
      .map(([zone, value]) => {
        const info = ZONE_DISPLAY[zone] || { label: zone, color: 'gray' };
        return { zone, label: info.label, value: Math.round(value * 100), color: info.color };
      })
      .sort((a, b) => b.value - a.value);
  }, [profile]);

  if (!segment) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconMap size={20} />
          <Text fw={600}>{segment.display_name || 'Segment Detail'}</Text>
        </Group>
      }
      size="xl"
      fullScreen
    >
      <ScrollArea h="calc(100vh - 80px)">
        <Stack gap="md" p="md">
          {/* Name editing */}
          <Group gap="xs">
            {editingName ? (
              <>
                <TextInput
                  value={editName}
                  onChange={(e) => setEditName(e.currentTarget.value)}
                  placeholder="Custom segment name"
                  size="sm"
                  style={{ flex: 1, borderRadius: 0 }}
                />
                <ActionIcon
                  variant="filled"
                  color="teal"
                  onClick={handleSaveName}
                  loading={nameSaving}
                  style={{ borderRadius: 0 }}
                >
                  <IconCheck size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  onClick={() => setEditingName(false)}
                  style={{ borderRadius: 0 }}
                >
                  <IconX size={16} />
                </ActionIcon>
              </>
            ) : (
              <>
                <Text fw={600} size="lg" style={{ flex: 1 }}>
                  {segment.display_name || segment.auto_name || 'Unnamed Segment'}
                </Text>
                <ActionIcon
                  variant="subtle"
                  onClick={() => {
                    setEditName(segment.custom_name || segment.display_name || '');
                    setEditingName(true);
                  }}
                  style={{ borderRadius: 0 }}
                >
                  <IconEdit size={16} />
                </ActionIcon>
              </>
            )}
          </Group>

          {/* Map */}
          <Box style={{ height: 300, borderRadius: 0, overflow: 'hidden', border: '1.5px solid var(--color-border)' }}>
            <Map
              initialViewState={initialViewState}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              mapboxAccessToken={MAPBOX_TOKEN}
              onLoad={() => setMapLoaded(true)}
            >
              {mapLoaded && geojsonData && (
                <Source id="segment-line" type="geojson" data={geojsonData}>
                  <Layer
                    id="segment-line-layer"
                    type="line"
                    paint={{
                      'line-color': terrainColor,
                      'line-width': 5,
                      'line-opacity': 0.9,
                    }}
                  />
                </Source>
              )}

              {/* Start marker */}
              {coords.length > 0 && (
                <Marker longitude={coords[0][0]} latitude={coords[0][1]} anchor="bottom">
                  <div style={{
                    backgroundColor: '#2A8C82',
                    color: 'white',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 11,
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
                    backgroundColor: '#C43C2A',
                    color: 'white',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 11,
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }}>
                    E
                  </div>
                </Marker>
              )}
            </Map>
          </Box>

          {/* Stats grid */}
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Distance</Text>
              <Text fw={600} size="sm">{formatDistance(segment.distance_meters)}</Text>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Avg Gradient</Text>
              <Text fw={600} size="sm">{segment.avg_gradient.toFixed(1)}%</Text>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Elevation Gain</Text>
              <Text fw={600} size="sm">{Math.round(segment.elevation_gain_meters)}m</Text>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Obstruction</Text>
              <Group gap={4}>
                <Text fw={600} size="sm">{segment.obstruction_score}/100</Text>
                <RingProgress
                  size={24}
                  thickness={3}
                  sections={[{ value: segment.obstruction_score, color: segment.obstruction_score >= 70 ? 'teal' : segment.obstruction_score >= 40 ? 'gold' : 'red' }]}
                />
              </Group>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Topology</Text>
              <Text fw={600} size="sm" tt="capitalize">
                {segment.topology?.replace(/_/g, ' ') || 'Unknown'}
              </Text>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Max Uninterrupted</Text>
              <Text fw={600} size="sm">{formatDuration(segment.max_uninterrupted_seconds)}</Text>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Ride Count</Text>
              <Text fw={600} size="sm">{segment.ride_count}</Text>
            </Paper>
            <Paper withBorder p="xs" style={{ borderRadius: 0 }}>
              <Text size="xs" c="dimmed">Confidence</Text>
              <Group gap={4}>
                <Text fw={600} size="sm">{segment.confidence_score}/100</Text>
                {(segment as any).data_quality_tier === 'geometry_only' && (
                  <Badge size="xs" variant="light" color="gold" style={{ borderRadius: 0 }}>
                    Terrain Only
                  </Badge>
                )}
              </Group>
            </Paper>
          </SimpleGrid>

          {/* Data quality notice for geometry-only segments */}
          {(segment as any).data_quality_tier === 'geometry_only' && (
            <Alert
              icon={<IconMap size={16} />}
              color="gold"
              style={{ borderRadius: 0 }}
            >
              <Text size="xs">
                This segment was detected from GPS tracks and elevation data. Terrain, gradient, and distance
                are available. Power and heart rate profiles will be added automatically when you ride this
                segment with a connected device.
              </Text>
            </Alert>
          )}

          {/* Power profile */}
          {profile && profile.mean_avg_power != null && (
            <Paper withBorder p="sm" style={{ borderRadius: 0 }}>
              <Text fw={600} size="sm" mb="xs">Power Profile</Text>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mb="sm">
                <div>
                  <Text size="xs" c="dimmed">Mean Power</Text>
                  <Text fw={600} size="sm">{Math.round(profile.mean_avg_power)}W</Text>
                </div>
                {profile.mean_avg_power && profile.std_dev_power != null && (
                  <div>
                    <Text size="xs" c="dimmed">Normalized Power</Text>
                    <Text fw={600} size="sm">
                      {Math.round(profile.mean_avg_power + (profile.std_dev_power || 0) * 0.3)}W
                    </Text>
                  </div>
                )}
                <div>
                  <Text size="xs" c="dimmed">Consistency</Text>
                  <Group gap={4}>
                    <Text fw={600} size="sm">{Math.round(profile.consistency_score)}%</Text>
                    <Progress
                      value={profile.consistency_score}
                      size="sm"
                      color={profile.consistency_score >= 70 ? 'teal' : profile.consistency_score >= 40 ? 'gold' : 'red'}
                      style={{ flex: 1, borderRadius: 0 }}
                    />
                  </Group>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Typical Zone</Text>
                  {profile.typical_power_zone && (
                    <Badge
                      size="sm"
                      color={ZONE_DISPLAY[profile.typical_power_zone]?.color || 'gray'}
                      variant="filled"
                      style={{ borderRadius: 0 }}
                    >
                      {ZONE_DISPLAY[profile.typical_power_zone]?.label || profile.typical_power_zone}
                    </Badge>
                  )}
                </div>
              </SimpleGrid>

              {/* Zone distribution bar */}
              {zoneDistribution.length > 0 && (
                <div>
                  <Text size="xs" c="dimmed" mb={4}>Zone Distribution</Text>
                  <Progress.Root size="lg" style={{ borderRadius: 0 }}>
                    {zoneDistribution.map((z) => (
                      <Tooltip key={z.zone} label={`${z.label}: ${z.value}%`} withArrow>
                        <Progress.Section value={z.value} color={z.color} />
                      </Tooltip>
                    ))}
                  </Progress.Root>
                </div>
              )}
            </Paper>
          )}

          {/* Ride history */}
          {rides.length > 0 && (
            <Paper withBorder p="sm" style={{ borderRadius: 0 }}>
              <Text fw={600} size="sm" mb="xs">
                Ride History ({rides.length} ride{rides.length !== 1 ? 's' : ''})
              </Text>
              <ScrollArea h={rides.length > 5 ? 240 : undefined}>
                <Table striped highlightOnHover style={{ borderRadius: 0 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ fontSize: 12 }}>Date</Table.Th>
                      <Table.Th style={{ fontSize: 12 }}>Power</Table.Th>
                      <Table.Th style={{ fontSize: 12 }}>HR</Table.Th>
                      <Table.Th style={{ fontSize: 12 }}>Speed</Table.Th>
                      <Table.Th style={{ fontSize: 12 }}>Stops</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rides.slice(0, 10).map((ride) => (
                      <Table.Tr key={ride.id}>
                        <Table.Td>
                          <Text size="xs">
                            {new Date(ride.ridden_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">
                            {ride.avg_power != null ? `${Math.round(ride.avg_power)}W` : '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">
                            {ride.avg_hr != null ? `${Math.round(ride.avg_hr)}bpm` : '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">
                            {ride.avg_speed != null ? `${ride.avg_speed.toFixed(1)}km/h` : '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{ride.stop_count}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          )}

          {/* Workout matches */}
          <Paper withBorder p="sm" style={{ borderRadius: 0 }}>
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">Workout Matches</Text>
              <Button
                size="xs"
                variant="light"
                color="teal"
                leftSection={<IconTarget size={14} />}
                loading={matchesLoading}
                onClick={onComputeMatches}
                style={{ borderRadius: 0 }}
              >
                Find Matching Workouts
              </Button>
            </Group>

            {workoutMatches.length > 0 ? (
              <Stack gap="xs">
                {workoutMatches.slice(0, 5).map((match) => {
                  const quality = getMatchQuality(match.match_score);
                  return (
                    <Paper key={match.id} withBorder p="xs" style={{ borderRadius: 0 }}>
                      <Group justify="space-between" wrap="nowrap">
                        <div style={{ flex: 1 }}>
                          <Group gap="xs" mb={2}>
                            <Text fw={600} size="sm" tt="capitalize">
                              {match.workout_type?.replace(/_/g, ' ')}
                            </Text>
                            <Badge size="xs" color={quality.color} style={{ borderRadius: 0 }}>
                              {match.match_score}
                            </Badge>
                          </Group>
                          {match.match_reasoning && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {match.match_reasoning}
                            </Text>
                          )}
                          {match.recommended_power_target && (
                            <Text size="xs" c="dimmed" mt={2}>
                              Target: {match.recommended_power_target}
                            </Text>
                          )}
                        </div>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                Click "Find Matching Workouts" to see which workout types suit this segment.
              </Text>
            )}
          </Paper>
        </Stack>
      </ScrollArea>
    </Modal>
  );
}

// ============================================================================
// SEGMENT MAP VIEW
// ============================================================================

function SegmentMapView({
  segments,
  onSegmentClick,
}: {
  segments: SegmentSummary[];
  onSegmentClick: (segmentId: string) => void;
}) {
  const [hoverInfo, setHoverInfo] = useState<{
    longitude: number;
    latitude: number;
    name: string;
    distance: string;
    gradient: string;
    segmentId: string;
  } | null>(null);

  const featureCollection = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: segments
      .filter(s => s.geojson?.coordinates?.length)
      .map(s => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          terrain_type: s.terrain_type,
          display_name: s.display_name || s.auto_name || 'Unnamed',
          distance: `${(s.distance_meters / 1000).toFixed(1)} km`,
          gradient: `${s.avg_gradient.toFixed(1)}%`,
        },
        geometry: s.geojson!,
      })),
  }), [segments]);

  const initialViewState = useMemo(() => {
    const allCoords = segments.flatMap(s => s.geojson?.coordinates || []);
    if (!allCoords.length) return { longitude: -98.5, latitude: 39.8, zoom: 3 };
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    allCoords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
    const maxSpan = Math.max(maxLng - minLng, maxLat - minLat);
    let zoom = 12;
    if (maxSpan > 1) zoom = 7;
    else if (maxSpan > 0.5) zoom = 8;
    else if (maxSpan > 0.2) zoom = 9;
    else if (maxSpan > 0.1) zoom = 10;
    else if (maxSpan > 0.05) zoom = 11;
    return {
      longitude: (minLng + maxLng) / 2,
      latitude: (minLat + maxLat) / 2,
      zoom,
    };
  }, [segments]);

  const handleMouseMove = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (feature) {
      const props = feature.properties;
      setHoverInfo({
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
        name: props.display_name,
        distance: props.distance,
        gradient: props.gradient,
        segmentId: props.id,
      });
    } else {
      setHoverInfo(null);
    }
  }, []);

  const handleClick = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (feature?.properties?.id) {
      onSegmentClick(feature.properties.id);
    }
  }, [onSegmentClick]);

  if (!featureCollection.features.length) {
    return (
      <Paper withBorder p="xl" style={{ borderRadius: 0, textAlign: 'center', borderColor: 'var(--color-border)' }}>
        <Text size="sm" c="dimmed">No segments with map data available.</Text>
      </Paper>
    );
  }

  return (
    <Box style={{ height: 500, borderRadius: 0, overflow: 'hidden', border: '1.5px solid var(--color-border)' }}>
      <Map
        initialViewState={initialViewState}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={['segments-base']}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        onClick={handleClick}
        cursor={hoverInfo ? 'pointer' : 'grab'}
        style={{ width: '100%', height: '100%' }}
      >
        <Source id="all-segments" type="geojson" data={featureCollection}>
          <Layer
            id="segments-highlight"
            type="line"
            paint={{
              'line-color': '#ffffff',
              'line-width': 7,
              'line-opacity': 0.5,
            }}
            filter={hoverInfo ? ['==', ['get', 'id'], hoverInfo.segmentId] : ['==', ['get', 'id'], '']}
          />
          <Layer
            id="segments-base"
            type="line"
            paint={{
              'line-color': [
                'match', ['get', 'terrain_type'],
                'flat', SEGMENT_COLORS.flat,
                'climb', SEGMENT_COLORS.climb,
                'descent', SEGMENT_COLORS.descent,
                'rolling', SEGMENT_COLORS.rolling,
                SEGMENT_COLORS.flat,
              ],
              'line-width': 4,
              'line-opacity': 0.85,
            }}
          />
        </Source>
        {hoverInfo && (
          <Popup
            longitude={hoverInfo.longitude}
            latitude={hoverInfo.latitude}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={10}
          >
            <div style={{ fontFamily: 'var(--mantine-font-family)', padding: 2 }}>
              <Text size="xs" fw={600}>{hoverInfo.name}</Text>
              <Text size="xs" c="dimmed">{hoverInfo.distance} · {hoverInfo.gradient}</Text>
            </div>
          </Popup>
        )}
      </Map>
    </Box>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

interface SegmentLibraryPanelProps {
  plannedWorkouts?: any[];
  formatDist?: (km: number) => string;
  formatElev?: (m: number) => string;
}

function SegmentLibraryPanel({
  plannedWorkouts = [],
  formatDist,
  formatElev,
}: SegmentLibraryPanelProps) {
  const { user } = useAuth() as { user?: { id: string } };
  const userId = user?.id;

  const {
    segments,
    loading,
    error,
    fetchSegments,
    analyzeUnprocessed,
    getSegmentDetail,
    updateSegmentName,
    getWorkoutMatches,
    computeMatches,
  } = useSegmentLibrary(userId);

  const [viewMode, setViewMode] = useState('routes');
  const [terrainFilter, setTerrainFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('relevance');
  const [displayMode, setDisplayMode] = useState<'list' | 'map'>('list');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  // Detail modal state
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<SegmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [workoutMatches, setWorkoutMatches] = useState<WorkoutMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  // Apply filters
  useEffect(() => {
    if (userId) {
      fetchSegments({
        terrainType: terrainFilter || undefined,
        sortBy,
      });
    }
  }, [userId, terrainFilter, sortBy, fetchSegments]);

  // Fetch detail when segment is selected
  useEffect(() => {
    if (selectedSegmentId) {
      setDetailLoading(true);
      setWorkoutMatches([]);
      getSegmentDetail(selectedSegmentId).then((detail) => {
        setSelectedSegment(detail);
        setDetailLoading(false);
      });
      // Also fetch existing matches
      getWorkoutMatches(undefined, 10).then((matches) => {
        setWorkoutMatches(matches.filter(m => m.segment_id === selectedSegmentId));
      });
    } else {
      setSelectedSegment(null);
      setWorkoutMatches([]);
    }
  }, [selectedSegmentId, getSegmentDetail, getWorkoutMatches]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const result = await analyzeUnprocessed();
      const totalProcessed = result.processed || 0;
      const totalNew = result.newSegments || 0;
      const polylineInfo = result.polylineAnalysis
        ? ` (${result.polylineAnalysis.processed || 0} from GPS tracks)`
        : '';
      setAnalyzeResult(
        `Analyzed ${totalProcessed} activities${polylineInfo}, found ${totalNew} new segments.`
      );
      await fetchSegments({ terrainType: terrainFilter || undefined, sortBy });
    } catch (err) {
      setAnalyzeResult('Failed to analyze activities.');
    } finally {
      setAnalyzing(false);
    }
  }, [analyzeUnprocessed, fetchSegments, terrainFilter, sortBy]);

  const handleComputeMatches = useCallback(async () => {
    if (!selectedSegmentId) return;
    setMatchesLoading(true);
    try {
      // Compute matches for common workout types against this segment
      // We fetch ALL existing matches for this segment after computation
      await computeMatches('all_types', {
        category: 'sweet_spot', // default compute
        structure: { main: [] },
      });
      const matches = await getWorkoutMatches(undefined, 10);
      setWorkoutMatches(matches.filter(m => m.segment_id === selectedSegmentId));
    } catch {
      // Silent failure — user can retry
    } finally {
      setMatchesLoading(false);
    }
  }, [selectedSegmentId, computeMatches, getWorkoutMatches]);

  const handleNameUpdate = useCallback(async (name: string | null) => {
    if (!selectedSegmentId) return;
    await updateSegmentName(selectedSegmentId, name);
    // Refresh the detail
    const detail = await getSegmentDetail(selectedSegmentId);
    setSelectedSegment(detail);
  }, [selectedSegmentId, updateSegmentName, getSegmentDetail]);

  const filteredSegments = segments;

  return (
    <Stack gap="md">
      {/* View mode toggle */}
      <SegmentedControl
        value={viewMode}
        onChange={setViewMode}
        data={[
          { label: 'My Segments', value: 'segments' },
          { label: 'Route Analysis', value: 'routes' },
        ]}
        color="teal"
        style={{ borderRadius: 0 }}
      />

      {viewMode === 'segments' ? (
        <Stack gap="md">
          {/* Header */}
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon
                size="md"
                variant="light"
                color="teal"
                style={{ borderRadius: 0 }}
              >
                <IconActivity size={16} />
              </ThemeIcon>
              <Text fw={600} size="sm">
                {loading ? 'Loading...' : `${segments.length} Segment${segments.length !== 1 ? 's' : ''}`}
              </Text>
            </Group>
            <Button
              size="xs"
              variant="light"
              color="teal"
              leftSection={<IconRefresh size={14} />}
              loading={analyzing}
              onClick={handleAnalyze}
              style={{ borderRadius: 0 }}
            >
              Analyze Rides
            </Button>
          </Group>

          {/* Analyze result */}
          {analyzeResult && (
            <Alert
              icon={<IconCheck size={16} />}
              color="teal"
              withCloseButton
              onClose={() => setAnalyzeResult(null)}
              style={{ borderRadius: 0 }}
            >
              {analyzeResult}
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              style={{ borderRadius: 0 }}
            >
              {error}
            </Alert>
          )}

          {/* Filter bar */}
          <Group gap="xs">
            <Select
              size="xs"
              placeholder="Terrain"
              clearable
              value={terrainFilter}
              onChange={setTerrainFilter}
              data={[
                { value: 'flat', label: 'Flat' },
                { value: 'climb', label: 'Climb' },
                { value: 'descent', label: 'Descent' },
                { value: 'rolling', label: 'Rolling' },
              ]}
              style={{ width: 120, borderRadius: 0 }}
            />
            <Select
              size="xs"
              value={sortBy}
              onChange={(v) => setSortBy(v || 'relevance')}
              data={[
                { value: 'relevance', label: 'Recent' },
                { value: 'ride_count', label: 'Most Ridden' },
                { value: 'distance', label: 'Longest' },
                { value: 'obstruction', label: 'Best Road' },
                { value: 'confidence', label: 'Confidence' },
              ]}
              style={{ width: 140, borderRadius: 0 }}
            />
            <Group gap={2} ml="auto">
              <ActionIcon
                variant={displayMode === 'list' ? 'filled' : 'subtle'}
                color="teal"
                size="sm"
                onClick={() => setDisplayMode('list')}
                style={{ borderRadius: 0 }}
                aria-label="Card view"
              >
                <IconLayoutGrid size={16} />
              </ActionIcon>
              <ActionIcon
                variant={displayMode === 'map' ? 'filled' : 'subtle'}
                color="teal"
                size="sm"
                onClick={() => setDisplayMode('map')}
                style={{ borderRadius: 0 }}
                aria-label="Map view"
              >
                <IconMap size={16} />
              </ActionIcon>
            </Group>
          </Group>

          {/* Segment grid or map */}
          {loading ? (
            <Center py="xl">
              <Loader color="teal" size="md" />
            </Center>
          ) : filteredSegments.length > 0 ? (
            displayMode === 'map' ? (
              <SegmentMapView
                segments={filteredSegments}
                onSegmentClick={(id) => setSelectedSegmentId(id)}
              />
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                {filteredSegments.map((segment) => (
                  <SegmentCard
                    key={segment.id}
                    segment={segment}
                    onClick={() => setSelectedSegmentId(segment.id)}
                  />
                ))}
              </SimpleGrid>
            )
          ) : (
            <Paper
              withBorder
              p="xl"
              style={{
                borderRadius: 0,
                textAlign: 'center',
                borderColor: 'var(--color-border)',
              }}
            >
              <Stack align="center" gap="sm">
                <ThemeIcon size="xl" variant="light" color="gray" style={{ borderRadius: 0 }}>
                  <IconRoute size={24} />
                </ThemeIcon>
                <Text fw={600} size="sm">No segments found</Text>
                <Text size="xs" c="dimmed" maw={400}>
                  Click "Analyze Rides" to detect training segments from your imported activities.
                  Segments are road sections where you regularly train.
                </Text>
                <Button
                  size="sm"
                  variant="light"
                  color="teal"
                  leftSection={<IconRefresh size={16} />}
                  loading={analyzing}
                  onClick={handleAnalyze}
                  style={{ borderRadius: 0 }}
                >
                  Analyze Rides
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      ) : (
        /* Route Analysis view — pass through to existing component */
        <RouteAnalysisPanel
          plannedWorkouts={plannedWorkouts as any}
          formatDist={formatDist}
          formatElev={formatElev}
        />
      )}

      {/* Detail modal */}
      <SegmentDetailModal
        segment={selectedSegment}
        opened={!!selectedSegmentId && !detailLoading}
        onClose={() => setSelectedSegmentId(null)}
        onNameUpdate={handleNameUpdate}
        workoutMatches={workoutMatches}
        matchesLoading={matchesLoading}
        onComputeMatches={handleComputeMatches}
        formatDistProp={formatDist}
        formatElevProp={formatElev}
      />
    </Stack>
  );
}

export default React.memo(SegmentLibraryPanel);
