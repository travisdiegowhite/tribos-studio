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
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Gauge, Heartbeat, Lightning, Mountains, Path } from '@phosphor-icons/react';
import {
  bucketAverageRows,
  buildStreamRows,
  cumulativeDistancesKm,
  smoothRows,
} from '../utils/streamChartData';
import RideMetricStrip from './RideMetricStrip';
import {
  HR_ZONE_DEFS,
  POWER_ZONE_DEFS,
  ZONE_COLORS,
  hrZoneFor,
  powerZoneFor,
  zoneLowerBound,
} from '../utils/rideZones';
import {
  formatDistanceKm,
  formatMetricValue,
  metricUnit,
  nearestIndex,
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
 * Percentile display range for a metric (2nd–98th) so a single spike doesn't
 * flatten the rest of the ride. Null when there's nothing to show.
 */
function metricRange(metricArray) {
  if (!metricArray) return null;
  const validValues = metricArray.filter(v => v != null && v > 0);
  if (validValues.length === 0) return null;
  const sorted = [...validValues].sort((a, b) => a - b);
  const min = sorted[Math.floor(sorted.length * 0.02)];
  const max = sorted[Math.floor(sorted.length * 0.98)];
  if (max - min <= 0) return null;
  return { min, max };
}

/**
 * Build colored GeoJSON segments from parallel coords/metric arrays.
 * Each segment is a 2-point LineString carrying its color, the metric's
 * normalized position in the display range (drives wall height in 3D), the
 * raw value and the cumulative distance (drive the readout and scrub sync).
 */
function buildColoredSegments(coords, metricArray, distances_km, range, colorFor) {
  if (!metricArray || !range || coords.length < 2) return null;
  const { min: minVal, max: maxVal } = range;
  const span = maxVal - minVal;
  const features = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const v1 = metricArray[i];
    const v2 = metricArray[i + 1];

    let color = '#666666';
    let norm = null;
    let value = null;
    if (!(v1 == null && v2 == null)) {
      value = v1 != null && v2 != null ? (v1 + v2) / 2 : (v1 ?? v2);
      norm = Math.max(0, Math.min(1, (value - minVal) / span));
      color = colorFor(value, norm);
    }

    features.push({
      type: 'Feature',
      properties: { color, norm, value, distance_km: distances_km[i], index: i },
      geometry: {
        type: 'LineString',
        coordinates: [coords[i], coords[i + 1]],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * How a metric maps to color. Two kinds:
 *  - `zones`: discrete bands from the athlete's FTP (7 power zones) or the
 *    ride's max HR (5 HR zones), in the Power tab's zone colors.
 *  - `ramp`: continuous percentile ramp, used for speed, elevation, and for
 *    power / HR when no reference is known.
 */
function buildColorizer(mode, { ftp, maxHr, range }) {
  if (mode === 'plain') return null;
  if (mode === 'power' && ftp > 0) {
    const colors = ZONE_COLORS.slice(0, POWER_ZONE_DEFS.length);
    return {
      kind: 'zones',
      defs: POWER_ZONE_DEFS,
      colors,
      reference: ftp,
      zoneFor: (v) => powerZoneFor(v, ftp),
      colorFor: (v) => {
        const z = powerZoneFor(v, ftp);
        return z ? colors[z.zone - 1] : '#666666';
      },
    };
  }
  if (mode === 'heartRate' && maxHr > 0) {
    const colors = ZONE_COLORS.slice(0, HR_ZONE_DEFS.length);
    return {
      kind: 'zones',
      defs: HR_ZONE_DEFS,
      colors,
      reference: maxHr,
      zoneFor: (v) => hrZoneFor(v, maxHr),
      colorFor: (v) => {
        const z = hrZoneFor(v, maxHr);
        return z ? colors[z.zone - 1] : '#666666';
      },
    };
  }
  const scale = COLOR_SCALES[mode];
  if (!scale || !range) return null;
  const span = range.max - range.min;
  return {
    kind: 'ramp',
    scale,
    zoneFor: () => null,
    colorFor: (v, norm) => {
      const n = norm ?? Math.max(0, Math.min(1, (v - range.min) / span));
      return interpolateColor(n, scale);
    },
  };
}

/**
 * Bottom-left card: selected metric, its ride-wide average and max, the
 * color key (zone swatches or ramp with its range), and — while scrubbing —
 * the reading under the cursor with the other metrics at that point.
 */
function MetricStatsCard({ mode, range, summary, colorizer, hovered }) {
  const config = COLOR_MODES[mode];
  if (!config || !colorizer) return null;

  const unit = metricUnit(mode);
  const labelStyle = { textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 };
  const hoveredZone = hovered ? colorizer.zoneFor(hovered.value) : null;

  return (
    <Stack
      gap={4}
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 10,
        width: 250,
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
        <Text size="xs" style={{ opacity: 0.7 }}>
          {colorizer.kind === 'zones'
            ? `zones · ${mode === 'power' ? 'FTP' : 'max HR'} ${Math.round(colorizer.reference)} ${unit}`
            : unit}
        </Text>
      </Group>

      {hovered ? (
        <Stack gap={2}>
          <Group gap={6} wrap="nowrap" align="baseline">
            <Text size="lg" fw={700} lh={1.1} ff="monospace">
              {formatMetricValue(mode, hovered.value)}
            </Text>
            <Text size="xs" style={{ opacity: 0.8 }}>{unit}</Text>
            {hoveredZone && (
              <Text size="xs" fw={600} style={{ color: colorizer.colorFor(hovered.value) }}>
                Z{hoveredZone.zone} {hoveredZone.name}
              </Text>
            )}
            <Text size="xs" style={{ opacity: 0.75, marginLeft: 'auto' }}>
              {formatDistanceKm(hovered.distance_km)}
            </Text>
          </Group>
          {hovered.others && (
            <Text size="xs" ff="monospace" style={{ opacity: 0.8 }}>
              {hovered.others}
            </Text>
          )}
        </Stack>
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

      {colorizer.kind === 'zones' ? (
        <Group gap={2} wrap="nowrap" mt={2}>
          {colorizer.defs.map((z, i) => (
            <Box
              key={z.zone}
              title={`Z${z.zone} ${z.name} · from ${zoneLowerBound(z, colorizer.reference)} ${unit}`}
              style={{
                flex: 1,
                height: 14,
                backgroundColor: colorizer.colors[i],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredZone && hoveredZone.zone !== z.zone ? 0.45 : 1,
              }}
            >
              <Text size="9px" fw={700} ff="monospace" lh={1} style={{ color: 'rgba(255,255,255,0.92)', textShadow: '0 1px 1px rgba(0,0,0,0.6)' }}>
                Z{z.zone}
              </Text>
            </Box>
          ))}
        </Group>
      ) : range ? (
        <Group gap={6} wrap="nowrap" mt={2}>
          <Text size="xs" ff="monospace" style={{ opacity: 0.85 }}>{formatMetricValue(mode, range.min)}</Text>
          <Box
            style={{
              flex: 1,
              height: 6,
              background: `linear-gradient(to right, ${colorizer.scale.map(([pos, color]) => `${color} ${pos * 100}%`).join(', ')})`,
            }}
          />
          <Text size="xs" ff="monospace" style={{ opacity: 0.85 }}>{formatMetricValue(mode, range.max)}</Text>
        </Group>
      ) : null}
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
 * Strip chart resolution. The strip is an overview, so it is smoothed harder
 * than RideStreamsChart: a rolling mean sized to ~STRIP_SMOOTH_TARGET
 * effective samples, then bucket-averaged (not LTTB, which keeps spikes) to
 * STRIP_TARGET_POINTS.
 */
const STRIP_TARGET_POINTS = 240;
const STRIP_SMOOTH_TARGET = 120;
const STRIP_MAX_WINDOW = 61;

/** First metric worth showing when the map opens. */
function defaultColorMode(streams) {
  if (!streams?.coords) return 'plain';
  for (const mode of ['power', 'heartRate', 'speed', 'elevation']) {
    if (streams[mode]) return mode;
  }
  return 'plain';
}

/**
 * ColoredRouteMap Component
 * Renders a ride on a Mapbox map, colored by power, heart rate, speed or
 * elevation, with a scrubbable strip chart of the same metric beneath.
 *
 * Draws over 3D terrain by default (toggleable, remembered per viewer); in 3D
 * the metric also becomes wall height along the route. The track comes from
 * `activityStreams.coords` when present so a colored segment lands on the
 * exact geometry it was measured on; the decoded summary polyline
 * (`routeCoords`) is the fallback for older activities.
 *
 * Power colors by FTP zones when `ftp` is known and heart rate by max-HR
 * zones when `maxHr` is known; otherwise a percentile ramp.
 */
const ColoredRouteMap = ({ activityStreams, routeCoords, bounds: boundsProp, ftp, maxHr }) => {
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [colorMode, setColorMode] = useState(() => defaultColorMode(activityStreams));
  const [is3d, setIs3d] = useState(() => readStored3dPreference());
  // Shared scrub position: distance along the ride, in km. Drives the map
  // marker, the strip cursor and the readout together.
  const [hoverX, setHoverX] = useState(null);

  const geometry = useMemo(
    () => routeGeometryFor(activityStreams, routeCoords),
    [activityStreams, routeCoords],
  );
  const bounds = geometry.bounds ?? boundsProp ?? null;
  const bearing3d = useMemo(() => cameraBearingForRoute(geometry.coords), [geometry.coords]);
  const hasStreamTrack = geometry.source === 'streams';

  const distances_km = useMemo(
    () => (hasStreamTrack ? cumulativeDistancesKm(geometry.coords) : []),
    [hasStreamTrack, geometry.coords],
  );

  // Determine which color modes are available based on stream data. Colored
  // segments are only meaningful on the stream track itself.
  const availableModes = useMemo(() => {
    const modes = ['plain'];
    if (activityStreams && hasStreamTrack) {
      if (activityStreams.power) modes.push('power');
      if (activityStreams.heartRate) modes.push('heartRate');
      if (activityStreams.speed) modes.push('speed');
      if (activityStreams.elevation) modes.push('elevation');
    }
    return modes;
  }, [activityStreams, hasStreamTrack]);

  const range = useMemo(
    () => (colorMode === 'plain' ? null : metricRange(activityStreams?.[colorMode])),
    [activityStreams, colorMode],
  );

  const colorizer = useMemo(
    () => buildColorizer(colorMode, { ftp, maxHr, range }),
    [colorMode, ftp, maxHr, range],
  );

  const summary = useMemo(
    () => (colorMode === 'plain' ? null : summarizeMetric(colorMode, activityStreams?.[colorMode])),
    [activityStreams, colorMode],
  );

  const coloredGeoJSON = useMemo(() => {
    if (!colorizer || !hasStreamTrack) return null;
    return buildColoredSegments(
      geometry.coords,
      activityStreams[colorMode],
      distances_km,
      range,
      colorizer.colorFor,
    );
  }, [colorizer, hasStreamTrack, geometry.coords, activityStreams, colorMode, distances_km, range]);

  // In 3D the metric becomes height: one thin extruded wall per segment,
  // colored like the flat line. Built lazily so 2D never pays for polygons.
  const extrusionGeoJSON = useMemo(() => {
    if (!is3d || !coloredGeoJSON) return null;
    const scale = extrusionScaleForCoords(geometry.coords);
    const segments = coloredGeoJSON.features.map((f) => ({
      coordinates: f.geometry.coordinates,
      norm: f.properties.norm,
      color: f.properties.color,
    }));
    const built = buildExtrusionCollection(segments, scale);
    built.features.forEach((f, i) => {
      const src = coloredGeoJSON.features[i].properties;
      f.properties.value = src.value;
      f.properties.distance_km = src.distance_km;
    });
    return built;
  }, [is3d, coloredGeoJSON, geometry.coords]);

  // Strip chart rows: smoothed and thinned like RideStreamsChart, keyed on
  // distance so they line up with the map's segments.
  const stripRows = useMemo(() => {
    if (!hasStreamTrack) return [];
    const { rows } = buildStreamRows(activityStreams);
    let window = Math.floor(rows.length / STRIP_SMOOTH_TARGET);
    window = Math.min(STRIP_MAX_WINDOW, Math.max(1, window));
    if (window % 2 === 0) window += 1;
    const smoothed = smoothRows(rows, ['power', 'heartRate', 'speed_kmh', 'cadence'], window);
    return bucketAverageRows(smoothed, STRIP_TARGET_POINTS);
  }, [activityStreams, hasStreamTrack]);
  const stripXs = useMemo(() => stripRows.map((r) => r.x), [stripRows]);

  // Strip colors work in row units (km/h for speed); the map's in stream units.
  const colorForRowValue = useCallback(
    (v) => (colorizer ? colorizer.colorFor(colorMode === 'speed' ? v / 3.6 : v) : ROUTE_COLOR),
    [colorizer, colorMode],
  );

  // Everything the scrub position resolves to: marker coordinate, readout.
  const scrub = useMemo(() => {
    if (hoverX == null || !hasStreamTrack) return null;
    const ci = nearestIndex(distances_km, hoverX);
    const ri = nearestIndex(stripXs, hoverX);
    if (ci < 0) return null;
    const coord = geometry.coords[ci];
    const row = ri >= 0 ? stripRows[ri] : null;
    const streamValue = colorMode === 'plain' ? null : activityStreams?.[colorMode]?.[ci];
    const others = row
      ? [
          colorMode !== 'power' && row.power != null ? `${Math.round(row.power)} W` : null,
          colorMode !== 'heartRate' && row.heartRate != null ? `${Math.round(row.heartRate)} bpm` : null,
          colorMode !== 'speed' && row.speed_kmh != null ? `${Math.round(row.speed_kmh)} km/h` : null,
          colorMode !== 'elevation' && row.elevation_m != null ? `${Math.round(row.elevation_m)} m` : null,
        ].filter(Boolean).join(' · ')
      : null;
    return {
      coord,
      color: colorizer && streamValue != null ? colorizer.colorFor(streamValue) : ROUTE_COLOR,
      readout: streamValue != null ? { value: streamValue, distance_km: distances_km[ci], others } : null,
    };
  }, [hoverX, hasStreamTrack, distances_km, stripXs, stripRows, geometry.coords, colorMode, activityStreams, colorizer]);

  // Map hover: the segment under the cursor on whichever metric layer shows.
  const handleMouseMove = useCallback((event) => {
    const f = event.features?.[0];
    if (f && f.properties && f.properties.distance_km != null) {
      setHoverX(f.properties.distance_km);
    } else {
      setHoverX(null);
    }
  }, []);
  const handleMouseLeave = useCallback(() => setHoverX(null), []);

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

  const showColoredRoute = Boolean(coloredGeoJSON);
  const showExtrusion = Boolean(showColoredRoute && is3d && extrusionGeoJSON);
  const hoverLayerIds = showExtrusion
    ? ['metric-extrusion-fill']
    : showColoredRoute
      ? ['colored-route-line']
      : undefined;
  const mapHovering = Boolean(scrub) && hoverLayerIds;

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
          cursor={mapHovering ? 'crosshair' : 'grab'}
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

          {/* Plain route (shown when no color mode or as outline under colored route) */}
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

          {/* Scrub marker */}
          {scrub && (
            <Marker longitude={scrub.coord[0]} latitude={scrub.coord[1]} anchor="center">
              <Box
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: scrub.color,
                  border: '3px solid white',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              />
            </Marker>
          )}

          <NavigationControl position="top-left" visualizePitch showZoom showCompass />
        </Map>

        {/* Metric stats + color key + scrub readout */}
        {showColoredRoute && colorizer && (
          <MetricStatsCard
            mode={colorMode}
            range={range}
            summary={summary}
            colorizer={colorizer}
            hovered={scrub?.readout ?? null}
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

      {/* Scrubber: the selected metric against distance, elevation behind */}
      {stripRows.length > 1 && (
        <RideMetricStrip
          rows={stripRows}
          metric={colorMode === 'plain' ? null : colorMode}
          colorForValue={colorForRowValue}
          hoverX={hoverX}
          onHoverX={setHoverX}
        />
      )}
    </Paper>
  );
};

export default ColoredRouteMap;
