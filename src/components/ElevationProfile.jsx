import { useState, useEffect, useMemo } from 'react';
import { Card, Text, Group, Skeleton, Stack, Box } from '@mantine/core';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { tokens } from '../theme';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Fetch elevation data for a set of coordinates using Mapbox Tilequery API
 * Samples the route at regular intervals to avoid too many API calls
 */
async function fetchElevationData(coordinates, maxPoints = 100) {
  if (!MAPBOX_TOKEN || !coordinates || coordinates.length < 2) {
    return null;
  }

  // Sample coordinates at regular intervals if there are too many points
  const step = Math.max(1, Math.floor(coordinates.length / maxPoints));
  const sampledCoords = [];
  for (let i = 0; i < coordinates.length; i += step) {
    sampledCoords.push(coordinates[i]);
  }
  // Always include the last point
  if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
    sampledCoords.push(coordinates[coordinates.length - 1]);
  }

  try {
    // Fetch elevation for each sampled point using Mapbox Tilequery
    const elevationPromises = sampledCoords.map(async ([lng, lat], index) => {
      // Use Mapbox Terrain-DEM tileset for elevation
      const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${lng},${lat}.json?layers=contour&access_token=${MAPBOX_TOKEN}`;

      try {
        const response = await fetch(url);
        if (!response.ok) return { index, elevation: null };

        const data = await response.json();
        // Get the closest contour elevation
        if (data.features && data.features.length > 0) {
          // Find the feature with elevation data
          const elevFeature = data.features.find(f => f.properties?.ele !== undefined);
          return {
            index,
            lng,
            lat,
            elevation: elevFeature?.properties?.ele || null
          };
        }
        return { index, lng, lat, elevation: null };
      } catch {
        return { index, lng, lat, elevation: null };
      }
    });

    const results = await Promise.all(elevationPromises);
    return results;
  } catch (error) {
    console.error('Error fetching elevation data:', error);
    return null;
  }
}

/**
 * Calculate cumulative distance along a route
 */
function calculateDistances(coordinates) {
  const distances = [0];
  let totalDistance = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];

    // Haversine formula for distance
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const segmentDistance = R * c;

    totalDistance += segmentDistance;
    distances.push(totalDistance);
  }

  return distances;
}

/**
 * Generate synthetic elevation data based on total elevation gain
 * Used as fallback when API elevation is unavailable
 */
function generateSyntheticElevation(coordinates, totalElevationGain, distances) {
  if (!coordinates || coordinates.length < 2) return null;

  const totalDistance = distances[distances.length - 1];
  const points = [];
  const baseElevation = 100; // Starting elevation in meters

  // Create a simple wave pattern that accumulates to the total elevation gain
  const numWaves = Math.max(1, Math.floor(totalDistance / 10)); // One wave per ~10km

  for (let i = 0; i < coordinates.length; i++) {
    const progress = distances[i] / totalDistance;
    // Create undulating terrain
    const waveElevation = Math.sin(progress * numWaves * Math.PI) * (totalElevationGain / (numWaves * 2));
    const trendElevation = progress * (totalElevationGain / 2);

    points.push({
      distance: distances[i],
      elevation: Math.round(baseElevation + waveElevation + trendElevation),
      lng: coordinates[i][0],
      lat: coordinates[i][1],
    });
  }

  return points;
}

/**
 * ElevationProfile Component
 * Displays an elevation profile chart for a route
 */
const ElevationProfile = ({
  coordinates,
  elevationGain = 0,
  isImperial = false,
  height = 150,
  showStats = true
}) => {
  const [elevationData, setElevationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Unit conversion helpers
  const toDisplayElevation = (meters) => isImperial ? Math.round(meters * 3.28084) : Math.round(meters);
  const toDisplayDistance = (km) => isImperial ? (km * 0.621371).toFixed(1) : km.toFixed(1);
  const elevationUnit = isImperial ? 'ft' : 'm';
  const distanceUnit = isImperial ? 'mi' : 'km';

  // Calculate distances once
  const distances = useMemo(() => {
    if (!coordinates || coordinates.length < 2) return [];
    return calculateDistances(coordinates);
  }, [coordinates]);

  // Fetch or generate elevation data
  useEffect(() => {
    if (!coordinates || coordinates.length < 2) {
      setElevationData(null);
      return;
    }

    const loadElevation = async () => {
      setLoading(true);
      setError(null);

      try {
        // First try to fetch real elevation data
        const apiData = await fetchElevationData(coordinates, 50);

        if (apiData && apiData.some(p => p.elevation !== null)) {
          // We have some real elevation data
          const validPoints = apiData.filter(p => p.elevation !== null);

          // Interpolate missing values and map to distances
          const points = [];
          let lastValidElevation = validPoints[0]?.elevation || 100;

          for (let i = 0; i < apiData.length; i++) {
            const elevation = apiData[i].elevation ?? lastValidElevation;
            if (apiData[i].elevation !== null) {
              lastValidElevation = elevation;
            }

            // Find corresponding distance index
            const step = Math.max(1, Math.floor(coordinates.length / 100));
            const coordIndex = Math.min(i * step, coordinates.length - 1);

            points.push({
              distance: distances[coordIndex],
              elevation,
              lng: coordinates[coordIndex][0],
              lat: coordinates[coordIndex][1],
            });
          }

          setElevationData(points);
        } else {
          // Fall back to synthetic data
          const synthetic = generateSyntheticElevation(coordinates, elevationGain || 100, distances);
          setElevationData(synthetic);
        }
      } catch (err) {
        console.error('Error loading elevation:', err);
        setError('Failed to load elevation data');
        // Still show synthetic data on error
        const synthetic = generateSyntheticElevation(coordinates, elevationGain || 100, distances);
        setElevationData(synthetic);
      } finally {
        setLoading(false);
      }
    };

    loadElevation();
  }, [coordinates, elevationGain, distances]);

  // Calculate stats from elevation data
  const stats = useMemo(() => {
    if (!elevationData || elevationData.length < 2) return null;

    let gain = 0;
    let loss = 0;
    let minElevation = elevationData[0].elevation;
    let maxElevation = elevationData[0].elevation;

    for (let i = 1; i < elevationData.length; i++) {
      const diff = elevationData[i].elevation - elevationData[i - 1].elevation;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);

      minElevation = Math.min(minElevation, elevationData[i].elevation);
      maxElevation = Math.max(maxElevation, elevationData[i].elevation);
    }

    return {
      gain: Math.round(gain),
      loss: Math.round(loss),
      min: Math.round(minElevation),
      max: Math.round(maxElevation),
    };
  }, [elevationData]);

  // Chart data formatted for display
  const chartData = useMemo(() => {
    if (!elevationData) return [];

    return elevationData.map(point => ({
      ...point,
      displayDistance: toDisplayDistance(point.distance),
      displayElevation: toDisplayElevation(point.elevation),
    }));
  }, [elevationData, isImperial]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    return (
      <Card p="xs" style={{ backgroundColor: tokens.colors.bgSecondary, border: `1px solid ${tokens.colors.bgTertiary}` }}>
        <Stack gap={4}>
          <Text size="xs" fw={600} style={{ color: tokens.colors.textPrimary }}>
            {data.displayElevation} {elevationUnit}
          </Text>
          <Text size="xs" style={{ color: tokens.colors.textMuted }}>
            {data.displayDistance} {distanceUnit}
          </Text>
        </Stack>
      </Card>
    );
  };

  // Loading state
  if (loading) {
    return (
      <Card p="md">
        <Stack gap="sm">
          <Skeleton height={12} width="30%" />
          <Skeleton height={height} />
        </Stack>
      </Card>
    );
  }

  // No data state
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  return (
    <Card p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
            Elevation Profile
          </Text>
          {showStats && stats && (
            <Group gap="md">
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Gain</Text>
                <Text size="sm" fw={600} style={{ color: tokens.colors.success }}>
                  +{toDisplayElevation(stats.gain)} {elevationUnit}
                </Text>
              </Box>
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Loss</Text>
                <Text size="sm" fw={600} style={{ color: tokens.colors.error }}>
                  -{toDisplayElevation(stats.loss)} {elevationUnit}
                </Text>
              </Box>
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Range</Text>
                <Text size="sm" fw={600} style={{ color: tokens.colors.textSecondary }}>
                  {toDisplayElevation(stats.min)}-{toDisplayElevation(stats.max)} {elevationUnit}
                </Text>
              </Box>
            </Group>
          )}
        </Group>

        {error && (
          <Text size="xs" style={{ color: tokens.colors.warning }}>
            {error} - showing estimated profile
          </Text>
        )}

        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={tokens.colors.electricLime} stopOpacity={0.4} />
                <stop offset="95%" stopColor={tokens.colors.electricLime} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.colors.bgTertiary} />
            <XAxis
              dataKey="displayDistance"
              tick={{ fontSize: 10, fill: tokens.colors.textMuted }}
              tickFormatter={(value) => `${value}`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: tokens.colors.textMuted }}
              tickFormatter={(value) => `${value}`}
              domain={['dataMin - 10', 'dataMax + 10']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="displayElevation"
              stroke={tokens.colors.electricLime}
              strokeWidth={2}
              fill="url(#elevationGradient)"
              name="Elevation"
            />
          </AreaChart>
        </ResponsiveContainer>

        <Text size="xs" style={{ color: tokens.colors.textMuted }} ta="center">
          Distance ({distanceUnit})
        </Text>
      </Stack>
    </Card>
  );
};

export default ElevationProfile;
