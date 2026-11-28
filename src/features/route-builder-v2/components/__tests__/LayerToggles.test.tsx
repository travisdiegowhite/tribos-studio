import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { LayerToggles, familiarHint, type LayerVisibilityState } from '../LayerToggles';

const initialVisibility: LayerVisibilityState = {
  surface: false,
  stress: false,
  gradient: false,
  wind: false,
  poi: false,
  bikeInfra: false,
  familiar: false,
  intervals: false,
  imagery: false,
};

function renderToggles(overrides: Partial<React.ComponentProps<typeof LayerToggles>> = {}) {
  const props: React.ComponentProps<typeof LayerToggles> = {
    visibility: initialVisibility,
    onToggle: vi.fn(),
    onPoiLayerToggle: vi.fn(),
    activePoiLayers: [],
    hasRideHistory: false,
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

  it('starts collapsed on mobile, so the switches are hidden until the header is clicked', () => {
    renderToggles({ isMobile: true });
    const root = screen.getByTestId('rb2-layer-toggles');
    expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it('starts expanded when defaultExpanded is set, even with mobile styling', () => {
    renderToggles({ isMobile: true, defaultExpanded: true });
    const root = screen.getByTestId('rb2-layer-toggles');
    expect(root.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
    expect(screen.getByText('Traffic Stress')).toBeInTheDocument();
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
    // Order: surface, stress, gradient, wind, bikeInfra, familiar, poi.
    fireEvent.click(switches[3] as HTMLInputElement);
    expect(props.onToggle).toHaveBeenCalledWith('wind', true);
  });

  it('fires onToggle for the traffic stress layer', () => {
    const { props } = renderToggles();
    const switches = screen
      .getByTestId('rb2-layer-toggles')
      .querySelectorAll('input[type="checkbox"]');
    fireEvent.click(switches[1] as HTMLInputElement);
    expect(props.onToggle).toHaveBeenCalledWith('stress', true);
  });

  it('disables the familiar-segments toggle when the rider has no ride history', () => {
    renderToggles({ hasRideHistory: false });
    const root = screen.getByTestId('rb2-layer-toggles');
    const labels = Array.from(root.querySelectorAll('input[type="checkbox"]'));
    expect(labels.length).toBeGreaterThan(0);
    const familiar = labels.find((el) => (el as HTMLInputElement).disabled);
    expect(familiar).toBeTruthy();
  });

  it('enables the familiar-segments toggle once the rider has ride history', () => {
    const { props } = renderToggles({ hasRideHistory: true });
    const switches = Array.from(
      screen.getByTestId('rb2-layer-toggles').querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(switches.every((el) => !el.disabled)).toBe(true);
    const familiarLabel = screen.getByText('Familiar Segments');
    const row = familiarLabel.closest('div')?.parentElement as HTMLElement;
    const input = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(input);
    expect(props.onToggle).toHaveBeenCalledWith('familiar', true);
  });

  it('explains why familiar segments are unavailable', () => {
    expect(familiarHint(true, false)).toBe('Roads you have ridden before');
    expect(familiarHint(false, true)).toMatch(/Sign in/);
    expect(familiarHint(false, false)).toMatch(/Sync your rides/);
  });

  it('shows the Intervals toggle only when a workout is attached', () => {
    renderToggles({ hasWorkout: false });
    expect(screen.queryByText('Intervals')).not.toBeInTheDocument();
  });

  it('fires onToggle for the intervals layer when a workout is attached', () => {
    const { props } = renderToggles({
      hasWorkout: true,
      visibility: { ...initialVisibility, intervals: true },
    });
    expect(screen.getByText('Intervals')).toBeInTheDocument();
    // Order with a workout: surface, stress, gradient, intervals, wind, …
    const switches = screen
      .getByTestId('rb2-layer-toggles')
      .querySelectorAll('input[type="checkbox"]');
    fireEvent.click(switches[3] as HTMLInputElement);
    expect(props.onToggle).toHaveBeenCalledWith('intervals', false);
  });
});

describe('LayerToggles — street imagery', () => {
  it('hides the toggle without a Mapillary token', () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', '');
    renderToggles();
    expect(screen.queryByText('Street Imagery')).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('shows the toggle with a token and reports the change', () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|test');
    const { props } = renderToggles();
    expect(screen.getByText('Street Imagery')).toBeInTheDocument();
    const row = screen.getByText('Street Imagery').closest('div')!.parentElement!;
    fireEvent.click(row.querySelector('input[type="checkbox"]')!);
    expect(props.onToggle).toHaveBeenCalledWith('imagery', true);
    vi.unstubAllEnvs();
  });
});
