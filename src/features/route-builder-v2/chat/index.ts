// P1.4 STUB — DELETE IN PHASE 3 CUTOVER
// This module exists to give Phase 1 beta testers a working chat interface.
// Phase 2 (Doc 2b) replaces this with the real LLM-backed conversational
// pipeline. Do not extend this module's capabilities. New chat behavior
// goes in Phase 2.

export { useChatSession } from './useChatSession';
export type { UseChatSessionReturn } from './useChatSession';
export { submitChatMessage } from './submitChatMessage';
export type { SubmitChatMessageArgs, FormPanelControl } from './submitChatMessage';
export { translate } from './heuristicTranslation';
export { EXAMPLE_PHRASES, COLD_START_EXAMPLES } from './examplePhrases';
export type { ChatMessage, ChatRole, ChatSession, TranslationResult } from './types';
