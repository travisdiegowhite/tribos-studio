// P1.4 STUB — DELETE IN PHASE 3 CUTOVER
// This module exists to give Phase 1 beta testers a working chat interface.
// Phase 2 (Doc 2b) replaces this with the real LLM-backed conversational
// pipeline. Do not extend this module's capabilities. New chat behavior
// goes in Phase 2.

import type { TranslationResult } from './types';

interface KeywordEntry {
  patterns: readonly string[];
  produce: () => TranslationResult;
}

const KEYWORD_MAP: readonly KeywordEntry[] = [
  {
    patterns: ['hillier', 'more climbing', 'more elevation'],
    produce: () => ({
      kind: 'modify',
      mutation: { type: 'increase_climbing', magnitude: 'moderate' },
      ackText: 'Adding some climbing. Working on it…',
    }),
  },
  {
    patterns: ['flatter', 'less climbing', 'less elevation', 'easier hills'],
    produce: () => ({
      kind: 'modify',
      mutation: { type: 'reduce_climbing', magnitude: 'moderate' },
      ackText: 'Flattening it out. One moment…',
    }),
  },
  {
    patterns: ['shorter', 'less distance', 'trim'],
    produce: () => ({
      kind: 'modify',
      mutation: { type: 'shorten_distance', delta_km: 5 },
      ackText: 'Trimming a few km off.',
    }),
  },
  {
    patterns: ['longer', 'more distance', 'add some distance'],
    produce: () => ({
      kind: 'modify',
      mutation: { type: 'extend_distance', delta_km: 5 },
      ackText: 'Adding a few km.',
    }),
  },
  {
    patterns: ['reverse', 'flip it'],
    produce: () => ({
      kind: 'modify',
      mutation: { type: 'reverse_route' },
      ackText: 'Flipping the direction.',
    }),
  },
  {
    patterns: ['skip 287', 'avoid 287'],
    produce: () => ({
      kind: 'modify',
      mutation: { type: 'avoid_segment', segment_id: 'us-287' },
      ackText: 'Routing around 287.',
    }),
  },
  {
    patterns: ['more gravel', 'less road'],
    produce: () => ({
      kind: 'modify',
      mutation: {
        type: 'change_surface_mix',
        target: { road: 0.4, gravel: 0.5, path: 0.1 },
      },
      ackText: 'Shifting toward more gravel.',
    }),
  },
];

const COLD_START_PATTERN =
  /\b(build|generate|make|create)\b[\s\S]*\b(ride|loop|route)\b/i;

const REFUSE_TEXT =
  "I don't understand that one yet. Real conversation is coming soon. For now try one of these:";

export function translate(input: string): TranslationResult {
  const normalized = input.toLowerCase().replace(/[.,!?;]/g, ' ').replace(/\s+/g, ' ').trim();

  if (COLD_START_PATTERN.test(input)) {
    return {
      kind: 'cold_start',
      ackText:
        'Let me build that for you. Opening the form so you can refine details.',
    };
  }

  for (const entry of KEYWORD_MAP) {
    if (entry.patterns.some((p) => normalized.includes(p))) {
      return entry.produce();
    }
  }

  return { kind: 'refuse', refuseText: REFUSE_TEXT };
}
