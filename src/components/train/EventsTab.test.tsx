import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { CatalogEvent } from '../../lib/events/eventCatalog';

const state: { events: CatalogEvent[]; error: string | null; season: { name: string; race_date: string }[] } = {
  events: [],
  error: null,
  season: [],
};

vi.mock('../../lib/events/eventCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../lib/events/eventCatalog')>('../../lib/events/eventCatalog');
  return { ...actual, fetchUpcomingEvents: vi.fn(async () => ({ events: state.events, error: state.error })) };
});
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/supabase', () => {
  const q = {
    select: () => q,
    eq: () => q,
    gte: async () => ({ data: state.season, error: null }),
  };
  return { supabase: { from: () => q } };
});
const modalProps = vi.fn();
vi.mock('../RaceGoalModal', () => ({
  default: (props: { raceGoal: unknown }) => {
    modalProps(props);
    return <div data-testid="race-form" />;
  },
}));
vi.mock('../../utils/dateUtils', () => ({ getTodayString: () => '2026-10-12' }));

import EventsTab from './EventsTab';

const ev = (over: Partial<CatalogEvent>): CatalogEvent => ({
  id: 'x',
  name: 'X',
  city: 'Town',
  state: 'CO',
  region: 'Mountain',
  event_date: '2027-02-06',
  date_status: 'confirmed',
  date_label: null,
  previous_date: null,
  event_type: 'Race',
  distances_text: '50 / 95 mi',
  distances_mi: [50, 95],
  max_distance_mi: 95,
  series: null,
  url: 'https://example.com/',
  notes: null,
  last_checked_at: null,
  ...over,
});

const renderTab = () =>
  render(
    <MantineProvider>
      <EventsTab isImperial />
    </MantineProvider>,
  );

beforeEach(() => {
  modalProps.mockClear();
  state.error = null;
  state.season = [];
  state.events = [
    ev({ id: 'rock', name: 'Rock Cobbler', city: 'Bakersfield', state: 'CA', region: 'West' }),
    ev({ id: 'cirrem', name: 'CIRREM', date_status: 'est', previous_date: '2026-02-28', event_date: '2027-02-27', distances_mi: [62.1], distances_text: '100K' }),
    ev({ id: 'dk', name: 'Desert Gravel', event_date: '2027-04-24' }),
  ];
});

describe('EventsTab', () => {
  it('lists events by month with each date’s status', async () => {
    renderTab();
    expect(await screen.findByText('Rock Cobbler')).toBeInTheDocument();
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Events', 'February 2027', 'April 2027']);
    expect(screen.getByText('Est. from 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmed')).toHaveLength(2);
    expect(screen.getByText('3 of 3 events')).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    renderTab();
    await screen.findByText('Rock Cobbler');
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'bakersfield' } });
    expect(screen.getByText('1 of 3 events')).toBeInTheDocument();
    expect(screen.queryByText('CIRREM')).not.toBeInTheDocument();
  });

  it('opens the race form prefilled when a single-distance event is added', async () => {
    renderTab();
    await screen.findByText('CIRREM');
    const buttons = screen.getAllByRole('button', { name: 'Add to season' });
    // Rows render in date order: Rock Cobbler (Feb 6), CIRREM (Feb 27), Desert Gravel.
    fireEvent.click(buttons[1]);
    expect(screen.getByTestId('race-form')).toBeInTheDocument();
    expect(modalProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        raceGoal: expect.objectContaining({ name: 'CIRREM', race_date: '2027-02-27', race_type: 'gravel', distance_km: 99.9 }),
      }),
    );
  });

  it('marks events already in the rider’s season', async () => {
    state.season = [{ name: 'Rock Cobbler', race_date: '2027-02-06' }];
    renderTab();
    await waitFor(() => expect(screen.getByText('In your season')).toBeInTheDocument());
  });

  it('says so when the catalog fails to load', async () => {
    state.events = [];
    state.error = 'relation "event_catalog" does not exist';
    renderTab();
    expect(await screen.findByRole('alert')).toHaveTextContent('event_catalog');
  });
});
