import { useMemo } from 'react';
import {
  Modal,
  Text,
  Group,
  Badge,
  Box,
  Stack,
  Paper,
  SimpleGrid,
  ThemeIcon,
  Divider,
  Button,
  Tooltip,
} from '@mantine/core';
import {
  IconRoute,
  IconMountain,
  IconClock,
  IconBolt,
  IconHeart,
  IconFlame,
  IconMapOff,
  IconRefresh,
  IconBrandStrava,
  IconDeviceWatch,
  IconGauge,
} from '@tabler/icons-react';
import {
  estimateNormalizedPower,
  calculateIF,
  calculateVI,
  calculateTSSFromPower,
  getIFZone,
} from './ActivityMetrics.jsx';
import { ViewOnStravaLink, PoweredByStrava, StravaLogo } from './StravaBranding';
import { FuelCard } from './fueling';
import ActivityPowerCurve from './ActivityPowerCurve';
import ColoredRouteMap from './ColoredRouteMap';

// FIT protocol uses 0xFFFF (65535) for "no data" - must filter before display
const MAX_VALID_POWER_WATTS = 2500;
const MAX_VALID_HR_BPM = 250;

/**
 * Decode a Google-encoded polyline string to coordinates
 */
function decodePolyline(encoded) {
  if (!encoded) return [];

  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

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

/**
 * Calculate bounds for fitting map to route
 */
function calculateBounds(coords) {
  if (!coords || coords.length === 0) return null;

  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  // Add padding
  const lngPad = (maxLng - minLng) * 0.1 || 0.01;
  const latPad = (maxLat - minLat) * 0.1 || 0.01;

  return [
    [minLng - lngPad, minLat - latPad],
    [maxLng + lngPad, maxLat + latPad],
  ];
}

/**
 * Estimate TSS from ride data when power is not available
 */
function estimateTSS(durationMinutes, distanceKm, elevationM, intensity = 'endurance') {
  // Base TSS estimation: 1 hour of endurance riding = 50 TSS
  const baseTSSPerHour = {
    recovery: 30,
    endurance: 50,
    tempo: 70,
    threshold: 90,
    vo2max: 120,
  };

  const baseRate = baseTSSPerHour[intensity] || 50;
  const hours = durationMinutes / 60;

  // Elevation factor: +10 TSS per 300m climbing
  const elevationFactor = elevationM ? (elevationM / 300) * 10 : 0;

  return Math.round(hours * baseRate + elevationFactor);
}

/**
 * RideAnalysisModal Component
 * Displays comprehensive ride analysis with map, metrics, and power data
 */
const RideAnalysisModal = ({
  opened,
  onClose,
  ride,
  ftp,
  weight,
  formatDistance,
  formatElevation,
  formatSpeed,
  onBackfillGps,
  isBackfilling = false,
}) => {
  // Extract polyline from various possible locations
  const polyline = useMemo(() => {
    if (!ride) return null;
    return (
      ride.map_summary_polyline ||
      ride.summary_polyline ||
      ride.polyline ||
      ride.map?.summary_polyline
    );
  }, [ride]);

  // Decode polyline to coordinates
  const routeCoords = useMemo(() => {
    return decodePolyline(polyline);
  }, [polyline]);

  // Calculate map bounds
  const bounds = useMemo(() => {
    return calculateBounds(routeCoords);
  }, [routeCoords]);

  // Build GeoJSON for the route
  const routeGeoJSON = useMemo(() => {
    if (routeCoords.length === 0) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeCoords,
      },
    };
  }, [routeCoords]);

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!ride) return null;

    const distance = ride.distance ? ride.distance / 1000 : ride.distance_km || 0;
    const elevation = ride.total_elevation_gain || ride.elevation_gain_m || 0;
    const duration = ride.moving_time || ride.duration_seconds || ride.elapsed_time || 0;
    const avgPower = ride.average_watts || 0;
    const rawMaxPower = ride.max_watts || 0;
    const rawAvgHR = ride.average_heartrate || 0;
    const rawMaxHR = ride.max_heartrate || 0;
    const avgCadence = ride.average_cadence || 0;
    const rawKilojoules = ride.kilojoules || 0;

    // Sanitize FIT sentinel values (0xFFFF = 65535 means "no data")
    const maxPower = rawMaxPower > 0 && rawMaxPower < MAX_VALID_POWER_WATTS ? rawMaxPower : 0;
    const maxPowerCorrupted = rawMaxPower >= MAX_VALID_POWER_WATTS;
    const avgHR = rawAvgHR > 0 && rawAvgHR < MAX_VALID_HR_BPM ? rawAvgHR : 0;
    const maxHR = rawMaxHR > 0 && rawMaxHR < MAX_VALID_HR_BPM ? rawMaxHR : 0;

    // Sanitize kilojoules: if stored value looks like metabolic energy (> 2x mechanical work), recalculate
    const mechanicalWork = avgPower > 0 && duration > 0 ? Math.round(avgPower * duration / 1000) : 0;
    const kilojoules = rawKilojoules > 0 && mechanicalWork > 0 && rawKilojoules > mechanicalWork * 2
      ? mechanicalWork
      : rawKilojoules;

    // Power metrics - prefer stored values from FIT parser (calculated from actual power stream)
    // BUT if max_power was a sentinel, stored NP/IF/TSS are also corrupted (calculated from unfiltered stream)
    // Fall back to client-side estimation from avg/max power
    let np = null, intensityFactor = null, vi = null, powerTSS = null, ifZone = null;
    if (avgPower > 0) {
      np = (!maxPowerCorrupted && ride.normalized_power) || estimateNormalizedPower(avgPower, maxPower);
      intensityFactor = (!maxPowerCorrupted && ride.intensity_factor) || calculateIF(np, ftp);
      vi = calculateVI(np, avgPower);
      powerTSS = (!maxPowerCorrupted && ride.tss) || calculateTSSFromPower(duration, np, ftp);
      ifZone = getIFZone(intensityFactor);
    }

    // Estimate TSS if no power data
    const estimatedTSS = !avgPower
      ? estimateTSS(duration / 60, distance, elevation)
      : null;

    // Speed
    const avgSpeed = duration > 0 ? (distance / (duration / 3600)) : 0;

    // Power data source indicators
    const deviceWatts = ride.device_watts === true;
    const hasRealNP = !maxPowerCorrupted && !!ride.normalized_power;
    const powerCurveSummary = ride.power_curve_summary;
    const hasPowerCurve = powerCurveSummary && typeof powerCurveSummary === 'object'
      && Object.keys(powerCurveSummary).length > 0;

    return {
      distance,
      elevation,
      duration,
      avgPower,
      maxPower,
      avgHR,
      maxHR,
      avgCadence,
      kilojoules,
      np,
      intensityFactor,
      vi,
      powerTSS,
      ifZone,
      estimatedTSS,
      avgSpeed,
      deviceWatts,
      hasRealNP,
      powerCurveSummary,
      hasPowerCurve,
    };
  }, [ride, ftp]);

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Provider info
  const getProviderInfo = () => {
    if (!ride) return null;
    const provider = ride.provider?.toLowerCase();

    if (provider === 'strava') {
      return { icon: StravaLogo, color: '#FC4C02', name: 'Strava' };
    }
    if (provider === 'garmin') {
      return { icon: IconDeviceWatch, color: '#007dcd', name: 'Garmin' };
    }
    return { icon: IconActivity, color: 'gray', name: provider || 'Manual' };
  };

  const providerInfo = getProviderInfo();

  if (!ride) return null;

  const hasGpsData = routeCoords.length > 0;
  const hasPowerData = metrics?.avgPower > 0;
  const hasHRData = metrics?.avgHR > 0;
  const isGarminRide = ride.provider?.toLowerCase() === 'garmin';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <ThemeIcon size="lg" color="lime" variant="light">
            <IconRoute size={18} />
          </ThemeIcon>
          <Box>
            <Text fw={600} size="lg" lineClamp={1}>
              {ride.name || 'Untitled Ride'}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDate(ride.start_date || ride.recorded_at)}
            </Text>
          </Box>
        </Group>
      }
      size="xl"
      padding="lg"
    >
      <Stack gap="md">
        {/* Route Map */}
        {hasGpsData ? (
          <ColoredRouteMap
            activityStreams={ride.activity_streams}
            routeCoords={routeCoords}
            routeGeoJSON={routeGeoJSON}
            bounds={bounds}
          />
        ) : (
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            <Box
              p="xl"
              ta="center"
              style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}
            >
              <IconMapOff size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Text c="dimmed" size="sm">
                No GPS data available for this ride
              </Text>
              {isGarminRide && onBackfillGps && (
                <Button
                  variant="light"
                  color="blue"
                  size="xs"
                  mt="sm"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => onBackfillGps(ride)}
                  loading={isBackfilling}
                >
                  Try to fetch GPS data
                </Button>
              )}
            </Box>
          </Paper>
        )}

        {/* Key Metrics */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Paper p="md" withBorder ta="center">
            <ThemeIcon size="lg" variant="light" color="blue" mb="xs">
              <IconRoute size={18} />
            </ThemeIcon>
            <Text size="xl" fw={700}>
              {formatDistance ? formatDistance(metrics?.distance) : `${metrics?.distance?.toFixed(1)} km`}
            </Text>
            <Text size="xs" c="dimmed">Distance</Text>
          </Paper>

          <Paper p="md" withBorder ta="center">
            <ThemeIcon size="lg" variant="light" color="orange" mb="xs">
              <IconMountain size={18} />
            </ThemeIcon>
            <Text size="xl" fw={700}>
              {formatElevation ? formatElevation(metrics?.elevation) : `${Math.round(metrics?.elevation || 0)}m`}
            </Text>
            <Text size="xs" c="dimmed">Elevation</Text>
          </Paper>

          <Paper p="md" withBorder ta="center">
            <ThemeIcon size="lg" variant="light" color="cyan" mb="xs">
              <IconClock size={18} />
            </ThemeIcon>
            <Text size="xl" fw={700}>
              {formatDuration(metrics?.duration)}
            </Text>
            <Text size="xs" c="dimmed">Duration</Text>
          </Paper>

          <Paper p="md" withBorder ta="center">
            <ThemeIcon size="lg" variant="light" color="lime" mb="xs">
              <IconFlame size={18} />
            </ThemeIcon>
            <Text size="xl" fw={700}>
              {metrics?.powerTSS || metrics?.estimatedTSS || '-'}
            </Text>
            <Text size="xs" c="dimmed">
              TSS {!hasPowerData && '(est.)'}
            </Text>
          </Paper>
        </SimpleGrid>

        {/* Power Analysis Section */}
        {hasPowerData && (
          <>
            <Divider
              label={
                <Group gap="xs">
                  <Text size="sm">Power Analysis</Text>
                  {metrics.deviceWatts && (
                    <Badge size="xs" color="lime" variant="light" leftSection={<IconGauge size={10} />}>
                      Power Meter
                    </Badge>
                  )}
                </Group>
              }
              labelPosition="center"
            />
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
              <Paper p="sm" withBorder>
                <Group justify="space-between">
                  <Box>
                    <Text size="xs" c="dimmed">Avg Power</Text>
                    <Group gap={4} align="baseline">
                      <Text fw={600}>{Math.round(metrics.avgPower)}W</Text>
                      {weight > 0 && (
                        <Text size="xs" c="dimmed">
                          {(metrics.avgPower / weight).toFixed(1)} W/kg
                        </Text>
                      )}
                    </Group>
                  </Box>
                  <IconBolt size={20} style={{ color: 'var(--tribos-lime)' }} />
                </Group>
              </Paper>

              {metrics.np && (
                <Paper p="sm" withBorder>
                  <Tooltip label={metrics.hasRealNP
                    ? 'Normalized Power — calculated from power meter stream'
                    : 'Normalized Power — estimated from avg/max power'
                  }>
                    <Box>
                      <Group gap={4} align="center">
                        <Text size="xs" c="dimmed">NP</Text>
                        {!metrics.hasRealNP && (
                          <Badge size="xs" variant="light" color="gray">est.</Badge>
                        )}
                      </Group>
                      <Group gap={4} align="baseline">
                        <Text fw={600}>{metrics.np}W</Text>
                        {weight > 0 && (
                          <Text size="xs" c="dimmed">
                            {(metrics.np / weight).toFixed(1)} W/kg
                          </Text>
                        )}
                      </Group>
                    </Box>
                  </Tooltip>
                </Paper>
              )}

              {metrics.intensityFactor && ftp && (
                <Paper p="sm" withBorder>
                  <Tooltip label={`Intensity Factor — ${metrics.ifZone?.name || ''}`}>
                    <Box>
                      <Text size="xs" c="dimmed">IF</Text>
                      <Group gap="xs">
                        <Text fw={600}>{metrics.intensityFactor}</Text>
                        {metrics.ifZone && (
                          <Badge size="xs" color={metrics.ifZone.color} variant="light">
                            {metrics.ifZone.name}
                          </Badge>
                        )}
                      </Group>
                    </Box>
                  </Tooltip>
                </Paper>
              )}

              {metrics.vi && (
                <Paper p="sm" withBorder>
                  <Tooltip label="Variability Index — NP / Avg Power">
                    <Box>
                      <Text size="xs" c="dimmed">VI</Text>
                      <Text fw={600}>{metrics.vi}</Text>
                    </Box>
                  </Tooltip>
                </Paper>
              )}

              {metrics.kilojoules > 0 && (
                <Paper p="sm" withBorder>
                  <Tooltip label="Total mechanical work output">
                    <Box>
                      <Text size="xs" c="dimmed">Work</Text>
                      <Text fw={600}>{Math.round(metrics.kilojoules)} kJ</Text>
                    </Box>
                  </Tooltip>
                </Paper>
              )}

              {metrics.maxPower > 0 && (
                <Paper p="sm" withBorder>
                  <Box>
                    <Text size="xs" c="dimmed">Max Power</Text>
                    <Group gap={4} align="baseline">
                      <Text fw={600}>{Math.round(metrics.maxPower)}W</Text>
                      {weight > 0 && (
                        <Text size="xs" c="dimmed">
                          {(metrics.maxPower / weight).toFixed(1)} W/kg
                        </Text>
                      )}
                    </Group>
                  </Box>
                </Paper>
              )}
            </SimpleGrid>

            {/* Per-Activity Power Curve (MMP) — only shown when FIT file data is available */}
            {metrics.hasPowerCurve && (
              <ActivityPowerCurve
                powerCurveSummary={metrics.powerCurveSummary}
                ftp={ftp}
                weight={weight}
              />
            )}
          </>
        )}

        {/* Heart Rate Section */}
        {hasHRData && (
          <>
            <Divider label="Heart Rate" labelPosition="center" />
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
              <Paper p="sm" withBorder>
                <Group justify="space-between">
                  <Box>
                    <Text size="xs" c="dimmed">Avg HR</Text>
                    <Text fw={600}>{Math.round(metrics.avgHR)} bpm</Text>
                  </Box>
                  <IconHeart size={20} style={{ color: '#ff6b6b' }} />
                </Group>
              </Paper>

              {metrics.maxHR > 0 && (
                <Paper p="sm" withBorder>
                  <Box>
                    <Text size="xs" c="dimmed">Max HR</Text>
                    <Text fw={600}>{Math.round(metrics.maxHR)} bpm</Text>
                  </Box>
                </Paper>
              )}

              {metrics.avgCadence > 0 && (
                <Paper p="sm" withBorder>
                  <Box>
                    <Text size="xs" c="dimmed">Avg Cadence</Text>
                    <Text fw={600}>{Math.round(metrics.avgCadence)} rpm</Text>
                  </Box>
                </Paper>
              )}

              {metrics.avgSpeed > 0 && (
                <Paper p="sm" withBorder>
                  <Box>
                    <Text size="xs" c="dimmed">Avg Speed</Text>
                    <Text fw={600}>{formatSpeed ? formatSpeed(metrics.avgSpeed) : `${metrics.avgSpeed.toFixed(1)} km/h`}</Text>
                  </Box>
                </Paper>
              )}
            </SimpleGrid>
          </>
        )}

        {/* Retrospective Fuel Analysis - for rides 60+ minutes */}
        {metrics?.duration >= 3600 && (
          <>
            <Divider label="Fuel Analysis" labelPosition="center" />
            <FuelCard
              activity={{
                movingTimeSeconds: metrics.duration,
                averageWatts: metrics.avgPower || undefined,
                kilojoules: metrics.kilojoules || undefined,
                totalElevationGain: metrics.elevation || undefined,
              }}
              retrospective={true}
              compact={true}
              showPlainEnglish={true}
              useImperial={!!formatDistance}
            />
          </>
        )}

        {/* Activity Info Footer */}
        <Divider />
        <Group justify="space-between">
          <Group gap="xs">
            {providerInfo && (
              <Badge
                variant="light"
                color={providerInfo.color === '#FC4C02' ? 'orange' : 'blue'}
                leftSection={
                  providerInfo.name === 'Strava' ? (
                    <StravaLogo size={12} />
                  ) : (
                    <IconDeviceWatch size={12} />
                  )
                }
              >
                {providerInfo.name}
              </Badge>
            )}
            {ride.type && (
              <Badge variant="light" color="gray">
                {ride.type}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {ride.provider === 'strava' && ride.provider_activity_id && (
              <ViewOnStravaLink activityId={ride.provider_activity_id} />
            )}
            <Button variant="light" color="gray" onClick={onClose}>
              Close
            </Button>
          </Group>
        </Group>

        {/* Strava attribution if applicable */}
        {ride.provider === 'strava' && (
          <Box pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByStrava variant="light" size="sm" />
          </Box>
        )}
      </Stack>
    </Modal>
  );
};

export default RideAnalysisModal;
