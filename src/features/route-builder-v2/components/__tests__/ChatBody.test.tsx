import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { ChatBody } from '../ChatBody';
import type { ChatMessage, RouteOptionSummary } from '../../chat/types';

const OPTIONS: RouteOptionSummary[] = [
  {
    index: 0,
    name: 'Northeast Loop',
    distance_km: 72.1,
    elevation_gain_m: 520,
    direction_label: 'Northeast',
    familiarity_percent: null,
    surface_label: 'gravel-biased',
  },
  {
    index: 1,
    name: 'Northeast Loop (ccw)',
    distance_km: 75.4,
    elevation_gain_m: 480,
    direction_label: 'Northeast',
    familiarity_percent: 22,
  },
  {
    index: 2,
    name: 'East Loop',
    distance_km: 69.8,
    elevation_gain_m: 610,
    direction_label: 'East',
    familiarity_percent: null,
  },
];

const OPTIONS_MESSAGE: ChatMessage = {
  id: 'opts-1',
  role: 'assistant',
  text: 'Built 3 options heading northeast — applied the best match.',
  timestamp: 0,
  kind: 'route-options',
  options: OPTIONS,
  selectedOptionIndex: 0,
};

function renderBody(overrides: Partial<Parameters<typeof ChatBody>[0]> = {}) {
  const onSelectOption = vi.fn();
  const utils = render(
    <MantineProvider>
      <ChatBody
        messages={[OPTIONS_MESSAGE]}
        isProcessing={false}
        exampleHint={[]}
        showAfterRefuseHint={false}
        onSubmit={vi.fn()}
        onSelectOption={onSelectOption}
        {...overrides}
      />
    </MantineProvider>,
  );
  return { ...utils, onSelectOption };
}

describe('ChatBody — route option cards', () => {
  it('renders a card per option with metric stats by default', () => {
    renderBody();
    expect(screen.getByTestId('rb2-chat-route-options')).toBeInTheDocument();
    expect(screen.getByText('Northeast Loop')).toBeInTheDocument();
    expect(screen.getByText('Northeast Loop (ccw)')).toBeInTheDocument();
    expect(screen.getByText('East Loop')).toBeInTheDocument();
    expect(screen.getByText(/72\.1 km/)).toBeInTheDocument();
    expect(screen.getByText(/520 m climbing/)).toBeInTheDocument();
    expect(screen.getByText(/gravel-biased/)).toBeInTheDocument();
    expect(screen.getByText(/22% familiar/)).toBeInTheDocument();
  });

  it('renders imperial stats when isImperial', () => {
    renderBody({ isImperial: true });
    expect(screen.getByText(/44\.8 mi/)).toBeInTheDocument();
    expect(screen.getByText(/1706 ft climbing/)).toBeInTheDocument();
  });

  it('marks the selected card and fires onSelectOption for the others', () => {
    const { onSelectOption } = renderBody();
    expect(screen.getByText('On map')).toBeInTheDocument();
    const selected = screen.getByTestId('rb2-chat-route-option-0');
    expect(selected).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('rb2-chat-route-option-1'));
    expect(onSelectOption).toHaveBeenCalledWith('opts-1', 1);

    // Clicking the already-selected card is a no-op.
    fireEvent.click(selected);
    expect(onSelectOption).toHaveBeenCalledTimes(1);
  });

  it('does not fire selection while processing', () => {
    const { onSelectOption } = renderBody({ isProcessing: true });
    fireEvent.click(screen.getByTestId('rb2-chat-route-option-2'));
    expect(onSelectOption).not.toHaveBeenCalled();
  });

  it('renders plain text messages without cards', () => {
    renderBody({
      messages: [{ id: 'm1', role: 'assistant', text: 'Just words', timestamp: 0 }],
    });
    expect(screen.getByText('Just words')).toBeInTheDocument();
    expect(screen.queryByTestId('rb2-chat-route-options')).toBeNull();
  });

  it('shows the measured gravel % (with target) and rationale when present', () => {
    const message: ChatMessage = {
      id: 'opts-2',
      role: 'assistant',
      text: 'Planned 3 routes.',
      timestamp: 0,
      kind: 'route-options',
      options: [
        {
          index: 0,
          name: 'Hygiene–Berthoud Gravel',
          distance_km: 72.1,
          elevation_gain_m: 520,
          direction_label: 'Northeast',
          familiarity_percent: null,
          surface_label: 'gravel-biased',
          gravel_actual_pct: 48,
          gravel_target_pct: 50,
          rationale: 'County gravel northeast through farm country.',
        },
      ],
      selectedOptionIndex: 0,
    };
    renderBody({ messages: [message] });
    // Measured % takes priority over the "gravel-biased" fallback label.
    expect(screen.getByText(/~48% gravel \(target 50%\)/)).toBeInTheDocument();
    expect(screen.queryByText(/gravel-biased/)).toBeNull();
    expect(screen.getByText(/County gravel northeast/)).toBeInTheDocument();
  });
});
