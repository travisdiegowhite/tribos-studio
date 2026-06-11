/**
 * MapControls — Route Builder 2.0 on-map controls (RB2-native, flat).
 *
 * A bottom-right stack matching the RB2 design language (sharp, borderRadius 0,
 * RB2 tokens) rather than Mapbox's default chrome. Provides zoom +/-, a compass
 * that rotates with the map bearing (click to reset bearing + pitch to north/
 * flat), fit-to-route, geolocate/recenter, a basemap switcher, and a scale bar.
 *
 * Rendered inside <Map> so it can drive the real `mapRef.getMap()`. The page
 * owns the persisted basemap id + the geolocation data and passes them down.
 */

import { type RefObject } from 'react';
import { Box, Loader, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Compass, Crosshair, MapTrifold, Minus, Path, Plus } from '@phosphor-icons/react';
import type { MapRef } from 'react-map-gl';
import { RB2, RB2_FONT } from './brand';
import { BASEMAP_STYLES } from '../../../components/RouteBuilder';
import { calculateScale } from './mapScale';
import type { Coordinate } from '../../../types/geo';

export interface MapControlsProps {
  mapRef: RefObject<MapRef | null>;
  bearing: number;
  pitch: number;
  latitude: number;
  zoom: number;
  routeGeometry: { coordinates: Coordinate[] } | null;
  userLocation: Coordinate | null;
  onGeolocate: () => void;
  isLocating?: boolean;
  basemapId: string;
  onBasemapChange: (id: string) => void;
  isImperial?: boolean;
  isMobile?: boolean;
}

function getMapbox(mapRef: RefObject<MapRef | null>) {
  return mapRef.current?.getMap?.() ?? null;
}

export function MapControls({
  mapRef,
  bearing,
  pitch,
  latitude,
  zoom,
  routeGeometry,
  userLocation,
  onGeolocate,
  isLocating = false,
  basemapId,
  onBasemapChange,
  isImperial = false,
  isMobile = false,
}: MapControlsProps) {
  const isRotated = Math.abs(bearing) > 0.5 || pitch > 1;
  const hasRoute = (routeGeometry?.coordinates?.length ?? 0) > 1;

  const zoomBy = (delta: number) => {
    const m = getMapbox(mapRef);
    if (m) m.easeTo({ zoom: m.getZoom() + delta, duration: 200 });
  };

  const resetNorth = () => {
    getMapbox(mapRef)?.easeTo({ bearing: 0, pitch: 0, duration: 300 });
  };

  const fitRoute = () => {
    const m = getMapbox(mapRef);
    const coords = routeGeometry?.coordinates;
    if (!m || !coords || coords.length < 2) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    m.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 500, maxZoom: 16 },
    );
  };

  const recenterUser = () => {
    if (userLocation) {
      getMapbox(mapRef)?.easeTo({
        center: [userLocation[0], userLocation[1]],
        zoom: 14,
        duration: 500,
      });
    } else {
      onGeolocate();
    }
  };

  const scale = calculateScale(latitude, zoom, isImperial);

  return (
    <Box
      data-testid="rb2-map-controls"
      // Stop control interactions from reaching the map's click/drag handlers.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: isMobile ? 64 : 16,
        right: isMobile ? 8 : 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
      }}
    >
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: RB2.cardBg,
          border: `1px solid ${RB2.border}`,
          boxShadow: RB2.shadowCard,
        }}
      >
        <CtrlButton label="Zoom in" testid="rb2-zoom-in" onClick={() => zoomBy(1)}>
          <Plus size={18} />
        </CtrlButton>
        <Divider />
        <CtrlButton label="Zoom out" testid="rb2-zoom-out" onClick={() => zoomBy(-1)}>
          <Minus size={18} />
        </CtrlButton>
        <Divider />
        <CtrlButton
          label={isRotated ? 'Reset to north' : 'Facing north'}
          testid="rb2-compass"
          onClick={resetNorth}
          iconStyle={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.15s ease-out' }}
          color={isRotated ? RB2.teal : undefined}
        >
          <Compass size={20} />
        </CtrlButton>
        <Divider />
        <CtrlButton
          label="Fit route in view"
          testid="rb2-fit-route"
          onClick={fitRoute}
          disabled={!hasRoute}
        >
          <Path size={18} />
        </CtrlButton>
        <Divider />
        <CtrlButton
          label={userLocation ? 'Go to my location' : 'Find my location'}
          testid="rb2-geolocate"
          onClick={recenterUser}
          disabled={isLocating}
        >
          {isLocating ? <Loader size={16} color={RB2.teal} /> : <Crosshair size={20} />}
        </CtrlButton>
        <Divider />
        <Menu position="left-end" withinPortal shadow="md" radius={0}>
          <Menu.Target>
            <UnstyledButton
              data-testid="rb2-basemap-menu"
              aria-label="Basemap style"
              style={ctrlButtonStyle(false)}
            >
              <MapTrifold size={20} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown style={{ borderRadius: 0 }}>
            <Menu.Label>Basemap</Menu.Label>
            {BASEMAP_STYLES.map((style: { id: string; label: string }) => (
              <Menu.Item
                key={style.id}
                data-testid={`rb2-basemap-${style.id}`}
                onClick={() => onBasemapChange(style.id)}
                style={{
                  backgroundColor: style.id === basemapId ? RB2.bgSecondary : undefined,
                  color: style.id === basemapId ? RB2.teal : RB2.textPrimary,
                }}
              >
                {style.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Box>

      {/* Scale bar */}
      <Box
        data-testid="rb2-scale-bar"
        style={{
          backgroundColor: RB2.cardBg,
          border: `1px solid ${RB2.border}`,
          padding: '3px 8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
        }}
      >
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            color: RB2.textSecondary,
            letterSpacing: '0.04em',
          }}
        >
          {scale.value} {scale.unit}
        </Text>
        <Box style={{ width: scale.width, height: 3, backgroundColor: RB2.textSecondary }} />
      </Box>
    </Box>
  );
}

function ctrlButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: disabled ? RB2.textDisabled : RB2.textSecondary,
    cursor: disabled ? 'default' : 'pointer',
  };
}

function CtrlButton({
  label,
  testid,
  onClick,
  disabled = false,
  color,
  iconStyle,
  children,
}: {
  label: string;
  testid: string;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  iconStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} position="left" withinPortal disabled={disabled}>
      <UnstyledButton
        data-testid={testid}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        style={{ ...ctrlButtonStyle(disabled), color: color ?? ctrlButtonStyle(disabled).color }}
      >
        <span style={{ display: 'flex', ...iconStyle }}>{children}</span>
      </UnstyledButton>
    </Tooltip>
  );
}

function Divider() {
  return <Box style={{ height: 1, backgroundColor: RB2.border }} />;
}

export default MapControls;
