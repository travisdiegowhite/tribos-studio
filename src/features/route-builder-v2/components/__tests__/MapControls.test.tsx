import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RefObject } from 'react';
import type { MapRef } from 'react-map-gl';
import { MapControls } from '../MapControls';
import type { Coordinate } from '../../../../types/geo';

const easeTo = vi.fn();
const fitBounds = vi.fn();
const getZoom = vi.fn(() => 12);

function fakeRef(): RefObject<MapRef | null> {
  return {
    current: { getMap: () => ({ easeTo, fitBounds, getZoom }) } as unknown as MapRef,
  };
}

const ROUTE = {
  coordinates: [
    [-105.0, 40.0],
    [-105.1, 40.1],
  ] as Coordinate[],
};

function renderControls(props: Partial<React.ComponentProps<typeof MapControls>> = {}) {
  const onGeolocate = props.onGeolocate ?? vi.fn();
  const onBasemapChange = props.onBasemapChange ?? vi.fn();
  const result = render(
    <MantineProvider>
      <MapControls
        mapRef={fakeRef()}
        bearing={0}
        pitch={0}
        latitude={40}
        zoom={12}
        routeGeometry={null}
        userLocation={null}
        onGeolocate={onGeolocate}
        basemapId="dark"
        onBasemapChange={onBasemapChange}
        {...props}
      />
    </MantineProvider>,
  );
  return { onGeolocate, onBasemapChange, unmount: result.unmount };
}

beforeEach(() => {
  easeTo.mockClear();
  fitBounds.mockClear();
  getZoom.mockClear();
});

describe('MapControls', () => {
  it('zoom in / out call easeTo relative to current zoom', () => {
    renderControls();
    fireEvent.click(screen.getByTestId('rb2-zoom-in'));
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 13 }));
    fireEvent.click(screen.getByTestId('rb2-zoom-out'));
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 11 }));
  });

  it('compass resets bearing and pitch to north/flat', () => {
    renderControls({ bearing: 45, pitch: 30 });
    fireEvent.click(screen.getByTestId('rb2-compass'));
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ bearing: 0, pitch: 0 }));
  });

  it('fit-route is disabled without a route and fits bounds with one', () => {
    const { unmount } = renderControls({ routeGeometry: null });
    expect(screen.getByTestId('rb2-fit-route')).toBeDisabled();
    unmount();

    fitBounds.mockClear();
    renderControls({ routeGeometry: ROUTE });
    fireEvent.click(screen.getByTestId('rb2-fit-route'));
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it('geolocate calls onGeolocate when no location, eases to it when known', () => {
    const { onGeolocate, unmount } = renderControls({ userLocation: null });
    fireEvent.click(screen.getByTestId('rb2-geolocate'));
    expect(onGeolocate).toHaveBeenCalledTimes(1);
    unmount();

    easeTo.mockClear();
    renderControls({ userLocation: [-105, 40] });
    fireEvent.click(screen.getByTestId('rb2-geolocate'));
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-105, 40] }));
  });

  it('selecting a basemap reports the choice', async () => {
    const { onBasemapChange } = renderControls();
    fireEvent.click(screen.getByTestId('rb2-basemap-menu'));
    fireEvent.click(await screen.findByTestId('rb2-basemap-satellite'));
    expect(onBasemapChange).toHaveBeenCalledWith('satellite');
  });

  it('scale bar label flips between metric and imperial', () => {
    const { unmount } = render(
      <MantineProvider>
        <MapControls
          mapRef={fakeRef()}
          bearing={0}
          pitch={0}
          latitude={40}
          zoom={12}
          routeGeometry={null}
          userLocation={null}
          onGeolocate={vi.fn()}
          basemapId="dark"
          onBasemapChange={vi.fn()}
          isImperial={false}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-scale-bar').textContent).toMatch(/\b(m|km)\b/);
    unmount();

    render(
      <MantineProvider>
        <MapControls
          mapRef={fakeRef()}
          bearing={0}
          pitch={0}
          latitude={40}
          zoom={12}
          routeGeometry={null}
          userLocation={null}
          onGeolocate={vi.fn()}
          basemapId="dark"
          onBasemapChange={vi.fn()}
          isImperial
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-scale-bar').textContent).toMatch(/\b(ft|mi)\b/);
  });
});
