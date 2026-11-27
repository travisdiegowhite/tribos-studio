import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth: { isAuthenticated: boolean; loading: boolean; user: { id: string } | null } = {
  isAuthenticated: false,
  loading: false,
  user: null,
};
vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
let home: string | null = null;
vi.mock('../utils/signedInHome', () => ({ useSignedInHome: () => home }));
vi.mock('../pages/Landing', () => ({ default: () => <div>marketing landing</div> }));
vi.mock('../features/routing-landing/RoutingLanding', () => ({ default: () => <div>routing landing</div> }));

import { RootRoute } from '../App';

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/ride/new" element={<div>route builder</div>} />
        <Route path="/today" element={<div>today page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.isAuthenticated = false;
  auth.loading = false;
  auth.user = null;
  home = null;
});

describe('RootRoute', () => {
  it('shows a signed-out visitor the landing', () => {
    renderAt();
    expect(screen.getByText(/landing/)).toBeInTheDocument();
  });

  it('sends a signed-in rider without a plan to the route builder', () => {
    auth.isAuthenticated = true;
    auth.user = { id: 'u1' };
    home = '/ride/new';
    renderAt();
    expect(screen.getByText('route builder')).toBeInTheDocument();
  });

  it('keeps riders with a plan on /today', () => {
    auth.isAuthenticated = true;
    auth.user = { id: 'u1' };
    home = '/today';
    renderAt();
    expect(screen.getByText('today page')).toBeInTheDocument();
  });

  it('waits (spinner) while the home resolves, but honours a stashed return path at once', () => {
    auth.isAuthenticated = true;
    auth.user = { id: 'u1' };
    const { container, unmount } = renderAt();
    expect(container.querySelector('.loading-spinner')).not.toBeNull();
    unmount();
    localStorage.setItem('tribos_return_to', '/ride/new');
    renderAt();
    expect(screen.getByText('route builder')).toBeInTheDocument();
  });
});
