import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('shows a distance/elevation readout on hover', async () => {
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
    // Hover at the far right (~10km / 100m). Hover updates are coalesced to
    // one per animation frame, so flush a frame before asserting.
    fireEvent.pointerMove(svg, { clientX: 100 });
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    const panel = screen.getByTestId('rb2-elevation-panel');
    expect(panel).toHaveTextContent('10km · 100m');
  });

  it('reports the hovered km via onHoverKm and clears it on leave', async () => {
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

    // Hover at the midpoint → ~5km (continuous, not snapped to a profile
    // point). Updates are rAF-coalesced, so flush a frame first.
    fireEvent.pointerMove(svg, { clientX: 50 });
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
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

describe('ElevationPanel climbs', () => {
  // Flat 1 km, a 4 km climb at 6%, flat 1 km — sampled every 100 m.
  const CAT3: ElevationPoint[] = Array.from({ length: 61 }, (_, i) => {
    const km = i / 10;
    const climbed = Math.min(Math.max(km - 1, 0), 4);
    return { distance_km: km, elevation_m: 1600 + climbed * 60 };
  });

  it('lists each climb with its category and lets the rider pick one', () => {
    const onSelectClimb = vi.fn();
    render(
      <MantineProvider>
        <ElevationPanel profile={CAT3} onSelectClimb={onSelectClimb} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-elevation-climb-bars').querySelectorAll('rect')).toHaveLength(1);
    const item = screen.getByRole('button', { name: /Cat 3/ });
    fireEvent.click(item);
    expect(onSelectClimb).toHaveBeenCalledTimes(1);
    const [start_km, end_km] = onSelectClimb.mock.calls[0];
    expect(start_km).toBeCloseTo(1, 0);
    expect(end_km).toBeCloseTo(5, 0);
  });

  it('shows no climb list on a flat route', () => {
    const flat: ElevationPoint[] = Array.from({ length: 30 }, (_, i) => ({ distance_km: i / 10, elevation_m: 1600 }));
    render(
      <MantineProvider>
        <ElevationPanel profile={flat} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId('rb2-elevation-climbs')).toBeNull();
  });
});

describe('ElevationPanel section select', () => {
  const RECT = {
    left: 0,
    width: 100,
    top: 0,
    height: 80,
    right: 100,
    bottom: 80,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect;

  it('drag selects a stretch, shows its metrics, and "Show on map" reports it', () => {
    const onSelectRange = vi.fn();
    render(
      <MantineProvider>
        <ElevationPanel profile={CLIMB} onSelectRange={onSelectRange} />
      </MantineProvider>,
    );
    const svg = screen.getByRole('img');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(RECT);
    fireEvent.pointerDown(svg, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, pointerId: 1 });

    expect(screen.getByTestId('rb2-elevation-selection')).toBeInTheDocument();
    // 2 km → 6 km of a steady 1% climb: 4 km, +40 m.
    const section = screen.getByTestId('rb2-elevation-section');
    expect(section).toHaveTextContent('2.0km–6.0km');
    expect(section).toHaveTextContent('↑ 40m');
    expect(section).toHaveTextContent('avg 1.0%');
    fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    expect(onSelectRange).toHaveBeenCalledWith(2, 6);

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByTestId('rb2-elevation-section')).toBeNull();
  });

  it('a press without dragging selects nothing', () => {
    renderPanel(CLIMB);
    const svg = screen.getByRole('img');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(RECT);
    fireEvent.pointerDown(svg, { clientX: 30, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 30, pointerId: 1 });
    expect(screen.queryByTestId('rb2-elevation-selection')).toBeNull();
  });
});
