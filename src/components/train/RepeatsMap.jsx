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
import { effortPointAt } from '../../utils/rideRepeats';

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

  const bounds = useMemo(() => boundsForCoords(anchor.coords), [anchor.coords]);

  const anchorGeoJSON = useMemo(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: anchor.coords } }),
    [anchor.coords],
  );

  const markers = useMemo(() => {
    if (hoverX == null) return [];
    return efforts
      .map((e) => {
        const at = effortPointAt(e, hoverX);
        return at ? { id: e.id, color: e.color, coord: at.coord } : null;
      })
      .filter(Boolean);
  }, [efforts, hoverX]);

  if (!MAPBOX_TOKEN || !bounds) return null;

  return (
    <Box style={{ height, position: 'relative' }} data-testid="repeats-map">
      {!mapLoaded && <Skeleton height={height} radius={0} />}
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

        {efforts.map((e) => (
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
