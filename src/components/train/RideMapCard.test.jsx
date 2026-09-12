import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// Mapbox needs WebGL; stand in for react-map-gl.
vi.mock('react-map-gl', () => ({
  default: ({ children }) => <div data-testid="map">{children}</div>,
  Source: ({ children }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }) => <>{children}</>,
  NavigationControl: () => null,
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

// The card is desktop by default; individual tests flip it to a phone.
const mediaState = { mobile: false };
vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual('@mantine/hooks');
  return { ...actual, useMediaQuery: () => mediaState.mobile };
});

import RideMapCard from './RideMapCard';

const N = 30;
const RIDE = {
  id: 'ride-1',
  name: 'Flagstaff loop',
  start_date: '2026-09-10T14:00:00Z',
  distance: 42_000,
  total_elevation_gain: 800,
  moving_time: 5400,
  average_watts: 210,
  average_heartrate: 148,
  max_heartrate: 178,
  activity_streams: {
    coords: Array.from({ length: N }, (_, i) => [-105.3 + i * 0.001, 40.0 + i * 0.001]),
    power: Array.from({ length: N }, (_, i) => 100 + i * 10),
    heartRate: Array.from({ length: N }, (_, i) => 110 + i * 2),
  },
};

const fmt = {
  formatDistance: (km) => `${km.toFixed(1)} km`,
  formatElevation: (m) => `${Math.round(m)} m`,
  formatTime: (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`,
};

function renderCard(props = {}) {
  return render(
    <MantineProvider>
      <RideMapCard
        ride={RIDE}
        ftp={250}
        hasNewer={false}
        hasOlder={true}
        onNewer={() => {}}
        onOlder={() => {}}
        onFullAnalysis={() => {}}
        {...fmt}
        {...props}
      />
    </MantineProvider>,
  );
}

beforeEach(() => {
  mediaState.mobile = false;
  localStorage.clear();
});

describe('RideMapCard', () => {
  it('leads with the ride name, cites its numbers and draws the map', () => {
    renderCard();
    expect(screen.getByText('Latest ride')).toBeTruthy();
    expect(screen.getByText('Flagstaff loop')).toBeTruthy();
    expect(screen.getByText('42.0 km')).toBeTruthy();
    expect(screen.getByText('800 m')).toBeTruthy();
    expect(screen.getByText('1h 30m')).toBeTruthy();
    expect(screen.getByText('210W')).toBeTruthy();
    expect(screen.getByText('148 bpm')).toBeTruthy();
    expect(screen.getByTestId('map')).toBeTruthy();
    expect(screen.getByTestId('ride-metric-strip')).toBeTruthy();
  });

  it('omits power and heart-rate chips when the ride has neither', () => {
    renderCard({ ride: { ...RIDE, average_watts: 0, average_heartrate: null } });
    expect(screen.queryByText('AVG')).toBeNull();
    expect(screen.queryByText('HR')).toBeNull();
  });

  it('disables the ends of the prev/next walk', () => {
    renderCard({ hasNewer: false, hasOlder: true });
    expect(screen.getByRole('button', { name: 'Newer ride' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Older ride' }).disabled).toBe(false);
  });

  it('steps rides and opens the full analysis on the shown ride', () => {
    const onOlder = vi.fn();
    const onFullAnalysis = vi.fn();
    renderCard({ onOlder, onFullAnalysis });
    fireEvent.click(screen.getByRole('button', { name: 'Older ride' }));
    expect(onOlder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Full analysis/ }));
    expect(onFullAnalysis).toHaveBeenCalledWith(RIDE);
  });

  it('renders nothing without a ride, and a skeleton while loading', () => {
    const { container } = renderCard({ ride: null });
    expect(container.querySelector('[data-testid="ride-map-card"]')).toBeNull();
    renderCard({ ride: null, loading: true });
    expect(document.querySelector('.mantine-Skeleton-root')).not.toBeNull();
  });

  it('starts collapsed on a phone, expands on request and remembers it', () => {
    mediaState.mobile = true;
    renderCard();
    expect(screen.queryByTestId('map')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show map' }));
    expect(screen.getByTestId('map')).toBeTruthy();
    // Phones drop the strip to keep the card short.
    expect(screen.queryByTestId('ride-metric-strip')).toBeNull();
    expect(localStorage.getItem('tribos-train-ride-map-open')).toBe('1');
  });

  it('expands on a phone when the page signals a row was tapped', () => {
    mediaState.mobile = true;
    const { rerender } = renderCard({ openSignal: 0 });
    expect(screen.queryByTestId('map')).toBeNull();
    rerender(
      <MantineProvider>
        <RideMapCard
          ride={RIDE}
          ftp={250}
          hasNewer={false}
          hasOlder
          onNewer={() => {}}
          onOlder={() => {}}
          onFullAnalysis={() => {}}
          openSignal={1}
          {...fmt}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('map')).toBeTruthy();
  });
});
