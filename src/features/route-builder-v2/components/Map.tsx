/**
 * <Map /> — Route Builder 2.0 Mapbox wrapper (P1.3).
 *
 * Thin wrapper around react-map-gl's <Map>. Reads viewport from
 * useMapInteraction, handles clicks, exposes a children API so
 * consumers can pass <Source>/<Layer>/<Marker> children.
 *
 * Reads MAPBOX_TOKEN + BASEMAP_STYLES from the shared RouteBuilder
 * exports. Does NOT own layer toggle state — toggle state lives in
 * useRouteAnalysis. The wrapper only renders whatever layers it
 * receives as children.
 */

import { type ReactNode, useCallback, useRef } from 'react';
import MapboxMap, { Marker, Source, Layer, type MapRef, type MapLayerMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box, Text } from '@mantine/core';
import { MAPBOX_TOKEN, BASEMAP_STYLES, WAYPOINT_COLORS } from '../../../components/RouteBuilder';
import type { Coordinate } from '../../../types/geo';
import type { UseMapInteractionReturn } from '../../../hooks/route-builder';

const DEFAULT_STYLE = BASEMAP_STYLES[0].style;

export interface MapWrapperProps {
  map: UseMapInteractionReturn;
  routeGeometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  waypoints: ReadonlyArray<{ id: string; position: Coordinate; type?: string }>;
  cursor?: string;
  mapStyle?: string | object;
  children?: ReactNode;
}

export function Map({
  map,
  routeGeometry,
  waypoints,
  cursor,
  mapStyle = DEFAULT_STYLE,
  children,
}: MapWrapperProps) {
  const mapRef = useRef<MapRef | null>(null);
  const dragRef = useRef(false);

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      // Suppress clicks that were the end of a drag
      if (dragRef.current) {
        dragRef.current = false;
        return;
      }
      const coord: Coordinate = [evt.lngLat.lng, evt.lngLat.lat];
      void map.handleMapClick(coord);
    },
    [map],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <Box
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#141410',
          color: '#F4F4F2',
        }}
      >
        <Text
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          VITE_MAPBOX_TOKEN is not configured
        </Text>
      </Box>
    );
  }

  return (
    <MapboxMap
      ref={mapRef}
      initialViewState={{
        longitude: map.viewport.longitude,
        latitude: map.viewport.latitude,
        zoom: map.viewport.zoom,
      }}
      onMove={(evt) => {
        // Debounced write happens inside the hook; this fires per-frame.
        map.setViewport({
          longitude: evt.viewState.longitude,
          latitude: evt.viewState.latitude,
          zoom: evt.viewState.zoom,
        });
      }}
      onClick={handleClick}
      mapStyle={mapStyle as string}
      mapboxAccessToken={MAPBOX_TOKEN}
      style={{ width: '100%', height: '100%' }}
      cursor={cursor ?? 'grab'}
    >
      {/* Default flat route line — rendered unless a child layer overrides it */}
      {routeGeometry && routeGeometry.coordinates.length >= 2 && (
        <Source id="rb2-route" type="geojson" data={routeGeometry}>
          <Layer
            id="rb2-route-glow"
            type="line"
            paint={{
              'line-color': '#2A8C82',
              'line-width': 18,
              'line-opacity': 0.25,
              'line-blur': 6,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="rb2-route-line"
            type="line"
            paint={{
              'line-color': '#2A8C82',
              'line-width': 5,
              'line-opacity': 1,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Waypoint markers — draggable */}
      {waypoints.map((wp, index) => {
        const isStart = index === 0;
        const isEnd = index === waypoints.length - 1;
        const fill = isStart
          ? WAYPOINT_COLORS.start
          : isEnd
            ? WAYPOINT_COLORS.end
            : WAYPOINT_COLORS.waypoint;
        return (
          <Marker
            key={wp.id}
            longitude={wp.position[0]}
            latitude={wp.position[1]}
            anchor="center"
            draggable
            onDragStart={() => {
              dragRef.current = true;
            }}
            onDragEnd={(e) => {
              const coord: Coordinate = [e.lngLat.lng, e.lngLat.lat];
              void map.handleWaypointDrag(index, coord);
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                backgroundColor: '#141410',
                border: `2.5px solid ${fill}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
              data-testid={`rb2-waypoint-marker-${index}`}
            >
              <div style={{ width: 7, height: 7, backgroundColor: fill }} />
            </div>
          </Marker>
        );
      })}

      {children}
    </MapboxMap>
  );
}

export default Map;
