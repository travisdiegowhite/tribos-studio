import React, { useState } from 'react';
import { Card, Table, Text, Badge, Group, ActionIcon, Tooltip, TextInput, LoadingOverlay, Stack, Button } from '@mantine/core';
import { Eye, Edit, Trash2, Search, BarChart3, Repeat, ArrowRight, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';
import { useUnits } from '../utils/units';
import { supabase } from '../supabase';
import RideDetailModal from './RideDetailModal';

/**
 * Ride History Table Component
 * Displays user's ride history with metrics
 */
const RideHistoryTable = ({ rides, onAnalyzeRide }) => {
  const navigate = useNavigate();
  const { formatDistance, formatElevation } = useUnits();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [trackPoints, setTrackPoints] = useState([]);
  const [loadingTrackPoints, setLoadingTrackPoints] = useState(false);

  // Filter rides based on search
  const filteredRides = rides.filter(ride =>
    ride.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Load ride details and track points with proper handling for large datasets
  const handleViewRide = async (ride) => {
    setLoadingTrackPoints(true);
    try {
      // First, fetch the full route details
      const { data: routeData, error: routeError } = await supabase
        .from('routes')
        .select('*')
        .eq('id', ride.id)
        .single();

      if (routeError) {
        console.error('Error loading route details:', routeError);
        setSelectedRide(ride);
        setTrackPoints([]);
        setModalOpened(true);
        return;
      }

      // Then fetch ALL track points in batches (Supabase max is 1000 per request)
      // We use range() to paginate through all points
      let allTrackPoints = [];
      let from = 0;
      const batchSize = 1000; // Supabase limit is 1000 rows per request
      let hasMore = true;

      console.log(`📍 Loading track points for ${ride.name || 'route'}...`);

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('track_points')
          .select('latitude, longitude, elevation, time_seconds, distance_m, point_index')
          .eq('route_id', ride.id)
          .order('point_index', { ascending: true })
          .range(from, from + batchSize - 1);

        if (batchError) {
          console.error('Error loading track points batch:', batchError);
          break;
        }

        if (batch && batch.length > 0) {
          allTrackPoints = [...allTrackPoints, ...batch];
          console.log(`  ✓ Loaded batch ${Math.floor(from / batchSize) + 1}: ${batch.length} points (total: ${allTrackPoints.length})`);
          from += batchSize;

          // If we got less than batchSize, we've reached the end
          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // Process track points to format expected by RouteMap
      const trackPoints = allTrackPoints.map(point => ({
        lat: point.latitude,
        lng: point.longitude,
        elevation: point.elevation,
      }));

      console.log(`📍 Loaded ${trackPoints.length} track points for ride ${ride.name}`);

      setSelectedRide(routeData);
      setTrackPoints(trackPoints);
      setModalOpened(true);
    } catch (error) {
      console.error('Error loading route:', error);
      setSelectedRide(ride);
      setTrackPoints([]);
      setModalOpened(true);
    } finally {
      setLoadingTrackPoints(false);
    }
  };

  // Estimate TSS (simple approximation)
  const estimateTSS = (ride) => {
    // Use correct database field names
    const distanceKm = ride.distance_km || 0;
    const elevationM = ride.elevation_gain_m || 0;
    const durationSeconds = ride.duration_seconds || 3600; // Default 1 hour

    const baseTSS = (durationSeconds / 3600) * 50;
    const elevationFactor = (elevationM / 300) * 10;
    return Math.round(baseTSS + elevationFactor);
  };

  if (!rides || rides.length === 0) {
    return (
      <Card withBorder p="xl">
        <Text c="dimmed" ta="center">No rides recorded yet</Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="md" pos="relative">
      <LoadingOverlay visible={loadingTrackPoints} overlayProps={{ blur: 2 }} loaderProps={{ children: 'Loading ride details...' }} />
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={600}>Ride History ({filteredRides.length})</Text>
        <TextInput
          placeholder="Search rides..."
          leftSection={<Search size={14} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="xs"
          style={{ width: 200 }}
        />
      </Group>

      {filteredRides.length === 0 && searchQuery ? (
        <Text c="dimmed" ta="center" py="xl">
          No rides found matching "{searchQuery}"
        </Text>
      ) : isMobile ? (
        // Mobile card view
        <Stack gap="md">
          {filteredRides.map((ride) => {
            const displayDate = ride.recorded_at || ride.created_at;

            return (
              <Card key={ride.id} withBorder p="md" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
                <Group justify="space-between" mb="xs">
                  <Text fw={600} size="sm">{ride.name || 'Untitled Route'}</Text>
                  <Badge size="xs" color="gray" variant="light">
                    {formatDate(displayDate)}
                  </Badge>
                </Group>

                <Group gap="xl" mb="sm" grow>
                  <div>
                    <Text size="xs" c="dimmed">Distance</Text>
                    <Text fw={500} size="sm">{formatDistance(ride.distance_km || 0)}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Elevation</Text>
                    <Text fw={500} size="sm">+{formatElevation(ride.elevation_gain_m || 0)}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Duration</Text>
                    <Text fw={500} size="sm">{formatDuration(ride.duration_seconds)}</Text>
                  </div>
                </Group>

                <Group gap="xs" mb="sm">
                  <Badge color="blue" variant="light" size="sm">
                    {estimateTSS(ride)} TSS
                  </Badge>
                  <Badge
                    color={
                      ride.route_type === 'loop' ? 'green' :
                      ride.route_type === 'point-to-point' ? 'blue' : 'gray'
                    }
                    variant="light"
                    size="sm"
                    leftSection={
                      ride.route_type === 'loop' ? <Repeat size={12} /> :
                      ride.route_type === 'point-to-point' ? <ArrowRight size={12} /> :
                      <Circle size={12} />
                    }
                  >
                    {ride.route_type === 'loop' ? 'Loop' :
                     ride.route_type === 'point-to-point' ? 'Point-to-Point' :
                     ride.route_type || 'Route'}
                  </Badge>
                </Group>

                <Group gap="xs" mt="md">
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<Eye size={16} />}
                    onClick={() => handleViewRide(ride)}
                    flex={1}
                  >
                    View
                  </Button>
                  {ride.average_watts && onAnalyzeRide && (
                    <Button
                      variant="light"
                      size="xs"
                      color="blue"
                      leftSection={<BarChart3 size={16} />}
                      onClick={() => onAnalyzeRide(ride)}
                      flex={1}
                    >
                      Analyze
                    </Button>
                  )}
                  <ActionIcon
                    variant="light"
                    size="lg"
                    onClick={() => navigate(`/studio?routeId=${ride.id}`)}
                    aria-label={`Edit ${ride.name || 'route'} in route studio`}
                  >
                    <Edit size={18} />
                  </ActionIcon>
                </Group>
              </Card>
            );
          })}
        </Stack>
      ) : (
        // Desktop table view
        <div style={{ overflowX: 'auto' }}>
          <Table
            striped
            highlightOnHover
            styles={{
              table: {
                '--table-striped-color': 'rgba(16, 185, 129, 0.05)', // Very light green
                '--table-hover-color': 'rgba(16, 185, 129, 0.1)', // Slightly darker green on hover
              }
            }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Distance</Table.Th>
                <Table.Th>Elevation</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>Est. TSS</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRides.map((ride) => {
              // Use recorded_at (actual activity date) or fall back to created_at
              const displayDate = ride.recorded_at || ride.created_at;

              return (
              <Table.Tr key={ride.id}>
                <Table.Td>
                  <Text size="xs">{formatDate(displayDate)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>{ride.name || 'Untitled Route'}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDistance(ride.distance_km || 0)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">+{formatElevation(ride.elevation_gain_m || 0)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDuration(ride.duration_seconds)}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color="blue" variant="light" size="sm">
                    {estimateTSS(ride)} TSS
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      ride.route_type === 'loop' ? 'green' :
                      ride.route_type === 'point-to-point' ? 'blue' : 'gray'
                    }
                    variant="light"
                    size="sm"
                    leftSection={
                      ride.route_type === 'loop' ? <Repeat size={12} /> :
                      ride.route_type === 'point-to-point' ? <ArrowRight size={12} /> :
                      <Circle size={12} />
                    }
                  >
                    {ride.route_type === 'loop' ? 'Loop' :
                     ride.route_type === 'point-to-point' ? 'Point-to-Point' :
                     ride.route_type || 'Route'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="View route">
                      <ActionIcon
                        size="lg"
                        variant="subtle"
                        onClick={() => handleViewRide(ride)}
                        aria-label={`View route map for ${ride.name || 'ride'}`}
                      >
                        <Eye size={18} />
                      </ActionIcon>
                    </Tooltip>
                    {ride.average_watts && onAnalyzeRide && (
                      <Tooltip label="Analyze ride">
                        <ActionIcon
                          size="lg"
                          variant="subtle"
                          color="blue"
                          onClick={() => onAnalyzeRide(ride)}
                          aria-label={`Analyze power data for ${ride.name || 'ride'}`}
                        >
                          <BarChart3 size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Edit route">
                      <ActionIcon
                        size="lg"
                        variant="subtle"
                        onClick={() => navigate(`/studio?routeId=${ride.id}`)}
                        aria-label={`Edit ${ride.name || 'route'} in route studio`}
                      >
                        <Edit size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
              );
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* End of mobile/desktop conditional rendering */}

      {/* Ride Detail Modal */}
      <RideDetailModal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setSelectedRide(null);
          setTrackPoints([]);
        }}
        route={selectedRide}
        trackPoints={trackPoints}
      />
    </Card>
  );
};

export default RideHistoryTable;
