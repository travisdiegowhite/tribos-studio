import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { SpinePanel } from './SpinePanel';
import { buildNodeVM } from './nodeView';
import { assembleSpine, type AssembleInput } from './getTodaySpine';
import type { ServerLoadRow } from '../today/athleteMetrics';
import type { SpineData } from './types';

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
    todaysWorkout: { name: 'Hygiene Loop', type: 'endurance', durationMin: 90 },
    event: { name: 'Gran Fondo', date: fmt(addDays(NOW, 12)), daysToRace: 12, priority: 'A' },
    persona: { id: 'pragmatist', name: 'The Pragmatist' },
    recentRides: [],
    weekRollup: { distanceKm: 182, distanceMi: 113, elevationM: 2140, elevationFt: 7021, rideCount: 4 },
    ...overrides,
  };
}

function renderPanel(data: SpineData, onSelect: (i: number) => void = () => {}, selectedIndex = data.todayIndex) {
  const vm = buildNodeVM(data.days, selectedIndex, data.todayIndex);
  return render(
    <MantineProvider>
      <MemoryRouter>
        <SpinePanel
          data={data}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          vm={vm}
          dispTSB={data.days[selectedIndex].fs}
          dispReady={data.days[selectedIndex].readiness}
          flipped={false}
          ringHover={false}
          onToggleFlip={() => {}}
          onSnapToday={() => {}}
          onRingEnter={() => {}}
          onRingLeave={() => {}}
          onRingToggle={() => {}}
        />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('SpinePanel render', () => {
  it('renders the chart, legend and node without crashing', () => {
    const data = assembleSpine(input());
    renderPanel(data);
    expect(screen.getByText('TRAINING ARC')).toBeTruthy();
    expect(screen.getByText('Hygiene Loop')).toBeTruthy();
    expect(screen.getByText('FORM · FS')).toBeTruthy();
  });

  it('moves the selection with arrow keys and snaps with T', () => {
    const data = assembleSpine(input());
    const onSelect = vi.fn();
    renderPanel(data, onSelect, 10);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(9);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith(11);
    fireEvent.keyDown(slider, { key: 't' });
    expect(onSelect).toHaveBeenLastCalledWith(data.todayIndex);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith(data.days.length - 1);
  });

  it('renders a future selection as a planned day', () => {
    const data = assembleSpine(input());
    renderPanel(data, () => {}, data.todayIndex + 5);
    expect(screen.getByText(/01 · PLANNED ·/)).toBeTruthy();
    expect(screen.getByText('◂ TODAY')).toBeTruthy();
  });

  it('shows the SET A GOAL affordance when no event is set', () => {
    const data = assembleSpine(input({ event: null }));
    renderPanel(data);
    expect(screen.getByText('SET A GOAL →')).toBeTruthy();
  });
});
