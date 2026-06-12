import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { DiscoverPanel } from '../DiscoverPanel';

const routes = [
  { id: 'a', name: 'Long Hauler', distance_km: 80, elevation_gain_m: 900 },
  { id: 'b', name: 'Tuesday Loop', distance_km: 41, elevation_gain_m: 300 },
  { id: 'c', name: 'Quick Spin', distance_km: 15, elevation_gain_m: 100 },
];

function renderPanel(props = {}) {
  const onPick = vi.fn();
  render(
    <MantineProvider>
      <DiscoverPanel routes={routes} targetKm={40} targetLabel="Endurance · ~40 km" onPick={onPick} {...props} />
    </MantineProvider>,
  );
  return { onPick };
}

describe('DiscoverPanel', () => {
  it('shows the target context line', () => {
    renderPanel();
    expect(screen.getByText(/For today — Endurance/)).toBeInTheDocument();
  });

  it('renders routes ranked closest-to-target first', () => {
    renderPanel();
    const items = screen.getAllByTestId(/rb2-discover-item-/);
    expect(items[0]).toHaveAttribute('data-testid', 'rb2-discover-item-b'); // 41 ≈ 40
  });

  it('calls onPick with the route id', () => {
    const { onPick } = renderPanel();
    fireEvent.click(screen.getByTestId('rb2-discover-item-b'));
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('shows a loader while loading', () => {
    render(
      <MantineProvider>
        <DiscoverPanel routes={[]} targetKm={40} loading onPick={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId(/rb2-discover-item-/)).not.toBeInTheDocument();
  });

  it('shows an empty hint with no routes', () => {
    render(
      <MantineProvider>
        <DiscoverPanel routes={[]} targetKm={null} onPick={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.getByText(/No saved routes yet/)).toBeInTheDocument();
  });
});
