import { useMemo, useState, useCallback, useRef } from 'react';
import {
  Box,
  Group,
  SegmentedControl,
  Text,
  Paper,
  Skeleton,
} from '@mantine/core';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Gauge, Heartbeat, Lightning, Mountains, Path } from '@phosphor-icons/react';
import {
  RIDE_MAP_3D_PITCH,
  RIDE_MAP_TERRAIN_EXAGGERATION,
  cameraBearingForRoute,
  readStored3dPreference,
  routeGeometryFor,
  writeStored3dPreference,
} from '../utils/rideMapCamera';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Color modes for route rendering
 */
const COLOR_MODES = {
  plain: { label: 'Route', icon: Path, unit: '' },
  speed: { label: 'Speed', icon: Gauge, unit: 'km/h' },
  power: { label: 'Power', icon: Lightning, unit: 'W' },
  elevation: { label: 'Elevation', icon: Mountains, unit: 'm' },
  heartRate: { label: 'Heart rate', icon: Heartbeat, unit: 'bpm' },
};

/**
 * Color stops for each metric — maps normalized 0–1 values to colors
 * Using perceptually distinct palettes that work on dark map backgrounds
 */
const COLOR_SCALES = {
  speed: [
    [0.0, '#2A8C82'],  // teal - slow
    [0.25, '#2A8C82'], // teal
    [0.5, '#D4600A'],  // orange
    [0.75, '#C43C2A'], // coral
    [1.0, '#C43C2A'],  // coral - fast
  ],
  power: [
    [0.0, '#2A8C82'],  // teal - easy (zone 1-2)
    [0.25, '#2A8C82'], // teal (zone 2-3)
    [0.5, '#D4600A'],  // orange (zone 3-4)
    [0.75, '#C43C2A'], // coral (zone 4-5)
    [1.0, '#C43C2A'],  // coral (zone 5+)
  ],
  elevation: [
    [0.0, '#2A8C82'],  // teal - low
    [0.25, '#C49A0A'], // gold
    [0.5, '#D4600A'],  // orange
    [0.75, '#C43C2A'], // coral
    [1.0, '#C43C2A'],  // coral - high
  ],
  heartRate: [
    [0.0, '#2A8C82'],  // teal - low HR
    [0.25, '#2A8C82'], // teal
    [0.5, '#D4600A'],  // orange
    [0.75, '#C43C2A'], // coral
    [1.0, '#C43C2A'],  // coral - high HR
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
 * Mapbox terrain DEM. Shared by the `terrain` prop (3D relief) and the
 * hillshade layer that gives the dark basemap its shading — dark-v11 has no
 * hillshade of its own, so without this a pitched map reads as flat paper.
 */
const TERRAIN_SOURCE_ID = 'ride-terrain-dem';
const TERRAIN_SOURCE_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';

// Atmosphere for the pitched view. Colors sit in the dark palette family
// (cool green-black) so the horizon blends into the card rather than
// showing a bright sky band.
const FOG_3D = {
  range: [0.6, 8],
  color: '#101613',
  'high-color': '#18211d',
  'space-color': '#0a0e0c',
  'horizon-blend': 0.12,
  'star-intensity': 0,
};

const HILLSHADE_PAINT = {
  'hillshade-exaggeration': 0.55,
  'hillshade-shadow-color': '#000000',
  'hillshade-highlight-color': '#4a5a52',
  'hillshade-accent-color': '#000000',
  'hillshade-illumination-direction': 315,
};

const MAP_HEIGHT = 440;
const FIT_PADDING = { top: 56, bottom: 44, left: 24, right: 24 };

const overlayControlStyles = {
  root: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
  },
  label: {
    color: 'white',
    fontSize: 11,
    padding: '4px 8px',
  },
};

/**
 * ColoredRouteMap Component
 * Renders a ride on a Mapbox map, colored by speed, power, elevation, or HR.
 *
 * Draws over 3D terrain by default (toggleable, remembered per viewer). The
 * track comes from `activityStreams.coords` when present so a colored
 * segment lands on the exact geometry it was measured on; the decoded
 * summary polyline (`routeCoords`) is the fallback for older activities.
 */
const ColoredRouteMap = ({ activityStreams, routeCoords, bounds: boundsProp }) => {
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [colorMode, setColorMode] = useState('plain');
  const [is3d, setIs3d] = useState(() => readStored3dPreference());

  const geometry = useMemo(
    () => routeGeometryFor(activityStreams, routeCoords),
    [activityStreams, routeCoords],
  );
  const bounds = geometry.bounds ?? boundsProp ?? null;
  const bearing3d = useMemo(() => cameraBearingForRoute(geometry.coords), [geometry.coords]);

  // Determine which color modes are available based on stream data. Colored
  // segments are only meaningful on the stream track itself.
  const availableModes = useMemo(() => {
    const modes = ['plain'];
    if (activityStreams && geometry.source === 'streams') {
      if (activityStreams.speed) modes.push('speed');
      if (activityStreams.power) modes.push('power');
      if (activityStreams.elevation) modes.push('elevation');
      if (activityStreams.heartRate) modes.push('heartRate');
    }
    return modes;
  }, [activityStreams, geometry.source]);

  // Build colored GeoJSON when mode changes
  const { coloredGeoJSON, meta } = useMemo(() => {
    if (colorMode === 'plain' || !activityStreams || geometry.source !== 'streams') {
      return { coloredGeoJSON: null, meta: null };
    }

    const result = buildColoredSegments({ ...activityStreams, coords: geometry.coords }, colorMode);
    if (!result) return { coloredGeoJSON: null, meta: null };

    return {
      coloredGeoJSON: result,
      meta: result.meta,
    };
  }, [activityStreams, colorMode, geometry]);

  // Reset to plain if current mode becomes unavailable
  const handleModeChange = useCallback((mode) => {
    if (availableModes.includes(mode)) {
      setColorMode(mode);
    }
  }, [availableModes]);

  const cameraFor = useCallback(
    (threeD) => ({
      pitch: threeD ? RIDE_MAP_3D_PITCH : 0,
      bearing: threeD ? bearing3d : 0,
    }),
    [bearing3d],
  );

  const flyToRoute = useCallback(
    (threeD) => {
      const map = mapRef.current?.getMap?.();
      if (!map || !bounds) return;
      map.fitBounds(bounds, { padding: FIT_PADDING, duration: 900, ...cameraFor(threeD) });
    },
    [bounds, cameraFor],
  );

  const handle3dChange = useCallback(
    (value) => {
      const threeD = value === '3d';
      setIs3d(threeD);
      writeStored3dPreference(threeD);
      flyToRoute(threeD);
    },
    [flyToRoute],
  );

  if (!bounds || !MAPBOX_TOKEN) return null;

  const showColoredRoute = colorMode !== 'plain' && coloredGeoJSON;

  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Box style={{ height: MAP_HEIGHT, position: 'relative' }}>
        {!mapLoaded && <Skeleton height={MAP_HEIGHT} />}

        <Map
          ref={mapRef}
          initialViewState={{
            bounds,
            fitBoundsOptions: { padding: FIT_PADDING, ...cameraFor(is3d) },
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          onLoad={() => setMapLoaded(true)}
          interactive={true}
          scrollZoom={false}
          dragRotate={true}
          touchPitch={true}
          maxPitch={75}
          terrain={is3d ? { source: TERRAIN_SOURCE_ID, exaggeration: RIDE_MAP_TERRAIN_EXAGGERATION } : undefined}
          fog={is3d ? FOG_3D : undefined}
        >
          {/* Terrain DEM: drives both the 3D mesh and the relief shading */}
          <Source
            id={TERRAIN_SOURCE_ID}
            type="raster-dem"
            url={TERRAIN_SOURCE_URL}
            tileSize={512}
            maxzoom={14}
          >
            <Layer id="ride-hillshade" type="hillshade" paint={HILLSHADE_PAINT} />
          </Source>

          {/* Plain route (shown when no color mode or as shadow under colored route) */}
          {geometry.geojson && (
            <Source id="route" type="geojson" data={geometry.geojson}>
              <Layer
                id="route-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': showColoredRoute ? '#9A9C90' : '#2A8C82',
                  'line-width': showColoredRoute ? 6 : 4,
                  'line-opacity': showColoredRoute ? 0.4 : 0.95,
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
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': ['get', 'color'],
                  'line-width': 4,
                  'line-opacity': 0.95,
                }}
              />
            </Source>
          )}

          <NavigationControl position="top-left" visualizePitch showZoom showCompass />
        </Map>

        {/* Color legend */}
        {showColoredRoute && meta && (
          <ColorLegend mode={colorMode} min={meta.min} max={meta.max} />
        )}

        {/* Top-right: metric color mode + 2D/3D toggle */}
        <Group
          gap={6}
          justify="flex-end"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
        >
          {availableModes.length > 1 && (
            <SegmentedControl
              size="xs"
              value={colorMode}
              onChange={handleModeChange}
              data={availableModes.map(mode => ({ value: mode, label: COLOR_MODES[mode].label }))}
              styles={overlayControlStyles}
            />
          )}
          <SegmentedControl
            size="xs"
            value={is3d ? '3d' : '2d'}
            onChange={handle3dChange}
            data={[
              { value: '2d', label: '2D' },
              { value: '3d', label: '3D' },
            ]}
            styles={overlayControlStyles}
            aria-label="Map perspective"
          />
        </Group>
      </Box>
    </Paper>
  );
};

export default ColoredRouteMap;
