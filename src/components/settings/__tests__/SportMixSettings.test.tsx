import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const load = vi.fn();
const save = vi.fn();
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('../../../utils/sportProfile', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/sportProfile')>('../../../utils/sportProfile');
  return { ...actual, loadSportProfile: (...a: unknown[]) => load(...a), saveSportProfile: (...a: unknown[]) => save(...a) };
});

import SportMixSettings from '../SportMixSettings';

const renderCard = (onProfileChange = vi.fn()) => {
  render(
    <MantineProvider>
      <SportMixSettings onProfileChange={onProfileChange} />
    </MantineProvider>,
  );
  return onProfileChange;
};

beforeEach(() => {
  load.mockReset();
  save.mockReset();
});

describe('SportMixSettings', () => {
  it('reports what it loaded to the parent', async () => {
    load.mockResolvedValue({ ok: true, profile: { sports: ['cycling', 'running'], primarySport: 'running' } });
    const onChange = renderCard();
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ ok: true, profile: { sports: ['cycling', 'running'], primarySport: 'running' } }),
    );
    // "Both" shows the primary-sport choice.
    expect(screen.getByText('Primary sport')).toBeInTheDocument();
  });

  it('saves Running as a running-only profile', async () => {
    load.mockResolvedValue({ ok: true, profile: { sports: ['cycling'], primarySport: 'cycling' } });
    save.mockImplementation(async (_id, profile) => ({ ok: true, error: null, profile }));
    const onChange = renderCard();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(screen.queryByText('Primary sport')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Running'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Sports' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith('u1', { sports: ['running'], primarySport: 'running' }));
    expect(onChange).toHaveBeenLastCalledWith({ ok: true, profile: { sports: ['running'], primarySport: 'running' } });
  });
});
