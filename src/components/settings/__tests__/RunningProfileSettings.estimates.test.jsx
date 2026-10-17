import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const db = { profile: null, estimates: null, prs: [], upserts: [] };

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('../../../lib/supabase', () => {
  const from = (table) => {
    let columns = '';
    const q = {
      select: (c) => {
        columns = c;
        return q;
      },
      eq: () => q,
      maybeSingle: async () =>
        columns.includes('estimated_') ? { data: db.estimates, error: null } : { data: db.profile, error: null },
      then: (resolve) => resolve({ data: table === 'running_race_prs' ? db.prs : null, error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (row) => {
        db.upserts.push(row);
        return { error: null };
      },
    };
    return q;
  };
  return { supabase: { from } };
});

import RunningProfileSettings, { shouldOfferEstimate } from '../RunningProfileSettings';

const EMPTY = { threshold_pace_sec: null, vdot: null, max_hr: null, resting_hr: null, lthr: null };

const renderCard = () =>
  render(
    <MantineProvider>
      <RunningProfileSettings />
    </MantineProvider>,
  );

beforeEach(() => {
  db.profile = EMPTY;
  db.estimates = null;
  db.prs = [];
  db.upserts = [];
});

describe('shouldOfferEstimate', () => {
  it('offers when there is no pace or it differs by more than 3%', () => {
    expect(shouldOfferEstimate(null, 280)).toBe(true);
    expect(shouldOfferEstimate(300, 280)).toBe(true);
    expect(shouldOfferEstimate(282, 280)).toBe(false);
    expect(shouldOfferEstimate(300, null)).toBe(false);
  });
});

describe('RunningProfileSettings estimates and PRs', () => {
  it('offers the history estimate and fills the inputs on "Use this"', async () => {
    db.estimates = { estimated_threshold_pace_sec: 282, estimated_lthr: 168 };
    renderCard();
    const offer = await screen.findByTestId('run-estimate-offer');
    expect(offer).toHaveTextContent('4:42/km');
    expect(offer).toHaveTextContent('LTHR 168');
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    expect(await screen.findByText('4:42/km', { selector: 'span' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('run-estimate-offer')).toBeNull());
    expect(db.upserts).toEqual([]);
  });

  it('does not offer an estimate close to the entered pace', async () => {
    db.profile = { ...EMPTY, threshold_pace_sec: 283 };
    db.estimates = { estimated_threshold_pace_sec: 282, estimated_lthr: null };
    renderCard();
    expect(await screen.findByText('4:43/km')).toBeInTheDocument();
    expect(screen.queryByTestId('run-estimate-offer')).toBeNull();
  });

  it('lists race PRs in distance order, marking automatic ones', async () => {
    db.prs = [
      { distance: 'half_marathon', time_seconds: 6070, race_date: '2026-05-03', race_name: 'Spring Half', source: 'auto' },
      { distance: '5k', time_seconds: 1300, race_date: null, race_name: null, source: 'manual' },
    ];
    renderCard();
    const list = await screen.findByTestId('race-prs');
    expect(list.textContent).toMatch(/5K.*21:40.*Half marathon.*1:41:10.*Spring Half · auto/);
  });
});
