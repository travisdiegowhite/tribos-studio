// P1.4 STUB — DELETE IN PHASE 3 CUTOVER
// This module exists to give Phase 1 beta testers a working chat interface.
// Phase 2 (Doc 2b) replaces this with the real LLM-backed conversational
// pipeline. Do not extend this module's capabilities. New chat behavior
// goes in Phase 2.

import { translate } from './heuristicTranslation';
import type { ChatMessage } from './types';
import type { UseRouteEditingReturn } from '../../../hooks/route-builder';
import { trackRb2 } from '../telemetry/trackRb2';

export interface FormPanelControl {
  expand: () => void;
}

export interface SubmitChatMessageArgs {
  input: string;
  hasRoute: boolean;
  append: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setProcessing: (b: boolean) => void;
  markRefused: () => void;
  editing: Pick<UseRouteEditingReturn, 'applyMutation'>;
  formPanelControl: FormPanelControl;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SHORT_FEEDBACK_DELAY_MS = 200;

export async function submitChatMessage(args: SubmitChatMessageArgs): Promise<void> {
  const {
    input,
    hasRoute,
    append,
    setProcessing,
    markRefused,
    editing,
    formPanelControl,
  } = args;

  const trimmed = input.trim();
  if (!trimmed) return;

  append({ role: 'user', text: trimmed });
  trackRb2('chat_message_submitted', { input_length: trimmed.length });

  const translation = translate(trimmed);

  switch (translation.kind) {
    case 'refuse': {
      await delay(SHORT_FEEDBACK_DELAY_MS);
      append({ role: 'assistant', text: translation.refuseText });
      markRefused();
      trackRb2('chat_refused', { input_length: trimmed.length });
      return;
    }

    case 'cold_start': {
      append({ role: 'assistant', text: translation.ackText });
      formPanelControl.expand();
      trackRb2('chat_cold_start_triggered', { input_length: trimmed.length });
      return;
    }

    case 'modify': {
      if (!hasRoute) {
        await delay(SHORT_FEEDBACK_DELAY_MS);
        append({
          role: 'assistant',
          text:
            'No route to edit yet — generate one first by typing something like "build me a 2 hour ride".',
        });
        return;
      }

      setProcessing(true);
      try {
        const result = await editing.applyMutation(translation.mutation);
        if (result.ok) {
          const distance = Math.round(result.route.stats.distance_km);
          const gain = Math.round(result.route.stats.elevation_gain_m);
          const newStats = `Now ${distance}km, ${gain}m climbing.`;
          append({ role: 'assistant', text: `${translation.ackText} ${newStats}` });
          trackRb2('chat_mutation_applied', {
            mutation_type: translation.mutation.type,
          });
        } else {
          const failureKind = result.reason?.kind ?? 'unknown';
          append({
            role: 'assistant',
            text: `Couldn't make that change — ${failureKind.replace(/_/g, ' ')}. Want to try something else?`,
          });
          trackRb2('chat_mutation_failed', {
            mutation_type: translation.mutation.type,
            failure_kind: failureKind,
          });
        }
      } catch (e) {
        const errName = e instanceof Error ? e.name : 'unknown';
        append({ role: 'assistant', text: 'Hit an error. Try again?' });
        trackRb2('chat_error', { error_name: errName });
      } finally {
        setProcessing(false);
      }
      return;
    }
  }
}
