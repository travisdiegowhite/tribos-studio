import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Beat4Route } from './Beat4Route';
import type { Beat4VM } from './types';

function vm(over: Partial<Beat4VM> = {}): Beat4VM {
  return {
    state: 'route',
    prompt: 'Want a route for that?',
    ctaLabel: 'Build my route',
    href: '/ride/new?workoutId=four_by_eight_vo2&duration=75',
    ...over,
  };
}

function renderBeat(v: Beat4VM) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Beat4Route vm={v} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Beat4Route', () => {
  it('links the build button at the pre-filled route builder', () => {
    renderBeat(vm());
    expect(screen.getByText('Want a route for that?')).toBeTruthy();
    const cta = screen.getByText('Build my route');
    expect(cta.getAttribute('href')).toBe('/ride/new?workoutId=four_by_eight_vo2&duration=75');
  });

  it('offers the library instead on a day with nothing to build for', () => {
    renderBeat(
      vm({
        state: 'browse',
        prompt: 'Thinking ahead? Browse routes for your next ride.',
        ctaLabel: 'Browse routes',
        href: '/ride/library',
      }),
    );
    const cta = screen.getByText('Browse routes');
    expect(cta.getAttribute('href')).toBe('/ride/library');
    expect(screen.queryByText('Build my route')).toBeNull();
  });
});
