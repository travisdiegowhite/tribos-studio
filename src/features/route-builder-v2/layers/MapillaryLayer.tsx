/**
 * MapillaryLayer — street-level imagery coverage on the RB2 map, and the
 * photo popup for a clicked image (Phase 2 §3.11). Only rendered when
 * VITE_MAPILLARY_TOKEN is set (mapillaryEnabled).
 *
 * Lines show where there's imagery; dots (from zoom 14) are individual
 * photos. Map.tsx routes a click on a dot here instead of adding a waypoint.
 */
import { useEffect, useState } from 'react';
import { Layer, Popup, Source } from 'react-map-gl';
import { Box, Loader, Text } from '@mantine/core';
import { RB2, RB2_FONT } from '../components/brand';
import { MAP_PALETTE } from '../../../utils/mapPalette';
import {
  fetchMapillaryImage,
  mapillaryTileUrl,
  mapillaryViewerUrl,
  type MapillaryImage,
} from '../../../utils/mapillary';
import type { Coordinate } from '../../../types/geo';

export const MAPILLARY_IMAGE_LAYER_ID = 'rb2-mly-image';

export interface MapillarySelection {
  imageId: string;
  coord: Coordinate;
}

export interface MapillaryLayerProps {
  visible: boolean;
  selected: MapillarySelection | null;
  onClose: () => void;
}

export function MapillaryPhoto({ imageId }: { imageId: string }) {
  const [image, setImage] = useState<MapillaryImage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void fetchMapillaryImage(imageId).then((img) => {
      if (cancelled) return;
      setImage(img);
      setState(img ? 'ready' : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  if (state === 'loading') return <Loader size="xs" />;
  if (!image) {
    return (
      <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textSecondary }}>
        This photo couldn’t be loaded.
      </Text>
    );
  }
  return (
    <Box data-testid="rb2-mapillary-photo" style={{ width: 260 }}>
      <img src={image.thumbUrl} alt="Street-level photo from Mapillary" style={{ width: '100%', display: 'block' }} />
      <Box style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
          {image.capturedAt ? new Date(image.capturedAt).toLocaleDateString() : ''} · © Mapillary
        </Text>
        <Text
          component="a"
          href={mapillaryViewerUrl(image.id)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textPrimary, textDecoration: 'underline' }}
        >
          Open
        </Text>
      </Box>
    </Box>
  );
}

export function MapillaryLayer({ visible, selected, onClose }: MapillaryLayerProps) {
  if (!visible) return null;
  return (
    <>
      <Source id="rb2-mly" type="vector" tiles={[mapillaryTileUrl()]} minzoom={6} maxzoom={14}>
        <Layer
          id="rb2-mly-sequence"
          type="line"
          source-layer="sequence"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': MAP_PALETTE.muted, 'line-width': 2, 'line-opacity': 0.8 }}
        />
        <Layer
          id={MAPILLARY_IMAGE_LAYER_ID}
          type="circle"
          source-layer="image"
          minzoom={14}
          paint={{
            'circle-radius': 4,
            'circle-color': MAP_PALETTE.ink,
            'circle-stroke-color': MAP_PALETTE.casing,
            'circle-stroke-width': 1,
          }}
        />
      </Source>
      {selected && (
        <Popup
          longitude={selected.coord[0]}
          latitude={selected.coord[1]}
          anchor="bottom"
          closeOnClick={false}
          onClose={onClose}
          maxWidth="280px"
        >
          <MapillaryPhoto imageId={selected.imageId} />
        </Popup>
      )}
    </>
  );
}

export default MapillaryLayer;
