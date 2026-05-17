import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/elevation.js', () => ({
  getElevationData: vi.fn().mockResolvedValue([
    { distance_km: 0, elevation: 1500 },
    { distance_km: 1, elevation: 1520 },
    { distance_km: 2, elevation: 1510 },
  ]),
}));
vi.mock('../../../../utils/routeGradient.js', () => ({
  createGradientRoute: vi.fn().mockReturnValue({
    type: 'FeatureCollection',
    features: [],
  }),
}));
vi.mock('react-map-gl', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
}));

import { GradientLayer } from '../GradientLayer';
import { getElevationData } from '../../../../utils/elevation.js';
import { createGradientRoute } from '../../../../utils/routeGradient.js';

const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [-105, 40],
    [-105.01, 40.01],
    [-105.02, 40.02],
  ] as [number, number][],
};

beforeEach(() => vi.clearAllMocks());

describe('GradientLayer', () => {
  it('renders nothing when geometry is null', () => {
    const { container } = render(<GradientLayer geometry={null} />);
    expect(container.firstChild).toBeNull();
    expect(getElevationData).not.toHaveBeenCalled();
  });

  it('fetches elevation then builds gradient route', async () => {
    render(<GradientLayer geometry={geometry} />);
    await waitFor(() => expect(getElevationData).toHaveBeenCalledWith(geometry.coordinates));
    await waitFor(() => expect(createGradientRoute).toHaveBeenCalled());
  });
});
