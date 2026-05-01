/**
 * MiniRouteMap — small embeddable Mapbox preview
 *
 * Designed for the HeroRoute card on the Today view. The audit notes
 * that no standalone "mini-map widget" exists; ColoredRouteMap is sized
 * for full-screen use. This component takes the same `geometry` shape
 * (a GeoJSON LineString or MultiLineString) and renders a static, no-
 * controls preview at a fixed height.
 */

import { useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box, Skeleton } from '@mantine/core';

// @ts-expect-error -- vite types not surfaced project-wide; matches RoutePreviewMap pattern
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface MiniRouteMapProps {
  geometry: unknown;          // GeoJSON LineString | MultiLineString from routes.geometry
  height?: number;
  showStartEnd?: boolean;
}

interface Bounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

function isCoord(c: unknown): c is [number, number] | [number, number, number] {
  return Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number';
}

function flattenCoords(geometry: unknown): [number, number][] {
  if (!geometry || typeof geometry !== 'object') return [];
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[]).filter(isCoord).map((c) => [c[0], c[1]]);
  }
  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[][]).flat().filter(isCoord).map((c) => [c[0], c[1]]);
  }
  return [];
}

function computeBounds(coords: [number, number][]): Bounds | null {
  if (coords.length === 0) return null;
  let minLng = coords[0][0], maxLng = coords[0][0];
  let minLat = coords[0][1], maxLat = coords[0][1];
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

function MiniRouteMap({ geometry, height = 220, showStartEnd = true }: MiniRouteMapProps) {
  const coords = useMemo(() => flattenCoords(geometry), [geometry]);
  const bounds = useMemo(() => computeBounds(coords), [coords]);

  const initialViewState = useMemo(() => {
    if (!bounds) return { longitude: -105.27, latitude: 40.015, zoom: 9 };
    return {
      longitude: (bounds.minLng + bounds.maxLng) / 2,
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      zoom: 9,
      bounds: [
        [bounds.minLng - 0.01, bounds.minLat - 0.01],
        [bounds.maxLng + 0.01, bounds.maxLat + 0.01],
      ] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 24 },
    };
  }, [bounds]);

  if (!coords.length) {
    return (
      <Box
        style={{
          height,
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 13,
          fontFamily: 'monospace',
        }}
      >
        No route preview available
      </Box>
    );
  }

  if (!MAPBOX_TOKEN) {
    return <Skeleton height={height} radius={0} />;
  }

  const lineGeoJSON = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: coords },
  };

  const startPoint = coords[0];
  const endPoint = coords[coords.length - 1];
  const endpointsGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { kind: 'start' },
        geometry: { type: 'Point' as const, coordinates: startPoint },
      },
      {
        type: 'Feature' as const,
        properties: { kind: 'end' },
        geometry: { type: 'Point' as const, coordinates: endPoint },
      },
    ],
  };

  return (
    <Box style={{ height, position: 'relative', overflow: 'hidden' }}>
      <Map
        initialViewState={initialViewState}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        attributionControl={false}
        interactive={false}
        style={{ width: '100%', height: '100%' }}
      >
        <Source id="mini-route" type="geojson" data={lineGeoJSON}>
          <Layer
            id="mini-route-line"
            type="line"
            paint={{
              'line-color': '#2A8C82',
              'line-width': 4,
              'line-opacity': 0.92,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
        {showStartEnd && (
          <Source id="mini-route-points" type="geojson" data={endpointsGeoJSON}>
            <Layer
              id="mini-route-points-circle"
              type="circle"
              paint={{
                'circle-radius': 5,
                'circle-color': [
                  'match',
                  ['get', 'kind'],
                  'start', '#2A8C82',
                  'end', '#C43C2A',
                  '#5A6B7A',
                ],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              }}
            />
          </Source>
        )}
      </Map>
    </Box>
  );
}

export default MiniRouteMap;
