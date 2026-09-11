import { useMemo, useState, useCallback, useRef } from 'react';
import {
  Box,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Paper,
  Skeleton,
} from '@mantine/core';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Gauge, Heartbeat, Lightning, Mountains, Path } from '@phosphor-icons/react';
import { cumulativeDistancesKm } from '../utils/streamChartData';
import {
  formatDistanceKm,
  formatMetricValue,
  metricUnit,
  summarizeMetric,
} from '../utils/rideMetricStats';
import {
  buildExtrusionCollection,
  extrusionScaleForCoords,
} from '../utils/rideMetricExtrusion';
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
 * Color stops for each metric — maps normalized 0–1 values to colors.
 *
 * Six evenly spaced stops through the tribos palette (teal → sage → gold →
 * orange → coral → deep red) so the ramp keeps changing across the whole
 * range. The earlier scales held teal for the bottom quarter and coral for
 * the top quarter, which made half of most rides read as two flat colors.
 */
const EFFORT_RAMP = [
  [0.0, '#2A8C82'],  // teal — easiest
  [0.2, '#5E9C6A'],  // sage
  [0.4, '#C49A0A'],  // gold
  [0.6, '#D4600A'],  // orange
  [0.8, '#C43C2A'],  // coral
  [1.0, '#7A1810'],  // deep red — hardest
];

const COLOR_SCALES = {
  speed: EFFORT_RAMP,
  power: EFFORT_RAMP,
  heartRate: EFFORT_RAMP,
  elevation: [
    [0.0, '#2A8C82'],  // teal — low
    [0.25, '#5E9C6A'], // sage
    [0.5, '#C49A0A'],  // gold
    [0.75, '#D4600A'], // orange
    [1.0, '#C43C2A'],  // coral — high
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

  const distances_km = cumulativeDistancesKm(coords);

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
    let norm = null;
    let value = null;
    if (v1 == null && v2 == null) {
      color = '#666666';
    } else {
      value = v1 != null && v2 != null
        ? (v1 + v2) / 2
        : (v1 ?? v2);
      norm = Math.max(0, Math.min(1, (value - minVal) / range));
      color = interpolateColor(norm, colorScale);
    }

    features.push({
      type: 'Feature',
      properties: { color, norm, value, distance_km: distances_km[i] },
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
 * Bottom-left card: selected metric, its ride-wide average and max, the
 * color ramp with its display range, and — while hovering the route — the
 * reading under the cursor.
 */
function MetricStatsCard({ mode, min, max, summary, hovered }) {
  const config = COLOR_MODES[mode];
  const colorScale = COLOR_SCALES[mode];

  if (!colorScale || min == null || max == null) return null;

  const unit = metricUnit(mode);
  const gradientStops = colorScale.map(([pos, color]) => `${color} ${pos * 100}%`).join(', ');
  const labelStyle = { textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 };

  return (
    <Stack
      gap={4}
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 10,
        width: 236,
        maxWidth: 'calc(100% - 16px)',
        padding: '8px 10px',
        backgroundColor: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(4px)',
        color: 'white',
        pointerEvents: 'none',
      }}
    >
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="xs" fw={700} style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {config.label}
        </Text>
        <Text size="xs" style={{ opacity: 0.7 }}>{unit}</Text>
      </Group>

      {hovered ? (
        <Group gap={6} wrap="nowrap" align="baseline">
          <Text size="lg" fw={700} lh={1.1} ff="monospace">
            {formatMetricValue(mode, hovered.value)}
          </Text>
          <Text size="xs" style={{ opacity: 0.75 }}>at {formatDistanceKm(hovered.distance_km)}</Text>
        </Group>
      ) : summary ? (
        <Group gap="md" wrap="nowrap">
          <Group gap={4} align="baseline" wrap="nowrap">
            <Text size="xs" style={labelStyle}>avg</Text>
            <Text size="sm" fw={700} ff="monospace" lh={1.1}>{formatMetricValue(mode, summary.avg)}</Text>
          </Group>
          <Group gap={4} align="baseline" wrap="nowrap">
            <Text size="xs" style={labelStyle}>max</Text>
            <Text size="sm" fw={700} ff="monospace" lh={1.1}>{formatMetricValue(mode, summary.max)}</Text>
          </Group>
        </Group>
      ) : null}

      <Group gap={6} wrap="nowrap" mt={2}>
        <Text size="xs" ff="monospace" style={{ opacity: 0.85 }}>{formatMetricValue(mode, min)}</Text>
        <Box
          style={{
            flex: 1,
            height: 6,
            background: `linear-gradient(to right, ${gradientStops})`,
          }}
        />
        <Text size="xs" ff="monospace" style={{ opacity: 0.85 }}>{formatMetricValue(mode, max)}</Text>
      </Group>
    </Stack>
  );
}

/**
 * Basemap. Outdoors carries its own hillshade and contour lines, which is
 * what makes the pitched terrain read as terrain — the dark style has no
 * relief shading and a 3D ride on it looked like tilted paper.
 */
const RIDE_MAP_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

/** Mapbox terrain DEM, driving the 3D mesh via the `terrain` prop. */
const TERRAIN_SOURCE_ID = 'ride-terrain-dem';
const TERRAIN_SOURCE_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';

// Atmosphere for the pitched view: a pale haze that softens the far
// terrain and a muted sky so the horizon doesn't turn into a bright band.
const FOG_3D = {
  range: [0.8, 9],
  color: '#e4ebe7',
  'high-color': '#b7cad3',
  'space-color': '#9db3c0',
  'horizon-blend': 0.08,
  'star-intensity': 0,
};

// Under the colored segments: a dark outline so warm segment colors keep
// their edge against the light basemap.
const ROUTE_OUTLINE_COLOR = '#1f2a26';
const ROUTE_COLOR = '#1f6f68';

const MAP_HEIGHT = 440;
const FIT_PADDING = { top: 56, bottom: 44, left: 24, right: 24 };

const overlayControlStyles = {
  root: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
  },
  // Mantine's default indicator is opaque white, which hid the white
  // active label; a translucent one keeps every label legible.
  indicator: {
    backgroundColor: 'rgba(255,255,255,0.28)',
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
  const [hovered, setHovered] = useState(null);

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

  const summary = useMemo(
    () => (colorMode === 'plain' ? null : summarizeMetric(colorMode, activityStreams?.[colorMode])),
    [activityStreams, colorMode],
  );

  // Hover readout: the segment under the cursor on whichever metric layer
  // is showing. Mapbox hands back the feature's properties.
  const handleMouseMove = useCallback((event) => {
    const f = event.features?.[0];
    if (f && f.properties && f.properties.value != null) {
      setHovered({ value: f.properties.value, distance_km: f.properties.distance_km });
    } else {
      setHovered(null);
    }
  }, []);
  const handleMouseLeave = useCallback(() => setHovered(null), []);

  // In 3D the metric becomes height: one thin extruded wall per segment,
  // colored on the same scale as the flat line. Built lazily so 2D never
  // pays for polygon geometry.
  const extrusionGeoJSON = useMemo(() => {
    if (!is3d || !coloredGeoJSON) return null;
    const scale = extrusionScaleForCoords(geometry.coords);
    const segments = coloredGeoJSON.features.map((f) => ({
      coordinates: f.geometry.coordinates,
      norm: f.properties.norm,
      color: f.properties.color,
    }));
    const built = buildExtrusionCollection(segments, scale);
    // Carry the readout fields onto the walls so hover works there too.
    built.features.forEach((f, i) => {
      f.properties.value = coloredGeoJSON.features[i].properties.value;
      f.properties.distance_km = coloredGeoJSON.features[i].properties.distance_km;
    });
    return built;
  }, [is3d, coloredGeoJSON, geometry.coords]);

  // Reset to plain if current mode becomes unavailable
  const handleModeChange = useCallback((mode) => {
    if (availableModes.includes(mode)) {
      setColorMode(mode);
      setHovered(null);
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
  const showExtrusion = Boolean(showColoredRoute && is3d && extrusionGeoJSON);
  const hoverLayerIds = showExtrusion
    ? ['metric-extrusion-fill']
    : showColoredRoute
      ? ['colored-route-line']
      : undefined;

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
          mapStyle={RIDE_MAP_STYLE}
          mapboxAccessToken={MAPBOX_TOKEN}
          onLoad={() => setMapLoaded(true)}
          interactive={true}
          interactiveLayerIds={hoverLayerIds}
          onMouseMove={hoverLayerIds ? handleMouseMove : undefined}
          onMouseLeave={hoverLayerIds ? handleMouseLeave : undefined}
          cursor={hovered ? 'crosshair' : 'grab'}
          scrollZoom={false}
          dragRotate={true}
          touchPitch={true}
          maxPitch={75}
          terrain={is3d ? { source: TERRAIN_SOURCE_ID, exaggeration: RIDE_MAP_TERRAIN_EXAGGERATION } : undefined}
          fog={is3d ? FOG_3D : undefined}
        >
          {/* Terrain DEM for the 3D mesh (the basemap supplies its own hillshade) */}
          <Source
            id={TERRAIN_SOURCE_ID}
            type="raster-dem"
            url={TERRAIN_SOURCE_URL}
            tileSize={512}
            maxzoom={14}
          />

          {/* Plain route (shown when no color mode or as shadow under colored route) */}
          {geometry.geojson && (
            <Source id="route" type="geojson" data={geometry.geojson}>
              <Layer
                id="route-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': showColoredRoute ? ROUTE_OUTLINE_COLOR : ROUTE_COLOR,
                  'line-width': showColoredRoute ? 6.5 : 4,
                  'line-opacity': showColoredRoute ? 0.55 : 0.95,
                }}
              />
            </Source>
          )}

          {/* Colored route segments: flat line in 2D, extruded walls in 3D */}
          {showExtrusion && (
            <Source id="metric-extrusion" type="geojson" data={extrusionGeoJSON}>
              <Layer
                id="metric-extrusion-fill"
                type="fill-extrusion"
                paint={{
                  'fill-extrusion-color': ['get', 'color'],
                  'fill-extrusion-height': ['get', 'height'],
                  'fill-extrusion-base': 0,
                  'fill-extrusion-opacity': 0.88,
                  'fill-extrusion-vertical-gradient': true,
                }}
              />
            </Source>
          )}
          {showColoredRoute && !showExtrusion && (
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

        {/* Metric stats + color ramp + hover readout */}
        {showColoredRoute && meta && (
          <MetricStatsCard
            mode={colorMode}
            min={meta.min}
            max={meta.max}
            summary={summary}
            hovered={hovered}
          />
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
