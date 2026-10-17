import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual('@mantine/hooks');
  return { ...actual, useMediaQuery: () => false };
});

import RideHistoryTable from './RideHistoryTable';

const rides = [
  { id: 'a', sport_type: 'Run', name: null, start_date: '2026-10-10T07:00:00Z', distance: 10000, moving_time: 3000, provider: 'garmin' },
  { id: 'b', sport_type: 'Ride', name: 'Lunch loop', start_date: '2026-10-09T07:00:00Z', distance: 40000, moving_time: 5400, average_watts: 210, provider: 'garmin' },
];

function renderTable(props = {}) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <RideHistoryTable
          rides={rides}
          formatDistance={(km) => `${km.toFixed(1)} km`}
          formatElevation={(m) => `${Math.round(m)} m`}
          maxRows={Infinity}
          {...props}
        />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('RideHistoryTable runs (multisport phase 4)', () => {
  it('shows run pace in the athlete’s units', () => {
    renderTable({ isImperial: true });
    expect(screen.getByText('8:03/mi')).toBeTruthy();
    expect(screen.getByText('210W')).toBeTruthy();
  });

  it('shows per-km pace for metric, and names an untitled run a run', () => {
    renderTable();
    expect(screen.getByText('5:00/km')).toBeTruthy();
    expect(screen.getByText('Untitled Run')).toBeTruthy();
  });
});
