import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { SpineEmptyState } from './SpineEmptyState';

describe('SpineEmptyState render', () => {
  it('renders the first-run copy with links to integrations and the route builder', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <SpineEmptyState />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByText(/No training history yet/i)).toBeTruthy();
    const connect = screen.getByText('CONNECT A SERVICE');
    expect(connect.closest('a')?.getAttribute('href')).toBe('/settings');
    const plan = screen.getByText('PLAN A RIDE');
    expect(plan.closest('a')?.getAttribute('href')).toBe('/ride/new');
  });
});
