import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// Mapbox needs WebGL; stand in for react-map-gl and capture what the map is
// asked to draw.
const drawn = { sources: [], layers: [], markers: [] };
vi.mock('react-map-gl', () => ({
  default: ({ children }) => <div data-testid="map">{children}</div>,
  Source: ({ id, type, data, children }) => {
    drawn.sources.push({ id, type, data });
    return <>{children}</>;
  },
  Layer: ({ id, type }) => {
    drawn.layers.push({ id, type });
    return null;
  },
  Marker: ({ children }) => {
    drawn.markers.push(1);
    return <>{children}</>;
  },
  NavigationControl: () => null,
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

import ColoredRouteMap from './ColoredRouteMap';

const N = 40;
const streams = {
  coords: Array.from({ length: N }, (_, i) => [-105.3 + i * 0.001, 40.0 + i * 0.001]),
  power: Array.from({ length: N }, (_, i) => 100 + i * 10), // 100 … 490 W
  heartRate: Array.from({ length: N }, (_, i) => 110 + i * 2), // 110 … 188
  speed: Array.from({ length: N }, () => 8),
  elevation: Array.from({ length: N }, (_, i) => 1600 + i),
};

const renderMap = (props = {}) =>
  render(
    <MantineProvider>
      <ColoredRouteMap activityStreams={streams} routeCoords={[]} {...props} />
    </MantineProvider>,
  );

beforeEach(() => {
  drawn.sources.length = 0;
  drawn.layers.length = 0;
  drawn.markers.length = 0;
  localStorage.clear();
});

describe('ColoredRouteMap', () => {
  it('opens on power, in 3D, with extruded walls and the scrub strip', () => {
    renderMap({ ftp: 250 });
    expect(screen.getByRole('radio', { name: 'Power' }).checked).toBe(true);
    expect(screen.getByRole('radio', { name: '3D' }).checked).toBe(true);
    expect(drawn.layers.some((l) => l.type === 'fill-extrusion')).toBe(true);
    expect(screen.getByTestId('ride-metric-strip')).toBeTruthy();
  });

  it('colors power by FTP zones and shows the zone key', () => {
    renderMap({ ftp: 250 });
    expect(screen.getByText(/zones · FTP 250 W/)).toBeTruthy();
    for (let z = 1; z <= 7; z++) expect(screen.getByText(`Z${z}`)).toBeTruthy();
    const extrusion = drawn.sources.find((s) => s.id === 'metric-extrusion');
    const colors = new Set(extrusion.data.features.map((f) => f.properties.color));
    // 100–490 W at FTP 250 spans Z1 (40%) through Z7 (196%): the Power tab's seven zone colors
    expect(colors.size).toBe(7);
    expect(colors.has('#51cf66')).toBe(true); // Z1
    expect(colors.has('#862e9c')).toBe(true); // Z7
  });

  it('falls back to the percentile ramp without an FTP', () => {
    renderMap();
    expect(screen.queryByText(/zones ·/)).toBeNull();
    expect(screen.queryByText('Z1')).toBeNull();
    // Ramp key shows the percentile display range (100 … 490 for 40 samples)
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getAllByText('490').length).toBeGreaterThan(0);
  });

  it('shows ride-wide average and max for the selected metric', () => {
    renderMap({ ftp: 250 });
    expect(screen.getByText('avg')).toBeTruthy();
    expect(screen.getByText('295')).toBeTruthy(); // mean of 100…490
    expect(screen.getByText('max')).toBeTruthy();
    expect(screen.getByText('490')).toBeTruthy();
  });

  it('uses the flat colored line in 2D and remembers the choice', () => {
    localStorage.setItem('tribos-ride-map-3d', '0');
    renderMap({ ftp: 250 });
    expect(screen.getByRole('radio', { name: '2D' }).checked).toBe(true);
    expect(drawn.layers.some((l) => l.type === 'fill-extrusion')).toBe(false);
    expect(drawn.layers.some((l) => l.id === 'colored-route-line')).toBe(true);
  });

  it('offers the fly-through when there is a track', () => {
    renderMap({ ftp: 250 });
    expect(screen.getByRole('button', { name: 'Play fly-through' })).toBeTruthy();
  });

  it('renders nothing without a track', () => {
    const { container } = renderMap({ activityStreams: null, routeCoords: [] });
    expect(container.querySelector('[data-testid="map"]')).toBeNull();
  });
});

describe('ColoredRouteMap — embed props', () => {
  it('sizes the map box from `height`', () => {
    renderMap({ ftp: 250, height: 260 });
    expect(screen.getByTestId('ride-map-box').style.height).toBe('260px');
  });

  it('drops the Paper chrome when frameless', () => {
    const { container } = renderMap({ ftp: 250, frameless: true });
    expect(container.querySelector('.mantine-Paper-root')).toBeNull();
  });

  it('keeps the Paper chrome by default', () => {
    const { container } = renderMap({ ftp: 250 });
    expect(container.querySelector('.mantine-Paper-root')).not.toBeNull();
  });

  it('leaves out the scrub strip when showStrip is false', () => {
    renderMap({ ftp: 250, showStrip: false });
    expect(screen.queryByTestId('ride-metric-strip')).toBeNull();
  });

  it('grows into a flex host when `fill` is set, with `height` as the floor', () => {
    renderMap({ ftp: 250, frameless: true, fill: true, height: 230 });
    const box = screen.getByTestId('ride-map-box');
    expect(box.style.flexGrow).toBe('1');
    expect(box.style.minHeight).toBe('230px');
    expect(box.style.height).toBe('');
  });
});
