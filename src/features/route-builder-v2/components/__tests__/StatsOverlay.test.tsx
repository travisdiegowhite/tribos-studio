import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { StatsOverlay } from '../StatsOverlay';
import type { StatsOverlayProps } from '../StatsOverlay';

function renderOverlay(stats: { distance_km: number; elevation_gain_m: number; duration_s: number } | null) {
  return render(
    <MantineProvider>
      <StatsOverlay stats={stats} routeName="Test Loop" />
    </MantineProvider>,
  );
}

describe('StatsOverlay', () => {
  it('shows a surface breakdown when segment data is provided', () => {
    const segments = [
      ...Array(7).fill('paved'),
      ...Array(3).fill('gravel'),
    ];
    render(
      <MantineProvider>
        <StatsOverlay
          stats={{ distance_km: 40, elevation_gain_m: 300, duration_s: 5400 }}
          surfaceSegments={segments}
        />
      </MantineProvider>,
    );
    const surface = screen.getByTestId('rb2-stats-surface');
    expect(surface).toHaveTextContent(/%/);
  });

  it('omits the surface line when no segment data', () => {
    render(
      <MantineProvider>
        <StatsOverlay stats={{ distance_km: 40, elevation_gain_m: 300, duration_s: 5400 }} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId('rb2-stats-surface')).toBeNull();
  });

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

  it('renders 0 (not NaN) when elevation gain is undefined/NaN', () => {
    // An in-flight or failed elevation fetch can leave elevation_gain_m
    // undefined; the overlay must never show "NaNft" / "NaNm".
    renderOverlay({ distance_km: 22.5, elevation_gain_m: undefined as unknown as number, duration_s: 3600 });
    const card = screen.getByTestId('rb2-stats-overlay');
    expect(card).toHaveTextContent('0m');
    expect(card).not.toHaveTextContent('NaN');
  });

  it('renders 0ft (not NaNft) for undefined elevation in imperial', () => {
    render(
      <MantineProvider>
        <StatsOverlay
          stats={{ distance_km: 22.5, elevation_gain_m: NaN, duration_s: 3600 }}
          routeName="Imperial Zero"
          isImperial
        />
      </MantineProvider>,
    );
    const card = screen.getByTestId('rb2-stats-overlay');
    expect(card).toHaveTextContent('0ft');
    expect(card).not.toHaveTextContent('NaN');
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

function renderWithProps(props: Partial<StatsOverlayProps>) {
  return render(
    <MantineProvider>
      <StatsOverlay stats={null} {...props} />
    </MantineProvider>,
  );
}

describe('StatsOverlay target chip', () => {
  const stats = { distance_km: 32, elevation_gain_m: 300, duration_s: 4400 };

  it('stays quiet when the route is on target', () => {
    renderWithProps({ stats, targetStatus: null });
    expect(screen.queryByTestId('rb2-stats-target')).not.toBeInTheDocument();
  });

  it('says how far off the route is, in the units asked for', () => {
    renderWithProps({
      stats,
      targetStatus: { mode: 'time', error: -0.18, label: '16 min under 90' },
    });
    expect(screen.getByTestId('rb2-stats-target')).toHaveTextContent('16 min under 90');
  });

  it('offers a one-tap fix that hands the gap to the coach', () => {
    const onFixTarget = vi.fn();
    renderWithProps({
      stats,
      targetStatus: { mode: 'time', error: -0.18, label: '16 min under 90' },
      onFixTarget,
    });
    fireEvent.click(screen.getByTestId('rb2-stats-target'));
    expect(onFixTarget).toHaveBeenCalledTimes(1);
  });

  it('still reports the gap when no fix action is wired', () => {
    renderWithProps({
      stats,
      targetStatus: { mode: 'distance', error: 0.2, label: '8.0 km over 40' },
    });
    const chip = screen.getByTestId('rb2-stats-target');
    expect(chip).toHaveTextContent('8.0 km over 40');
    expect(chip).not.toHaveTextContent('Fix');
  });
});
