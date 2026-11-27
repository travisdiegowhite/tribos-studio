import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../LandingMap', () => ({ LandingMap: () => <div data-testid="map" /> }));
vi.mock('../../../components/SEO', () => ({ default: () => null }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('../../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: null }) }));

const planLandingRoute = vi.fn();
vi.mock('../landingEngine', () => ({ planLandingRoute: (...a: unknown[]) => planLandingRoute(...a) }));

import RoutingLanding from '../RoutingLanding';
import { comfortCard } from '../../../utils/comfortLevels';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <RoutingLanding />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  planLandingRoute.mockReset();
});

describe('RoutingLanding', () => {
  it('has the headline and labelled controls, defaulting to 30 mi, road, Comfort 2', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/roads you’ll actually want to ride/);
    expect(screen.getByRole('group', { name: 'How far' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 miles' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Road' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '2 Easy' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Start from' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make my route' })).toBeInTheDocument();
  });

  it('the comfort card follows the level, with text from comfortLevels', () => {
    renderPage();
    expect(screen.getByText(comfortCard(2).headline)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '4 Confident' }));
    expect(screen.getByText(comfortCard(4).headline)).toBeInTheDocument();
    expect(screen.getByText(comfortCard(4).tradeoff)).toBeInTheDocument();
  });

  it('shows the first-visit card once', () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
    unmount();
    renderPage();
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  });

  it('asks for a start before routing', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Make my route' }));
    expect(screen.getByText('Pick a start point first.')).toBeInTheDocument();
    expect(planLandingRoute).not.toHaveBeenCalled();
  });

  it('routes from a remembered start and shows a refusal plainly', async () => {
    localStorage.setItem(
      'routing-landing:form:v1',
      JSON.stringify({ startLabel: 'Kiowa', start: [-104.46, 39.35], distanceMi: 30, surface: 'road', comfortLevel: 1 }),
    );
    planLandingRoute.mockResolvedValue({
      outcome: 'refused',
      level: 1,
      route: null,
      alternatives: [],
      refusal: { message: "There isn't a route at Comfort 1 from here at this distance.", nearbyStart: null, shorter: null, tryLevel: 2 },
      calls: 12,
      budget: 12,
      tried: [],
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Make my route' }));
    expect(await screen.findByText("There isn't a route at Comfort 1 from here at this distance.")).toBeInTheDocument();
    expect(planLandingRoute.mock.calls[0][0]).toMatchObject({ start: [-104.46, 39.35], distanceMi: 30, surface: 'road', comfortLevel: 1, bearingDeg: 0 });

    planLandingRoute.mockResolvedValue({ outcome: 'refused', level: 2, route: null, alternatives: [], refusal: { message: 'x', nearbyStart: null, shorter: null, tryLevel: 3 }, calls: 1, budget: 12, tried: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Try Comfort 2' }));
    await waitFor(() => expect(planLandingRoute).toHaveBeenCalledTimes(2));
    expect(planLandingRoute.mock.calls[1][0]).toMatchObject({ comfortLevel: 2 });
    expect(screen.getByRole('radio', { name: '2 Easy' })).toBeChecked();
  });

  it('says so when the routing service is unreachable', async () => {
    localStorage.setItem('routing-landing:form:v1', JSON.stringify({ startLabel: 'Boulder', start: [-105.27, 40.01], distanceMi: 15, surface: 'road', comfortLevel: 2 }));
    planLandingRoute.mockRejectedValue(new Error('down'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Make my route' }));
    expect(await screen.findByText(/couldn’t reach the routing service/)).toBeInTheDocument();
  });

  it('hands the shown loop to the route builder for save or send', async () => {
    localStorage.setItem(
      'routing-landing:form:v1',
      JSON.stringify({ startLabel: 'Boulder', start: [-105.27, 40.01], distanceMi: 15, surface: 'mixed', comfortLevel: 1 }),
    );
    const coordinates = [[-105.27, 40.01], [-105.3, 40.05], [-105.27, 40.01]];
    const candidate = {
      kind: 'route',
      level: 1,
      start: [-105.27, 40.01],
      targetDistance_km: 24,
      bearingDeg: 0,
      clockwise: true,
      waypoints: [[-105.27, 40.01], [-105.3, 40.05]],
      coordinates,
      distance_m: 24140,
      note: '',
      validation: {
        level: 1, total_m: 24140, within_m: 24140, flagged_m: 0, blocked_m: 0, unknown_m: 0,
        withinPct: 100, unknownPct: 0,
        segments: [{ length_m: 24140, status: 'free', tone: 'within', cls: 1, confidence: 'high', reasons: [] }],
        flaggedStretches: [], blockedStretches: [], unknownStretches: [], longestFlagged_m: 0,
        passes: true, failures: [], headsUps: [],
      },
    };
    planLandingRoute.mockResolvedValue({
      outcome: 'ok', level: 1, route: candidate, alternatives: [], refusal: null, calls: 2, budget: 12, tried: [],
    });

    function Where() {
      const loc = useLocation();
      return <div data-testid="where">{loc.pathname + loc.search}</div>;
    }
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/ride/start']}>
          <Routes>
            <Route path="/ride/start" element={<RoutingLanding />} />
            <Route path="/ride/new" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Make my route' }));
    expect(await screen.findByTestId('comfort-strip')).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('rl-open-in-builder'));

    expect(await screen.findByTestId('where')).toHaveTextContent('/ride/new?from=landing');
    const state = useRouteBuilderStore.getState();
    expect((state.routeGeometry as { coordinates: number[][] }).coordinates).toEqual(coordinates);
    expect(state.routeProfile).toBe('gravel'); // mixed edits as gravel
    expect(state.comfortLevel).toBe(1);
    expect(state.routeType).toBe('loop');
    expect(state.waypoints).toHaveLength(2);
  });
});
