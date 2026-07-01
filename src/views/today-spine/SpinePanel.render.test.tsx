import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SpinePanel } from './SpinePanel';
import { buildNodeVM } from './nodeView';
import { assembleSpine, type AssembleInput } from './getTodaySpine';
import type { ServerLoadRow } from '../today/athleteMetrics';

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
function input(): AssembleInput {
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
  };
}

describe('SpinePanel render', () => {
  it('renders the chart, legend and node without crashing', () => {
    const data = assembleSpine(input());
    const vm = buildNodeVM(data.days, data.todayIndex, data.todayIndex);
    render(
      <MantineProvider>
        <SpinePanel
          data={data}
          selectedIndex={data.todayIndex}
          onSelect={() => {}}
          vm={vm}
          dispTSB={data.days[data.todayIndex].fs}
          dispReady={data.days[data.todayIndex].readiness}
          flipped={false}
          ringHover={false}
          onToggleFlip={() => {}}
          onSnapToday={() => {}}
          onRingEnter={() => {}}
          onRingLeave={() => {}}
        />
      </MantineProvider>,
    );
    expect(screen.getByText('TRAINING ARC')).toBeTruthy();
    // The node's today workout chip.
    expect(screen.getByText('Hygiene Loop')).toBeTruthy();
    // The FORM/TSB readout label.
    expect(screen.getByText('FORM · TSB')).toBeTruthy();
  });
});
