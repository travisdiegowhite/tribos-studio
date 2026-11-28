import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../telemetry/trackRb2', () => ({ trackRb2: vi.fn() }));
vi.mock('../../../routing-landing/landingEngine', () => ({ planLandingRoute: vi.fn() }));

import { QuickLoopPanel } from '../QuickLoopPanel';
import { useRouteBuilderStore } from '../../../../stores/routeBuilderStore';
import type { ComfortCandidate, ComfortPlan } from '../../../../utils/comfortLadder';
import type { Coordinate } from '../../../../types/geo';

const START: Coordinate = [-105.27, 40.01];

function candidate(over: Partial<ComfortCandidate> = {}): ComfortCandidate {
  return {
    kind: 'route',
    level: 2,
    start: START,
    targetDistance_km: 48,
    bearingDeg: 90,
    clockwise: true,
    waypoints: [START, [-105.2, 40.05]],
    coordinates: [START, [-105.2, 40.05], START],
    distance_m: 48000,
    note: '',
    validation: { withinPct: 97, unknownPct: 0, flaggedStretches: [], headsUps: [], segments: [], level: 2 } as never,
    ...over,
  } as ComfortCandidate;
}

function plan(over: Partial<ComfortPlan>): ComfortPlan {
  return { outcome: 'ok', level: 2, route: null, alternatives: [], refusal: null, calls: 2, budget: 12, tried: [], ...over } as ComfortPlan;
}

function renderPanel(planner: ReturnType<typeof vi.fn>, onApplied = vi.fn()) {
  render(
    <MantineProvider>
      <QuickLoopPanel start={START} startLabel="your location" comfortLevel={2} isImperial={false} onApplied={onApplied} planner={planner as never} />
    </MantineProvider>,
  );
  return onApplied;
}

describe('QuickLoopPanel', () => {
  beforeEach(() => useRouteBuilderStore.getState().resetAll());

  it('asks the ladder for a loop in the chosen direction and puts it in the builder', async () => {
    const planner = vi.fn().mockResolvedValue(plan({ route: candidate() }));
    const onApplied = renderPanel(planner);
    fireEvent.click(screen.getByRole('radio', { name: 'E' }));
    fireEvent.click(screen.getByTestId('rb2-quick-loop-go'));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(planner).toHaveBeenCalledWith(
      expect.objectContaining({ start: START, surface: 'road', comfortLevel: 2, bearingDeg: 90 }),
    );
    // 50 km default, sent as miles.
    expect(planner.mock.calls[0][0].distanceMi).toBeCloseTo(31.07, 1);
    const state = useRouteBuilderStore.getState();
    expect((state.routeGeometry as { coordinates: unknown[] }).coordinates).toHaveLength(3);
    expect(state.routeType).toBe('loop');
  });

  it('offers alternatives when there is no loop at the rider’s comfort', async () => {
    const alt = candidate({ kind: 'comfortUp' as never, level: 3, note: 'One level up', distance_m: 47000 });
    const planner = vi.fn().mockResolvedValue(plan({ outcome: 'alternatives', alternatives: [alt] }));
    const onApplied = renderPanel(planner);
    fireEvent.click(screen.getByTestId('rb2-quick-loop-go'));
    const pick = await screen.findByRole('button', { name: /One level up/ });
    expect(onApplied).not.toHaveBeenCalled();
    fireEvent.click(pick);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when routing fails', async () => {
    const planner = vi.fn().mockRejectedValue(new Error('down'));
    renderPanel(planner);
    fireEvent.click(screen.getByTestId('rb2-quick-loop-go'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t reach the routing service/);
  });
});
