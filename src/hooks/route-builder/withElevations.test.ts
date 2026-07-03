import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/elevation', () => ({
  getElevationData: vi.fn(),
  calculateElevationStats: vi.fn(),
}));

import { getElevationData } from '../../utils/elevation';
import { withElevations } from './useRoutePersistence';

const mockGetElevationData = vi.mocked(getElevationData);

const COORDS: [number, number][] = [
  [-105.2705, 40.015],
  [-105.28, 40.02],
];

beforeEach(() => {
  mockGetElevationData.mockReset();
});

describe('withElevations', () => {
  it('zips the fetched elevation profile into 3-tuple coordinates', async () => {
    mockGetElevationData.mockResolvedValue([
      { distance: 0, elevation: 1655.2 },
      { distance: 1.1, elevation: 1672.8 },
    ]);
    const result = await withElevations(COORDS);
    expect(result).toEqual([
      [-105.2705, 40.015, 1655.2],
      [-105.28, 40.02, 1672.8],
    ]);
  });

  it('returns coordinates unchanged when they already carry elevation', async () => {
    const coords3d: [number, number, number][] = [[-105.2705, 40.015, 1655.2]];
    const result = await withElevations(coords3d);
    expect(result).toBe(coords3d);
    expect(mockGetElevationData).not.toHaveBeenCalled();
  });

  it('falls back to flat coordinates when the profile is missing or mismatched', async () => {
    mockGetElevationData.mockResolvedValue(null);
    expect(await withElevations(COORDS)).toBe(COORDS);

    mockGetElevationData.mockResolvedValue([{ distance: 0, elevation: 1655.2 }]);
    expect(await withElevations(COORDS)).toBe(COORDS);
  });

  it('falls back to flat coordinates when the elevation fetch throws', async () => {
    mockGetElevationData.mockRejectedValue(new Error('rate limited'));
    expect(await withElevations(COORDS)).toBe(COORDS);
  });
});
