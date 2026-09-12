import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import RideMetricStrip from './RideMetricStrip';
import type { StreamRow } from '../utils/streamChartData';

const rows: StreamRow[] = Array.from({ length: 20 }, (_, i) => ({
  x: i * 0.5, // 0 … 9.5 km
  power: i === 10 ? null : 150 + i * 10,
  heartRate: 130 + i,
  speed_kmh: 25,
  cadence: 90,
  elevation_m: 1600 + i * 3,
}));

const colorForValue = (v: number) => (v >= 250 ? '#C43C2A' : '#2A8C82');

const renderStrip = (props: Partial<React.ComponentProps<typeof RideMetricStrip>> = {}) =>
  render(
    <MantineProvider>
      <RideMetricStrip
        rows={rows}
        metric="power"
        colorForValue={colorForValue}
        hoverX={null}
        onHoverX={() => {}}
        {...props}
      />
    </MantineProvider>,
  );

describe('RideMetricStrip', () => {
  it('draws the metric, the elevation band and hard-edged color stops', () => {
    const { container } = renderStrip();
    const paths = container.querySelectorAll('svg path');
    // elevation area, metric area, metric line
    expect(paths.length).toBe(3);
    // The null at i=10 splits the metric into two runs → two "M" commands
    const line = paths[2].getAttribute('d') ?? '';
    expect(line.match(/M/g)?.length).toBe(2);
    // One color change (teal → coral at 250 W) → 4 stops: start, pair at the edge, end
    // jsdom lowercases HTML-document selectors, so query the stop tag alone
    const stops = container.querySelectorAll('stop');
    expect(stops.length).toBe(4);
    expect(stops[0].getAttribute('stop-color')).toBe('#2A8C82');
    expect(stops[3].getAttribute('stop-color')).toBe('#C43C2A');
  });

  it('labels distance ticks in km', () => {
    renderStrip();
    expect(screen.getByText('0 km')).toBeTruthy();
    expect(screen.getByText('8 km')).toBeTruthy();
  });

  it('reports the pointer position as a distance along the ride', () => {
    const onHoverX = vi.fn();
    renderStrip({ onHoverX });
    const strip = screen.getByTestId('ride-metric-strip');
    strip.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, height: 100, right: 300, bottom: 100, x: 100, y: 0, toJSON() {} }) as DOMRect;
    fireEvent.pointerMove(strip, { clientX: 200 }); // halfway → 4.75 km
    expect(onHoverX).toHaveBeenLastCalledWith(4.75);
    fireEvent.pointerLeave(strip);
    expect(onHoverX).toHaveBeenLastCalledWith(null);
  });

  it('shows the cursor and dot at the hovered distance', () => {
    const { container } = renderStrip({ hoverX: 2 });
    expect(container.querySelector('svg line')).not.toBeNull();
    // Dot is an absolutely positioned HTML element colored by the value there (190 W → teal)
    const dot = container.querySelector('[style*="border-radius: 50%"]') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).toBe('rgb(42, 140, 130)');
  });

  it('draws only the elevation band with no metric selected', () => {
    const { container } = renderStrip({ metric: null });
    expect(container.querySelectorAll('svg path').length).toBe(1);
  });

  it('renders nothing for fewer than two rows', () => {
    const { container } = renderStrip({ rows: rows.slice(0, 1) });
    expect(container.querySelector('[data-testid="ride-metric-strip"]')).toBeNull();
  });
});
