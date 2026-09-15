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
const patch = vi.fn();
vi.mock('../../hooks/useRepeatAnchorSegments', () => ({
  useRepeatAnchorSegments: () => ({
    segments: libraryState.segments,
    loading: libraryState.loading,
    error: libraryState.error,
    patch,
  }),
}));

const namerState = {
  progress: { running: false, done: 0, total: 0, named: 0, error: null },
  unnamedCount: 0,
  nameAll: vi.fn(),
  stop: vi.fn(),
  rename: vi.fn(),
  renaming: null,
};
vi.mock('../../hooks/useSegmentNamer', () => ({
  useSegmentNamer: () => namerState,
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

const segment = (id, name, rideCount, coords, extra = {}) => ({
  id,
  display_name: name,
  auto_name: name,
  custom_name: null,
  generic: false,
  distance_meters: 1500,
  avg_gradient: 1.2,
  elevation_gain_meters: 20,
  ride_count: rideCount,
  terrain_type: 'rolling',
  last_ridden_at: '2026-09-03T14:00:00Z',
  geojson: { type: 'LineString', coordinates: coords },
  ...extra,
});

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
  namerState.unnamedCount = 0;
  namerState.progress = { running: false, done: 0, total: 0, named: 0, error: null };
  vi.clearAllMocks();
});

describe('RepeatsTab', () => {
  it('lists every repeat of the anchor ride with its numbers and draws them on the map', async () => {
    renderTab();
    await screen.findByTestId('repeats-list');
    // The anchor's name heads zones 01 and 02 and names its own row.
    expect(screen.getAllByText('Lookout loop').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/3 RIDES · /)).toBeTruthy();
    expect(screen.getByText(/2 WITH FULL DATA/)).toBeTruthy();
    const list = screen.getByTestId('repeats-list');
    expect(within(list).getAllByTestId(/repeat-row-/)).toHaveLength(3);
    expect(within(list).getByText('anchor')).toBeTruthy();
    expect(within(list).getByText('best time')).toBeTruthy();
    expect(within(list).getByText('geometry only')).toBeTruthy();
    expect(screen.getByTestId('source-repeats-anchor')).toBeTruthy();
    expect(screen.getByTestId('source-repeat-a')).toBeTruthy();
    expect(screen.getByTestId('source-repeat-b')).toBeTruthy();
    expect(screen.getByTestId('source-repeat-c')).toBeTruthy();
    expect(screen.queryByTestId('repeat-row-far')).toBeNull();
    // Traces only for the measured rides, with a value axis in the metric's unit.
    expect(screen.getByTestId('repeat-trace-a')).toBeTruthy();
    expect(screen.getByTestId('repeat-trace-b')).toBeTruthy();
    expect(screen.queryByTestId('repeat-trace-c')).toBeNull();
    expect(screen.getAllByTestId('repeats-y-tick').length).toBeGreaterThan(0);
    expect(screen.getByText('W')).toBeTruthy();
    // The legend names what is drawn.
    const legend = screen.getByTestId('repeats-legend');
    expect(within(legend).getByText(/Sep 10, 26/)).toBeTruthy();
    expect(within(legend).getByText(/Aug 27, 26 · no trace/)).toBeTruthy();
  });

  it('hides a ride from the map and strip when its row is clicked, and back with its swatch', async () => {
    renderTab();
    await screen.findByTestId('repeats-list');
    fireEvent.click(screen.getByTestId('repeat-row-b'));
    expect(screen.queryByTestId('source-repeat-b')).toBeNull();
    expect(screen.queryByTestId('repeat-trace-b')).toBeNull();
    expect(screen.getByTestId('source-repeat-a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Show Sep 3, 26/ }));
    expect(screen.getByTestId('source-repeat-b')).toBeTruthy();
  });

  it('switches the trace metric from the header tabs', async () => {
    renderTab();
    await screen.findByTestId('repeats-list');
    fireEvent.click(screen.getByRole('button', { name: 'HEART RATE' }));
    expect(screen.getByText('bpm')).toBeTruthy();
    expect(screen.queryByText('W')).toBeNull();
  });

  it('opens the full analysis on the chosen effort without toggling its row', async () => {
    const onOpenRide = vi.fn();
    renderTab({ onOpenRide });
    await screen.findByTestId('repeats-list');
    fireEvent.click(screen.getByRole('button', { name: 'Open Sep 3, 26' }));
    expect(onOpenRide).toHaveBeenCalledWith(B);
    expect(screen.getByTestId('source-repeat-b')).toBeTruthy();
  });

  it('explains itself without an anchor ride', () => {
    renderTab({ anchorRide: null });
    expect(screen.getByText(/Pick a ride with GPS on the map card above/)).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
  });

  it('anchors on the most-ridden library segment by default and lists the rides along it', async () => {
    libraryState.segments = [
      segment('s1', 'North arc', 4, loop().slice(50, 200)),
      segment('s2', 'South arc', 1, loop().slice(250, 350), { distance_meters: 1200 }),
    ];
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'SEGMENT' }));
    // Lands on the first (most-ridden) segment without a manual pick.
    expect(await screen.findByTestId('segment-picker')).toBeTruthy();
    expect(screen.getByTestId('segment-card-s1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('segment-card-s2').getAttribute('data-selected')).toBe('false');
    expect(within(screen.getByTestId('segment-card-s1')).getByText('1.5 KM · ROLLING · +1.2%')).toBeTruthy();
    expect(within(screen.getByTestId('segment-card-s1')).getByText(/4 RIDES/)).toBeTruthy();
    // Both measured loops pass along the arc; the geometry-only one too.
    await waitFor(() => expect(within(screen.getByTestId('repeats-list')).getAllByTestId(/repeat-row-/)).toHaveLength(3));
    expect(screen.queryByText('anchor')).toBeNull();
    // Picking the other card re-anchors.
    fireEvent.click(screen.getByRole('button', { name: 'Compare repeats of South arc' }));
    expect(screen.getByTestId('segment-card-s2').getAttribute('data-selected')).toBe('true');
    expect(screen.getAllByText('South arc').length).toBeGreaterThanOrEqual(2);
  });

  it('opens straight onto a deep-linked segment', async () => {
    libraryState.segments = [segment('s1', 'North arc', 4, loop().slice(50, 200)), segment('s2', 'South arc', 1, loop().slice(250, 350))];
    renderTab({ initialSegmentId: 's2' });
    expect(await screen.findByTestId('segment-picker')).toBeTruthy();
    expect(screen.getByTestId('segment-card-s2').getAttribute('data-selected')).toBe('true');
    await waitFor(() => expect(screen.getByTestId('repeats-list')).toBeTruthy());
  });

  it('says so when the segment library cannot be read', () => {
    libraryState.error = 'column training_segments.retired_at does not exist';
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'SEGMENT' }));
    expect(screen.getByTestId('repeats-segments-error').textContent).toMatch(/Couldn't load your segments/);
    expect(screen.queryByTestId('repeats-zone-map')).toBeNull();
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
