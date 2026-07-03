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
 *  - Drag the route line  → insert a shaping point between control points,
 *                           with a rubber-band preview through its neighbours.
 *  - Remove a waypoint    → hover ✕ / right-click (desktop), long-press (touch).
 *
 * Line-drag stays available even when an analysis layer (surface/gradient/
 * intervals) draws the visible line: the page passes the geometry through for
 * the transparent hit-line and sets `showRouteLine={false}` so the plain teal
 * line doesn't double up under the coloured one.
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
import { MapControls } from './MapControls';

const DEFAULT_STYLE = BASEMAP_STYLES[0].style;

/** Transparent, wide overlay of the route used as the grab target for line-drag. */
const ROUTE_HIT_LAYER_ID = 'rb2-route-hit';
/** Movement (px) past which a touch-hold is treated as a drag, not a long-press. */
const LONG_PRESS_MOVE_TOLERANCE = 10;
const LONG_PRESS_MS = 500;

export interface MapWrapperProps {
  map: UseMapInteractionReturn;
  routeGeometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  waypoints: ReadonlyArray<{ id: string; position: Coordinate; type?: string }>;
  cursor?: string;
  mapStyle?: string | object;
  /**
   * Whether to draw the default teal route line. Set false when an analysis
   * layer renders its own coloured line — the transparent hit-line still
   * renders so line-drag keeps working.
   */
  showRouteLine?: boolean;
  // ── On-map controls (rendered inside <Map> where mapRef lives) ──
  userLocation?: Coordinate | null;
  onGeolocate?: () => void;
  isLocating?: boolean;
  basemapId?: string;
  onBasemapChange?: (id: string) => void;
  isImperial?: boolean;
  isMobile?: boolean;
  // ── Clip-tangent mode ──
  /** When on, map clicks select a spur to clip instead of appending a waypoint. */
  clipMode?: boolean;
  /** Called with the clicked coordinate while in clip mode. */
  onClipClick?: (coord: Coordinate) => void;
  /** Highlight geometry (the spur pending removal), drawn above the route. */
  clipHighlight?: GeoJSON.Feature | null;
  children?: ReactNode;
}

interface GhostState {
  coord: Coordinate;
  insertAt: number;
}

export function Map({
  map,
  routeGeometry,
  waypoints,
  cursor,
  mapStyle = DEFAULT_STYLE,
  showRouteLine = true,
  userLocation = null,
  onGeolocate,
  isLocating = false,
  basemapId = 'dark',
  onBasemapChange,
  isImperial = false,
  isMobile = false,
  clipMode = false,
  onClipClick,
  clipHighlight = null,
  children,
}: MapWrapperProps) {
  const mapRef = useRef<MapRef | null>(null);
  const dragRef = useRef(false);
  const lineDragRef = useRef<{ active: boolean; insertAt: number }>({
    active: false,
    insertAt: -1,
  });
  const suppressClickRef = useRef(false);
  // Touch long-press (mobile delete) bookkeeping — one active touch at a time.
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    startX: number;
    startY: number;
  }>({ timer: null, startX: 0, startY: 0 });
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [overLine, setOverLine] = useState(false);
  const [hoveredWp, setHoveredWp] = useState<number | null>(null);
  // Live camera (bearing/pitch/lat/zoom) for the compass + scale bar. Updated
  // from onMove, but gated (see below) so a continuous pan doesn't re-render
  // the markers/layers every frame.
  const [camera, setCamera] = useState({
    bearing: 0,
    pitch: 0,
    latitude: map.viewport.latitude,
    zoom: map.viewport.zoom,
  });
  const cameraRef = useRef(camera);

  const hasLine = !!routeGeometry && routeGeometry.coordinates.length >= 2;

  const clearLongPress = useCallback(() => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  }, []);

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
      // In clip mode, a click selects a spur to remove — never appends a point.
      if (clipMode) {
        onClipClick?.(coord);
        return;
      }
      void map.handleMapClick(coord);
    },
    [map, clipMode, onClipClick],
  );

  const handleMouseDown = useCallback(
    (evt: MapLayerMouseEvent) => {
      // Clip mode suppresses line-drag so a clip click can't insert a point.
      if (clipMode || dragRef.current || !hasLine) return;
      const onLine = evt.features?.some((f) => f.layer?.id === ROUTE_HIT_LAYER_ID);
      if (!onLine) return;
      const point: Coordinate = [evt.lngLat.lng, evt.lngLat.lat];
      const insertAt = nearestInsertIndex(
        routeGeometry!.coordinates,
        waypoints.map((w) => w.position),
        point,
      );
      lineDragRef.current = { active: true, insertAt };
      setGhost({ coord: point, insertAt });
      mapRef.current?.getMap?.().dragPan.disable();
      evt.preventDefault?.();
    },
    [hasLine, routeGeometry, waypoints, clipMode],
  );

  const handleMouseMove = useCallback((evt: MapLayerMouseEvent) => {
    if (lineDragRef.current.active) {
      setGhost({
        coord: [evt.lngLat.lng, evt.lngLat.lat],
        insertAt: lineDragRef.current.insertAt,
      });
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
      // The drag ends with a click we don't want to also append a point.
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

  const activeCursor = ghost
    ? 'grabbing'
    : clipMode
      ? 'crosshair'
      : overLine
        ? 'grab'
        : (cursor ?? 'crosshair');

  // Rubber-band preview: from the waypoint before the grab, through the ghost,
  // to the waypoint after — so the user sees the tentative detour shape. The
  // dropped point still snaps to roads on release (handleAddWaypointAtClick).
  const previewCoords: Coordinate[] | null = ghost
    ? ([
        waypoints[ghost.insertAt - 1]?.position,
        ghost.coord,
        waypoints[ghost.insertAt]?.position,
      ].filter(Boolean) as Coordinate[])
    : null;

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
        const vs = evt.viewState;
        map.setViewport({
          longitude: vs.longitude,
          latitude: vs.latitude,
          zoom: vs.zoom,
        });
        // Only push camera state when it changes materially — the compass needs
        // bearing/pitch responsiveness; the scale bar needs zoom and a coarse
        // latitude. Pure panning at constant zoom no longer re-renders markers.
        const prev = cameraRef.current;
        const changed =
          Math.abs(vs.bearing - prev.bearing) > 0.5 ||
          Math.abs(vs.pitch - prev.pitch) > 0.5 ||
          Math.abs(vs.zoom - prev.zoom) > 0.05 ||
          Math.abs(vs.latitude - prev.latitude) > 0.01;
        if (changed) {
          const next = {
            bearing: vs.bearing,
            pitch: vs.pitch,
            latitude: vs.latitude,
            zoom: vs.zoom,
          };
          cameraRef.current = next;
          setCamera(next);
        }
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
      {/* Route line + transparent grab target. The visible glow/line is gated by
          showRouteLine; the hit line always renders so line-drag keeps working
          under analysis layers. */}
      {hasLine && (
        <Source id="rb2-route" type="geojson" data={routeGeometry!}>
          {/* Each <Layer> must be a DIRECT child of <Source> — react-map-gl
              attaches the source id via React.Children.map + cloneElement, which
              does not recurse into Fragments. Wrapping these in a fragment makes
              them render without a source (i.e. invisibly). */}
          {showRouteLine && (
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
          )}
          {showRouteLine && (
            <Layer
              id="rb2-route-line"
              type="line"
              paint={{ 'line-color': '#2A8C82', 'line-width': 5, 'line-opacity': 1 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          )}
          <Layer
            id={ROUTE_HIT_LAYER_ID}
            type="line"
            paint={{ 'line-color': '#000000', 'line-width': 22, 'line-opacity': 0.001 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Clip-mode spur highlight (the segment pending removal) */}
      {clipHighlight && (
        <Source id="rb2-clip-highlight" type="geojson" data={clipHighlight}>
          <Layer
            id="rb2-clip-highlight-line"
            type="line"
            paint={{ 'line-color': '#D4600A', 'line-width': 7, 'line-opacity': 0.95 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Line-drag rubber-band preview */}
      {previewCoords && previewCoords.length >= 2 && (
        <Source
          id="rb2-line-drag-preview"
          type="geojson"
          data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: previewCoords } }}
        >
          <Layer
            id="rb2-line-drag-preview-line"
            type="line"
            paint={{
              'line-color': WAYPOINT_COLORS.start,
              'line-width': 3,
              'line-opacity': 0.9,
              'line-dasharray': [2, 2],
            }}
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
              clearLongPress();
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
              onTouchStart={(e) => {
                // Long-press removes the point (touch affordance — mobile has no
                // hover/right-click). A drag cancels it via onTouchMove.
                const t = e.touches[0];
                longPressRef.current.startX = t.clientX;
                longPressRef.current.startY = t.clientY;
                clearLongPress();
                longPressRef.current.timer = setTimeout(() => {
                  longPressRef.current.timer = null;
                  dragRef.current = true; // suppress the trailing click
                  void map.handleRemoveWaypoint(index);
                }, LONG_PRESS_MS);
              }}
              onTouchMove={(e) => {
                const t = e.touches[0];
                const moved = Math.hypot(
                  t.clientX - longPressRef.current.startX,
                  t.clientY - longPressRef.current.startY,
                );
                if (moved > LONG_PRESS_MOVE_TOLERANCE) clearLongPress();
              }}
              onTouchEnd={clearLongPress}
              style={{
                position: 'relative',
                cursor: 'grab',
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
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

              {/* Hover ✕ to remove the point without leaving the map (desktop). */}
              {hoveredWp === index && (
                <div
                  data-testid={`rb2-waypoint-remove-${index}`}
                  role="button"
                  aria-label={`Remove waypoint ${index + 1}`}
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

      {/* Line-drag preview point — where the new shaping point will land. */}
      {ghost && (
        <Marker longitude={ghost.coord[0]} latitude={ghost.coord[1]} anchor="center">
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

      <MapControls
        mapRef={mapRef}
        bearing={camera.bearing}
        pitch={camera.pitch}
        latitude={camera.latitude}
        zoom={camera.zoom}
        routeGeometry={routeGeometry}
        userLocation={userLocation}
        onGeolocate={onGeolocate ?? (() => {})}
        isLocating={isLocating}
        basemapId={basemapId}
        onBasemapChange={onBasemapChange ?? (() => {})}
        isImperial={isImperial}
        isMobile={isMobile}
      />

      {children}
    </MapboxMap>
  );
}

export default Map;
