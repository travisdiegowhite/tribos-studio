// S2: chat types after the v1 rewire. No more `Mutation` references —
// edits go through `replicatedEditLogic.applyAIEdit(text)`.

export type ChatRole = 'user' | 'assistant';

/**
 * Card-sized summary of one generated route option, rendered under the
 * assistant bubble when a natural-language generation produced alternatives.
 * Indexes line up with the `aiSuggestions` store array.
 */
export interface RouteOptionSummary {
  index: number;
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  direction_label: string;
  familiarity_percent: number | null;
  surface_label?: string;
  /** Measured gravel+unpaved share (%) of the route; null/undefined if unknown. */
  gravel_actual_pct?: number | null;
  /** Requested gravel share (%), when the rider stated one. */
  gravel_target_pct?: number | null;
  /** One-line "why this route" from the planner. */
  rationale?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
  /**
   * 'route-options' renders selectable candidate cards under the bubble.
   * Cards are session-only — persistence/rehydration carries `text` alone.
   */
  kind?: 'text' | 'route-options';
  options?: RouteOptionSummary[];
  selectedOptionIndex?: number;
}

export interface ChatSession {
  messages: ChatMessage[];
  isProcessing: boolean;
  showExamplesHint: boolean;
  showAfterRefuseHint: boolean;
}
