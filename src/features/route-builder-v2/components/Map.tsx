/**
 * <Map /> — Route Builder 2.0 Mapbox wrapper (P1.3).
 *
 * Thin wrapper around react-map-gl's <Map>. Reads viewport from
 * useMapInteraction, handles clicks, exposes a children API so
 * consumers can pass <Source>/<Layer>/<Marker> children.
 *
 * Manual-editing interactions (competitor parity):
 *  - Click empty map      → append a waypoint (handleMapClick).
 *  - Drag a waypoint      → move it and reroute.
 *  - Drag the route line  → insert a shaping point between control points.
 *  - Hover a waypoint     → an ✕ appears; click it (or right-click the
 *                           marker) to remove the point.
 *
 * Reads MAPBOX_TOKEN + BASEMAP_STYLES from the shared RouteBuilder exports.
 */

import { type ReactNode, useCallback, useRef, useState } from 'react';
import MapboxMap, {
  Marker,
  Source,
  Layer,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box, Text } from '@mantine/core';
import { X } from '@phosphor-icons/react';
import { MAPBOX_TOKEN, BASEMAP_STYLES, WAYPOINT_COLORS } from '../../../components/RouteBuilder';
import type { Coordinate } from '../../../types/geo';
import type { MapController, UseMapInteractionReturn } from '../../../hooks/route-builder';
import { nearestInsertIndex } from './lineInsert';

const DEFAULT_STYLE = BASEMAP_STYLES[0].style;

/** Transparent, wide overlay of the route used as the grab target for line-drag. */
const ROUTE_HIT_LAYER_ID = 'rb2-route-hit';

export interface MapWrapperProps {
  map: UseMapInteractionReturn;
  routeGeometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  waypoints: ReadonlyArray<{ id: string; position: Coordinate; type?: string }>;
  cursor?: string;
  mapStyle?: string | object;
  /** Elevation-chart hover position; renders a non-interactive dot on the route. */
  highlightCoord?: Coordinate | null;
  children?: ReactNode;
}

export function Map({
  map,
  routeGeometry,
  waypoints,
  cursor,
  mapStyle = DEFAULT_STYLE,
  highlightCoord,
  children,
}: MapWrapperProps) {
  const mapRef = useRef<MapRef | null>(null);
  const dragRef = useRef(false);
  // Line-drag state: the insert index is fixed at grab time; `ghost` follows
  // the cursor so the user previews where the new point will land.
  const lineDragRef = useRef<{ active: boolean; insertAt: number }>({
    active: false,
    insertAt: -1,
  });
  const suppressClickRef = useRef(false);
  const [ghost, setGhost] = useState<Coordinate | null>(null);
  const [overLine, setOverLine] = useState(false);
  const [hoveredWp, setHoveredWp] = useState<number | null>(null);

  const hasLine = !!routeGeometry && routeGeometry.coordinates.length >= 2;

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      // Suppress the click that ends a marker drag or a line-drag.
      if (dragRef.current) {
        dragRef.current = false;
        return;
      }
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const coord: Coordinate = [evt.lngLat.lng, evt.lngLat.lat];
      void map.handleMapClick(coord);
    },
    [map],
  );

  const handleMouseDown = useCallback(
    (evt: MapLayerMouseEvent) => {
      if (dragRef.current || !hasLine) return;
      const onLine = evt.features?.some((f) => f.layer?.id === ROUTE_HIT_LAYER_ID);
      if (!onLine) return;
      // Begin a line-drag: lock in the insert index, freeze map panning, and
      // start previewing the ghost point.
      const point: Coordinate = [evt.lngLat.lng, evt.lngLat.lat];
      const insertAt = nearestInsertIndex(
        routeGeometry!.coordinates,
        waypoints.map((w) => w.position),
        point,
      );
      lineDragRef.current = { active: true, insertAt };
      setGhost(point);
      mapRef.current?.getMap?.().dragPan.disable();
      evt.preventDefault?.();
    },
    [hasLine, routeGeometry, waypoints],
  );

  const handleMouseMove = useCallback((evt: MapLayerMouseEvent) => {
    if (lineDragRef.current.active) {
      setGhost([evt.lngLat.lng, evt.lngLat.lat]);
      return;
    }
    setOverLine(!!evt.features?.some((f) => f.layer?.id === ROUTE_HIT_LAYER_ID));
  }, []);

  const handleMouseUp = useCallback(
    (evt: MapLayerMouseEvent) => {
      if (!lineDragRef.current.active) return;
      const coord: Coordinate = [evt.lngLat.lng, evt.lngLat.lat];
      const { insertAt } = lineDragRef.current;
      lineDragRef.current = { active: false, insertAt: -1 };
      setGhost(null);
      mapRef.current?.getMap?.().dragPan.enable();
      // The drag ends with a click event we don't want to also append a point.
      suppressClickRef.current = true;
      void map.handleAddWaypointAtClick(coord, insertAt);
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

  const activeCursor = ghost ? 'grabbing' : overLine ? 'grab' : (cursor ?? 'crosshair');

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
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      interactiveLayerIds={hasLine ? [ROUTE_HIT_LAYER_ID] : undefined}
      onLoad={() => map.registerMap(mapRef.current as unknown as MapController)}
      mapStyle={mapStyle as string}
      mapboxAccessToken={MAPBOX_TOKEN}
      style={{ width: '100%', height: '100%' }}
      cursor={activeCursor}
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
          {/* Transparent wide grab target for line-drag (topmost, ~invisible). */}
          <Layer
            id={ROUTE_HIT_LAYER_ID}
            type="line"
            paint={{ 'line-color': '#000000', 'line-width': 22, 'line-opacity': 0.001 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Waypoint markers — draggable; start/end are pins, mid points are dots */}
      {waypoints.map((wp, index) => {
        const isStart = index === 0;
        const isEnd = index === waypoints.length - 1;
        const fill = isStart
          ? WAYPOINT_COLORS.start
          : isEnd
            ? WAYPOINT_COLORS.end
            : WAYPOINT_COLORS.waypoint;
        const isAnchor = isStart || isEnd;
        const size = isAnchor ? 22 : 14;
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
              onMouseEnter={() => setHoveredWp(index)}
              onMouseLeave={() => setHoveredWp((h) => (h === index ? null : h))}
              onContextMenu={(e) => {
                // Right-click removes the point (desktop affordance).
                e.preventDefault();
                e.stopPropagation();
                void map.handleRemoveWaypoint(index);
              }}
              style={{ position: 'relative', cursor: 'grab' }}
            >
              {isAnchor ? (
                <div
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: '#141410',
                    border: `2.5px solid ${fill}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  }}
                  data-testid={`rb2-waypoint-marker-${index}`}
                >
                  <div style={{ width: 7, height: 7, backgroundColor: fill }} />
                </div>
              ) : (
                <div
                  style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    backgroundColor: fill,
                    border: '2px solid #141410',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                  data-testid={`rb2-waypoint-marker-${index}`}
                />
              )}

              {/* Hover ✕ to remove the point without leaving the map. */}
              {hoveredWp === index && (
                <div
                  data-testid={`rb2-waypoint-remove-${index}`}
                  role="button"
                  aria-label={`Remove waypoint ${index + 1}`}
                  // Stop the marker drag from starting on the ✕ itself.
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void map.handleRemoveWaypoint(index);
                  }}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 16,
                    height: 16,
                    backgroundColor: '#141410',
                    border: `1.5px solid ${WAYPOINT_COLORS.end}`,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={9} color={WAYPOINT_COLORS.end} weight="bold" />
                </div>
              )}
            </div>
          </Marker>
        );
      })}

      {/* Line-drag preview — where the new shaping point will land. */}
      {ghost && (
        <Marker longitude={ghost[0]} latitude={ghost[1]} anchor="center">
          <div
            data-testid="rb2-line-drag-ghost"
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: WAYPOINT_COLORS.start,
              border: '2px solid #FFFFFF',
              boxShadow: '0 0 0 2px rgba(42,140,130,0.5)',
              pointerEvents: 'none',
            }}
          />
        </Marker>
      )}

      {/* Elevation-chart hover scrubber — purely indicative, never intercepts input */}
      {highlightCoord && (
        <Marker longitude={highlightCoord[0]} latitude={highlightCoord[1]} anchor="center">
          <div
            data-testid="rb2-elevation-hover-marker"
            style={{
              width: 16,
              height: 16,
              backgroundColor: '#D4600A',
              borderRadius: '50%',
              border: '3px solid #FFFFFF',
              boxShadow: '0 0 0 2px #D4600A, 0 2px 12px rgba(212, 96, 10, 0.6)',
              pointerEvents: 'none',
            }}
          />
        </Marker>
      )}

      {children}
    </MapboxMap>
  );
}

export default Map;
