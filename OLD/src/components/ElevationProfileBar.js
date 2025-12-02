import React from 'react';
import { Paper, Group, Text, Badge, Stack } from '@mantine/core';
import { useUnits } from '../utils/units';

const ElevationProfileBar = ({ 
  elevationProfile = [], 
  elevationStats = null, 
  routeStats = null,
  isRouteBuilder = false 
}) => {
  const { formatDistance, formatElevation } = useUnits();

  // Don't render if no data
  if (!elevationProfile || elevationProfile.length === 0) {
    return null;
  }

  // Safety check for elevation data
  if (!Array.isArray(elevationProfile) || elevationProfile.length < 2) {
    return null;
  }

  // Calculate dimensions for the elevation chart - make it fill most of the container
  const chartHeight = 100;
  const padding = 15;

  // Find min/max elevations for scaling
  const elevations = elevationProfile.map(point => point?.elevation || 0).filter(e => !isNaN(e) && e >= 0);
  if (elevations.length === 0) {
    return null;
  }
  
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationRange = Math.max(maxElevation - minElevation, 10); // Ensure minimum range of 10m

  // Add small padding (1-2%) to elevation range for clarity
  const elevationPadding = elevationRange * 0.02; // 2% padding
  const chartMinElevation = minElevation - elevationPadding;
  const chartMaxElevation = maxElevation + elevationPadding;
  const chartElevationRange = chartMaxElevation - chartMinElevation;

  // Debug the scaling values
  console.error('🎯 ELEVATION CHART SCALING:', {
    minElevation: Math.round(minElevation),
    maxElevation: Math.round(maxElevation), 
    elevationRange: Math.round(elevationRange),
    chartMinElevation: Math.round(chartMinElevation),
    chartMaxElevation: Math.round(chartMaxElevation),
    chartElevationRange: Math.round(chartElevationRange)
  });

  // Use original elevation profile with light smoothing
  const smoothElevationProfile = elevationProfile.map((point, index) => {
    if (!point || typeof point.elevation !== 'number' || point.elevation < 0) {
      return { ...point, elevation: minElevation };
    }
    return point; // Keep original elevations, just adjust the scaling
  });

  // Create smooth SVG path using cubic bezier curves
  const createSmoothPath = (points, width) => {
    if (points.length < 2) return '';

    let path = '';
    
    points.forEach((point, index) => {
      const x = padding + (index / (points.length - 1)) * (width - 2 * padding);
      // Scale using the padded chart range (minElevation to maxElevation with 2% padding)
      const y = chartHeight - padding - ((point.elevation - chartMinElevation) / chartElevationRange) * (chartHeight - 2 * padding);
      
      if (index < 3) {
        console.error(`📐 POINT ${index}: elevation=${point.elevation}, chartMin=${Math.round(chartMinElevation)}, y=${Math.round(y)}`);
      }
      
      if (index === 0) {
        path += `M ${x} ${y}`;
      } else {
        // Use smooth curves instead of sharp lines
        const prevPoint = points[index - 1];
        const prevX = padding + ((index - 1) / (points.length - 1)) * (width - 2 * padding);
        const prevY = chartHeight - padding - ((prevPoint.elevation - chartMinElevation) / chartElevationRange) * (chartHeight - 2 * padding);
        
        // Control points for smooth curve
        const cp1x = prevX + (x - prevX) * 0.4;
        const cp1y = prevY;
        const cp2x = prevX + (x - prevX) * 0.6;
        const cp2y = y;
        
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`;
      }
    });
    
    return path;
  };

  return (
    <Paper 
      shadow="sm" 
      p={{ base: 'xs', sm: 'md' }}
      style={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 5,
        borderRadius: '12px 12px 0 0',
        maxHeight: '200px'
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap">
          <Text size={{ base: 'xs', sm: 'sm' }} fw={600}>
            {isRouteBuilder ? 'Route Builder' : 'Route Profile'}
          </Text>
          <Group gap="xs" wrap="wrap">
            {routeStats?.distance && (
              <Badge variant="light" color="blue">
                {formatDistance(routeStats.distance)}
              </Badge>
            )}
            {elevationStats?.gain && (
              <Badge variant="light" color="green">
                ↗ {formatElevation(elevationStats.gain)}
              </Badge>
            )}
            {elevationStats?.loss && (
              <Badge variant="light" color="red">
                ↘ {formatElevation(elevationStats.loss)}
              </Badge>
            )}
            {routeStats?.confidence && (
              <Badge variant="light" color="orange">
                {Math.round(routeStats.confidence * 100)}% confidence
              </Badge>
            )}
          </Group>
        </Group>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%' }}>
          {/* Full-width elevation chart */}
          <div style={{ position: 'relative', flex: 1 }}>
            <svg 
              width="100%" 
              height={chartHeight}
              style={{ 
                background: 'linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%)', 
                borderRadius: '8px',
                minWidth: '600px'
              }}
              preserveAspectRatio="none"
              viewBox={`0 0 800 ${chartHeight}`}
            >
              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#dee2e6" strokeWidth="0.5"/>
                </pattern>
                <linearGradient id="elevationGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#8b5cf6', stopOpacity: 0.7}} />
                  <stop offset="50%" style={{stopColor: '#3b82f6', stopOpacity: 0.5}} />
                  <stop offset="100%" style={{stopColor: '#22c55e', stopOpacity: 0.3}} />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              {(() => {
                const svgWidth = 800;
                const smoothPath = createSmoothPath(smoothElevationProfile, svgWidth);
                const areaPath = smoothPath + 
                  ` L ${svgWidth - padding} ${chartHeight - padding}` +
                  ` L ${padding} ${chartHeight - padding} Z`;
                
                return (
                  <>
                    {/* Elevation area fill */}
                    <path
                      d={areaPath}
                      fill="url(#elevationGradient)"
                      stroke="none"
                    />
                    
                    {/* Elevation line */}
                    <path
                      d={smoothPath}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                );
              })()}
              
              {/* Elevation labels - show actual min and max elevations */}
              <text 
                x={padding} 
                y={padding + 12} 
                fontSize="14" 
                fill="#374151"
                fontWeight="500"
              >
                {formatElevation(maxElevation)}
              </text>
              <text 
                x={padding} 
                y={chartHeight - padding - 2} 
                fontSize="14" 
                fill="#374151"
                fontWeight="500"
              >
                {formatElevation(minElevation)}
              </text>
              
              {/* Center elevation reference line - only show if significant range */}
              {elevationRange > 50 && (
                <>
                  <line
                    x1={padding}
                    y1={chartHeight / 2}
                    x2={800 - padding}
                    y2={chartHeight / 2}
                    stroke="#9ca3af"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                    opacity="0.6"
                  />
                  <text 
                    x={padding} 
                    y={chartHeight / 2 - 2} 
                    fontSize="14" 
                    fill="#6b7280"
                  >
                    {formatElevation((minElevation + maxElevation) / 2)}
                  </text>
                </>
              )}
            </svg>
          </div>
          
          {/* Compact stats panel */}
          <div style={{ 
            minWidth: '140px', 
            background: 'rgba(255,255,255,0.8)', 
            padding: '8px 12px', 
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Profile Range:</Text>
                <Text size="xs" fw={500}>{formatElevation(elevationRange)}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Max Climb:</Text>
                <Text size="xs">+{formatElevation(elevationRange)}</Text>
              </Group>
              {routeStats?.duration && (
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Est. Time:</Text>
                  <Text size="xs">{Math.round(routeStats.duration / 60)}min</Text>
                </Group>
              )}
              {elevationStats?.gain > 0 && (
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Total Gain:</Text>
                  <Text size="xs">↗{formatElevation(elevationStats.gain)}</Text>
                </Group>
              )}
            </Stack>
          </div>
        </div>
      </Stack>
    </Paper>
  );
};

export default ElevationProfileBar;