import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

vi.mock('react-map-gl', () => ({
  default: ({ children }) => <div data-testid="map">{children}</div>,
  Source: ({ id, children }) => <div data-testid={`source-${id}`}>{children}</div>,
  Layer: () => null,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  NavigationControl: () => null,
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

const libraryState = { segments: [], loading: false, error: null };
vi.mock('../../hooks/useRepeatAnchorSegments', () => ({
  useRepeatAnchorSegments: () => ({
    segments: libraryState.segments,
    loading: libraryState.loading,
    error: libraryState.error,
  }),
}));

const mediaState = { mobile: false };
vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual('@mantine/hooks');
  return { ...actual, useMediaQuery: () => mediaState.mobile };
});

import RepeatsTab, { formatDuration } from './RepeatsTab';

// A small loop, dense enough to be "measured".
const CENTER = [-105.25, 40.02];
function loop(offsetMeters = 0, n = 400) {
  const out = [];
  const rLat = 0.004 + offsetMeters / 111320;
  const rLng = rLat / Math.cos((CENTER[1] * Math.PI) / 180);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([CENTER[0] + rLng * Math.cos(t), CENTER[1] + rLat * Math.sin(t)]);
  }
  return out;
}
const streams = (coords, watts, mps) => ({
  coords,
  power: coords.map(() => watts),
  heartRate: coords.map(() => 145),
  speed: coords.map(() => mps),
  elevation: coords.map((_, i) => 1600 + i / 10),
});

const A = { id: 'a', name: 'Lookout loop', start_date: '2026-09-10T14:00:00Z', activity_streams: streams(loop(), 200, 8) };
const B = { id: 'b', name: 'Lookout again', start_date: '2026-09-03T14:00:00Z', activity_streams: streams(loop(3), 250, 10) };
const C = { id: 'c', name: 'Geometry only', start_date: '2026-08-27T14:00:00Z', activity_streams: { coords: loop(2) } };
const FAR = { id: 'far', name: 'Elsewhere', start_date: '2026-08-20T14:00:00Z', activity_streams: streams(loop().map(([lng, lat]) => [lng + 1, lat]), 200, 8) };

const fmt = { formatDistance: (km) => `${km.toFixed(1)} km`, formatSpeed: (kmh) => `${kmh.toFixed(1)} km/h` };

function renderTab(props = {}) {
  return render(
    <MantineProvider>
      <RepeatsTab anchorRide={A} activities={[A, B, C, FAR]} userId="u1" onOpenRide={() => {}} {...fmt} {...props} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  libraryState.segments = [];
  libraryState.loading = false;
  libraryState.error = null;
  mediaState.mobile = false;
});

describe('RepeatsTab', () => {
  it('lists every repeat of the anchor ride with its numbers and draws them on the map', async () => {
    renderTab();
    await screen.findByTestId('repeats-list');
    // The anchor's name heads the tab and names its own row.
    expect(screen.getAllByText('Lookout loop')).toHaveLength(2);
    expect(screen.getByText(/3 rides · /)).toBeTruthy();
    expect(screen.getByText(/2 with full data/)).toBeTruthy();
    const list = screen.getByTestId('repeats-list');
    expect(within(list).getAllByTestId(/repeat-row-/)).toHaveLength(3);
    expect(within(list).getByText('anchor')).toBeTruthy();
    expect(within(list).getByText('fastest')).toBeTruthy();
    expect(within(list).getByText('geometry only')).toBeTruthy();
    expect(screen.getByTestId('source-repeats-anchor')).toBeTruthy();
    expect(screen.getByTestId('source-repeat-a')).toBeTruthy();
    expect(screen.getByTestId('source-repeat-b')).toBeTruthy();
    expect(screen.getByTestId('source-repeat-c')).toBeTruthy();
    expect(screen.queryByTestId('repeat-row-far')).toBeNull();
    // Traces only for the measured rides.
    expect(screen.getByTestId('repeat-trace-a')).toBeTruthy();
    expect(screen.getByTestId('repeat-trace-b')).toBeTruthy();
    expect(screen.queryByTestId('repeat-trace-c')).toBeNull();
  });

  it('hides a ride from the map and strip when its swatch is toggled off', async () => {
    renderTab();
    await screen.findByTestId('repeats-list');
    fireEvent.click(screen.getByRole('button', { name: /Hide Sep 3, 26/ }));
    expect(screen.queryByTestId('source-repeat-b')).toBeNull();
    expect(screen.queryByTestId('repeat-trace-b')).toBeNull();
    expect(screen.getByTestId('source-repeat-a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Show Sep 3, 26/ }));
    expect(screen.getByTestId('source-repeat-b')).toBeTruthy();
  });

  it('opens the full analysis on the chosen effort', async () => {
    const onOpenRide = vi.fn();
    renderTab({ onOpenRide });
    await screen.findByTestId('repeats-list');
    fireEvent.click(screen.getByRole('button', { name: 'Open Sep 3, 26' }));
    expect(onOpenRide).toHaveBeenCalledWith(B);
  });

  it('explains itself without an anchor ride', () => {
    renderTab({ anchorRide: null });
    expect(screen.getByText(/Pick a ride with GPS on the map card above/)).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
  });

  it('anchors on the most-ridden library segment by default and lists the rides along it', async () => {
    libraryState.segments = [
      { id: 's1', display_name: 'North arc', distance_meters: 1500, ride_count: 4, geojson: { coordinates: loop().slice(50, 200) } },
      { id: 's2', display_name: 'South arc', distance_meters: 1200, ride_count: 1, geojson: { coordinates: loop().slice(250, 350) } },
    ];
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'Segment' }));
    // Lands on the first (most-ridden) segment without a manual pick.
    expect(await screen.findByText('North arc')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Segment' }).value).toMatch(/North arc · 1.5 km · 4 rides/);
    // Both measured loops pass along the arc; the geometry-only one too.
    await waitFor(() =>
      expect(within(screen.getByTestId('repeats-list')).getAllByTestId(/repeat-row-/)).toHaveLength(3),
    );
    expect(screen.queryByText('anchor')).toBeNull();
  });

  it('says so when the segment library cannot be read', () => {
    libraryState.error = 'column training_segments.retired_at does not exist';
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'Segment' }));
    expect(screen.getByTestId('repeats-segments-error').textContent).toMatch(/Couldn't load your segments/);
    expect(screen.getByText(/Pick a segment to see every ride along it/)).toBeTruthy();
  });

  it('survives a ride row that breaks the matcher and never blanks the page', async () => {
    // A row whose polyline getter throws: the scan skips it, the tab still renders.
    const poison = {
      id: 'poison',
      name: 'Corrupt',
      start_date: '2026-08-01T14:00:00Z',
      get map_summary_polyline() {
        throw new Error('corrupt row');
      },
    };
    renderTab({ activities: [A, B, poison] });
    const list = await screen.findByTestId('repeats-list');
    expect(within(list).getAllByTestId(/repeat-row-/)).toHaveLength(2);
    expect(screen.queryByTestId('repeats-error')).toBeNull();
  });

  it('fences a render failure inside the tab with its own fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // formatDistance is called on render for the header; make it throw.
    renderTab({ formatDistance: () => { throw new Error('boom'); } });
    expect(screen.getByTestId('repeats-error')).toBeTruthy();
    expect(screen.getByText(/rest of the page is unaffected/)).toBeTruthy();
    spy.mockRestore();
  });

  it('formats durations for the list', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('—');
  });
});
