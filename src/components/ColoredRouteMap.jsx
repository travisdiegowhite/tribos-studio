import { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Group,
  SegmentedControl,
  Text,
  Paper,
  Skeleton,
} from '@mantine/core';
import {
  IconBolt,
  IconGauge,
  IconMountain,
  IconHeartbeat,
  IconRoute,
} from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../theme';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Color modes for route rendering
 */
const COLOR_MODES = {
  plain: { label: 'Route', icon: IconRoute, unit: '' },
  speed: { label: 'Speed', icon: IconGauge, unit: 'km/h' },
  power: { label: 'Power', icon: IconBolt, unit: 'W' },
  elevation: { label: 'Elevation', icon: IconMountain, unit: 'm' },
  heartRate: { label: 'HR', icon: IconHeartbeat, unit: 'bpm' },
};

/**
 * Color stops for each metric — maps normalized 0–1 values to colors
 * Using perceptually distinct palettes that work on dark map backgrounds
 */
const COLOR_SCALES = {
  speed: [
    [0.0, '#7BA9A0'],  // teal - slow
    [0.25, '#A8BFA8'], // sage
    [0.5, '#D4A843'],  // gold
    [0.75, '#C4785C'], // terracotta
    [1.0, '#C4785C'],  // terracotta - fast
  ],
  power: [
    [0.0, '#7BA9A0'],  // teal - easy (zone 1-2)
    [0.25, '#A8BFA8'], // sage (zone 2-3)
    [0.5, '#D4A843'],  // gold (zone 3-4)
    [0.75, '#C4785C'], // terracotta (zone 4-5)
    [1.0, '#C4785C'],  // terracotta (zone 5+)
  ],
  elevation: [
    [0.0, '#A8BFA8'],  // sage - low
    [0.25, '#B8CDD9'], // sky
    [0.5, '#D4A843'],  // gold
    [0.75, '#C4785C'], // terracotta
    [1.0, '#C4785C'],  // terracotta - high
  ],
  heartRate: [
    [0.0, '#7BA9A0'],  // teal - low HR
    [0.25, '#A8BFA8'], // sage
    [0.5, '#D4A843'],  // gold
    [0.75, '#C4785C'], // terracotta
    [1.0, '#C4785C'],  // terracotta - high HR
  ],
};

/**
 * Interpolate between color stops for a normalized value (0-1)
 */
function interpolateColor(normalizedValue, colorScale) {
  const v = Math.max(0, Math.min(1, normalizedValue));

  // Find surrounding color stops
  for (let i = 0; i < colorScale.length - 1; i++) {
    const [low, lowColor] = colorScale[i];
    const [high, highColor] = colorScale[i + 1];

    if (v >= low && v <= high) {
      const t = (v - low) / (high - low);
      return lerpColor(lowColor, highColor, t);
    }
  }

  return colorScale[colorScale.length - 1][1];
}

/**
 * Linearly interpolate between two hex colors
 */
function lerpColor(color1, color2, t) {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Build colored GeoJSON segments from activity streams
 * Each segment is a 2-point LineString with a color property
 */
function buildColoredSegments(streams, mode) {
  const { coords } = streams;
  const metricArray = streams[mode];

  if (!metricArray || coords.length < 2) return null;

  // Find min/max for normalization (skip nulls)
  const validValues = metricArray.filter(v => v != null && v > 0);
  if (validValues.length === 0) return null;

  // Use percentile-based range to avoid outlier skew
  const sorted = [...validValues].sort((a, b) => a - b);
  const minVal = sorted[Math.floor(sorted.length * 0.02)];  // 2nd percentile
  const maxVal = sorted[Math.floor(sorted.length * 0.98)];  // 98th percentile
  const range = maxVal - minVal;

  if (range <= 0) return null;

  const colorScale = COLOR_SCALES[mode];
  const features = [];

  for (let i = 0; i < coords.length - 1; i++) {
    // Use average of two endpoints for segment color
    const v1 = metricArray[i];
    const v2 = metricArray[i + 1];

    // If both values are null, use neutral color
    let color;
    if (v1 == null && v2 == null) {
      color = '#666666';
    } else {
      const avg = v1 != null && v2 != null
        ? (v1 + v2) / 2
        : (v1 ?? v2);
      const normalized = (avg - minVal) / range;
      color = interpolateColor(normalized, colorScale);
    }

    features.push({
      type: 'Feature',
      properties: { color },
      geometry: {
        type: 'LineString',
        coordinates: [coords[i], coords[i + 1]],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
    meta: { min: minVal, max: maxVal },
  };
}

/**
 * Color scale legend component
 */
function ColorLegend({ mode, min, max }) {
  const config = COLOR_MODES[mode];
  const colorScale = COLOR_SCALES[mode];

  if (!colorScale || min == null || max == null) return null;

  // Format values based on metric type
  const formatValue = (val) => {
    if (mode === 'speed') return `${(val * 3.6).toFixed(0)}`; // m/s to km/h
    if (mode === 'elevation') return `${Math.round(val)}`;
    return `${Math.round(val)}`;
  };

  // Build gradient CSS
  const gradientStops = colorScale.map(([pos, color]) => `${color} ${pos * 100}%`).join(', ');

  return (
    <Group
      gap={6}
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <Text size="xs" fw={600} c="white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        {formatValue(min)} {config.unit}
      </Text>
      <Box
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: `linear-gradient(to right, ${gradientStops})`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      />
      <Text size="xs" fw={600} c="white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        {formatValue(max)} {config.unit}
      </Text>
    </Group>
  );
}

/**
 * ColoredRouteMap Component
 * Renders a route on a Mapbox map, colored by speed, power, elevation, or HR
 */
const ColoredRouteMap = ({ activityStreams, routeCoords, routeGeoJSON, bounds }) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [colorMode, setColorMode] = useState('plain');

  // Determine which color modes are available based on stream data
  const availableModes = useMemo(() => {
    const modes = ['plain'];
    if (activityStreams) {
      if (activityStreams.speed) modes.push('speed');
      if (activityStreams.power) modes.push('power');
      if (activityStreams.elevation) modes.push('elevation');
      if (activityStreams.heartRate) modes.push('heartRate');
    }
    return modes;
  }, [activityStreams]);

  // Build colored GeoJSON when mode changes
  const { coloredGeoJSON, meta } = useMemo(() => {
    if (colorMode === 'plain' || !activityStreams) {
      return { coloredGeoJSON: null, meta: null };
    }

    const result = buildColoredSegments(activityStreams, colorMode);
    if (!result) return { coloredGeoJSON: null, meta: null };

    return {
      coloredGeoJSON: result,
      meta: result.meta,
    };
  }, [activityStreams, colorMode]);

  // Reset to plain if current mode becomes unavailable
  const handleModeChange = useCallback((mode) => {
    if (availableModes.includes(mode)) {
      setColorMode(mode);
    }
  }, [availableModes]);

  if (!bounds || !MAPBOX_TOKEN) return null;

  const showColoredRoute = colorMode !== 'plain' && coloredGeoJSON;

  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Box style={{ height: 300, position: 'relative' }}>
        {!mapLoaded && <Skeleton height={300} />}

        <Map
          initialViewState={{
            bounds: bounds,
            fitBoundsOptions: { padding: 40 },
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          onLoad={() => setMapLoaded(true)}
          interactive={true}
          scrollZoom={false}
        >
          {/* Plain route (shown when no color mode or as shadow under colored route) */}
          {routeGeoJSON && (
            <Source id="route" type="geojson" data={routeGeoJSON}>
              <Layer
                id="route-line"
                type="line"
                paint={{
                  'line-color': showColoredRoute ? '#9E9590' : '#C4785C',
                  'line-width': showColoredRoute ? 5 : 3,
                  'line-opacity': showColoredRoute ? 0.4 : 0.9,
                }}
              />
            </Source>
          )}

          {/* Colored route segments */}
          {showColoredRoute && (
            <Source id="colored-route" type="geojson" data={coloredGeoJSON}>
              <Layer
                id="colored-route-line"
                type="line"
                paint={{
                  'line-color': ['get', 'color'],
                  'line-width': 3.5,
                  'line-opacity': 0.95,
                }}
              />
            </Source>
          )}
        </Map>

        {/* Color legend */}
        {showColoredRoute && meta && (
          <ColorLegend mode={colorMode} min={meta.min} max={meta.max} />
        )}

        {/* Color mode toggle — only show if we have stream data */}
        {availableModes.length > 1 && (
          <Box
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
            }}
          >
            <SegmentedControl
              size="xs"
              value={colorMode}
              onChange={handleModeChange}
              data={availableModes.map(mode => {
                const config = COLOR_MODES[mode];
                return {
                  value: mode,
                  label: config.label,
                };
              })}
              styles={{
                root: {
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                },
                label: {
                  color: 'white',
                  fontSize: 11,
                  padding: '4px 8px',
                },
              }}
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ColoredRouteMap;
