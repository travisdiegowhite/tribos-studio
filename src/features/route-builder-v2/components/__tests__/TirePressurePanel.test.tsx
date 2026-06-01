import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { TirePressurePanel } from '../TirePressurePanel';

function renderPanel(props: Partial<React.ComponentProps<typeof TirePressurePanel>> = {}) {
  render(
    <MantineProvider>
      <TirePressurePanel {...props} />
    </MantineProvider>,
  );
}

function frontPsi(): number {
  const match = (screen.getByTestId('rb2-tire-front').textContent ?? '').match(/(\d+)\s*PSI/);
  return match ? parseInt(match[1], 10) : NaN;
}

describe('TirePressurePanel', () => {
  it('renders front and rear pressures', () => {
    renderPanel();
    expect(screen.getByTestId('rb2-tire-front')).toHaveTextContent(/PSI/);
    expect(screen.getByTestId('rb2-tire-rear')).toHaveTextContent(/bar/);
  });

  it('seeds tire width + surface from a gravel route profile', () => {
    renderPanel({ routeProfile: 'gravel' });
    expect(screen.getByTestId('rb2-tire-width-40')).toHaveStyle({ color: 'rgb(255, 255, 255)' });
    expect(screen.getByTestId('rb2-tire-surface-gravel')).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    });
  });

  it('lowers pressure when switching to a rougher surface', () => {
    renderPanel({ routeProfile: 'road' });
    const paved = frontPsi();
    fireEvent.click(screen.getByTestId('rb2-tire-surface-unpaved'));
    expect(frontPsi()).toBeLessThan(paved);
  });

  it('raises pressure as rider weight increases', () => {
    renderPanel();
    const before = frontPsi();
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId('rb2-tire-weight-up'));
    }
    expect(frontPsi()).toBeGreaterThan(before);
  });
});
