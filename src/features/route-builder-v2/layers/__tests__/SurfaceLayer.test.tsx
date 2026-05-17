import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/surfaceOverlay.js', () => ({
  fetchRouteSurfaceData: vi.fn().mockResolvedValue(['paved', 'paved', 'gravel']),
  createSurfaceRoute: vi.fn().mockReturnValue({
    type: 'FeatureCollection',
    features: [],
  }),
}));
vi.mock('react-map-gl', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
}));

import { SurfaceLayer } from '../SurfaceLayer';
import {
  fetchRouteSurfaceData,
  createSurfaceRoute,
} from '../../../../utils/surfaceOverlay.js';

const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [-105, 40],
    [-105.01, 40.01],
    [-105.02, 40.02],
  ] as [number, number][],
};

beforeEach(() => vi.clearAllMocks());

describe('SurfaceLayer', () => {
  it('renders nothing when geometry is null', () => {
    const { container } = render(<SurfaceLayer geometry={null} />);
    expect(container.firstChild).toBeNull();
    expect(fetchRouteSurfaceData).not.toHaveBeenCalled();
  });

  it('fetches surface data and builds the feature collection', async () => {
    render(<SurfaceLayer geometry={geometry} />);
    await waitFor(() =>
      expect(fetchRouteSurfaceData).toHaveBeenCalledWith(geometry.coordinates),
    );
    await waitFor(() => expect(createSurfaceRoute).toHaveBeenCalled());
  });
});
