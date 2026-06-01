import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn().mockResolvedValue({ error: null });
const singleMock = vi.fn().mockResolvedValue({
  data: { units_preference: 'imperial', timezone: 'America/Denver' },
  error: null,
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      upsert: upsertMock,
    }),
  },
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { UserPreferencesProvider, useUserPreferences } from '../UserPreferencesContext';

function Consumer() {
  const { unitsPreference, updateUnitsPreference } = useUserPreferences();
  return (
    <div>
      <span data-testid="units">{unitsPreference}</span>
      <button onClick={() => updateUnitsPreference('metric')}>to-metric</button>
    </div>
  );
}

beforeEach(() => {
  upsertMock.mockClear();
});

describe('UserPreferencesContext.updateUnitsPreference', () => {
  it('updates the exposed value and persists to user_profiles', async () => {
    render(
      <UserPreferencesProvider>
        <Consumer />
      </UserPreferencesProvider>,
    );
    // Loads imperial from the profile.
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('imperial'));

    fireEvent.click(screen.getByText('to-metric'));

    // Optimistic local update.
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('metric'));
    // Persisted to Supabase with just the units column + id.
    expect(upsertMock).toHaveBeenCalledWith({ id: 'user-1', units_preference: 'metric' });
  });
});
