import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../../hooks/useCoachCheckIn', () => ({
  useCoachCheckIn: () => ({
    persona: 'pragmatist',
    savePersona: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mapbox-gl tries to access browser APIs at import time. Stub the Map
// wrapper output so jsdom doesn't blow up. We still validate that the
// wrapper is rendered into the page via a data-testid.
vi.mock('../../features/route-builder-v2/components/Map', () => ({
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="rb2-map-stub">{children}</div>
  ),
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

describe('RouteBuilder2 (P1.3)', () => {
  beforeEach(() => {
    window.matchMedia =
      window.matchMedia ||
      ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
  });

  it('renders the page root', () => {
    renderPage();
    expect(screen.getByTestId('rb2-page')).toBeInTheDocument();
  });

  it('renders the map wrapper', () => {
    renderPage();
    expect(screen.getByTestId('rb2-map-stub')).toBeInTheDocument();
  });

  it('renders the form panel collapsed by default', () => {
    renderPage();
    const toggle = screen.getByTestId('rb2-form-panel-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the layer toggles panel', () => {
    renderPage();
    expect(screen.getByTestId('rb2-layer-toggles')).toBeInTheDocument();
  });

  it('renders the chat panel open by default on desktop', () => {
    renderPage();
    expect(screen.getByTestId('rb2-chat-panel')).toBeInTheDocument();
  });

  it('renders the empty state when there is no route', () => {
    renderPage();
    expect(screen.getByTestId('rb2-empty-state')).toBeInTheDocument();
  });

  it('sets the document title', () => {
    renderPage();
    expect(document.title).toBe('Route Builder 2.0 BETA — Tribos');
  });
});
