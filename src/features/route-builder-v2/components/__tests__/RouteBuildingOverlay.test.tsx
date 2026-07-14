import { render, screen, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RouteBuildingOverlay } from '../RouteBuildingOverlay';

function renderOverlay(message?: string) {
  return render(
    <MantineProvider>
      <RouteBuildingOverlay message={message} />
    </MantineProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RouteBuildingOverlay', () => {
  it('renders as a polite status with the default headline', () => {
    renderOverlay();
    const overlay = screen.getByTestId('rb2-building-overlay');
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveTextContent(/plotting your route/i);
  });

  it('accepts a custom headline', () => {
    renderOverlay('Rebuilding route');
    expect(screen.getByTestId('rb2-building-overlay')).toHaveTextContent('Rebuilding route');
  });

  it('cycles the status copy over time', () => {
    vi.useFakeTimers();
    renderOverlay();
    const overlay = screen.getByTestId('rb2-building-overlay');
    expect(overlay).toHaveTextContent('Scouting the road network…');
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(overlay).toHaveTextContent('Weighing climbs and descents…');
  });

  it('does not block map interaction (pointer-events none on the scrim)', () => {
    renderOverlay();
    expect(screen.getByTestId('rb2-building-overlay')).toHaveStyle({ pointerEvents: 'none' });
  });
});
