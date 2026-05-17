import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/routePreferences.js', () => ({
  getFamiliarSegmentsGeoJSON: vi.fn().mockResolvedValue({
    type: 'FeatureCollection',
    features: [],
  }),
}));
vi.mock('../../../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok-abc' } },
      }),
    },
  },
}));
vi.mock('react-map-gl', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
}));

import { FamiliarSegmentsLayer } from '../FamiliarSegmentsLayer';
import { getFamiliarSegmentsGeoJSON } from '../../../../utils/routePreferences.js';

const bbox = { north: 40.1, south: 40.0, east: -105.0, west: -105.1 };

beforeEach(() => vi.clearAllMocks());

describe('FamiliarSegmentsLayer', () => {
  it('does not fetch when invisible', () => {
    render(<FamiliarSegmentsLayer bbox={bbox} visible={false} />);
    expect(getFamiliarSegmentsGeoJSON).not.toHaveBeenCalled();
  });

  it('fetches with bbox + token after debounce when visible', async () => {
    render(<FamiliarSegmentsLayer bbox={bbox} visible />);
    await waitFor(
      () => expect(getFamiliarSegmentsGeoJSON).toHaveBeenCalledWith(bbox, 'tok-abc', 1),
      { timeout: 2000 },
    );
  });

  it('does not fetch when bbox is null', () => {
    render(<FamiliarSegmentsLayer bbox={null} visible />);
    expect(getFamiliarSegmentsGeoJSON).not.toHaveBeenCalled();
  });
});
