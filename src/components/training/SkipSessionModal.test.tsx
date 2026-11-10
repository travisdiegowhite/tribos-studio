import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SkipSessionModal, buildSkipReason } from './SkipSessionModal';

describe('buildSkipReason', () => {
  it('joins the chip and the note, or uses whichever is given', () => {
    expect(buildSkipReason('Legs need rest', 'long run yesterday')).toBe('Legs need rest — long run yesterday');
    expect(buildSkipReason('No time', '  ')).toBe('No time');
    expect(buildSkipReason(null, 'travel day')).toBe('travel day');
    expect(buildSkipReason(null, '')).toBeNull();
  });
});

describe('SkipSessionModal', () => {
  function renderModal(onSkip = vi.fn()) {
    render(
      <MantineProvider>
        <SkipSessionModal opened sessionName="Easy Aerobic Run" dateLabel="Tuesday 10 Nov" onClose={() => {}} onSkip={onSkip} />
      </MantineProvider>,
    );
    return onSkip;
  }

  it('skips with the chosen reason', async () => {
    const onSkip = renderModal();
    fireEvent.click(screen.getByText('Legs need rest'));
    fireEvent.click(screen.getByText('Skip session'));
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith('Legs need rest', false));
  });

  it('clears the reason when the chosen chip is tapped again', async () => {
    const onSkip = renderModal();
    fireEvent.click(screen.getByText('No time'));
    fireEvent.click(screen.getByText('No time'));
    fireEvent.click(screen.getByText('Skip session'));
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith(null, false));
  });

  it('skips without a reason, and can ask the coach', async () => {
    const onSkip = renderModal();
    fireEvent.click(screen.getByText('Skip and ask coach'));
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith(null, true));
  });
});
