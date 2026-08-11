import { describe, it, expect, vi, beforeEach } from 'vitest';

const setRouteGeometry = vi.fn();
const setRouteStats = vi.fn();

vi.mock('../../../../stores/routeBuilderStore', () => ({
  useRouteBuilderStore: {
    getState: () => ({ setRouteGeometry, setRouteStats }),
  },
}));

import { revertLastChatEdit } from '../revertLastChatEdit';
import { pushCheckpoint, clearCheckpoints, checkpointCount } from '../editCheckpoints';
import type { Coordinate } from '../../../../types/geo';

const CHECKPOINT = {
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [-105.3, 40.0],
      [-105.28, 40.02],
    ] as Coordinate[],
  },
  stats: { distance_km: 42, elevation_gain_m: 800, duration_s: 5400 },
};

beforeEach(() => {
  vi.clearAllMocks();
  clearCheckpoints();
});

describe('revertLastChatEdit', () => {
  it('pops the checkpoint, writes it to the store, and returns its stats', () => {
    pushCheckpoint(CHECKPOINT);

    const restored = revertLastChatEdit();

    expect(restored).toEqual(CHECKPOINT.stats);
    expect(setRouteGeometry).toHaveBeenCalledWith(CHECKPOINT.geometry);
    expect(setRouteStats).toHaveBeenCalledWith(CHECKPOINT.stats);
    expect(checkpointCount()).toBe(0);
  });

  it('returns null and leaves the store untouched when the stack is empty', () => {
    const restored = revertLastChatEdit();

    expect(restored).toBeNull();
    expect(setRouteGeometry).not.toHaveBeenCalled();
    expect(setRouteStats).not.toHaveBeenCalled();
  });
});
