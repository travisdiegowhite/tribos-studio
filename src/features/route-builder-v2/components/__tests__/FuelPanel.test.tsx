import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { FuelPanel } from '../FuelPanel';

function renderPanel(props: Partial<React.ComponentProps<typeof FuelPanel>> = {}) {
  render(
    <MantineProvider>
      <FuelPanel durationMinutes={180} elevationGainMeters={800} {...props} />
    </MantineProvider>,
  );
}

describe('FuelPanel', () => {
  it('prompts to build a route when there is no duration', () => {
    renderPanel({ durationMinutes: 0 });
    expect(screen.getByTestId('rb2-fuel-panel')).toHaveTextContent(/build or generate a route/i);
  });

  it('renders carb and hydration targets for a route', () => {
    renderPanel();
    expect(screen.getByTestId('rb2-fuel-carbs')).toHaveTextContent(/g carbs\/hr/);
    expect(screen.getByTestId('rb2-fuel-fluid')).toHaveTextContent(/ml\/hr/);
  });

  it('shows oz/hr as the primary hydration unit when imperial', () => {
    renderPanel({ isImperial: true });
    const fluid = screen.getByTestId('rb2-fuel-fluid');
    expect(fluid).toHaveTextContent(/oz\/hr/);
    expect(fluid).toHaveTextContent(/ml$|ml\b/); // ml shown as secondary
  });

  it('recomputes when the intensity chip changes', () => {
    renderPanel();
    const before = screen.getByTestId('rb2-fuel-carbs').textContent;
    fireEvent.click(screen.getByTestId('rb2-fuel-intensity-race'));
    const after = screen.getByTestId('rb2-fuel-carbs').textContent;
    // Race intensity carries a higher carb target than the moderate default.
    expect(after).not.toEqual(before);
  });
});
