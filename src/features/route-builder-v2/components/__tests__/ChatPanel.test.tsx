import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { ChatPanel, type ChatPanelState } from '../ChatPanel';
import type { ChatMessage } from '../../chat/types';

const EXAMPLES = ['"shorter"', '"longer"'] as const;

function makeMessages(): ChatMessage[] {
  return [
    {
      id: 'opening',
      role: 'assistant',
      text: 'Tell me what kind of ride you want.',
      timestamp: 0,
    },
  ];
}

function renderPanel(
  state: ChatPanelState,
  overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {},
) {
  const onStateChange = vi.fn();
  const onSubmit = vi.fn();
  return {
    onStateChange,
    onSubmit,
    ...render(
      <MantineProvider>
        <ChatPanel
          state={state}
          onStateChange={onStateChange}
          messages={makeMessages()}
          isProcessing={false}
          exampleHint={EXAMPLES}
          showAfterRefuseHint={false}
          onSubmit={onSubmit}
          {...overrides}
        />
      </MantineProvider>,
    ),
  };
}

describe('ChatPanel', () => {
  it('renders the open state with header + body', () => {
    renderPanel('open');
    expect(screen.getByTestId('rb2-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-chat-bubbles')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-chat-input')).toBeInTheDocument();
  });

  it('renders the opening message bubble', () => {
    renderPanel('open');
    const bubbles = screen.getByTestId('rb2-chat-bubbles');
    expect(bubbles).toHaveTextContent('Tell me what kind of ride');
  });

  it('renders the persistent example phrases hint', () => {
    renderPanel('open');
    expect(screen.getByTestId('rb2-chat-examples-hint')).toBeInTheDocument();
    expect(screen.getByText('"shorter"')).toBeInTheDocument();
  });

  it('shows the typing indicator when isProcessing is true', () => {
    renderPanel('open', { isProcessing: true });
    expect(screen.getByTestId('rb2-chat-typing')).toBeInTheDocument();
  });

  it('does not show the typing indicator when isProcessing is false', () => {
    renderPanel('open');
    expect(screen.queryByTestId('rb2-chat-typing')).not.toBeInTheDocument();
  });

  it('emphasizes example phrases under a refuse message when showAfterRefuseHint is true', () => {
    const messages: ChatMessage[] = [
      {
        id: 'opening',
        role: 'assistant',
        text: "Tell me what kind of ride you're looking for.",
        timestamp: 0,
      },
      { id: 'u1', role: 'user', text: 'do something weird', timestamp: 1 },
      {
        id: 'a1',
        role: 'assistant',
        text: "I don't understand that one yet. Try:",
        timestamp: 2,
      },
    ];
    renderPanel('open', { messages, showAfterRefuseHint: true });
    expect(screen.getByTestId('rb2-chat-refuse-examples')).toBeInTheDocument();
  });

  it('does not emphasize examples when showAfterRefuseHint is false', () => {
    renderPanel('open', { showAfterRefuseHint: false });
    expect(screen.queryByTestId('rb2-chat-refuse-examples')).not.toBeInTheDocument();
  });

  it('calls onSubmit with the typed text on Enter', () => {
    const { onSubmit } = renderPanel('open');
    const input = screen.getByTestId('rb2-chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'make it hillier' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('make it hillier');
  });

  it('calls onSubmit on send-button click', () => {
    const { onSubmit } = renderPanel('open');
    const input = screen.getByTestId('rb2-chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'shorter' } });
    fireEvent.click(screen.getByTestId('rb2-chat-send'));
    expect(onSubmit).toHaveBeenCalledWith('shorter');
  });

  it('does not call onSubmit on empty/whitespace input', () => {
    const { onSubmit } = renderPanel('open');
    fireEvent.click(screen.getByTestId('rb2-chat-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the input after submit', () => {
    renderPanel('open');
    const input = screen.getByTestId('rb2-chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'shorter' } });
    fireEvent.click(screen.getByTestId('rb2-chat-send'));
    expect(input.value).toBe('');
  });

  it('switches to minimized on minimize click', () => {
    const { onStateChange } = renderPanel('open');
    fireEvent.click(screen.getByTestId('rb2-chat-minimize'));
    expect(onStateChange).toHaveBeenCalledWith('minimized');
  });

  it('switches to closed on close click', () => {
    const { onStateChange } = renderPanel('open');
    fireEvent.click(screen.getByTestId('rb2-chat-close'));
    expect(onStateChange).toHaveBeenCalledWith('closed');
  });

  it('shows open-chat button when closed', () => {
    const { onStateChange } = renderPanel('closed');
    const open = screen.getByTestId('rb2-chat-open');
    expect(open).toBeInTheDocument();
    fireEvent.click(open);
    expect(onStateChange).toHaveBeenCalledWith('open');
  });

  it('shows restore bar when minimized', () => {
    const { onStateChange } = renderPanel('minimized');
    const restore = screen.getByTestId('rb2-chat-restore');
    expect(restore).toBeInTheDocument();
    fireEvent.click(restore);
    expect(onStateChange).toHaveBeenCalledWith('open');
  });
});
