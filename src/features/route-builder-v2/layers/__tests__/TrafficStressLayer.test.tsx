import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { stressResult } = vi.hoisted(() => ({
  stressResult: {
  ltsSegments: [1, 4] as Array<0 | 1 | 2 | 3 | 4>,
  facilities: ['protected', 'none'] as Array<'protected' | 'lane' | 'shoulder' | 'shared' | 'trail' | 'none' | 'unknown'>,
  facility: {
    totalKm: 0.2,
    knownKm: 0.2,
    kmByKind: { protected: 0.1, lane: 0, shoulder: 0, shared: 0, trail: 0, none: 0.1, unknown: 0 },
    facilityKm: 0.1,
    facilityPct: 50,
  },
  summary: {
    totalKm: 0.2,
    knownKm: 0.2,
    kmByLts: { 0: 0, 1: 0.1, 2: 0, 3: 0, 4: 0.1 },
    quietPct: 50,
    unknownPct: 0,
    stressScore: 0.5,
    lts4Km: 0.1,
    maxContinuousLts4Km: 0.1,
  },
  source: 'overpass' as const,
  },
}));

vi.mock('../../../../utils/roadAttributes', () => ({
  measureRouteStress: vi.fn().mockResolvedValue(stressResult),
  createStressRoute: vi.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
}));
vi.mock('../../telemetry/trackRb2', () => ({ trackRb2: vi.fn() }));
vi.mock('react-map-gl', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
}));

import { TrafficStressLayer } from '../TrafficStressLayer';
import { measureRouteStress, createStressRoute } from '../../../../utils/roadAttributes';
import { trackRb2 } from '../../telemetry/trackRb2';

const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [-105, 40],
    [-105.01, 40.01],
    [-105.02, 40.02],
  ] as [number, number][],
};

beforeEach(() => vi.clearAllMocks());

describe('TrafficStressLayer', () => {
  it('renders nothing and fetches nothing when geometry is null', () => {
    const { container } = render(<TrafficStressLayer geometry={null} />);
    expect(container.firstChild).toBeNull();
    expect(measureRouteStress).not.toHaveBeenCalled();
  });

  it('measures stress, reports it up, tracks, and builds the feature collection', async () => {
    const onStress = vi.fn();
    const taggedWays = [{ id: -1, geometry: geometry.coordinates, tags: { highway: 'track' } }];
    render(<TrafficStressLayer geometry={geometry} taggedWays={taggedWays} onStress={onStress} />);
    await waitFor(() =>
      expect(measureRouteStress).toHaveBeenCalledWith(geometry.coordinates, { taggedWays }),
    );
    await waitFor(() => expect(onStress).toHaveBeenCalledWith(stressResult));
    expect(createStressRoute).toHaveBeenCalledWith(geometry.coordinates, stressResult.ltsSegments);
    expect(trackRb2).toHaveBeenCalledWith(
      'stress_computed',
      expect.objectContaining({ quiet_pct: 50, source: 'overpass' }),
    );
  });

  it('renders a supplied result without fetching', async () => {
    render(<TrafficStressLayer geometry={geometry} result={stressResult} />);
    expect(createStressRoute).toHaveBeenCalledWith(geometry.coordinates, stressResult.ltsSegments);
    await new Promise((r) => setTimeout(r, 0));
    expect(measureRouteStress).not.toHaveBeenCalled();
  });

  it('clears the reported result on unmount', async () => {
    const onStress = vi.fn();
    const { unmount } = render(<TrafficStressLayer geometry={geometry} onStress={onStress} />);
    await waitFor(() => expect(onStress).toHaveBeenCalledWith(stressResult));
    unmount();
    expect(onStress).toHaveBeenLastCalledWith(null);
  });
});
