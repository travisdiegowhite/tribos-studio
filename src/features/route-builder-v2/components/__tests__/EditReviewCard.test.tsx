import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { EditReviewCard } from '../EditReviewCard';

const PREVIOUS = { distance_km: 30, elevation_gain_m: 300 };
const NEXT = { distance_km: 34.2, elevation_gain_m: 450 };

function renderCard(overrides: Partial<Parameters<typeof EditReviewCard>[0]> = {}) {
  const onKeep = vi.fn();
  const onRevert = vi.fn();
  const utils = render(
    <MantineProvider>
      <EditReviewCard
        previous={PREVIOUS}
        next={NEXT}
        partial={false}
        isImperial={false}
        busy={false}
        onKeep={onKeep}
        onRevert={onRevert}
        {...overrides}
      />
    </MantineProvider>,
  );
  return { ...utils, onKeep, onRevert };
}

describe('EditReviewCard', () => {
  it('shows before → after stats with signed deltas (metric)', () => {
    renderCard();
    expect(screen.getByText('Route updated')).toBeInTheDocument();
    expect(screen.getByText(/30\.0 km → 34\.2 km \(\+4\.2 km\)/)).toBeInTheDocument();
    expect(screen.getByText(/300 m → 450 m climbing \(\+150 m\)/)).toBeInTheDocument();
  });

  it('renders imperial units when isImperial', () => {
    renderCard({ isImperial: true });
    expect(screen.getByText(/18\.6 mi → 21\.3 mi/)).toBeInTheDocument();
    expect(screen.getByText(/ft climbing/)).toBeInTheDocument();
  });

  it('shows the partial eyebrow only for partial applies', () => {
    renderCard({ partial: true });
    expect(screen.getByTestId('rb2-edit-review-partial')).toBeInTheDocument();
  });

  it('omits the partial eyebrow on full applies', () => {
    renderCard();
    expect(screen.queryByTestId('rb2-edit-review-partial')).toBeNull();
  });

  it('fires onKeep and onRevert', () => {
    const { onKeep, onRevert } = renderCard();
    fireEvent.click(screen.getByTestId('rb2-edit-keep'));
    expect(onKeep).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('rb2-edit-revert'));
    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    const { onKeep } = renderCard({ busy: true });
    expect(screen.getByTestId('rb2-edit-keep')).toBeDisabled();
    expect(screen.getByTestId('rb2-edit-revert')).toBeDisabled();
    fireEvent.click(screen.getByTestId('rb2-edit-keep'));
    expect(onKeep).not.toHaveBeenCalled();
  });
});
