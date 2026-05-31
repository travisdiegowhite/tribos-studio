import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { ElevationDock } from '../ElevationDock';
import type { ElevationPoint } from '../../../../hooks/route-builder';

const PROFILE: ElevationPoint[] = [
  { distance_km: 0, elevation_m: 0 },
  { distance_km: 5, elevation_m: 50 },
  { distance_km: 10, elevation_m: 20 },
];

function Harness({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <MantineProvider>
      <ElevationDock
        profile={PROFILE}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onHoverKm={vi.fn()}
      />
    </MantineProvider>
  );
}

describe('ElevationDock', () => {
  it('renders nothing without a usable profile', () => {
    render(
      <MantineProvider>
        <ElevationDock profile={null} collapsed={false} onCollapsedChange={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId('rb2-elevation-dock')).toBeNull();
  });

  it('shows the chart when expanded', () => {
    render(<Harness />);
    expect(screen.getByTestId('rb2-elevation-dock')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-elevation-panel')).toBeInTheDocument();
  });

  it('hides the chart when collapsed', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rb2-elevation-dock-toggle'));
    expect(screen.getByTestId('rb2-elevation-dock')).toBeInTheDocument();
    expect(screen.queryByTestId('rb2-elevation-panel')).toBeNull();
  });
});
