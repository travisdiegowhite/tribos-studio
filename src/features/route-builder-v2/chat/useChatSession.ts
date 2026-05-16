// P1.4 STUB — DELETE IN PHASE 3 CUTOVER
// This module exists to give Phase 1 beta testers a working chat interface.
// Phase 2 (Doc 2b) replaces this with the real LLM-backed conversational
// pipeline. Do not extend this module's capabilities. New chat behavior
// goes in Phase 2.

import { useCallback, useState } from 'react';
import type { ChatMessage } from './types';

const OPENING_MESSAGE: ChatMessage = {
  id: 'opening',
  role: 'assistant',
  text:
    "Tell me what kind of ride you're looking for, or ask me to change the route.",
  timestamp: 0,
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseChatSessionReturn {
  messages: ChatMessage[];
  isProcessing: boolean;
  showExamplesHint: boolean;
  showAfterRefuseHint: boolean;
  append: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setProcessing: (processing: boolean) => void;
  markRefused: () => void;
}

export function useChatSession(): UseChatSessionReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSeenRefuse, setHasSeenRefuse] = useState(false);

  const append = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...message, id: newId(), timestamp: Date.now() },
    ]);
  }, []);

  const setProcessing = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  const markRefused = useCallback(() => {
    setHasSeenRefuse(true);
  }, []);

  return {
    messages,
    isProcessing,
    showExamplesHint: true,
    showAfterRefuseHint: hasSeenRefuse,
    append,
    setProcessing,
    markRefused,
  };
}
