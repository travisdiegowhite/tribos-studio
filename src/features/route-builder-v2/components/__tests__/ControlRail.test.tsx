import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { ControlRail, type RailItem } from '../ControlRail';

function makeItems(): RailItem[] {
  return [
    { id: 'layers', label: 'Layers', icon: <span>L</span>, panel: <div>LAYERS PANEL</div>, badge: 2 },
    {
      id: 'waypoints',
      label: 'Waypoints',
      icon: <span>W</span>,
      panel: <div>WAYPOINTS PANEL</div>,
      disabled: true,
    },
  ];
}

function Harness() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <MantineProvider>
      <ControlRail items={makeItems()} openId={openId} onOpenChange={setOpenId} />
    </MantineProvider>
  );
}

describe('ControlRail', () => {
  it('renders an icon button per item and no flyout when closed', () => {
    render(<Harness />);
    expect(screen.getByTestId('rb2-rail-layers')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-rail-waypoints')).toBeInTheDocument();
    expect(screen.queryByTestId('rb2-rail-flyout')).toBeNull();
  });

  it('opens a flyout on click and closes it on re-click', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rb2-rail-layers'));
    expect(screen.getByTestId('rb2-rail-flyout')).toBeInTheDocument();
    expect(screen.getByText('LAYERS PANEL')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rb2-rail-layers'));
    expect(screen.queryByTestId('rb2-rail-flyout')).toBeNull();
  });

  it('closes the flyout via the close button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rb2-rail-layers'));
    fireEvent.click(screen.getByTestId('rb2-rail-flyout-close'));
    expect(screen.queryByTestId('rb2-rail-flyout')).toBeNull();
  });

  it('does not open a disabled item', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rb2-rail-waypoints'));
    expect(screen.queryByTestId('rb2-rail-flyout')).toBeNull();
  });

  it('renders a badge for active counts', () => {
    render(
      <MantineProvider>
        <ControlRail items={makeItems()} openId={null} onOpenChange={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
