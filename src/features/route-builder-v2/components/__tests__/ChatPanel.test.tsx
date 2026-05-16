import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { ChatPanel, type ChatPanelState } from '../ChatPanel';

function renderPanel(state: ChatPanelState) {
  const onStateChange = vi.fn();
  return {
    onStateChange,
    ...render(
      <MantineProvider>
        <ChatPanel state={state} onStateChange={onStateChange} />
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

  it('renders 3 placeholder bubbles', () => {
    renderPanel('open');
    const bubbles = screen.getByTestId('rb2-chat-bubbles');
    expect(bubbles).toHaveTextContent('Loop set up');
    expect(bubbles).toHaveTextContent('less climbing');
    expect(bubbles).toHaveTextContent('Rerouted');
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
