/**
 * submitChatMessage — chat dispatch for Route Builder 2.0.
 *
 * Two-stage translation:
 *   1) `heuristicTranslation` for fast offline cases ("longer",
 *      "flatter", "reverse"). When the heuristic returns `modify` or
 *      `cold_start`, we act on it locally with zero network cost.
 *   2) On heuristic `refuse`, POST the request to
 *      `/api/route-builder-2-chat`. The Claude-backed translator
 *      returns either `{ mutation }` (apply via `editing.applyMutation`)
 *      or `{ refusal }` (show the message and mark refused).
 */

import { translate } from './heuristicTranslation';
import type { ChatMessage } from './types';
import type { UseRouteEditingReturn } from '../../../hooks/route-builder';
import type { Mutation, RouteSnapshot } from '../../../routing/executor';
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
  /** Snapshot of the current route, sent to the AI translator as context. */
  routeSnapshot?: RouteSnapshot | null;
  /** High-level training context, sent to the AI translator. */
  routeContext?: { goal?: string } | null;
  /** Override for tests. Defaults to `fetch`. */
  fetchImpl?: typeof fetch;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SHORT_FEEDBACK_DELAY_MS = 200;

interface AiResponse {
  mutation?: Mutation;
  refusal?: string;
  error?: string;
}

async function callAiTranslator(args: {
  text: string;
  snapshot: RouteSnapshot | null;
  context: { goal?: string } | null;
  fetchImpl: typeof fetch;
}): Promise<AiResponse> {
  const { text, snapshot, context, fetchImpl } = args;
  const body = JSON.stringify({
    text,
    currentRoute: snapshot
      ? {
          distance_km: snapshot.stats.distance_km,
          elevation_gain_m: snapshot.stats.elevation_gain_m,
          waypoint_count: snapshot.waypoints.length,
        }
      : null,
    context: context ?? null,
  });
  try {
    const res = await fetchImpl('/api/route-builder-2-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { error: errBody?.error ?? `HTTP ${res.status}` };
    }
    return (await res.json()) as AiResponse;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

async function applyMutationToRoute(args: {
  mutation: Mutation;
  ackText: string;
  hasRoute: boolean;
  append: SubmitChatMessageArgs['append'];
  editing: SubmitChatMessageArgs['editing'];
}): Promise<void> {
  const { mutation, ackText, hasRoute, append, editing } = args;
  if (!hasRoute) {
    await delay(SHORT_FEEDBACK_DELAY_MS);
    append({
      role: 'assistant',
      text:
        'No route to edit yet — generate one first by typing something like "build me a 2 hour ride".',
    });
    return;
  }
  try {
    const result = await editing.applyMutation(mutation);
    if (result.ok) {
      const distance = Math.round(result.route.stats.distance_km);
      const gain = Math.round(result.route.stats.elevation_gain_m);
      const newStats = `Now ${distance}km, ${gain}m climbing.`;
      append({ role: 'assistant', text: `${ackText} ${newStats}` });
      trackRb2('chat_mutation_applied', { mutation_type: mutation.type });
    } else {
      const failureKind = result.reason?.kind ?? 'unknown';
      append({
        role: 'assistant',
        text: `Couldn't make that change — ${failureKind.replace(/_/g, ' ')}. Want to try something else?`,
      });
      trackRb2('chat_mutation_failed', {
        mutation_type: mutation.type,
        failure_kind: failureKind,
      });
    }
  } catch (e) {
    const errName = e instanceof Error ? e.name : 'unknown';
    append({ role: 'assistant', text: 'Hit an error. Try again?' });
    trackRb2('chat_error', { error_name: errName });
  }
}

export async function submitChatMessage(args: SubmitChatMessageArgs): Promise<void> {
  const {
    input,
    hasRoute,
    append,
    setProcessing,
    markRefused,
    editing,
    formPanelControl,
    routeSnapshot = null,
    routeContext = null,
    fetchImpl = fetch,
  } = args;

  const trimmed = input.trim();
  if (!trimmed) return;

  append({ role: 'user', text: trimmed });
  trackRb2('chat_message_submitted', { input_length: trimmed.length });

  const translation = translate(trimmed);

  if (translation.kind === 'cold_start') {
    append({ role: 'assistant', text: translation.ackText });
    formPanelControl.expand();
    trackRb2('chat_cold_start_triggered', { input_length: trimmed.length });
    return;
  }

  if (translation.kind === 'modify') {
    trackRb2('chat_translated_heuristic', { mutation_type: translation.mutation.type });
    setProcessing(true);
    try {
      await applyMutationToRoute({
        mutation: translation.mutation,
        ackText: translation.ackText,
        hasRoute,
        append,
        editing,
      });
    } finally {
      setProcessing(false);
    }
    return;
  }

  // Heuristic refused — fall back to AI translator.
  setProcessing(true);
  try {
    const ai = await callAiTranslator({
      text: trimmed,
      snapshot: routeSnapshot,
      context: routeContext,
      fetchImpl,
    });

    if (ai.error) {
      await delay(SHORT_FEEDBACK_DELAY_MS);
      append({
        role: 'assistant',
        text: 'Translator unavailable. Try one of the example phrases below.',
      });
      markRefused();
      trackRb2('chat_translator_error', { input_length: trimmed.length });
      return;
    }

    if (ai.mutation) {
      trackRb2('chat_translated_ai', { mutation_type: ai.mutation.type });
      await applyMutationToRoute({
        mutation: ai.mutation,
        ackText: 'On it.',
        hasRoute,
        append,
        editing,
      });
      return;
    }

    const refusal =
      ai.refusal ??
      "I don't understand that one yet. Try one of the examples below.";
    await delay(SHORT_FEEDBACK_DELAY_MS);
    append({ role: 'assistant', text: refusal });
    markRefused();
    trackRb2('chat_refused', { input_length: trimmed.length });
  } finally {
    setProcessing(false);
  }
}
