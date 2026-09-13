import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import RepeatsStrip from './RepeatsStrip';
import type { StreamRow } from '../../utils/streamChartData';

function rows(n: number, power: number | null, hr: number | null): StreamRow[] {
  return Array.from({ length: n }, (_, i) => ({
    x: (i / (n - 1)) * 10,
    power,
    heartRate: hr,
    speed_kmh: 30,
    cadence: null,
    elevation_m: 1600 + i,
  }));
}

function renderStrip(props: Partial<React.ComponentProps<typeof RepeatsStrip>> = {}) {
  return render(
    <MantineProvider>
      <RepeatsStrip
        series={[
          { id: 'a', color: '#2A8C82', rows: rows(20, 200, 140) },
          { id: 'b', color: '#D4600A', rows: rows(20, 260, 150) },
        ]}
        metric="power"
        xMaxKm={10}
        elevationRows={rows(20, 200, 140)}
        hoverX={null}
        onHoverX={() => {}}
        {...props}
      />
    </MantineProvider>,
  );
}

describe('RepeatsStrip', () => {
  it('draws one trace per series in its own colour', () => {
    renderStrip();
    expect(screen.getByTestId('repeat-trace-a').getAttribute('stroke')).toBe('#2A8C82');
    expect(screen.getByTestId('repeat-trace-b').getAttribute('stroke')).toBe('#D4600A');
    expect(screen.getByText('0 km')).toBeTruthy();
    expect(screen.getByText('10 km')).toBeTruthy();
  });

  it('skips a series with nothing for the metric and says so when none remain', () => {
    renderStrip({ series: [{ id: 'a', color: '#2A8C82', rows: rows(20, null, 140) }] });
    expect(screen.queryByTestId('repeat-trace-a')).toBeNull();
    expect(screen.getByText('No measured traces to draw')).toBeTruthy();
  });

  it('reports the scrubbed distance in km from the pointer position', () => {
    const onHoverX = vi.fn();
    renderStrip({ onHoverX });
    const strip = screen.getByTestId('repeats-strip');
    strip.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerMove(strip, { clientX: 50 });
    expect(onHoverX).toHaveBeenLastCalledWith(2.5);
    fireEvent.pointerLeave(strip);
    expect(onHoverX).toHaveBeenLastCalledWith(null);
  });
});
