/**
 * MapControls Component
 *
 * Custom map controls for the route builder including:
 * - Zoom in / zoom out
 * - Compass/North button (reset bearing + pitch)
 * - Reset pitch button (flatten view, independent of bearing)
 * - Recenter on user location
 * - Recenter on route (fit bounds)
 * - Scale bar
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, ActionIcon, Tooltip, Text, Menu } from '@mantine/core';
import {
  IconCurrentLocation,
  IconRoute,
  IconCompass,
  IconFocus2,
  IconPlus,
  IconMinus,
  IconTiltShift,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import { useUnits } from '../utils/units';

/**
 * Calculate the scale bar width and label based on zoom level and unit preference
 */
function calculateScale(latitude, zoom, useImperial) {
  // Meters per pixel at the equator for zoom level 0
  const metersPerPixelAtEquator = 156543.03392;

  // Adjust for latitude and zoom
  const metersPerPixel = metersPerPixelAtEquator * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom);

  // Target scale bar width in pixels (aim for 80-120px)
  const targetWidth = 100;
  const targetMeters = metersPerPixel * targetWidth;

  // Nice round numbers for scale
  const niceMeters = [
    1, 2, 5, 10, 20, 50, 100, 200, 500,
    1000, 2000, 5000, 10000, 20000, 50000, 100000
  ];

  const niceFeet = [
    10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
    5280, 10560, 26400, 52800, 105600, 264000, 528000 // includes miles
  ];

  let value, unit, width;

  if (useImperial) {
    // Convert to feet
    const targetFeet = targetMeters * 3.28084;

    // Find the closest nice number
    let closestFeet = niceFeet[0];
    for (const nice of niceFeet) {
      if (Math.abs(nice - targetFeet) < Math.abs(closestFeet - targetFeet)) {
        closestFeet = nice;
      }
      if (nice > targetFeet * 1.5) break;
    }

    // Convert back to meters for width calculation
    const closestMeters = closestFeet / 3.28084;
    width = closestMeters / metersPerPixel;

    // Format the label
    if (closestFeet >= 5280) {
      const miles = closestFeet / 5280;
      value = miles;
      unit = miles === 1 ? 'mi' : 'mi';
    } else {
      value = closestFeet;
      unit = 'ft';
    }
  } else {
    // Find the closest nice number in meters
    let closestMeters = niceMeters[0];
    for (const nice of niceMeters) {
      if (Math.abs(nice - targetMeters) < Math.abs(closestMeters - targetMeters)) {
        closestMeters = nice;
      }
      if (nice > targetMeters * 1.5) break;
    }

    width = closestMeters / metersPerPixel;

    // Format the label
    if (closestMeters >= 1000) {
      value = closestMeters / 1000;
      unit = 'km';
    } else {
      value = closestMeters;
      unit = 'm';
    }
  }

  // Clamp width to reasonable bounds
  width = Math.max(50, Math.min(150, width));

  return { width, value, unit };
}

/**
 * Scale Bar Component
 */
function ScaleBar({ latitude, zoom }) {
  const { useImperial } = useUnits();
  const { width, value, unit } = calculateScale(latitude, zoom, useImperial);

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 2,
      }}
    >
      <Text
        size="xs"
        style={{
          color: 'var(--tribos-text-secondary)',
          fontSize: 10,
          fontWeight: 500,
        }}
      >
        {value} {unit}
      </Text>
      <Box
        style={{
          width: width,
          height: 4,
          backgroundColor: 'var(--tribos-text-secondary)',
          borderRadius: 2,
          position: 'relative',
        }}
      >
        {/* Left tick */}
        <Box
          style={{
            position: 'absolute',
            left: 0,
            top: -2,
            width: 2,
            height: 8,
            backgroundColor: 'var(--tribos-text-secondary)',
            borderRadius: 1,
          }}
        />
        {/* Right tick */}
        <Box
          style={{
            position: 'absolute',
            right: 0,
            top: -2,
            width: 2,
            height: 8,
            backgroundColor: 'var(--tribos-text-secondary)',
            borderRadius: 1,
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * Map Controls Component
 */
export default function MapControls({
  mapRef,
  viewport,
  userLocation,
  routeGeometry,
  onGeolocate,
  isLocating = false,
}) {
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);

  // Update bearing and pitch when viewport changes
  useEffect(() => {
    if (viewport?.bearing !== undefined) {
      setBearing(viewport.bearing);
    }
    if (viewport?.pitch !== undefined) {
      setPitch(viewport.pitch);
    }
  }, [viewport?.bearing, viewport?.pitch]);

  // Reset bearing and pitch to north/flat
  const handleResetNorth = useCallback(() => {
    const map = mapRef?.current?.getMap?.();
    if (map) {
      map.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 300,
      });
    }
  }, [mapRef]);

  // Reset only pitch (flatten view), preserving bearing
  const handleResetPitch = useCallback(() => {
    const map = mapRef?.current?.getMap?.();
    if (map) {
      map.easeTo({
        pitch: 0,
        duration: 300,
      });
    }
  }, [mapRef]);

  // Zoom in one step
  const handleZoomIn = useCallback(() => {
    const map = mapRef?.current?.getMap?.();
    if (map) {
      map.easeTo({
        zoom: map.getZoom() + 1,
        duration: 200,
      });
    }
  }, [mapRef]);

  // Zoom out one step
  const handleZoomOut = useCallback(() => {
    const map = mapRef?.current?.getMap?.();
    if (map) {
      map.easeTo({
        zoom: map.getZoom() - 1,
        duration: 200,
      });
    }
  }, [mapRef]);

  // Fit map to route bounds
  const handleFitRoute = useCallback(() => {
    const map = mapRef?.current?.getMap?.();
    if (!map || !routeGeometry?.coordinates?.length) return;

    const coordinates = routeGeometry.coordinates;

    // Calculate bounds
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    coordinates.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    // Fit to bounds with padding
    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        duration: 500,
      }
    );
  }, [mapRef, routeGeometry]);

  // Recenter on user location
  const handleRecenterUser = useCallback(() => {
    if (userLocation) {
      const map = mapRef?.current?.getMap?.();
      if (map) {
        map.easeTo({
          center: [userLocation.longitude, userLocation.latitude],
          zoom: 14,
          duration: 500,
        });
      }
    } else if (onGeolocate) {
      onGeolocate();
    }
  }, [mapRef, userLocation, onGeolocate]);

  const hasRoute = routeGeometry?.coordinates?.length > 1;
  const hasUserLocation = !!userLocation;
  const isRotated = Math.abs(bearing) > 0.5;
  const isTilted = pitch > 1;

  const controlButtonStyle = {
    backgroundColor: 'var(--tribos-bg-secondary)',
    border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
    color: 'var(--tribos-text-primary)',
    '&:hover': {
      backgroundColor: 'var(--tribos-bg-tertiary)',
    },
  };

  return (
    <Box
      style={{
        position: 'absolute',
        bottom: 24,
        right: 16,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      {/* Control Buttons */}
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: 'var(--tribos-bg-secondary)',
          borderRadius: tokens.radius.md,
          padding: 4,
          border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Zoom In */}
        <Tooltip label="Zoom In" position="left">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={handleZoomIn}
            style={controlButtonStyle}
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip>

        {/* Zoom Out */}
        <Tooltip label="Zoom Out" position="left">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={handleZoomOut}
            style={controlButtonStyle}
          >
            <IconMinus size={18} />
          </ActionIcon>
        </Tooltip>

        {/* Divider */}
        <Box
          style={{
            height: 1,
            backgroundColor: 'var(--tribos-bg-tertiary)',
            margin: '2px 4px',
          }}
        />

        {/* Compass / North Button */}
        <Tooltip label={isRotated || isTilted ? 'Reset to North' : 'Facing North'} position="left">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={handleResetNorth}
            style={{
              ...controlButtonStyle,
              transform: `rotate(${-bearing}deg)`,
              transition: 'transform 0.15s ease-out',
            }}
          >
            <IconCompass
              size={20}
              style={{
                color: isRotated ? 'var(--tribos-lime)' : 'var(--tribos-text-secondary)',
              }}
            />
          </ActionIcon>
        </Tooltip>

        {/* Reset Pitch / Flatten View */}
        <Tooltip label={isTilted ? `Reset to Flat View (${Math.round(pitch)}°)` : 'Flat View'} position="left">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={handleResetPitch}
            style={controlButtonStyle}
          >
            <IconTiltShift
              size={20}
              style={{
                color: isTilted ? 'var(--tribos-lime)' : 'var(--tribos-text-secondary)',
              }}
            />
          </ActionIcon>
        </Tooltip>

        {/* Divider */}
        <Box
          style={{
            height: 1,
            backgroundColor: 'var(--tribos-bg-tertiary)',
            margin: '2px 4px',
          }}
        />

        {/* Recenter Menu */}
        <Menu position="left" withArrow shadow="md">
          <Menu.Target>
            <Tooltip label="Recenter Map" position="left">
              <ActionIcon
                size="lg"
                variant="subtle"
                style={controlButtonStyle}
              >
                <IconFocus2 size={20} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
            <Menu.Item
              leftSection={<IconCurrentLocation size={16} />}
              onClick={handleRecenterUser}
              disabled={isLocating}
              style={{
                color: 'var(--tribos-text-primary)',
              }}
            >
              {hasUserLocation ? 'Go to My Location' : 'Find My Location'}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconRoute size={16} />}
              onClick={handleFitRoute}
              disabled={!hasRoute}
              style={{
                color: hasRoute ? 'var(--tribos-text-primary)' : 'var(--tribos-text-muted)',
              }}
            >
              Fit to Route
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>

      {/* Scale Bar */}
      <Box
        style={{
          backgroundColor: 'rgba(26, 26, 26, 0.85)',
          borderRadius: tokens.radius.sm,
          padding: '4px 8px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
        }}
      >
        <ScaleBar
          latitude={viewport?.latitude || 37.7749}
          zoom={viewport?.zoom || 12}
        />
      </Box>
    </Box>
  );
}
