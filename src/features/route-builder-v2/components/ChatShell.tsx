/**
 * ChatShell — Route Builder 2.0 responsive chat root.
 *
 * On desktop renders ChatPanel (floating window). On mobile renders
 * ChatDrawer (bottom-sheet). Owns the open/closed/minimized state and
 * threads chat session state (messages, processing, hints, onSubmit)
 * through to whichever child renders.
 */

import { useState } from 'react';
import { ChatPanel, type ChatPanelState } from './ChatPanel';
import { ChatDrawer, type ChatDrawerState } from './ChatDrawer';
import type { ChatMessage } from '../chat/types';

export interface ChatShellProps {
  isMobile: boolean;
  messages: ChatMessage[];
  isProcessing: boolean;
  exampleHint: readonly string[];
  showAfterRefuseHint: boolean;
  onSubmit: (text: string) => void;
}

export function ChatShell({
  isMobile,
  messages,
  isProcessing,
  exampleHint,
  showAfterRefuseHint,
  onSubmit,
}: ChatShellProps) {
  const [panelState, setPanelState] = useState<ChatPanelState>('open');
  const [drawerState, setDrawerState] = useState<ChatDrawerState>('open');

  const shared = {
    messages,
    isProcessing,
    exampleHint,
    showAfterRefuseHint,
    onSubmit,
  } as const;

  if (isMobile) {
    return (
      <ChatDrawer
        state={drawerState}
        onStateChange={setDrawerState}
        {...shared}
      />
    );
  }
  return (
    <ChatPanel
      state={panelState}
      onStateChange={setPanelState}
      {...shared}
    />
  );
}

export default ChatShell;
