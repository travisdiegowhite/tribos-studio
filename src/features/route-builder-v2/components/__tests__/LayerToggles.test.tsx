import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { LayerToggles, type LayerVisibilityState } from '../LayerToggles';

const initialVisibility: LayerVisibilityState = {
  surface: false,
  gradient: false,
  wind: false,
  poi: false,
  bikeInfra: false,
  familiar: false,
};

function renderToggles(overrides: Partial<React.ComponentProps<typeof LayerToggles>> = {}) {
  const props: React.ComponentProps<typeof LayerToggles> = {
    visibility: initialVisibility,
    onToggle: vi.fn(),
    onPoiLayerToggle: vi.fn(),
    activePoiLayers: [],
    hasStravaConnection: false,
    ...overrides,
  };
  return {
    ...render(
      <MantineProvider>
        <LayerToggles {...props} />
      </MantineProvider>,
    ),
    props,
  };
}

describe('LayerToggles', () => {
  it('renders the panel root', () => {
    renderToggles();
    expect(screen.getByTestId('rb2-layer-toggles')).toBeInTheDocument();
  });

  it('fires onToggle with the layer key when a switch flips', () => {
    const { props } = renderToggles();
    const switches = screen
      .getByTestId('rb2-layer-toggles')
      .querySelectorAll('input[type="checkbox"]');
    expect(switches.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(switches[0] as HTMLInputElement);
    expect(props.onToggle).toHaveBeenCalledWith('surface', true);
  });

  it('fires onToggle for the wind layer', () => {
    const { props } = renderToggles();
    const switches = screen
      .getByTestId('rb2-layer-toggles')
      .querySelectorAll('input[type="checkbox"]');
    // Order: surface, gradient, wind, bikeInfra, familiar, poi.
    fireEvent.click(switches[2] as HTMLInputElement);
    expect(props.onToggle).toHaveBeenCalledWith('wind', true);
  });

  it('disables the familiar-segments toggle when no Strava connection', () => {
    renderToggles({ hasStravaConnection: false });
    const root = screen.getByTestId('rb2-layer-toggles');
    const labels = Array.from(root.querySelectorAll('input[type="checkbox"]'));
    expect(labels.length).toBeGreaterThan(0);
    const familiar = labels.find((el) => (el as HTMLInputElement).disabled);
    expect(familiar).toBeTruthy();
  });
});
