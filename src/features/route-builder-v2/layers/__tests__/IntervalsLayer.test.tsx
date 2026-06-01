import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-map-gl', () => ({
  Source: ({ children, data }: { children?: React.ReactNode; data?: unknown }) => (
    <div data-testid="rb2-intervals-source" data-features={(data as GeoJSON.FeatureCollection)?.features?.length ?? 0}>
      {children}
    </div>
  ),
  Layer: () => <div data-testid="rb2-intervals-layer-stub" />,
}));

import { IntervalsLayer } from '../IntervalsLayer';
import type { WorkoutCue } from '../../overlay/intervalOverlay';

const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [-105.0, 40.0],
    [-105.01, 40.0],
    [-105.02, 40.0],
  ] as [number, number][],
};

const cues: WorkoutCue[] = [{ type: 'steady', zone: 3, startDistance: 0, endDistance: 999 }];

describe('IntervalsLayer', () => {
  it('renders nothing without geometry', () => {
    const { container } = render(<IntervalsLayer geometry={null} cues={cues} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing without cues', () => {
    const { container } = render(<IntervalsLayer geometry={geometry} cues={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a colored source with features when geometry + cues are present', () => {
    const { getByTestId } = render(<IntervalsLayer geometry={geometry} cues={cues} />);
    const source = getByTestId('rb2-intervals-source');
    expect(Number(source.getAttribute('data-features'))).toBeGreaterThanOrEqual(1);
  });
});
