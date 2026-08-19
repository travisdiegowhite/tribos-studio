import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { BeatsColumn } from './BeatsColumn';
import { assembleSpine, type AssembleInput } from '../getTodaySpine';
import type { ServerLoadRow } from '../../today/athleteMetrics';

const NOW = new Date(2026, 5, 30, 9, 0, 0);

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(base: Date, n: number): Date {
  const c = new Date(base);
  c.setDate(c.getDate() + n);
  return c;
}
function serverLoad(): ServerLoadRow[] {
  const rows: ServerLoadRow[] = [];
  for (let i = 0; i <= 42; i++) {
    const tfi = 44 + (i / 42) * 18;
    rows.push({ date: fmt(addDays(NOW, i - 42)), tfi, afi: tfi - 4, form_score: 4 });
  }
  return rows;
}
function input(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    now: NOW,
    serverLoad: serverLoad(),
    activities: [],
    ftp: 250,
    planned: [],
    todaysWorkout: { name: 'Threshold 4×8', type: 'threshold', durationMin: 75, targetRss: 80, workoutId: 'w-9' },
    event: null,
    persona: { id: 'pragmatist', name: 'The Pragmatist' },
    recentRides: [],
    weekRollup: { distanceKm: 0, distanceMi: 0, elevationM: 0, elevationFt: 0, rideCount: 0 },
    ...overrides,
  };
}

function renderColumn(overrides: Partial<AssembleInput> = {}) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <BeatsColumn
          data={assembleSpine(input(overrides))}
          units="metric"
          numbers={<div data-testid="instrument-view">charts</div>}
        />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('BeatsColumn', () => {
  it('renders the beats in order, one card each', () => {
    renderColumn();
    expect(screen.getByText('LAST RIDE')).toBeTruthy();
    expect(screen.getByText("TODAY'S CALL")).toBeTruthy();
    expect(screen.getByText('ROUTE')).toBeTruthy();
  });

  it('keeps the instrument view behind the door until it is asked for', () => {
    renderColumn();
    expect(screen.queryByTestId('instrument-view')).toBeNull();

    fireEvent.click(screen.getByText('See the numbers'));
    expect(screen.getByTestId('instrument-view')).toBeTruthy();

    fireEvent.click(screen.getByText('Hide the numbers'));
    expect(screen.queryByTestId('instrument-view')).toBeNull();
  });

  it('shows no axis, gridline or legend above the door', () => {
    const { container } = renderColumn();
    expect(container.querySelectorAll('svg text')).toHaveLength(0);
  });
});
