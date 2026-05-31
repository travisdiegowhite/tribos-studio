import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { ChatDock } from '../ChatDock';
import type { ChatMessage } from '../../chat/types';

const MESSAGES: ChatMessage[] = [
  { id: 'a', role: 'assistant', text: 'Hello rider', timestamp: 0 },
];

function Harness({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <MantineProvider>
      <ChatDock
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        messages={MESSAGES}
        isProcessing={false}
        exampleHint={[]}
        showAfterRefuseHint={false}
        onSubmit={vi.fn()}
      />
    </MantineProvider>
  );
}

describe('ChatDock', () => {
  it('shows the chat body when open', () => {
    render(<Harness />);
    expect(screen.getByTestId('rb2-chat-dock')).toBeInTheDocument();
    expect(screen.getByText('Hello rider')).toBeInTheDocument();
    expect(screen.queryByTestId('rb2-chat-dock-rail')).toBeNull();
  });

  it('collapses to a rail and hides the body', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rb2-chat-dock-collapse'));
    expect(screen.getByTestId('rb2-chat-dock-rail')).toBeInTheDocument();
    expect(screen.queryByText('Hello rider')).toBeNull();
  });

  it('expands again from the rail', () => {
    render(<Harness initialCollapsed />);
    expect(screen.getByTestId('rb2-chat-dock-rail')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rb2-chat-dock-expand'));
    expect(screen.getByTestId('rb2-chat-dock')).toBeInTheDocument();
    expect(screen.getByText('Hello rider')).toBeInTheDocument();
  });
});
