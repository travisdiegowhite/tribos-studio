import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const db = { row: null, selectError: null, updateError: null, updates: [] };

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('../../../lib/supabase', () => {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: db.row, error: db.selectError }),
    update: (payload) => {
      db.updates.push(payload);
      return { eq: async () => ({ error: db.updateError }) };
    },
  };
  return { supabase: { from: () => q } };
});

import RunningProfileSettings, { LEGACY_STORAGE_KEY } from '../RunningProfileSettings';

const EMPTY_ROW = { threshold_pace_sec: null, vdot: null, max_hr: null, resting_hr: null, lthr: null };

const renderCard = () =>
  render(
    <MantineProvider>
      <RunningProfileSettings />
    </MantineProvider>,
  );

beforeEach(() => {
  db.row = null;
  db.selectError = null;
  db.updateError = null;
  db.updates = [];
  localStorage.clear();
});

describe('RunningProfileSettings', () => {
  it('loads threshold pace from the profile row', async () => {
    db.row = { ...EMPTY_ROW, threshold_pace_sec: 270, lthr: 168 };
    renderCard();
    expect(await screen.findByText('4:30/km')).toBeInTheDocument();
    expect(db.updates).toEqual([]);
  });

  it('copies a leftover localStorage profile to the database once, then removes it', async () => {
    db.row = EMPTY_ROW;
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ thresholdPaceSec: 300, lthr: 165, maxHR: 190 }));
    renderCard();
    await waitFor(() =>
      expect(db.updates).toEqual([{ threshold_pace_sec: 300, vdot: null, max_hr: 190, resting_hr: null, lthr: 165 }]),
    );
    await waitFor(() => expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull());
    expect(screen.getByText('5:00/km')).toBeInTheDocument();
  });

  it('keeps the localStorage profile when copying it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.row = EMPTY_ROW;
    db.updateError = { message: 'boom' };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ thresholdPaceSec: 300 }));
    renderCard();
    await waitFor(() => expect(db.updates).toHaveLength(1));
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it('never overwrites database values with localStorage', async () => {
    db.row = { ...EMPTY_ROW, threshold_pace_sec: 270 };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ thresholdPaceSec: 300 }));
    renderCard();
    expect(await screen.findByText('4:30/km')).toBeInTheDocument();
    expect(db.updates).toEqual([]);
  });
});
