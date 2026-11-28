import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../telemetry/trackRb2', () => ({ trackRb2: vi.fn() }));

import { AvoidToggles } from '../AvoidToggles';
import { useRouteBuilderStore } from '../../../../stores/routeBuilderStore';

describe('AvoidToggles', () => {
  beforeEach(() => {
    useRouteBuilderStore.setState({ routeAvoid: { unpaved: false, mainRoads: false } });
  });

  it('turns each avoid option on in the store, and clearing the route keeps them', () => {
    render(
      <MantineProvider>
        <AvoidToggles />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('switch', { name: /Unpaved roads/ }));
    fireEvent.click(screen.getByRole('switch', { name: /Main roads/ }));
    expect(useRouteBuilderStore.getState().routeAvoid).toEqual({ unpaved: true, mainRoads: true });
    useRouteBuilderStore.getState().clearRoute();
    expect(useRouteBuilderStore.getState().routeAvoid).toEqual({ unpaved: true, mainRoads: true });
  });
});
