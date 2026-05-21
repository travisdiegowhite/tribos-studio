/**
 * submitChatMessage — chat dispatch for Route Builder 2.0.
 *
 * PR-4B rewire: the default edit dispatch is now `applyAIEditViaCoach`,
 * which POSTs to the conversational `/api/route-coach` endpoint. The
 * previous default (`replicatedEditLogic.applyAIEdit`, the keyword
 * classifier) stays in place for v1's `/route-builder` edit panel.
 *
 * Cold-start detection (regex on the user's phrasing) still runs first
 * and opens the form panel. Everything else goes through the endpoint.
 */
import { applyAIEditViaCoach } from './applyAIEditViaCoach';
import type { ChatMessage } from './types';
import { trackRb2 } from '../telemetry/trackRb2';

export interface FormPanelControl {
  expand: () => void;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

type ApplyAIEditImpl = typeof applyAIEditViaCoach;

export interface SubmitChatMessageArgs {
  input: string;
  hasRoute: boolean;
  routeId: string | null;
  conversationHistory: ConversationTurn[];
  append: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setProcessing: (b: boolean) => void;
  markRefused: () => void;
  formPanelControl: FormPanelControl;
  /** Persists the completed user/assistant pair. Owned by `useChatSession`. */
  persistTurn?: (userText: string, assistantText: string) => Promise<void>;
  /** Test seam — defaults to the real `applyAIEditViaCoach`. */
  applyAIEditImpl?: ApplyAIEditImpl;
}

const COLD_START_PATTERN =
  /\b(build|generate|make|create)\b[\s\S]*\b(ride|loop|route)\b/i;

export async function submitChatMessage(args: SubmitChatMessageArgs): Promise<void> {
  const {
    input,
    hasRoute,
    routeId,
    conversationHistory,
    append,
    setProcessing,
    markRefused,
    formPanelControl,
    persistTurn,
    applyAIEditImpl = applyAIEditViaCoach,
  } = args;

  const trimmed = input.trim();
  if (!trimmed) return;

  append({ role: 'user', text: trimmed });
  trackRb2('chat_message_submitted', { input_length: trimmed.length });

  // Cold start — unchanged.
  if (COLD_START_PATTERN.test(trimmed)) {
    append({
      role: 'assistant',
      text: 'Let me set up the form for you — adjust the details and click Generate.',
    });
    formPanelControl.expand();
    trackRb2('chat_cold_start_triggered', { input_length: trimmed.length });
    return;
  }

  if (!hasRoute) {
    append({
      role: 'assistant',
      text: 'No route to edit yet — generate one first by typing something like "build me a 2 hour ride".',
    });
    markRefused();
    trackRb2('chat_edit_failed', {
      input_length: trimmed.length,
      failure_reason: 'no_current_route',
    });
    return;
  }

  setProcessing(true);
  try {
    const result = await applyAIEditImpl(trimmed, conversationHistory, routeId);
    if (result.ok) {
      // Suffix the stats only when the route actually changed; otherwise
      // the prose stands alone (clarifying question, refusal, etc.).
      const assistantText = result.routeChanged
        ? `${result.assistantText} Now ${result.distance_km}km, ${result.elevation_gain_m}m climbing.`
        : result.assistantText;
      append({ role: 'assistant', text: assistantText });
      trackRb2(result.routeChanged ? 'chat_edit_applied' : 'chat_message_received', {
        input_length: trimmed.length,
        distance_km: result.distance_km,
        elevation_gain_m: result.elevation_gain_m,
        route_changed: result.routeChanged,
      });
      if (persistTurn) {
        await persistTurn(trimmed, assistantText);
      }
    } else {
      append({
        role: 'assistant',
        text: `Couldn't make that change — ${result.reason}. Want to try something else?`,
      });
      markRefused();
      trackRb2('chat_edit_failed', {
        input_length: trimmed.length,
        failure_reason: result.reason.slice(0, 200),
      });
    }
  } catch (e) {
    const errName = e instanceof Error ? e.name : 'unknown';
    append({ role: 'assistant', text: 'Hit an error. Try again?' });
    trackRb2('chat_error', { error_name: errName });
  } finally {
    setProcessing(false);
  }
}
