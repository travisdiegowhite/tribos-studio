import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { RB2DesktopLayout } from '../RB2DesktopLayout';

function renderLayout(props: Partial<Parameters<typeof RB2DesktopLayout>[0]> = {}) {
  return render(
    <MantineProvider>
      <RB2DesktopLayout
        stats={<div>STATS</div>}
        sidebar={<div>SIDEBAR</div>}
        mapArea={<div>MAP</div>}
        elevation={<div>ELEVATION</div>}
        chat={<div>CHAT</div>}
        {...props}
      />
    </MantineProvider>,
  );
}

describe('RB2DesktopLayout', () => {
  it('renders all five region slots', () => {
    renderLayout();
    expect(screen.getByTestId('rb2-desktop-layout')).toBeInTheDocument();
    expect(screen.getByText('STATS')).toBeInTheDocument();
    expect(screen.getByText('SIDEBAR')).toBeInTheDocument();
    expect(screen.getByText('MAP')).toBeInTheDocument();
    expect(screen.getByText('ELEVATION')).toBeInTheDocument();
    expect(screen.getByText('CHAT')).toBeInTheDocument();
  });

  it('omits optional slots when not provided', () => {
    renderLayout({ stats: undefined, elevation: undefined, chat: undefined });
    expect(screen.queryByText('STATS')).toBeNull();
    expect(screen.queryByText('ELEVATION')).toBeNull();
    expect(screen.queryByText('CHAT')).toBeNull();
    // Required slots still render.
    expect(screen.getByText('SIDEBAR')).toBeInTheDocument();
    expect(screen.getByText('MAP')).toBeInTheDocument();
  });
});
