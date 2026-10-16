import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { StatsOverlay, formatPace } from '../StatsOverlay';
import { LayerToggles, type LayerVisibilityState } from '../LayerToggles';
import { EditToolbar } from '../EditToolbar';

const visibility: LayerVisibilityState = {
  surface: false,
  stress: false,
  gradient: false,
  wind: false,
  poi: true,
  bikeInfra: false,
  familiar: false,
  intervals: false,
};

describe('run sport rendering (multisport phase 2)', () => {
  it('formats pace per km and per mile', () => {
    expect(formatPace(10, 3000, false)).toBe('5:00/km');
    expect(formatPace(10, 3000, true)).toBe('8:03/mi');
    expect(formatPace(0, 3000, false)).toBe('—');
  });

  it('a run shows Pace instead of the bike-only stat cells', () => {
    render(
      <MantineProvider>
        <StatsOverlay stats={{ distance_km: 10, elevation_gain_m: 80, duration_s: 3000 }} sport="running" />
      </MantineProvider>,
    );
    const row = screen.getByTestId('rb2-stats-row');
    expect(row).toHaveTextContent('Pace');
    expect(row).toHaveTextContent('5:00/km');
    expect(row).not.toHaveTextContent(/Quiet roads/i);
    expect(row).not.toHaveTextContent(/Bike lanes/i);
  });

  it('a ride keeps the bike stat cells', () => {
    render(
      <MantineProvider>
        <StatsOverlay stats={{ distance_km: 40, elevation_gain_m: 300, duration_s: 5400 }} />
      </MantineProvider>,
    );
    const row = screen.getByTestId('rb2-stats-row');
    expect(row).toHaveTextContent(/Quiet roads/i);
    expect(row).not.toHaveTextContent('Pace');
  });

  it('a run hides traffic stress, bike infrastructure and bike shops', () => {
    render(
      <MantineProvider>
        <LayerToggles
          visibility={visibility}
          onToggle={vi.fn()}
          onPoiLayerToggle={vi.fn()}
          activePoiLayers={[]}
          defaultExpanded
          sport="running"
        />
      </MantineProvider>,
    );
    expect(screen.queryByText('Traffic Stress')).toBeNull();
    expect(screen.queryByText('Bike Infrastructure')).toBeNull();
    expect(screen.queryByText('Bike Shop')).toBeNull();
    expect(screen.getByText('Water')).toBeInTheDocument();
  });

  it('the edit toolbar offers run profiles for a run', () => {
    render(
      <MantineProvider>
        <EditToolbar
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          routeProfile="trail_run"
          onChangeProfile={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-profile-menu')).toHaveAttribute('aria-label', 'Routing profile: Trail');
  });
});
