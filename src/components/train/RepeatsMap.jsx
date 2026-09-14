/**
 * RepeatsMap — the anchor path with several efforts' slices drawn over it,
 * each in its identity colour, and a marker per effort at the scrubbed
 * distance. Flat (2D) on purpose: the point is comparing lines, and terrain
 * would only hide the ones underneath.
 */

import { useMemo, useState } from 'react';
import { Box, Skeleton } from '@mantine/core';
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { boundsForCoords } from '../../utils/rideMapCamera';
import { effortPointAt, isFiniteLngLat } from '../../utils/rideRepeats';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/mapbox/outdoors-v12';
const FIT_PADDING = { top: 36, bottom: 36, left: 36, right: 36 };

/**
 * @param {object} props
 * @param {import('../../utils/rideRepeats').RepeatAnchor} props.anchor
 * @param {Array<import('../../utils/rideRepeats').RepeatEffort & { color: string }>} props.efforts
 * @param {number|null} props.hoverX  Distance along the anchor, km.
 * @param {number} [props.height]
 */
function RepeatsMap({ anchor, efforts, hoverX, height = 420 }) {
  const [mapLoaded, setMapLoaded] = useState(false);

  // Mapbox throws on an out-of-range LngLat, and a thrown error here would
  // unmount the page; only ever hand it plausible geometry.
  const bounds = useMemo(() => {
    const b = boundsForCoords(anchor.coords.filter(isFiniteLngLat));
    if (!b) return null;
    const ok = b.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90);
    return ok ? b : null;
  }, [anchor.coords]);

  const drawable = useMemo(
    () => efforts.map((e) => ({ ...e, coords: e.coords.filter(isFiniteLngLat) })).filter((e) => e.coords.length >= 2),
    [efforts],
  );

  const anchorGeoJSON = useMemo(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: anchor.coords } }),
    [anchor.coords],
  );

  const markers = useMemo(() => {
    if (hoverX == null) return [];
    return drawable
      .map((e) => {
        const at = effortPointAt(e, hoverX);
        return at && isFiniteLngLat(at.coord) ? { id: e.id, color: e.color, coord: at.coord } : null;
      })
      .filter(Boolean);
  }, [drawable, hoverX]);

  if (!MAPBOX_TOKEN || !bounds) return null;

  return (
    <Box style={{ height, position: 'relative', overflow: 'hidden' }} data-testid="repeats-map">
      {/* Overlaid, not in flow, so the map keeps its box while the style loads */}
      {!mapLoaded && (
        <Box style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          <Skeleton height={height} radius={0} />
        </Box>
      )}
      <Map
        initialViewState={{ bounds, fitBoundsOptions: { padding: FIT_PADDING } }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={() => setMapLoaded(true)}
        scrollZoom={false}
        dragRotate={false}
        cursor="grab"
      >
        {/* The anchor as the ground: a wide, quiet band every effort sits on */}
        <Source id="repeats-anchor" type="geojson" data={anchorGeoJSON}>
          <Layer
            id="repeats-anchor-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#1f2a26', 'line-width': 7, 'line-opacity': 0.22 }}
          />
        </Source>

        {drawable.map((e) => (
          <Source
            key={e.id}
            id={`repeat-${e.id}`}
            type="geojson"
            data={{ type: 'Feature', properties: { id: e.id }, geometry: { type: 'LineString', coordinates: e.coords } }}
          >
            <Layer
              id={`repeat-line-${e.id}`}
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': e.color, 'line-width': 2.5, 'line-opacity': 0.9 }}
            />
          </Source>
        ))}

        {markers.map((m) => (
          <Marker key={m.id} longitude={m.coord[0]} latitude={m.coord[1]} anchor="center">
            <Box
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: m.color,
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
              }}
            />
          </Marker>
        ))}

        <NavigationControl position="top-left" showCompass={false} />
      </Map>
    </Box>
  );
}

export default RepeatsMap;
