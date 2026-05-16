import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../hooks/useGear.ts', () => ({
  useGear: () => ({ alerts: [], dismissAlert: vi.fn() }),
}));

vi.mock('../../hooks/useActivation.ts', () => ({
  useActivation: () => ({ isDismissed: false, isComplete: false, undismissGuide: vi.fn() }),
}));

import RouteBuilder2 from '../RouteBuilder2';

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <RouteBuilder2 />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('RouteBuilder2 (P1.1 scaffolding)', () => {
  it('renders the heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /route builder 2\.0/i })).toBeInTheDocument();
  });

  it('shows the BETA badge', () => {
    renderPage();
    expect(screen.getByTestId('rb2-beta-badge')).toHaveTextContent('BETA');
  });

  it('sets the document title', () => {
    renderPage();
    expect(document.title).toBe('Route Builder 2.0 BETA — Tribos');
  });
});
