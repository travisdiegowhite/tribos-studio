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
  Switch,
  Box,
  Pagination,
} from '@mantine/core';
import { IconSearch, IconEye, IconChartBar, IconChevronRight, IconChevronLeft, IconFilter, IconEyeOff, IconEyeCheck, IconUpload, IconDeviceWatch, IconRoute } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';
import { ViewOnStravaLink, StravaLogo, PoweredByStrava, STRAVA_ORANGE } from './StravaBranding';

/**
 * Ride History Table Component
 * Displays user's ride history with metrics and filtering
 */
const RideHistoryTable = ({
  rides,
  onViewRide,
  onAnalyzeRide,
  onHideRide,
  formatDistance,
  formatElevation,
  maxRows = 10,
  pageSize = 25,
}) => {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Check if there are any hidden rides
  const hiddenCount = rides.filter(r => r.is_hidden).length;

  // Helper functions to handle both data formats
  const getDistance = (r) => r.distance_km || (r.distance ? r.distance / 1000 : 0);
  const getElevation = (r) => r.elevation_gain_m || r.total_elevation_gain || 0;
  const getDuration = (r) => r.duration_seconds || r.moving_time || r.elapsed_time || 0;
  const getPower = (r) => r.average_watts || 0;
  const getDate = (r) => r.recorded_at || r.start_date || r.created_at;
  const getName = (r) => r.name || 'Untitled Ride';
  const isFromStrava = (r) => r.provider === 'strava';
  const getStravaActivityId = (r) => r.provider === 'strava' ? r.provider_activity_id : null;
  const getProvider = (r) => r.provider || 'manual';

  // Get provider display info
  const getProviderInfo = (provider) => {
    switch (provider) {
      case 'strava':
        return { label: 'Strava', color: 'orange', icon: StravaLogo };
      case 'garmin':
        return { label: 'Garmin', color: 'blue', icon: IconDeviceWatch };
      case 'fit_upload':
        return { label: 'FIT Upload', color: 'cyan', icon: IconUpload };
      case 'gpx_upload':
        return { label: 'GPX Upload', color: 'green', icon: IconRoute };
      case 'manual':
      default:
        return { label: 'Manual', color: 'gray', icon: IconUpload };
    }
  };

  // Filter rides (without pagination slice)
  const allFilteredRides = rides.filter(ride => {
    // Filter by hidden status first
    if (!showHidden && ride.is_hidden) return false;
    if (showHidden && !ride.is_hidden) return false;

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
  });

  // Count visible (non-hidden) rides for the "View all" button
  const visibleRidesCount = rides.filter(r => !r.is_hidden).length;

  // Calculate pagination
  const totalFilteredCount = allFilteredRides.length;
  const totalPages = Math.ceil(totalFilteredCount / pageSize);

  // Apply pagination - use pageSize for pagination, maxRows as overall limit
  const effectiveMaxRows = maxRows === Infinity ? totalFilteredCount : maxRows;
  const paginatedRides = allFilteredRides
    .slice(0, effectiveMaxRows)
    .slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset to page 1 when filters change
  const handleFilterChange = (newFilter) => {
    setTimeFilter(newFilter);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleHiddenToggle = (e) => {
    setShowHidden(e.currentTarget.checked);
    setCurrentPage(1);
  };

  // Use paginatedRides for display
  const filteredRides = paginatedRides;

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';

    const dateYear = date.getFullYear();
    const currentYear = new Date().getFullYear();

    // Flag obviously wrong dates (before 2010 or more than 1 year in future)
    if (dateYear < 2010 || dateYear > currentYear + 1) {
      return 'Invalid';
    }

    // Show year if not current year
    if (dateYear === currentYear) {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });
    }
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
        <Group gap="sm">
          <Text size="sm" fw={600}>
            {showHidden ? 'Hidden Rides' : 'Ride History'}
          </Text>
          {hiddenCount > 0 && (
            <Switch
              size="xs"
              label={`Show hidden (${hiddenCount})`}
              checked={showHidden}
              onChange={handleHiddenToggle}
              styles={{ label: { fontSize: 11, color: 'var(--mantine-color-dimmed)' } }}
            />
          )}
        </Group>
        <Group gap="xs" wrap="wrap">
          <Select
            size="xs"
            value={timeFilter}
            onChange={handleFilterChange}
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
            onChange={handleSearchChange}
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
              style={{ backgroundColor: 'var(--tribos-card)', cursor: 'pointer' }}
              onClick={() => onViewRide?.(ride)}
            >
              <Group justify="space-between" mb="xs">
                <Group gap="xs" style={{ flex: 1 }}>
                  <Text fw={600} size="sm" lineClamp={1}>
                    {getName(ride)}
                  </Text>
                </Group>
                <Group gap="xs">
                  {(() => {
                    const provider = getProvider(ride);
                    const info = getProviderInfo(provider);
                    const IconComponent = info.icon;
                    return (
                      <Badge
                        size="xs"
                        color={info.color}
                        variant="light"
                        leftSection={
                          provider === 'strava' ? (
                            <StravaLogo size={10} />
                          ) : (
                            <IconComponent size={10} />
                          )
                        }
                      >
                        {info.label}
                      </Badge>
                    );
                  })()}
                  <Badge size="xs" color="gray" variant="light">
                    {formatDate(getDate(ride))}
                  </Badge>
                </Group>
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

              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <Badge color="blue" variant="light" size="sm">
                    {estimateTSS(ride)} TSS
                  </Badge>
                  {getPower(ride) > 0 && (
                    <Badge color="yellow" variant="light" size="sm">
                      {Math.round(getPower(ride))}W
                    </Badge>
                  )}
                  {getStravaActivityId(ride) && (
                    <Box onClick={(e) => e.stopPropagation()}>
                      <ViewOnStravaLink activityId={getStravaActivityId(ride)} />
                    </Box>
                  )}
                </Group>
                {onHideRide && (
                  <Tooltip label={ride.is_hidden ? 'Restore ride' : 'Hide ride'}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={ride.is_hidden ? 'green' : 'gray'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onHideRide(ride);
                      }}
                    >
                      {ride.is_hidden ? <IconEyeCheck size={16} /> : <IconEyeOff size={16} />}
                    </ActionIcon>
                  </Tooltip>
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
                <Table.Th>Source</Table.Th>
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
                    <Text size="sm" fw={500} lineClamp={1} maw={180}>
                      {getName(ride)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {(() => {
                      const provider = getProvider(ride);
                      const info = getProviderInfo(provider);
                      const IconComponent = info.icon;
                      return (
                        <Tooltip label={info.label}>
                          <Badge
                            size="xs"
                            color={info.color}
                            variant="light"
                            leftSection={
                              provider === 'strava' ? (
                                <StravaLogo size={10} />
                              ) : (
                                <IconComponent size={10} />
                              )
                            }
                          >
                            {info.label}
                          </Badge>
                        </Tooltip>
                      );
                    })()}
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
                      {getStravaActivityId(ride) && (
                        <ViewOnStravaLink activityId={getStravaActivityId(ride)} />
                      )}
                      {onHideRide && (
                        <Tooltip label={ride.is_hidden ? 'Restore ride' : 'Hide ride'}>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color={ride.is_hidden ? 'green' : 'gray'}
                            onClick={() => onHideRide(ride)}
                          >
                            {ride.is_hidden ? <IconEyeCheck size={16} /> : <IconEyeOff size={16} />}
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

      {/* Pagination controls - show when there are multiple pages */}
      {totalPages > 1 && maxRows === Infinity && (
        <Group justify="space-between" align="center" mt="md" pt="sm" style={{ borderTop: '1px solid var(--tribos-border-default)' }}>
          <Text size="xs" c="dimmed">
            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalFilteredCount)} of {totalFilteredCount} rides
          </Text>
          <Pagination
            size="sm"
            total={totalPages}
            value={currentPage}
            onChange={setCurrentPage}
            withEdges
          />
        </Group>
      )}

      {/* "View all rides" button - only show on limited-view pages (not the history tab) */}
      {visibleRidesCount > maxRows && maxRows !== Infinity && !showHidden && (
        <Button
          variant="subtle"
          fullWidth
          mt="sm"
          rightSection={<IconChevronRight size={16} />}
          onClick={() => navigate('/training?tab=history')}
        >
          View all {visibleRidesCount} rides
        </Button>
      )}

      {/* Strava Attribution - show if any rides are from Strava */}
      {filteredRides.some(r => isFromStrava(r)) && (
        <Box mt="sm" pt="sm" style={{ borderTop: '1px solid var(--tribos-border-default)' }}>
          <PoweredByStrava variant="light" size="sm" />
        </Box>
      )}
    </Card>
  );
};

export default RideHistoryTable;
