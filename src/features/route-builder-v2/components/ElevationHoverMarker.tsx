/**
 * ElevationHoverMarker — the map dot that tracks the elevation-chart hover.
 *
 * Subscribes to the elevation-hover store itself so scrubbing the chart
 * re-renders only this marker, not the page. Must be rendered as a child
 * of the react-map-gl Map (Marker needs the map context).
 */
import { useMemo } from 'react';
import { Marker } from 'react-map-gl';
import { coordinateAtDistanceKm } from '../../../utils/elevation';
import { useElevationHoverStore } from '../state/elevationHoverStore';
import type { Coordinate } from '../../../types/geo';

export interface ElevationHoverMarkerProps {
  geometry: { coordinates: Coordinate[] } | null;
}

export function ElevationHoverMarker({ geometry }: ElevationHoverMarkerProps) {
  const hoverKm = useElevationHoverStore((s) => s.hoverKm);

  // Resolved by distance (cumulative walk) rather than index, so it holds
  // even when the elevation profile and geometry have different point counts.
  const coord = useMemo<Coordinate | null>(() => {
    if (hoverKm == null || !geometry || geometry.coordinates.length < 2) return null;
    const c = coordinateAtDistanceKm(geometry.coordinates as [number, number][], hoverKm);
    return c ? (c as Coordinate) : null;
  }, [hoverKm, geometry]);

  if (!coord) return null;

  return (
    <Marker longitude={coord[0]} latitude={coord[1]} anchor="center">
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
  );
}

export default ElevationHoverMarker;
