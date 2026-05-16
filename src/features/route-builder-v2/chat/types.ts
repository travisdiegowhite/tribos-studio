// P1.4 STUB — DELETE IN PHASE 3 CUTOVER
// This module exists to give Phase 1 beta testers a working chat interface.
// Phase 2 (Doc 2b) replaces this with the real LLM-backed conversational
// pipeline. Do not extend this module's capabilities. New chat behavior
// goes in Phase 2.

import type { Mutation } from '../../../routing/executor';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
}

export interface ChatSession {
  messages: ChatMessage[];
  isProcessing: boolean;
  showExamplesHint: boolean;
  showAfterRefuseHint: boolean;
}

export type TranslationResult =
  | { kind: 'modify'; mutation: Mutation; ackText: string }
  | { kind: 'cold_start'; ackText: string }
  | { kind: 'refuse'; refuseText: string };
