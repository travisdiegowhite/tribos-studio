import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import RepeatsGrid from './RepeatsGrid';
import type { StreamRow } from '../../utils/streamChartData';

// 12 km, one sample every 100 m: ~3 km sectors → 4 of them.
function rows(power: (x: number) => number | null): StreamRow[] {
  return Array.from({ length: 121 }, (_, i) => {
    const x = i / 10;
    return { x, power: power(x), heartRate: 140, speed_kmh: 30, cadence: null, elevation_m: 1600 + i };
  });
}

function renderGrid(props: Partial<React.ComponentProps<typeof RepeatsGrid>> = {}) {
  return render(
    <MantineProvider>
      <RepeatsGrid
        efforts={[
          { id: 'a', color: '#2B2BFF', label: 'Oct 9, 26', rows: rows(() => 200) },
          // Nothing recorded after 3 km: the rest of its row stays blank.
          { id: 'b', color: '#FF3DB8', label: 'Sep 29, 26', rows: rows((x) => (x < 3 ? 260 : null)) },
          { id: 'c', color: '#00C2FF', label: 'Aug 9, 26', rows: null },
        ]}
        metric="power"
        unit="W"
        xMaxKm={12}
        elevationRows={rows(() => 200)}
        hoverX={null}
        onHoverX={() => {}}
        {...props}
      />
    </MantineProvider>,
  );
}

describe('RepeatsGrid', () => {
  it('shows each effort’s sector averages and blanks what it can’t say', () => {
    renderGrid();
    expect(screen.getByText('0–3 km')).toBeTruthy();
    expect(screen.getByText('9–12 km')).toBeTruthy();
    expect(screen.getByTestId('repeats-cell-a-0').textContent).toBe('200');
    expect(screen.getByTestId('repeats-cell-b-0').textContent).toBe('260');
    expect(screen.getByTestId('repeats-cell-b-2').textContent).toBe('·');
    expect(screen.getByTestId('repeats-cell-c-0').textContent).toBe('·');
    expect(screen.getByText('AVG W')).toBeTruthy();
  });

  it('reports the sector midpoint when a column is hovered', () => {
    const onHoverX = vi.fn();
    renderGrid({ onHoverX });
    fireEvent.pointerEnter(screen.getByTestId('repeats-cell-a-1'));
    expect(onHoverX).toHaveBeenLastCalledWith(4.5);
  });

  it('says so when nothing was measured', () => {
    renderGrid({ efforts: [{ id: 'c', color: '#00C2FF', label: 'Aug 9, 26', rows: null }] });
    expect(screen.getByText('No measured traces to draw')).toBeTruthy();
  });
});
