import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import EffortsTable, { sortEfforts } from './EffortsTable';

function effort(id, startDate, stats, extra = {}) {
  return {
    id,
    ride: { id },
    name: `Ride ${id}`,
    startDate,
    coverage: 0.95,
    direction: 'forward',
    entryIdx: 0,
    exitIdx: 10,
    coords: [],
    rows: [],
    measured: true,
    color: '#123456',
    stats: { durationSeconds: null, avgPower: null, avgHr: null, avgSpeedKmh: null, ...stats },
    ...extra,
  };
}

const E = [
  effort('a', '2026-09-10T14:00:00Z', { durationSeconds: 1200, avgPower: 210, avgHr: 150, avgSpeedKmh: 30 }),
  effort('b', '2026-09-03T14:00:00Z', { durationSeconds: 1100, avgPower: 240, avgHr: 155, avgSpeedKmh: 32 }),
  effort('c', '2026-08-27T14:00:00Z', {}, { measured: false, rows: null, direction: 'reverse' }),
];

function renderTable(props = {}) {
  const all = {
    efforts: E,
    selectedSet: new Set(['a', 'b']),
    bests: { fastestId: 'b', strongestId: 'b' },
    anchor: { kind: 'ride', id: 'a' },
    atCap: false,
    maxSelected: 8,
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    formatSpeed: (kmh) => `${kmh.toFixed(1)} km/h`,
    readoutFor: () => null,
    ...props,
  };
  render(
    <MantineProvider>
      <EffortsTable {...all} />
    </MantineProvider>,
  );
  return all;
}

describe('sortEfforts', () => {
  it('sorts by any column with missing values last in either direction', () => {
    expect(sortEfforts(E, 'time', 'asc').map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(sortEfforts(E, 'time', 'desc').map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(sortEfforts(E, 'date', 'desc').map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(sortEfforts(E, 'date', 'asc').map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(sortEfforts(E, 'power', 'desc').map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('EffortsTable', () => {
  it('shows one row per effort, newest first, with the best time marked', () => {
    renderTable();
    const rows = screen.getAllByTestId(/repeat-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['repeat-row-a', 'repeat-row-b', 'repeat-row-c']);
    const b = screen.getByTestId('repeat-row-b');
    expect(within(b).getByText('best time')).toBeTruthy();
    expect(within(b).getByText('18:20')).toBeTruthy();
    expect(within(b).getByText('240')).toBeTruthy();
    expect(within(b).getByText('32.0 km/h')).toBeTruthy();
    expect(within(screen.getByTestId('repeat-row-a')).getByText('anchor')).toBeTruthy();
    const c = screen.getByTestId('repeat-row-c');
    expect(within(c).getByText('geometry only')).toBeTruthy();
    expect(within(c).getByText('reverse')).toBeTruthy();
    expect(within(c).getAllByText('—')).toHaveLength(4);
    expect(c.getAttribute('data-selected')).toBe('false');
  });

  it('re-sorts when a column header is clicked, toggling direction on a second click', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Sort by time' }));
    expect(screen.getAllByTestId(/repeat-row-/).map((r) => r.getAttribute('data-testid'))).toEqual(['repeat-row-b', 'repeat-row-a', 'repeat-row-c']);
    expect(screen.getByRole('columnheader', { name: /Time/ }).getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by time' }));
    expect(screen.getAllByTestId(/repeat-row-/).map((r) => r.getAttribute('data-testid'))).toEqual(['repeat-row-a', 'repeat-row-b', 'repeat-row-c']);
    expect(screen.getByRole('columnheader', { name: /Time/ }).getAttribute('aria-sort')).toBe('descending');
  });

  it('toggles a ride from the whole row, the swatch, or the keyboard, and opens without toggling', () => {
    const { onToggle, onOpen } = renderTable();
    fireEvent.click(screen.getByTestId('repeat-row-c'));
    expect(onToggle).toHaveBeenLastCalledWith('c');
    fireEvent.click(screen.getByRole('button', { name: 'Hide Sep 3, 26' }));
    expect(onToggle).toHaveBeenLastCalledWith('b');
    expect(onToggle).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByTestId('repeat-row-a'), { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: 'Open Sep 10, 26' }));
    expect(onOpen).toHaveBeenCalledWith(E[0].ride);
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it('refuses to add a row past the cap but still allows hiding', () => {
    const { onToggle } = renderTable({ atCap: true });
    fireEvent.click(screen.getByTestId('repeat-row-c'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId('repeat-row-c').getAttribute('title')).toBe('Up to 8 at once');
    fireEvent.click(screen.getByTestId('repeat-row-a'));
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('prints the cursor readout on a shown row', () => {
    renderTable({ readoutFor: (e) => (e.id === 'a' ? '215 W' : null) });
    expect(screen.getByTestId('repeat-readout-a').textContent).toBe('215 W at cursor');
    expect(screen.queryByTestId('repeat-readout-b')).toBeNull();
  });
});
