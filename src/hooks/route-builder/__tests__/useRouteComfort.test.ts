import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchCorridorWays = vi.fn();
vi.mock('../../../utils/roadAttributes', () => ({
  fetchCorridorWays: (...a: unknown[]) => fetchCorridorWays(...a),
}));
const validateComfortRoute = vi.fn();
vi.mock('../../../utils/comfortValidator', () => ({
  validateComfortRoute: (...a: unknown[]) => validateComfortRoute(...a),
}));
vi.mock('../../../features/route-builder-v2/telemetry/trackRb2', () => ({ trackRb2: vi.fn() }));

import { useRouteComfort } from '../useRouteComfort';
import type { Coordinate } from '../../../types/geo';

const GEOMETRY = { coordinates: [[-105.27, 40.01], [-105.25, 40.03]] as Coordinate[] };

describe('useRouteComfort', () => {
  beforeEach(() => {
    fetchCorridorWays.mockReset();
    validateComfortRoute.mockReset();
  });

  it('validates the route at the rider level using the corridor ways', async () => {
    fetchCorridorWays.mockResolvedValue({ ways: [{ id: 1 }], source: 'overpass' });
    validateComfortRoute.mockReturnValue({ withinPct: 90, unknownPct: 0, flaggedStretches: [], passes: true });
    const { result } = renderHook(() => useRouteComfort(GEOMETRY, 2));
    await waitFor(() => expect(result.current.validation).not.toBeNull(), { timeout: 3000 });
    expect(validateComfortRoute).toHaveBeenCalledWith(GEOMETRY.coordinates, [{ id: 1 }], { level: 2 });
    expect(result.current.loading).toBe(false);
  });

  it('reports no validation (not a pass) when no ways come back', async () => {
    fetchCorridorWays.mockResolvedValue(null);
    const { result } = renderHook(() => useRouteComfort(GEOMETRY, 2));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.validation).toBeNull();
    expect(validateComfortRoute).not.toHaveBeenCalled();
  });

  it('does nothing without a route (runs pass null)', () => {
    const { result } = renderHook(() => useRouteComfort(null, 2));
    expect(result.current.validation).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
