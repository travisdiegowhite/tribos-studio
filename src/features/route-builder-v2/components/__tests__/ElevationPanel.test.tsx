import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { ElevationPanel } from '../ElevationPanel';
import type { ElevationPoint } from '../../../../hooks/route-builder';

function renderPanel(profile: ElevationPoint[] | null) {
  return render(
    <MantineProvider>
      <ElevationPanel profile={profile} />
    </MantineProvider>,
  );
}

// A simple climb: 0→100m over 10km, sampled every 2km.
const CLIMB: ElevationPoint[] = [
  { distance_km: 0, elevation_m: 0 },
  { distance_km: 2, elevation_m: 20 },
  { distance_km: 4, elevation_m: 40 },
  { distance_km: 6, elevation_m: 60 },
  { distance_km: 8, elevation_m: 80 },
  { distance_km: 10, elevation_m: 100 },
];

describe('ElevationPanel', () => {
  it('renders nothing when profile is null', () => {
    renderPanel(null);
    expect(screen.queryByTestId('rb2-elevation-panel')).toBeNull();
  });

  it('renders nothing with fewer than two points', () => {
    renderPanel([{ distance_km: 0, elevation_m: 0 }]);
    expect(screen.queryByTestId('rb2-elevation-panel')).toBeNull();
  });

  it('renders the chart and total gain when populated', () => {
    renderPanel(CLIMB);
    const panel = screen.getByTestId('rb2-elevation-panel');
    expect(panel).toBeInTheDocument();
    // 100m of monotonic climbing.
    expect(panel).toHaveTextContent('↑ 100m');
    // X-axis end label.
    expect(panel).toHaveTextContent('10km');
  });

  it('shows a distance/elevation readout on hover', () => {
    renderPanel(CLIMB);
    const svg = screen.getByRole('img');
    // Stub the bounding rect so clientX maps deterministically into the chart.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      height: 80,
      right: 100,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);
    // Hover at the far right (~10km / 100m).
    fireEvent.pointerMove(svg, { clientX: 100 });
    const panel = screen.getByTestId('rb2-elevation-panel');
    expect(panel).toHaveTextContent('10km · 100m');
  });

  it('reports the hovered km via onHoverKm and clears it on leave', () => {
    const onHoverKm = vi.fn();
    render(
      <MantineProvider>
        <ElevationPanel profile={CLIMB} onHoverKm={onHoverKm} />
      </MantineProvider>,
    );
    const svg = screen.getByRole('img');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      height: 80,
      right: 100,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    // Hover at the midpoint → ~5km (continuous, not snapped to a profile point).
    fireEvent.pointerMove(svg, { clientX: 50 });
    expect(onHoverKm).toHaveBeenLastCalledWith(5);

    fireEvent.pointerLeave(svg);
    expect(onHoverKm).toHaveBeenLastCalledWith(null);
  });

  it('paints interval bands when cues are provided', () => {
    render(
      <MantineProvider>
        <ElevationPanel
          profile={CLIMB}
          cues={[
            { type: 'warmup', zone: 1, startDistance: 0, endDistance: 5 },
            { type: 'interval-hard', zone: 5, startDistance: 5, endDistance: 10 },
          ]}
        />
      </MantineProvider>,
    );
    const bands = screen.getByTestId('rb2-elevation-interval-bands');
    expect(bands.querySelectorAll('rect')).toHaveLength(2);
  });

  it('renders no interval bands without cues', () => {
    renderPanel(CLIMB);
    expect(screen.queryByTestId('rb2-elevation-interval-bands')).toBeNull();
  });
});
