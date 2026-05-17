// S2: chat types after the v1 rewire. No more `Mutation` references —
// edits go through `replicatedEditLogic.applyAIEdit(text)`.

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
