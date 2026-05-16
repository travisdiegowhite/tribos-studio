/**
 * ChatShell — Route Builder 2.0 responsive chat root.
 *
 * On desktop renders ChatPanel (floating window). On mobile renders
 * ChatDrawer (bottom-sheet). Owns the open/closed/minimized state.
 */

import { useState } from 'react';
import { ChatPanel, type ChatPanelState } from './ChatPanel';
import { ChatDrawer, type ChatDrawerState } from './ChatDrawer';

export interface ChatShellProps {
  isMobile: boolean;
}

export function ChatShell({ isMobile }: ChatShellProps) {
  const [panelState, setPanelState] = useState<ChatPanelState>('open');
  const [drawerState, setDrawerState] = useState<ChatDrawerState>('open');

  if (isMobile) {
    return <ChatDrawer state={drawerState} onStateChange={setDrawerState} />;
  }
  return <ChatPanel state={panelState} onStateChange={setPanelState} />;
}

export default ChatShell;
