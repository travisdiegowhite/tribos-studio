import { useState, useEffect, useMemo } from 'react';
import { Paper, Text, Group, Badge, Stack, Box, Skeleton, Loader } from '@mantine/core';
import { tokens } from '../theme';
import { getElevationData, calculateElevationStats } from '../utils/elevation';
import { formatDistance, formatElevation } from '../utils/units';

/**
 * ElevationProfileBar Component
 * Displays a fixed bottom bar with elevation profile chart
 * Uses OpenTopoData API for accurate elevation data
 */
const ElevationProfile = ({
  coordinates,
  totalDistance = 0, // in km
  isImperial = true,
  onStatsUpdate = null,
}) => {
  const [elevationData, setElevationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  // Formatting helpers
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);
  const elevationUnit = isImperial ? 'ft' : 'm';

  // Fetch elevation data when coordinates change
  useEffect(() => {
    if (!coordinates || coordinates.length < 2) {
      setElevationData(null);
      setStats(null);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      try {
        const data = await getElevationData(coordinates);

        if (cancelled) return;

        if (data && data.length > 0) {
          setElevationData(data);

          // Calculate stats
          const calculatedStats = calculateElevationStats(data);
          setStats(calculatedStats);

          // Notify parent of stats update
          if (onStatsUpdate) {
            onStatsUpdate(calculatedStats);
          }
        }
      } catch (error) {
        console.error('Error fetching elevation:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [coordinates, onStatsUpdate]);

  // Calculate SVG path and chart dimensions
  const chartConfig = useMemo(() => {
    if (!elevationData || elevationData.length < 2) return null;

    const padding = 15;
    const chartHeight = 80;

    // Get elevation range
    const elevations = elevationData.map(p => p.elevation);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationRange = Math.max(maxElevation - minElevation, 10);

    // Add padding to range
    const chartMin = minElevation - elevationRange * 0.05;
    const chartMax = maxElevation + elevationRange * 0.05;
    const chartRange = chartMax - chartMin;

    // Get distance range
    const maxDistance = elevationData[elevationData.length - 1].distance;

    return {
      padding,
      chartHeight,
      minElevation,
      maxElevation,
      chartMin,
      chartMax,
      chartRange,
      maxDistance,
    };
  }, [elevationData]);

  // Create SVG path
  const createPath = (width) => {
    if (!elevationData || !chartConfig) return { line: '', area: '' };

    const { padding, chartHeight, chartMin, chartRange, maxDistance } = chartConfig;
    const chartWidth = width - 2 * padding;

    let linePath = '';
    let areaPath = '';

    elevationData.forEach((point, index) => {
      const x = padding + (point.distance / maxDistance) * chartWidth;
      const y = chartHeight - padding - ((point.elevation - chartMin) / chartRange) * (chartHeight - 2 * padding);

      if (index === 0) {
        linePath += `M ${x} ${y}`;
      } else {
        // Smooth curve
        const prevPoint = elevationData[index - 1];
        const prevX = padding + (prevPoint.distance / maxDistance) * chartWidth;
        const prevY = chartHeight - padding - ((prevPoint.elevation - chartMin) / chartRange) * (chartHeight - 2 * padding);

        const cpX1 = prevX + (x - prevX) * 0.4;
        const cpX2 = prevX + (x - prevX) * 0.6;

        linePath += ` C ${cpX1} ${prevY}, ${cpX2} ${y}, ${x} ${y}`;
      }
    });

    // Create area path (close the path at the bottom)
    const lastX = padding + chartWidth;
    const firstX = padding;
    areaPath = linePath + ` L ${lastX} ${chartHeight - padding} L ${firstX} ${chartHeight - padding} Z`;

    return { line: linePath, area: areaPath };
  };

  // Don't render if no coordinates
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  // Loading state
  if (loading && !elevationData) {
    return (
      <Paper
        shadow="md"
        p="sm"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: tokens.colors.bgSecondary,
          borderRadius: '12px 12px 0 0',
          borderTop: `1px solid ${tokens.colors.bgTertiary}`,
        }}
      >
        <Group justify="center" gap="sm" py="md">
          <Loader size="sm" color="lime" />
          <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
            Loading elevation profile...
          </Text>
        </Group>
      </Paper>
    );
  }

  // No data state
  if (!elevationData || !chartConfig) {
    return null;
  }

  const svgWidth = 800;
  const { line, area } = createPath(svgWidth);

  return (
    <Paper
      shadow="md"
      p="sm"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: tokens.colors.bgSecondary,
        borderRadius: '12px 12px 0 0',
        borderTop: `1px solid ${tokens.colors.bgTertiary}`,
      }}
    >
      <Stack gap="xs">
        {/* Header with stats */}
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Group gap="xs">
            <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
              Elevation Profile
            </Text>
            {loading && <Loader size={12} color="lime" />}
          </Group>

          <Group gap="xs" wrap="wrap">
            {totalDistance > 0 && (
              <Badge variant="light" color="blue" size="sm">
                {formatDist(totalDistance)}
              </Badge>
            )}
            {stats?.gain > 0 && (
              <Badge variant="light" color="green" size="sm">
                ↗ {formatElev(stats.gain)}
              </Badge>
            )}
            {stats?.loss > 0 && (
              <Badge variant="light" color="red" size="sm">
                ↘ {formatElev(stats.loss)}
              </Badge>
            )}
          </Group>
        </Group>

        {/* SVG Chart */}
        <Box style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Chart area */}
          <Box style={{ flex: 1, minWidth: 0 }}>
            <svg
              width="100%"
              height={chartConfig.chartHeight}
              viewBox={`0 0 ${svgWidth} ${chartConfig.chartHeight}`}
              preserveAspectRatio="none"
              style={{
                background: `linear-gradient(to bottom, ${tokens.colors.bgTertiary} 0%, ${tokens.colors.bgPrimary} 100%)`,
                borderRadius: '8px',
              }}
            >
              {/* Gradient definition */}
              <defs>
                <linearGradient id="elevGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: tokens.colors.electricLime, stopOpacity: 0.6 }} />
                  <stop offset="50%" style={{ stopColor: tokens.colors.electricLime, stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: tokens.colors.electricLime, stopOpacity: 0.1 }} />
                </linearGradient>
                <pattern id="gridPattern" width="40" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 20" fill="none" stroke={tokens.colors.bgTertiary} strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Grid */}
              <rect width="100%" height="100%" fill="url(#gridPattern)" opacity="0.5" />

              {/* Area fill */}
              <path d={area} fill="url(#elevGradient)" />

              {/* Line */}
              <path
                d={line}
                fill="none"
                stroke={tokens.colors.electricLime}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Elevation labels */}
              <text
                x={chartConfig.padding + 5}
                y={chartConfig.padding + 10}
                fontSize="11"
                fill={tokens.colors.textSecondary}
                fontWeight="500"
              >
                {formatElev(chartConfig.maxElevation)}
              </text>
              <text
                x={chartConfig.padding + 5}
                y={chartConfig.chartHeight - chartConfig.padding - 2}
                fontSize="11"
                fill={tokens.colors.textSecondary}
                fontWeight="500"
              >
                {formatElev(chartConfig.minElevation)}
              </text>
            </svg>
          </Box>

          {/* Stats panel */}
          <Box
            style={{
              minWidth: 100,
              padding: '8px 12px',
              backgroundColor: tokens.colors.bgTertiary,
              borderRadius: '6px',
            }}
          >
            <Stack gap={4}>
              <Group justify="space-between" gap="xs">
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Range:</Text>
                <Text size="xs" fw={500} style={{ color: tokens.colors.textPrimary }}>
                  {formatElev(chartConfig.maxElevation - chartConfig.minElevation)}
                </Text>
              </Group>
              <Group justify="space-between" gap="xs">
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Min:</Text>
                <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                  {formatElev(chartConfig.minElevation)}
                </Text>
              </Group>
              <Group justify="space-between" gap="xs">
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Max:</Text>
                <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                  {formatElev(chartConfig.maxElevation)}
                </Text>
              </Group>
            </Stack>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
};

export default ElevationProfile;
