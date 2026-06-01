import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-map-gl', () => ({
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { WindArrowsLayer } from '../WindArrowsLayer';
import type { Coordinate } from '../../../../types/geo';

// A route heading due east (longitude increasing).
const eastRoute: Coordinate[] = Array.from({ length: 13 }, (_, i) => [-105 + i * 0.01, 40]);

describe('WindArrowsLayer', () => {
  it('renders nothing for light wind', () => {
    render(<WindArrowsLayer coordinates={eastRoute} windDegrees={90} windSpeed={3} />);
    expect(screen.queryAllByTestId('rb2-wind-arrow')).toHaveLength(0);
  });

  it('renders nothing for a degenerate route', () => {
    render(<WindArrowsLayer coordinates={[[-105, 40]]} windDegrees={90} windSpeed={20} />);
    expect(screen.queryAllByTestId('rb2-wind-arrow')).toHaveLength(0);
  });

  it('places arrows along the route, capped at maxArrows', () => {
    render(
      <WindArrowsLayer coordinates={eastRoute} windDegrees={90} windSpeed={20} maxArrows={6} />,
    );
    const arrows = screen.getAllByTestId('rb2-wind-arrow');
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.length).toBeLessThanOrEqual(6 + 1);
  });

  it('colors a head-on stretch as headwind (coral)', () => {
    // Heading east with wind FROM the east (90°) → headwind everywhere.
    render(<WindArrowsLayer coordinates={eastRoute} windDegrees={90} windSpeed={20} />);
    const arrows = screen.getAllByTestId('rb2-wind-arrow');
    expect(arrows.length).toBeGreaterThan(0);
    arrows.forEach((a) => expect(a.getAttribute('data-wind-color')).toBe('#C43C2A'));
  });

  it('colors a tail stretch as tailwind (teal)', () => {
    // Heading east with wind FROM the west (270°) → tailwind everywhere.
    render(<WindArrowsLayer coordinates={eastRoute} windDegrees={270} windSpeed={20} />);
    const arrows = screen.getAllByTestId('rb2-wind-arrow');
    arrows.forEach((a) => expect(a.getAttribute('data-wind-color')).toBe('#2A8C82'));
  });
});
