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

  it('auto-scrolls to the newest message', () => {
    const { rerender } = renderBody({
      messages: [{ id: 'm1', role: 'user', text: 'first', timestamp: 1 }],
    });
    const list = screen.getByTestId('rb2-chat-bubbles');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 640 });
    rerender(
      <MantineProvider>
        <ChatBody
          messages={[
            { id: 'm1', role: 'user', text: 'first', timestamp: 1 },
            { id: 'm2', role: 'assistant', text: 'second', timestamp: 2 },
          ]}
          isProcessing={false}
          exampleHint={[]}
          showAfterRefuseHint={false}
          onSubmit={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(list.scrollTop).toBe(640);
  });

  it('keeps the input readOnly (not disabled) while processing', () => {
    renderBody({ isProcessing: true });
    const input = screen.getByTestId('rb2-chat-input');
    expect(input).toHaveAttribute('readonly');
    expect(input).not.toBeDisabled();
  });

  it('shows phase-specific progress copy and a status role while processing', () => {
    renderBody({ isProcessing: true, processingPhase: 'rerouting' });
    const typing = screen.getByTestId('rb2-chat-typing');
    expect(typing).toHaveTextContent('Rerouting…');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('falls back to thinking copy when no phase is set', () => {
    renderBody({ isProcessing: true });
    expect(screen.getByTestId('rb2-chat-typing')).toHaveTextContent('Coach is thinking…');
  });

  it('announces the thread politely', () => {
    renderBody();
    expect(screen.getByTestId('rb2-chat-bubbles')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders coach markdown but keeps user text literal', () => {
    renderBody({
      messages: [
        { id: 'u1', role: 'user', text: '**not bold**', timestamp: 1 },
        { id: 'a1', role: 'assistant', text: 'A **bold** move', timestamp: 2 },
      ],
    });
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('**not bold**')).toBeInTheDocument();
  });

  it('labels the start of each coach run with the persona name', () => {
    renderBody({
      personaName: 'The Scientist',
      messages: [
        { id: 'a1', role: 'assistant', text: 'one', timestamp: 1 },
        { id: 'a2', role: 'assistant', text: 'two', timestamp: 2 },
        { id: 'u1', role: 'user', text: 'ok', timestamp: 3 },
        { id: 'a3', role: 'assistant', text: 'three', timestamp: 4 },
      ],
    });
    // Once for the opening run, once after the user turn — not per message.
    expect(screen.getAllByTestId('rb2-chat-persona-label')).toHaveLength(2);
  });

  it('renders a timestamp for real messages but not the synthetic opener', () => {
    renderBody({
      messages: [
        { id: 'opening', role: 'assistant', text: 'Hello', timestamp: 0 },
        {
          id: 'a1',
          role: 'assistant',
          text: 'Later',
          timestamp: new Date(2026, 7, 11, 14, 5).getTime(),
        },
      ],
    });
    expect(screen.getByText(/2:05|14:05/)).toBeInTheDocument();
  });

  it('example phrases are clickable chips that submit the phrase', () => {
    const onSubmit = vi.fn();
    renderBody({
      onSubmit,
      exampleHint: ['make it flatter'],
      messages: [{ id: 'm1', role: 'assistant', text: 'hi', timestamp: 1 }],
    });
    fireEvent.click(screen.getByText('make it flatter'));
    expect(onSubmit).toHaveBeenCalledWith('make it flatter');
  });

  it('renders quick-action chips that submit their phrase', () => {
    const onSubmit = vi.fn();
    renderBody({
      onSubmit,
      quickActions: [{ id: 'flatten', label: 'Flatter', phrase: 'Make it flatter' }],
    });
    fireEvent.click(screen.getByTestId('rb2-chat-quick-flatten'));
    expect(onSubmit).toHaveBeenCalledWith('Make it flatter');
  });

  it('shows refusal examples for kind-tagged refusals, not for error bubbles', () => {
    const base = {
      exampleHint: ['make it flatter'] as readonly string[],
      showAfterRefuseHint: true,
    };
    renderBody({
      ...base,
      messages: [
        { id: 'r1', role: 'assistant', kind: 'refusal', text: "Couldn't make that change", timestamp: 1 },
      ],
    });
    expect(screen.getByTestId('rb2-chat-refuse-examples')).toBeInTheDocument();

    renderBody({
      ...base,
      messages: [
        { id: 'e1', role: 'assistant', kind: 'error', text: 'The coach is busy right now.', timestamp: 1 },
      ],
    });
    expect(screen.queryAllByTestId('rb2-chat-refuse-examples')).toHaveLength(1); // only the first render's
  });

  it('error bubbles offer a Retry button that resubmits the original text', () => {
    const onRetry = vi.fn();
    renderBody({
      onRetry,
      messages: [
        {
          id: 'e1',
          role: 'assistant',
          kind: 'error',
          text: 'The coach is temporarily unavailable.',
          retryText: 'make it hillier',
          timestamp: 1,
        },
      ],
    });
    fireEvent.click(screen.getByTestId('rb2-chat-retry'));
    expect(onRetry).toHaveBeenCalledWith('make it hillier');
  });

  it('shows a loading placeholder while the thread hydrates', () => {
    renderBody({ hydrated: false });
    expect(screen.getByTestId('rb2-chat-hydrating')).toBeInTheDocument();
    expect(screen.queryByText('Northeast Loop')).toBeNull();
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
