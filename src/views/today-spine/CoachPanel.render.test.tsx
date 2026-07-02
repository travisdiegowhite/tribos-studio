import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
const getTodayCoachMock = vi.fn();
vi.mock('../today-glance/getToday', () => ({
  getTodayCoach: (...args: unknown[]) => getTodayCoachMock(...args),
}));

import { CoachPanel } from './CoachPanel';
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
function makeData(overrides: Partial<AssembleInput> = {}) {
  return assembleSpine({
    now: NOW,
    serverLoad: serverLoad(),
    activities: [],
    ftp: 250,
    planned: [],
    todaysWorkout: null,
    event: null,
    persona: { id: 'pragmatist', name: 'The Pragmatist' },
    recentRides: [],
    weekRollup: { distanceKm: 0, distanceMi: 0, elevationM: 0, elevationFt: 0, rideCount: 0 },
    ...overrides,
  });
}

function renderPanel(data = makeData()) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <CoachPanel data={data} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeAll(() => {
  // jsdom has no Element.scrollTo; the thread autoscroll effect calls it.
  window.HTMLElement.prototype.scrollTo = (() => {}) as never;
});

beforeEach(() => {
  getTodayCoachMock.mockReset();
});

describe("CoachPanel TODAY'S CALL", () => {
  it('shows the deterministic recBody immediately, then upgrades to the AI take', async () => {
    getTodayCoachMock.mockResolvedValue('Bank the freshness — one crisp effort today.');
    const data = makeData();
    renderPanel(data);
    expect(screen.getByText(data.coach.recBody)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('Bank the freshness — one crisp effort today.')).toBeTruthy(),
    );
    expect(getTodayCoachMock).toHaveBeenCalledWith(
      expect.objectContaining({ tfi: 62, afi: 58, fs: 4 }),
    );
  });

  it('keeps the deterministic copy when the AI take is unavailable', async () => {
    getTodayCoachMock.mockResolvedValue(null);
    const data = makeData();
    renderPanel(data);
    await waitFor(() => expect(getTodayCoachMock).toHaveBeenCalled());
    expect(screen.getByText(data.coach.recBody)).toBeTruthy();
  });

  it('does not request an AI take with no training history', () => {
    renderPanel(makeData({ serverLoad: [], activities: [] }));
    expect(getTodayCoachMock).not.toHaveBeenCalled();
  });
});
