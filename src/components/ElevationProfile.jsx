import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Paper, Text, Group, Badge, Stack, Box, Skeleton, Loader } from '@mantine/core';
import { tokens } from '../theme';
import { getElevationData, calculateElevationStats } from '../utils/elevation';
import { formatDistance, formatElevation } from '../utils/units';

/**
 * ElevationProfileBar Component
 * Displays a fixed bottom bar with elevation profile chart
 * Uses OpenTopoData API for accurate elevation data
 * Supports hover interaction to show position on map
 */
const ElevationProfile = ({
  coordinates,
  totalDistance = 0, // in km
  isImperial = true,
  onStatsUpdate = null,
  leftOffset = 0, // Offset from left edge (for sidebar)
  onHoverPosition = null, // Callback with {lng, lat, elevation, distance} or null when not hovering
  highlightDistance = null, // External highlight distance (km) — e.g. from map hover. Internal hover takes priority.
}) => {
  const [elevationData, setElevationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [hoverInfo, setHoverInfo] = useState(null);
  const svgRef = useRef(null);

  // Selection state for click-drag zoom
  const [selection, setSelection] = useState(null); // { startDist, endDist } in km
  const isDragSelecting = useRef(false);
  const dragStartDist = useRef(null);

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

  // Convert a mouse event to distance along the route (km)
  const mouseToDistance = useCallback((event) => {
    if (!svgRef.current || !chartConfig) return null;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const { padding, maxDistance } = chartConfig;
    const mouseX = event.clientX - rect.left;
    const svgWidth = rect.width;
    const viewBoxWidth = 800;
    const scaledX = (mouseX / svgWidth) * viewBoxWidth;
    const chartWidth = viewBoxWidth - 2 * padding;
    const distanceRatio = Math.max(0, Math.min(1, (scaledX - padding) / chartWidth));
    return distanceRatio * maxDistance;
  }, [chartConfig]);

  // Selection drag handlers
  const handleMouseDown = useCallback((event) => {
    if (event.button !== 0) return; // left click only
    const dist = mouseToDistance(event);
    if (dist == null) return;
    isDragSelecting.current = true;
    dragStartDist.current = dist;
    setSelection(null); // clear previous selection
  }, [mouseToDistance]);

  const handleMouseUp = useCallback(() => {
    if (!isDragSelecting.current || dragStartDist.current == null) return;
    isDragSelecting.current = false;
    // Selection is already set in handleMouseMove during drag
  }, []);

  const handleDoubleClick = useCallback(() => {
    setSelection(null); // clear selection on double-click
  }, []);

  // Handle mouse move over the chart
  const handleMouseMove = useCallback((event) => {
    if (!svgRef.current || !elevationData || !chartConfig || !coordinates) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const { padding, maxDistance } = chartConfig;

    // Get mouse position relative to SVG
    const mouseX = event.clientX - rect.left;
    const svgWidth = rect.width;

    // Convert to chart coordinates (accounting for viewBox scaling)
    const viewBoxWidth = 800;
    const scaledX = (mouseX / svgWidth) * viewBoxWidth;

    // Calculate distance along route
    const chartWidth = viewBoxWidth - 2 * padding;
    const distanceRatio = Math.max(0, Math.min(1, (scaledX - padding) / chartWidth));
    const distance = distanceRatio * maxDistance;

    // Find the closest elevation point
    let closestPoint = elevationData[0];
    let minDiff = Math.abs(elevationData[0].distance - distance);

    for (const point of elevationData) {
      const diff = Math.abs(point.distance - distance);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
      }
    }

    // Find the corresponding coordinate
    // Use linear interpolation between coordinates based on distance
    const coordIndex = Math.floor(distanceRatio * (coordinates.length - 1));
    const nextIndex = Math.min(coordIndex + 1, coordinates.length - 1);
    const localRatio = (distanceRatio * (coordinates.length - 1)) - coordIndex;

    const lng = coordinates[coordIndex][0] + (coordinates[nextIndex][0] - coordinates[coordIndex][0]) * localRatio;
    const lat = coordinates[coordIndex][1] + (coordinates[nextIndex][1] - coordinates[coordIndex][1]) * localRatio;

    const info = {
      lng,
      lat,
      elevation: closestPoint.elevation,
      distance: closestPoint.distance,
      x: scaledX, // For hover indicator position
    };

    setHoverInfo(info);

    // Update drag selection if in progress
    if (isDragSelecting.current && dragStartDist.current != null) {
      const startDist = Math.min(dragStartDist.current, distance);
      const endDist = Math.max(dragStartDist.current, distance);
      if (endDist - startDist > 0.05) { // minimum 50m selection
        setSelection({ startDist, endDist });
      }
    }

    if (onHoverPosition) {
      onHoverPosition(info);
    }
  }, [elevationData, chartConfig, coordinates, onHoverPosition]);

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
    if (onHoverPosition) {
      onHoverPosition(null);
    }
  }, [onHoverPosition]);

  // Compute section metrics when a selection exists
  const sectionMetrics = useMemo(() => {
    if (!selection || !elevationData) return null;
    const { startDist, endDist } = selection;
    const sectionPoints = elevationData.filter(p => p.distance >= startDist && p.distance <= endDist);
    if (sectionPoints.length < 2) return null;

    const sectionStats = calculateElevationStats(sectionPoints);
    const distance = endDist - startDist;
    const netElevChange = sectionPoints[sectionPoints.length - 1].elevation - sectionPoints[0].elevation;
    const avgGrade = distance > 0 ? (netElevChange / (distance * 1000)) * 100 : 0;

    return {
      distance,
      gain: sectionStats.gain,
      loss: sectionStats.loss,
      avgGrade: avgGrade.toFixed(1),
      min: sectionStats.min,
      max: sectionStats.max,
    };
  }, [selection, elevationData]);

  // Convert selection distances to SVG x coordinates
  const selectionSvg = useMemo(() => {
    if (!selection || !chartConfig) return null;
    const { padding, maxDistance } = chartConfig;
    const viewBoxWidth = 800;
    const chartWidth = viewBoxWidth - 2 * padding;
    const x1 = padding + (selection.startDist / maxDistance) * chartWidth;
    const x2 = padding + (selection.endDist / maxDistance) * chartWidth;
    return { x1, x2 };
  }, [selection, chartConfig]);

  // Compute external highlight position (from map hover)
  const externalHighlight = useMemo(() => {
    if (highlightDistance == null || !elevationData || !chartConfig) return null;
    const { padding, maxDistance } = chartConfig;
    const viewBoxWidth = 800;
    const chartWidth = viewBoxWidth - 2 * padding;

    // Find closest elevation point to the highlighted distance
    let closestPoint = elevationData[0];
    let minDiff = Math.abs(elevationData[0].distance - highlightDistance);
    for (const point of elevationData) {
      const diff = Math.abs(point.distance - highlightDistance);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
      }
    }

    const x = padding + (highlightDistance / maxDistance) * chartWidth;
    return { x: Math.max(padding, Math.min(x, padding + chartWidth)), elevation: closestPoint.elevation, distance: closestPoint.distance };
  }, [highlightDistance, elevationData, chartConfig]);

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
          left: leftOffset,
          right: 0,
          zIndex: 100,
          backgroundColor: 'var(--tribos-bg-secondary)',
          borderRadius: leftOffset > 0 ? '0' : '12px 12px 0 0',
          borderTop: `1px solid ${'var(--tribos-bg-tertiary)'}`,
        }}
      >
        <Group justify="center" gap="sm" py="md">
          <Loader size="sm" color="lime" />
          <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
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
        left: leftOffset,
        right: 0,
        zIndex: 100,
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderRadius: leftOffset > 0 ? '0' : '12px 12px 0 0',
        borderTop: `1px solid ${'var(--tribos-bg-tertiary)'}`,
      }}
    >
      <Stack gap="xs">
        {/* Header with stats */}
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Group gap="xs">
            <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
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

        {/* Section metrics (shown when a section is selected via click-drag) */}
        {sectionMetrics && (
          <Group gap="xs" wrap="wrap" style={{ padding: '2px 0' }}>
            <Badge variant="light" color="blue" size="xs">
              {formatDist(sectionMetrics.distance)}
            </Badge>
            <Badge variant="light" color="green" size="xs">
              ↗ {formatElev(sectionMetrics.gain)}
            </Badge>
            <Badge variant="light" color="red" size="xs">
              ↘ {formatElev(sectionMetrics.loss)}
            </Badge>
            <Badge variant="light" color="yellow" size="xs">
              avg {sectionMetrics.avgGrade}%
            </Badge>
            <Text
              size="xs"
              style={{ color: 'var(--tribos-text-muted)', cursor: 'pointer' }}
              onClick={() => setSelection(null)}
            >
              clear
            </Text>
          </Group>
        )}

        {/* SVG Chart */}
        <Box style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Chart area */}
          <Box style={{ flex: 1, minWidth: 0 }}>
            <svg
              ref={svgRef}
              width="100%"
              height={chartConfig.chartHeight}
              viewBox={`0 0 ${svgWidth} ${chartConfig.chartHeight}`}
              preserveAspectRatio="none"
              style={{
                background: `linear-gradient(to bottom, ${'var(--tribos-bg-tertiary)'} 0%, ${'var(--tribos-bg-primary)'} 100%)`,
                borderRadius: '8px',
                cursor: 'crosshair',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onDoubleClick={handleDoubleClick}
            >
              {/* Gradient definition */}
              <defs>
                <linearGradient id="elevGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: 'var(--tribos-lime)', stopOpacity: 0.6 }} />
                  <stop offset="50%" style={{ stopColor: 'var(--tribos-lime)', stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: 'var(--tribos-lime)', stopOpacity: 0.1 }} />
                </linearGradient>
                <pattern id="gridPattern" width="40" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 20" fill="none" stroke={'var(--tribos-bg-tertiary)'} strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Grid */}
              <rect width="100%" height="100%" fill="url(#gridPattern)" opacity="0.5" />

              {/* Selection highlight overlay */}
              {selectionSvg && (
                <rect
                  x={selectionSvg.x1}
                  y={chartConfig.padding}
                  width={selectionSvg.x2 - selectionSvg.x1}
                  height={chartConfig.chartHeight - 2 * chartConfig.padding}
                  fill="rgba(123, 169, 160, 0.15)"
                  stroke="#7BA9A0"
                  strokeWidth="1"
                  strokeDasharray="4,2"
                />
              )}

              {/* Area fill */}
              <path d={area} fill="url(#elevGradient)" />

              {/* Line */}
              <path
                d={line}
                fill="none"
                stroke={'var(--tribos-lime)'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Elevation labels */}
              <text
                x={chartConfig.padding + 5}
                y={chartConfig.padding + 10}
                fontSize="11"
                fill={'var(--tribos-text-secondary)'}
                fontWeight="500"
              >
                {formatElev(chartConfig.maxElevation)}
              </text>
              <text
                x={chartConfig.padding + 5}
                y={chartConfig.chartHeight - chartConfig.padding - 2}
                fontSize="11"
                fill={'var(--tribos-text-secondary)'}
                fontWeight="500"
              >
                {formatElev(chartConfig.minElevation)}
              </text>

              {/* Hover indicator (internal — from chart hover) */}
              {hoverInfo && (
                <>
                  <line
                    x1={hoverInfo.x}
                    y1={chartConfig.padding}
                    x2={hoverInfo.x}
                    y2={chartConfig.chartHeight - chartConfig.padding}
                    stroke="#fff"
                    strokeWidth="1"
                    strokeDasharray="4,2"
                    opacity="0.7"
                  />
                  <circle
                    cx={hoverInfo.x}
                    cy={chartConfig.chartHeight - chartConfig.padding - ((hoverInfo.elevation - chartConfig.chartMin) / chartConfig.chartRange) * (chartConfig.chartHeight - 2 * chartConfig.padding)}
                    r="5"
                    fill="#32CD32"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                  <g transform={`translate(${Math.min(hoverInfo.x + 10, svgWidth - 90)}, ${chartConfig.padding + 5})`}>
                    <rect
                      x="0"
                      y="0"
                      width="80"
                      height="36"
                      rx="4"
                      fill="rgba(0,0,0,0.85)"
                    />
                    <text x="8" y="14" fontSize="10" fill="#fff" fontWeight="500">
                      {formatElev(hoverInfo.elevation)}
                    </text>
                    <text x="8" y="28" fontSize="10" fill="#aaa">
                      {formatDist(hoverInfo.distance)} km
                    </text>
                  </g>
                </>
              )}

              {/* External highlight (from map hover) — only shown when not internally hovering */}
              {!hoverInfo && externalHighlight && (
                <>
                  <line
                    x1={externalHighlight.x}
                    y1={chartConfig.padding}
                    x2={externalHighlight.x}
                    y2={chartConfig.chartHeight - chartConfig.padding}
                    stroke="#7BA9A0"
                    strokeWidth="1"
                    strokeDasharray="4,2"
                    opacity="0.7"
                  />
                  <circle
                    cx={externalHighlight.x}
                    cy={chartConfig.chartHeight - chartConfig.padding - ((externalHighlight.elevation - chartConfig.chartMin) / chartConfig.chartRange) * (chartConfig.chartHeight - 2 * chartConfig.padding)}
                    r="5"
                    fill="#7BA9A0"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                  <g transform={`translate(${Math.min(externalHighlight.x + 10, svgWidth - 90)}, ${chartConfig.padding + 5})`}>
                    <rect
                      x="0"
                      y="0"
                      width="80"
                      height="36"
                      rx="4"
                      fill="rgba(0,0,0,0.85)"
                    />
                    <text x="8" y="14" fontSize="10" fill="#fff" fontWeight="500">
                      {formatElev(externalHighlight.elevation)}
                    </text>
                    <text x="8" y="28" fontSize="10" fill="#aaa">
                      {formatDist(externalHighlight.distance)} km
                    </text>
                  </g>
                </>
              )}
            </svg>
          </Box>

          {/* Stats panel */}
          <Box
            style={{
              minWidth: 100,
              padding: '8px 12px',
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: '6px',
            }}
          >
            <Stack gap={4}>
              <Group justify="space-between" gap="xs">
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Range:</Text>
                <Text size="xs" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                  {formatElev(chartConfig.maxElevation - chartConfig.minElevation)}
                </Text>
              </Group>
              <Group justify="space-between" gap="xs">
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Min:</Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  {formatElev(chartConfig.minElevation)}
                </Text>
              </Group>
              <Group justify="space-between" gap="xs">
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Max:</Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
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
