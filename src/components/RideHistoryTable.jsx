import React, { useState } from 'react';
import {
  Card,
  Table,
  Text,
  Badge,
  Group,
  ActionIcon,
  Tooltip,
  TextInput,
  Stack,
  Button,
  Select,
} from '@mantine/core';
import { IconSearch, IconEye, IconChartBar, IconChevronRight, IconFilter } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';

/**
 * Ride History Table Component
 * Displays user's ride history with metrics and filtering
 */
const RideHistoryTable = ({
  rides,
  onViewRide,
  onAnalyzeRide,
  formatDistance,
  formatElevation,
  maxRows = 10,
}) => {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');

  // Helper functions to handle both data formats
  const getDistance = (r) => r.distance_km || (r.distance ? r.distance / 1000 : 0);
  const getElevation = (r) => r.elevation_gain_m || r.total_elevation_gain || 0;
  const getDuration = (r) => r.duration_seconds || r.moving_time || r.elapsed_time || 0;
  const getPower = (r) => r.average_watts || 0;
  const getDate = (r) => r.recorded_at || r.start_date || r.created_at;
  const getName = (r) => r.name || 'Untitled Ride';

  // Filter rides
  const filteredRides = rides.filter(ride => {
    const matchesSearch = getName(ride).toLowerCase().includes(searchQuery.toLowerCase());

    if (timeFilter === 'all') return matchesSearch;

    const rideDate = new Date(getDate(ride));
    const now = new Date();
    const daysDiff = (now - rideDate) / (1000 * 60 * 60 * 24);

    switch (timeFilter) {
      case '7d': return matchesSearch && daysDiff <= 7;
      case '30d': return matchesSearch && daysDiff <= 30;
      case '90d': return matchesSearch && daysDiff <= 90;
      default: return matchesSearch;
    }
  }).slice(0, maxRows);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Estimate TSS
  const estimateTSS = (ride) => {
    const distanceKm = getDistance(ride);
    const elevationM = getElevation(ride);
    const durationSeconds = getDuration(ride) || 3600;
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
    <Card withBorder p="md">
      <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
        <Text size="sm" fw={600}>Ride History</Text>
        <Group gap="xs" wrap="wrap">
          <Select
            size="xs"
            value={timeFilter}
            onChange={setTimeFilter}
            data={[
              { value: 'all', label: 'All Time' },
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
              { value: '90d', label: 'Last 90 Days' },
            ]}
            leftSection={<IconFilter size={12} />}
            w={{ base: 'auto', sm: 130 }}
          />
          <TextInput
            placeholder="Search..."
            leftSection={<IconSearch size={14} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="xs"
            w={{ base: '100%', xs: 'auto', sm: 150 }}
          />
        </Group>
      </Group>

      {filteredRides.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          No rides found {searchQuery && `matching "${searchQuery}"`}
        </Text>
      ) : isMobile ? (
        // Mobile card view
        <Stack gap="sm">
          {filteredRides.map((ride) => (
            <Card
              key={ride.id}
              withBorder
              p="sm"
              style={{ backgroundColor: 'var(--mantine-color-dark-6)', cursor: 'pointer' }}
              onClick={() => onViewRide?.(ride)}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1 }}>
                  {getName(ride)}
                </Text>
                <Badge size="xs" color="gray" variant="light">
                  {formatDate(getDate(ride))}
                </Badge>
              </Group>

              <Group gap="lg" mb="xs">
                <div>
                  <Text size="xs" c="dimmed">Distance</Text>
                  <Text fw={500} size="sm">{formatDistance(getDistance(ride))}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Elevation</Text>
                  <Text fw={500} size="sm">+{formatElevation(getElevation(ride))}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Time</Text>
                  <Text fw={500} size="sm">{formatDuration(getDuration(ride))}</Text>
                </div>
              </Group>

              <Group gap="xs">
                <Badge color="blue" variant="light" size="sm">
                  {estimateTSS(ride)} TSS
                </Badge>
                {getPower(ride) > 0 && (
                  <Badge color="yellow" variant="light" size="sm">
                    {Math.round(getPower(ride))}W
                  </Badge>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      ) : (
        // Desktop table
        <div style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Distance</Table.Th>
                <Table.Th>Elevation</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>TSS</Table.Th>
                <Table.Th>Power</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRides.map((ride) => (
                <Table.Tr key={ride.id}>
                  <Table.Td>
                    <Text size="xs">{formatDate(getDate(ride))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500} lineClamp={1} maw={200}>
                      {getName(ride)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDistance(getDistance(ride))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">+{formatElevation(getElevation(ride))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDuration(getDuration(ride))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="blue" variant="light" size="sm">
                      {estimateTSS(ride)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {getPower(ride) > 0 ? (
                      <Text size="sm">{Math.round(getPower(ride))}W</Text>
                    ) : (
                      <Text size="sm" c="dimmed">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="View ride">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => onViewRide?.(ride)}
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                      {getPower(ride) > 0 && onAnalyzeRide && (
                        <Tooltip label="Analyze">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="blue"
                            onClick={() => onAnalyzeRide(ride)}
                          >
                            <IconChartBar size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {rides.length > maxRows && (
        <Button
          variant="subtle"
          fullWidth
          mt="sm"
          rightSection={<IconChevronRight size={16} />}
          onClick={() => navigate('/training?tab=history')}
        >
          View all {rides.length} rides
        </Button>
      )}
    </Card>
  );
};

export default RideHistoryTable;
