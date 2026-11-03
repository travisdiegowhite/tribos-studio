import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../LandingMap', () => ({ LandingMap: () => <div data-testid="map" /> }));
vi.mock('../../../components/SEO', () => ({ default: () => null }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

const planLandingRoute = vi.fn();
vi.mock('../landingEngine', () => ({ planLandingRoute: (...a: unknown[]) => planLandingRoute(...a) }));

import RoutingLanding from '../RoutingLanding';
import { comfortCard } from '../../../utils/comfortLevels';

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
});
