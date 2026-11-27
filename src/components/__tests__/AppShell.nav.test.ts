import { describe, it, expect, vi } from 'vitest';

vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: null, isAuthenticated: false }) }));

import { NAV_ITEMS } from '../AppShell';

describe('AppShell primary navigation', () => {
  it('puts Ride first (the route builder is the free core) and keeps every tab', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Ride', 'Today', 'Train', 'Coach', 'Garage']);
  });
});
