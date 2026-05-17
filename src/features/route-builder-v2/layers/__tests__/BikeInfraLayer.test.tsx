import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/bikeInfrastructureService.js', () => ({
  fetchBikeInfrastructure: vi.fn().mockResolvedValue({
    type: 'FeatureCollection',
    features: [],
  }),
}));
vi.mock('../../../../components/BikeInfrastructureLayer.jsx', () => ({
  default: ({ data, visible }: { data: unknown; visible: boolean }) => (
    <div data-testid="legacy-bike-infra" data-visible={String(visible)} data-has-data={String(!!data)} />
  ),
}));

import { BikeInfraLayer } from '../BikeInfraLayer';
import { fetchBikeInfrastructure } from '../../../../utils/bikeInfrastructureService.js';

const bbox = { north: 40.1, south: 40.0, east: -105.0, west: -105.1 };

beforeEach(() => vi.clearAllMocks());

describe('BikeInfraLayer', () => {
  it('does not fetch when invisible', () => {
    render(<BikeInfraLayer bbox={bbox} visible={false} />);
    expect(fetchBikeInfrastructure).not.toHaveBeenCalled();
  });

  it('fetches with bbox after debounce when visible', async () => {
    render(<BikeInfraLayer bbox={bbox} visible />);
    await waitFor(
      () => expect(fetchBikeInfrastructure).toHaveBeenCalledWith(bbox),
      { timeout: 2000 },
    );
  });

  it('does not fetch when bbox is null', () => {
    render(<BikeInfraLayer bbox={null} visible />);
    expect(fetchBikeInfrastructure).not.toHaveBeenCalled();
  });
});
