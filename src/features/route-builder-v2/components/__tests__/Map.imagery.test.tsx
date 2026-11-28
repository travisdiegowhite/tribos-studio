/**
 * Map.tsx click routing for street imagery: a click on a Mapillary image dot
 * opens the photo; any other click still adds a waypoint.
 */
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';

const captured: { props: Record<string, any> | null } = { props: null };

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('react-map-gl', () => ({
  default: (props: Record<string, any>) => {
    captured.props = props;
    return <div>{props.children}</div>;
  },
  Marker: () => null,
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
}));
vi.mock('../../../../components/RouteBuilder', () => ({
  MAPBOX_TOKEN: 'pk.test',
  BASEMAP_STYLES: [{ id: 'light', style: 'mapbox://styles/mapbox/light-v11' }],
  WAYPOINT_COLORS: { start: '#000', end: '#000', waypoint: '#000' },
}));
vi.mock('../MapControls', () => ({ MapControls: () => null }));

import { Map } from '../Map';

function setup(withImagery: boolean) {
  const handleMapClick = vi.fn();
  const onImageryClick = vi.fn();
  const map = {
    viewport: { longitude: -105, latitude: 40, zoom: 14 },
    handleMapClick,
    handleAddWaypointAtClick: vi.fn(),
    setViewport: vi.fn(),
  } as any;
  render(
    <MantineProvider>
      <Map
        map={map}
        routeGeometry={null}
        waypoints={[]}
        imageryLayerId={withImagery ? 'rb2-mly-image' : null}
        onImageryClick={onImageryClick}
      />
    </MantineProvider>,
  );
  return { handleMapClick, onImageryClick };
}

const at = { lngLat: { lng: -105.1, lat: 40.1 } };

describe('Map — street imagery clicks', () => {
  it('makes the image layer clickable only when imagery is on', () => {
    setup(false);
    expect(captured.props?.interactiveLayerIds).toBeUndefined();
    setup(true);
    expect(captured.props?.interactiveLayerIds).toEqual(['rb2-mly-image']);
  });

  it('opens the photo for a click on an image dot', () => {
    const { handleMapClick, onImageryClick } = setup(true);
    captured.props!.onClick({
      ...at,
      features: [
        { layer: { id: 'rb2-mly-image' }, properties: { id: 99 }, geometry: { type: 'Point', coordinates: [-105.11, 40.11] } },
      ],
    });
    expect(onImageryClick).toHaveBeenCalledWith('99', [-105.11, 40.11]);
    expect(handleMapClick).not.toHaveBeenCalled();
  });

  it('still adds a waypoint for a click elsewhere', () => {
    const { handleMapClick, onImageryClick } = setup(true);
    captured.props!.onClick({ ...at, features: [] });
    expect(handleMapClick).toHaveBeenCalledWith([-105.1, 40.1]);
    expect(onImageryClick).not.toHaveBeenCalled();
  });
});
