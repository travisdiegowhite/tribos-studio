/**
 * submitChatMessage — chat dispatch for Route Builder 2.0.
 *
 * S2 rewire: collapses P1.4's two-stage (heuristic + AI translator)
 * pipeline into a single call into v1's edit pipeline via
 * `replicatedEditLogic.applyAIEdit`. Cold-start detection (regex on the
 * user's phrasing) still happens first and opens the form panel.
 * Everything else goes through v1, which decides whether the input is a
 * known intent.
 *
 * S5 will replace this with the real conversational pipeline.
 */
import { applyAIEdit } from './replicatedEditLogic';
import type { ChatMessage } from './types';
import { trackRb2 } from '../telemetry/trackRb2';

export interface FormPanelControl {
  expand: () => void;
}

type ApplyAIEditFn = typeof applyAIEdit;

export interface SubmitChatMessageArgs {
  input: string;
  hasRoute: boolean;
  append: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setProcessing: (b: boolean) => void;
  markRefused: () => void;
  formPanelControl: FormPanelControl;
  /** Test seam — defaults to the real `applyAIEdit`. */
  applyAIEditImpl?: ApplyAIEditFn;
}

const COLD_START_PATTERN =
  /\b(build|generate|make|create)\b[\s\S]*\b(ride|loop|route)\b/i;

export async function submitChatMessage(args: SubmitChatMessageArgs): Promise<void> {
  const {
    input,
    hasRoute,
    append,
    setProcessing,
    markRefused,
    formPanelControl,
    applyAIEditImpl = applyAIEdit,
  } = args;

  const trimmed = input.trim();
  if (!trimmed) return;

  append({ role: 'user', text: trimmed });
  trackRb2('chat_message_submitted', { input_length: trimmed.length });

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
    const result = await applyAIEditImpl(trimmed);
    if (result.ok) {
      append({
        role: 'assistant',
        text: `${result.assistantText} Now ${result.distance_km}km, ${result.elevation_gain_m}m climbing.`,
      });
      trackRb2('chat_edit_applied', {
        input_length: trimmed.length,
        distance_km: result.distance_km,
        elevation_gain_m: result.elevation_gain_m,
      });
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
