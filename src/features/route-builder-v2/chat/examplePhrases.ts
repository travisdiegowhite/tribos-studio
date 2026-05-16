// P1.4 STUB — DELETE IN PHASE 3 CUTOVER
// This module exists to give Phase 1 beta testers a working chat interface.
// Phase 2 (Doc 2b) replaces this with the real LLM-backed conversational
// pipeline. Do not extend this module's capabilities. New chat behavior
// goes in Phase 2.

export const EXAMPLE_PHRASES: readonly string[] = [
  '"make it hillier"',
  '"less climbing"',
  '"shorter"',
  '"longer"',
  '"reverse it"',
  '"skip 287"',
  '"more gravel"',
];

export const COLD_START_EXAMPLES: readonly string[] = [
  '"build me a 2 hour endurance ride"',
  '"generate a 30km gravel loop"',
];
