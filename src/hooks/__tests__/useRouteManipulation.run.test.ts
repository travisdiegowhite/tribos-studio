import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../utils/smartCyclingRouter', () => ({ getSmartCyclingRoute: vi.fn() }));
vi.mock('../../utils/elevation', () => ({
  getElevationData: vi.fn().mockResolvedValue(null),
  calculateElevationStats: vi.fn(() => ({})),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { useRouteManipulation } from '../useRouteManipulation';
import { getSmartCyclingRoute } from '../../utils/smartCyclingRouter';

const WAYPOINTS = [
  { id: 'a', position: [-105.27, 40.01], type: 'start', name: 'Start' },
  { id: 'b', position: [-105.28, 40.02], type: 'end', name: 'End' },
];
const LINE = [
  [-105.27, 40.01],
  [-105.275, 40.015],
  [-105.28, 40.02],
];

function renderManipulation(routingProfile: string, useSmartRouting: boolean) {
  return renderHook(() =>
    useRouteManipulation({
      waypoints: WAYPOINTS,
      setWaypoints: vi.fn(),
      routeGeometry: null,
      setRouteGeometry: vi.fn(),
      routeStats: {},
      setRouteStats: vi.fn(),
      elevationProfile: null,
      setElevationProfile: vi.fn(),
      routingProfile,
      useSmartRouting,
    } as never),
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.mocked(getSmartCyclingRoute).mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ routes: [{ geometry: { coordinates: LINE }, distance: 1500, duration: 900 }] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'tok');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useRouteManipulation — run profiles (multisport phase 2)', () => {
  it('a run takes the smart path without bike alternates', async () => {
    vi.mocked(getSmartCyclingRoute).mockResolvedValue({ coordinates: LINE, distance_m: 1500, duration_s: 600 } as never);
    const { result } = renderManipulation('trail_run', true);
    await act(async () => {
      await result.current.snapToRoads(WAYPOINTS as never, { silent: true });
    });
    expect(getSmartCyclingRoute).toHaveBeenCalledWith(
      WAYPOINTS.map((w) => w.position),
      expect.objectContaining({ profile: 'trail_run', alternates: false }),
    );
  });

  it('a run on plain Mapbox walks — never cycling, never driving', async () => {
    const { result } = renderManipulation('run', false);
    await act(async () => {
      await result.current.snapToRoads(WAYPOINTS as never, { silent: true });
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/mapbox/walking/');
    expect(getSmartCyclingRoute).not.toHaveBeenCalled();
  });

  it('a ride on plain Mapbox still cycles', async () => {
    const { result } = renderManipulation('road', false);
    await act(async () => {
      await result.current.snapToRoads(WAYPOINTS as never, { silent: true });
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/mapbox/cycling/');
  });
});
