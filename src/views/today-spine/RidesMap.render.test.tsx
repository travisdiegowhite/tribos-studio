import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';

// Mapbox needs WebGL; stand in for react-map-gl.
vi.mock('react-map-gl', () => ({
  default: ({ children, mapStyle }: { children?: React.ReactNode; mapStyle?: string }) => (
    <div data-testid="map" data-style={mapStyle}>
      {children}
    </div>
  ),
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  NavigationControl: () => null,
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

import { RidesMap, fullAnalysisHref } from './RidesMap';
import type { LatestRideMap, RecentRide, WeekRollup } from './types';

/** Google's canonical sample polyline — three real points. */
const POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const N = 30;

const WEEK: WeekRollup = { distanceKm: 120, distanceMi: 74.6, elevationM: 1500, elevationFt: 4921, rideCount: 3 };
const RIDES: RecentRide[] = [
  { id: 'r1', name: 'Flagstaff loop', startDate: '2026-09-10T14:00:00Z', distanceKm: 42, elevationM: 800, durationSec: 5400, polyline: POLYLINE, provider: 'garmin' },
];

function latest(over: Partial<LatestRideMap> = {}): LatestRideMap {
  return {
    id: 'r1',
    name: 'Flagstaff loop',
    startDate: '2026-09-10T14:00:00Z',
    distanceKm: 42,
    elevationM: 800,
    durationSec: 5400,
    polyline: POLYLINE,
    streams: {
      coords: Array.from({ length: N }, (_, i) => [-105.3 + i * 0.001, 40.0 + i * 0.001] as [number, number]),
      power: Array.from({ length: N }, (_, i) => 100 + i * 10),
    },
    hasStreamTrack: true,
    maxHr: 178,
    ...over,
  };
}

function renderZone(props: Partial<React.ComponentProps<typeof RidesMap>> = {}) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <RidesMap rides={RIDES} weekRollup={WEEK} units="metric" latestRide={latest()} ftp={250} {...props} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('RidesMap — zone 03 views', () => {
  it('opens on LAST RIDE with the colored map and strip when the newest ride has streams', () => {
    renderZone();
    expect(screen.getByRole('button', { name: 'LAST RIDE' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('map').getAttribute('data-style')).toContain('outdoors');
    expect(screen.getByTestId('ride-metric-strip')).toBeTruthy();
    expect(screen.getByText(/zones · FTP 250 W/)).toBeTruthy();
    expect(screen.getByText(/FLAGSTAFF LOOP · /)).toBeTruthy();
    expect(screen.queryByText('THIS WEEK', { selector: 'p' })).toBeNull();
  });

  it('switches to THIS WEEK: the dark overlay with the week chips', () => {
    renderZone();
    fireEvent.click(screen.getByRole('button', { name: 'THIS WEEK' }));
    expect(screen.getByTestId('map').getAttribute('data-style')).toContain('dark');
    expect(screen.getByText('THIS WEEK', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.queryByTestId('ride-metric-strip')).toBeNull();
  });

  it('defaults to THIS WEEK for a polyline-only ride but still offers LAST RIDE', () => {
    renderZone({ latestRide: latest({ streams: null, hasStreamTrack: false }) });
    expect(screen.getByRole('button', { name: 'THIS WEEK' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('map').getAttribute('data-style')).toContain('dark');
    fireEvent.click(screen.getByRole('button', { name: 'LAST RIDE' }));
    expect(screen.getByTestId('map').getAttribute('data-style')).toContain('outdoors');
  });

  it('shows no toggle and the plain ride count without a drawable ride', () => {
    renderZone({ latestRide: null });
    expect(screen.queryByRole('button', { name: 'LAST RIDE' })).toBeNull();
    expect(screen.getByText('LAST 1 RIDES')).toBeTruthy();
  });

  it('links FULL ANALYSIS to /train with the ride selected', () => {
    renderZone();
    const link = screen.getByRole('link', { name: /FULL ANALYSIS/ });
    expect(link.getAttribute('href')).toBe('/train?tab=history&ride=r1');
    expect(fullAnalysisHref('a b')).toBe('/train?tab=history&ride=a%20b');
  });

  it('drops the strip when compact and opens on LAST RIDE when focused', () => {
    renderZone({ compact: true, focusOnMount: true, latestRide: latest({ streams: null, hasStreamTrack: false }) });
    expect(screen.getByRole('button', { name: 'LAST RIDE' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('ride-metric-strip')).toBeNull();
  });
});
