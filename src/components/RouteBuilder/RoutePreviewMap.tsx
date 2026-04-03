import { useMemo, useState, useCallback, useEffect } from 'react';
import { Box, Text, Group, Skeleton } from '@mantine/core';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchElevationProfile, calculateElevationStats } from '../../utils/directions';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Grade-based color scale for terrain overlay.
 * Maps grade percentage to colors matching the tribos design system.
 */
const GRADE_COLOR_SCALE: [number, string][] = [
  [0.0, '#2A8C82'],  // flat — teal
  [0.25, '#C49A0A'], // gentle — gold
  [0.5, '#D4600A'],  // moderate — orange
  [0.75, '#C43C2A'], // steep — coral
  [1.0, '#C43C2A'],  // very steep — coral
];

type OverlayMode = 'plain' | 'terrain';

interface ElevationPoint {
  elevation: number;
  distance: number;
  coordinate: number[];
}

interface RoutePreviewMapProps {
  /** GeoJSON geometry (LineString or MultiLineString) from the routes table */
  geometry: GeoJSON.Geometry | null;
  /** Elevation values per coordinate point (meters). Enables terrain overlay. */
  elevationProfile?: number[];
  /** Map height in pixels (default: 180) */
  height?: number;
  /** Overlay mode: 'plain' for solid line, 'terrain' for grade-based coloring */
  mode?: OverlayMode;
  /** Whether the map is interactive (pan/zoom). Default: false */
  interactive?: boolean;
  /** Callback with computed elevation stats when fetched on-demand */
  onElevationLoaded?: (stats: { gain: number; loss: number; min: number; max: number }) => void;
}

function interpolateColor(value: number, scale: [number, string][]): string {
  const v = Math.max(0, Math.min(1, value));
  for (let i = 0; i < scale.length - 1; i++) {
    const [low, lowColor] = scale[i];
    const [high, highColor] = scale[i + 1];
    if (v >= low && v <= high) {
      const t = (v - low) / (high - low);
      return lerpColor(lowColor, highColor, t);
    }
  }
  return scale[scale.length - 1][1];
}

function lerpColor(a: string, b: string, t: number): string {
  const r1 = parseInt(a.slice(1, 3), 16);
  const g1 = parseInt(a.slice(3, 5), 16);
  const b1 = parseInt(a.slice(5, 7), 16);
  const r2 = parseInt(b.slice(1, 3), 16);
  const g2 = parseInt(b.slice(3, 5), 16);
  const b2 = parseInt(b.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/** Extract a flat coordinate array from GeoJSON geometry */
function getCoordinates(geometry: GeoJSON.Geometry): number[][] {
  if (geometry.type === 'LineString') {
    return geometry.coordinates as number[][];
  }
  if (geometry.type === 'MultiLineString') {
    return (geometry.coordinates as number[][][]).flat();
  }
  return [];
}

/** Compute [minLng, minLat, maxLng, maxLat] bounding box */
function computeBounds(coords: number[][]): [number, number, number, number] | null {
  if (coords.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Build grade-colored GeoJSON segments from sampled elevation data.
 * Maps elevation points back to coordinate segments for coloring.
 */
function buildTerrainSegmentsFromProfile(
  coords: number[][],
  elevProfile: ElevationPoint[],
): { geojson: GeoJSON.FeatureCollection; minGrade: number; maxGrade: number } | null {
  if (coords.length < 2 || elevProfile.length < 2) return null;

  // Build an interpolated elevation value for each coordinate.
  // elevProfile has sampled points with distance values; we interpolate
  // between them to get elevation at each coordinate index.
  const totalCoords = coords.length;
  const elevAtCoord: number[] = new Array(totalCoords);

  // Map each coordinate to a fractional position (0..1) along the route
  let runningDist = 0;
  const coordDists: number[] = [0];
  for (let i = 1; i < totalCoords; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = (lat2 - lat1) * 111_320;
    const dLng = (lng2 - lng1) * 111_320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    runningDist += Math.sqrt(dLat * dLat + dLng * dLng);
    coordDists.push(runningDist);
  }
  const totalDist = runningDist || 1;

  // elevProfile distances are in meters from start
  const maxProfileDist = elevProfile[elevProfile.length - 1].distance || totalDist;

  let profileIdx = 0;
  for (let i = 0; i < totalCoords; i++) {
    const coordDistNorm = coordDists[i] / totalDist;
    const targetDist = coordDistNorm * maxProfileDist;

    // Advance profileIdx to bracket targetDist
    while (profileIdx < elevProfile.length - 2 && elevProfile[profileIdx + 1].distance < targetDist) {
      profileIdx++;
    }

    const p1 = elevProfile[profileIdx];
    const p2 = elevProfile[Math.min(profileIdx + 1, elevProfile.length - 1)];
    const span = p2.distance - p1.distance;
    const t = span > 0 ? Math.max(0, Math.min(1, (targetDist - p1.distance) / span)) : 0;
    elevAtCoord[i] = p1.elevation + (p2.elevation - p1.elevation) * t;
  }

  // Compute grade for each segment
  const grades: number[] = [];
  for (let i = 0; i < totalCoords - 1; i++) {
    const segDist = coordDists[i + 1] - coordDists[i];
    const dElev = elevAtCoord[i + 1] - elevAtCoord[i];
    grades.push(segDist > 1 ? Math.abs(dElev / segDist) * 100 : 0);
  }

  const sorted = [...grades].sort((a, b) => a - b);
  const maxGrade = sorted[Math.floor(sorted.length * 0.98)] || 1;

  const features: GeoJSON.Feature[] = grades.map((grade, i) => ({
    type: 'Feature' as const,
    properties: {
      color: interpolateColor(Math.min(grade / maxGrade, 1), GRADE_COLOR_SCALE),
    },
    geometry: {
      type: 'LineString' as const,
      coordinates: [coords[i], coords[i + 1]],
    },
  }));

  return {
    geojson: { type: 'FeatureCollection', features },
    minGrade: 0,
    maxGrade,
  };
}

/**
 * RoutePreviewMap — lightweight, read-only map preview for route cards.
 *
 * Renders a route polyline with optional grade-based terrain coloring.
 * When mode='terrain' and no elevation data is available, automatically
 * fetches elevation using the same multi-source API (Open-Elevation /
 * Mapbox terrain) used by the route builder.
 */
export default function RoutePreviewMap({
  geometry,
  elevationProfile,
  height = 180,
  mode = 'plain',
  interactive = false,
  onElevationLoaded,
}: RoutePreviewMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [fetchedProfile, setFetchedProfile] = useState<ElevationPoint[] | null>(null);
  const [elevFetchAttempted, setElevFetchAttempted] = useState(false);

  const coords = useMemo(
    () => (geometry ? getCoordinates(geometry) : []),
    [geometry],
  );

  const bounds = useMemo(() => computeBounds(coords), [coords]);

  const routeGeoJSON = useMemo<GeoJSON.Feature | null>(() => {
    if (!geometry) return null;
    return { type: 'Feature', properties: {}, geometry };
  }, [geometry]);

  // Check for inline 3D elevation
  const has3DCoords = coords.length >= 2 && coords[0].length >= 3 && coords[0][2] != null;

  // Fetch elevation on-demand when terrain mode needs it and we don't have any
  const needsFetch = mode === 'terrain' && !elevationProfile?.length && !has3DCoords && !fetchedProfile && !elevFetchAttempted;

  useEffect(() => {
    if (!needsFetch || coords.length < 2) return;

    let cancelled = false;
    setElevFetchAttempted(true);

    fetchElevationProfile(coords, MAPBOX_TOKEN).then((profile: ElevationPoint[]) => {
      if (cancelled) return;
      if (!profile || profile.length < 2) {
        console.warn('RoutePreviewMap: elevation fetch returned insufficient data', profile?.length);
        return;
      }
      console.log('RoutePreviewMap: elevation loaded', profile.length, 'points');
      setFetchedProfile(profile);

      // Compute stats and notify parent
      if (onElevationLoaded) {
        const stats = calculateElevationStats(profile);
        onElevationLoaded(stats);
      }
    }).catch((err) => {
      console.warn('RoutePreviewMap: elevation fetch failed', err);
    });

    return () => { cancelled = true; };
  }, [needsFetch, coords, onElevationLoaded]);

  // Build terrain segments from whichever elevation source is available
  const terrainData = useMemo(() => {
    if (mode !== 'terrain') return null;

    // Priority 1: explicit elevation profile prop (array of numbers per coord)
    if (elevationProfile && elevationProfile.length >= 2) {
      // Convert simple number array to ElevationPoint-like for the builder
      const asProfile: ElevationPoint[] = elevationProfile.map((elev, i) => ({
        elevation: elev,
        distance: i, // placeholder — buildTerrainSegmentsFromProfile normalizes
        coordinate: coords[i] || [0, 0],
      }));
      return buildTerrainSegmentsFromProfile(coords, asProfile);
    }

    // Priority 2: 3D coordinates
    if (has3DCoords) {
      const asProfile: ElevationPoint[] = coords.map((c, i) => ({
        elevation: c[2],
        distance: i,
        coordinate: c,
      }));
      return buildTerrainSegmentsFromProfile(coords, asProfile);
    }

    // Priority 3: fetched profile
    if (fetchedProfile) {
      return buildTerrainSegmentsFromProfile(coords, fetchedProfile);
    }

    return null;
  }, [mode, elevationProfile, has3DCoords, fetchedProfile, coords]);

  const handleLoad = useCallback(() => setMapLoaded(true), []);

  if (!geometry || !bounds || !MAPBOX_TOKEN) return null;

  const showTerrain = mode === 'terrain' && terrainData;

  return (
    <Box style={{ height, position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
      {!mapLoaded && <Skeleton height={height} radius={0} />}

      <Map
        initialViewState={{
          bounds: bounds as [number, number, number, number],
          fitBoundsOptions: { padding: 30 },
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={handleLoad}
        interactive={interactive}
        scrollZoom={false}
        dragPan={interactive}
        dragRotate={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        attributionControl={false}
      >
        {/* Base route line (shadow when terrain overlay active, primary otherwise) */}
        {routeGeoJSON && (
          <Source id="route-preview" type="geojson" data={routeGeoJSON}>
            <Layer
              id="route-preview-line"
              type="line"
              paint={{
                'line-color': showTerrain ? '#9A9C90' : '#2A8C82',
                'line-width': showTerrain ? 4 : 3,
                'line-opacity': showTerrain ? 0.35 : 0.9,
              }}
            />
          </Source>
        )}

        {/* Terrain-colored segments */}
        {showTerrain && (
          <Source id="terrain-overlay" type="geojson" data={terrainData.geojson}>
            <Layer
              id="terrain-overlay-line"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 3,
                'line-opacity': 0.95,
              }}
            />
          </Source>
        )}
      </Map>

      {/* Grade legend for terrain mode */}
      {showTerrain && (
        <Group
          gap={4}
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            right: 6,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <Text size="10px" fw={600} c="white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            0%
          </Text>
          <Box
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: `linear-gradient(to right, ${GRADE_COLOR_SCALE.map(([pos, color]) => `${color} ${pos * 100}%`).join(', ')})`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          />
          <Text size="10px" fw={600} c="white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {Math.round(terrainData.maxGrade)}%
          </Text>
        </Group>
      )}
    </Box>
  );
}
