import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { StatsOverlay } from '../StatsOverlay';

function renderOverlay(stats: { distance_km: number; elevation_gain_m: number; duration_s: number } | null) {
  return render(
    <MantineProvider>
      <StatsOverlay stats={stats} routeName="Test Loop" />
    </MantineProvider>,
  );
}

describe('StatsOverlay', () => {
  it('renders nothing when stats are null', () => {
    renderOverlay(null);
    expect(screen.queryByTestId('rb2-stats-overlay')).toBeNull();
  });

  it('renders nothing when distance is zero', () => {
    renderOverlay({ distance_km: 0, elevation_gain_m: 0, duration_s: 0 });
    expect(screen.queryByTestId('rb2-stats-overlay')).toBeNull();
  });

  it('renders distance, elevation, and duration when populated', () => {
    renderOverlay({ distance_km: 52.4, elevation_gain_m: 612, duration_s: 7320 });
    const card = screen.getByTestId('rb2-stats-overlay');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('52km');
    expect(card).toHaveTextContent('612m');
    expect(card).toHaveTextContent('2h 2m');
  });

  it('renders single-decimal km for short rides', () => {
    renderOverlay({ distance_km: 8.4, elevation_gain_m: 100, duration_s: 1800 });
    expect(screen.getByTestId('rb2-stats-overlay')).toHaveTextContent('8.4km');
  });

  it('renders miles and feet when imperial', () => {
    render(
      <MantineProvider>
        <StatsOverlay
          stats={{ distance_km: 80.47, elevation_gain_m: 1000, duration_s: 7320 }}
          routeName="Imperial Loop"
          isImperial
        />
      </MantineProvider>,
    );
    const card = screen.getByTestId('rb2-stats-overlay');
    expect(card).toHaveTextContent('50mi'); // 80.47 km ≈ 50 mi
    expect(card).toHaveTextContent('3281ft'); // 1000 m ≈ 3281 ft
    expect(card).not.toHaveTextContent('km');
  });
});
