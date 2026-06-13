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
import type { ChatMessage, RouteOptionSummary } from './types';
import { trackRb2 } from '../telemetry/trackRb2';
import { formatDistance, formatElevation } from '../../../utils/units';

export interface FormPanelControl {
  expand: () => void;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

type ApplyAIEditImpl = typeof applyAIEditViaCoach;

/** Outcome of a chat-driven fresh-route generation (RB1's NL builder). */
export type GenerateOutcome =
  | {
      ok: true;
      /** Stats of the applied (best) route. */
      distance_km: number;
      elevation_gain_m: number;
      name?: string;
      /** % of the route on roads the rider has ridden before, when available. */
      familiarity_percent?: number | null;
      /** Measured gravel+unpaved share (%) of the applied route, when known. */
      gravel_actual_pct?: number | null;
      /**
       * All generated candidates (applied one first) when alternatives exist.
       * Indexes line up with the `aiSuggestions` store.
       */
      options?: RouteOptionSummary[];
    }
  | { ok: false; reason: 'no_start' | string };

export interface SubmitChatMessageArgs {
  input: string;
  hasRoute: boolean;
  routeId: string | null;
  conversationHistory: ConversationTurn[];
  /** Render distances/climbing in the rider's units (mi/ft vs km/m). */
  isImperial?: boolean;
  append: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setProcessing: (b: boolean) => void;
  markRefused: () => void;
  formPanelControl: FormPanelControl;
  /** Persists the completed user/assistant pair. Owned by `useChatSession`. */
  persistTurn?: (userText: string, assistantText: string) => Promise<void>;
  /** Test seam — defaults to the real `applyAIEditViaCoach`. */
  applyAIEditImpl?: ApplyAIEditImpl;
  /**
   * Generate a fresh route from the prompt (RB1's NL builder, wired by the
   * page). When provided, build/create phrasing — or any prompt while no route
   * exists — generates instead of just opening the form.
   */
  onGenerateFromPrompt?: (prompt: string) => Promise<GenerateOutcome>;
}

const COLD_START_PATTERN =
  /\b(build|generate|make|create)\b[\s\S]*\b(ride|loop|route)\b/i;

export async function submitChatMessage(args: SubmitChatMessageArgs): Promise<void> {
  const {
    input,
    hasRoute,
    routeId,
    conversationHistory,
    isImperial = false,
    append,
    setProcessing,
    markRefused,
    formPanelControl,
    persistTurn,
    applyAIEditImpl = applyAIEditViaCoach,
    onGenerateFromPrompt,
  } = args;

  const fmtKm = (km: number) => formatDistance(km, isImperial);
  const fmtM = (m: number) => formatElevation(m, isImperial);

  const trimmed = input.trim();
  if (!trimmed) return;

  append({ role: 'user', text: trimmed });
  trackRb2('chat_message_submitted', { input_length: trimmed.length });

  // Generate a fresh route when the user asks to build/create one, or whenever
  // there's no route yet (nothing to edit). Mirrors RB1's NL builder.
  const wantsGenerate = COLD_START_PATTERN.test(trimmed) || !hasRoute;
  if (wantsGenerate && onGenerateFromPrompt) {
    setProcessing(true);
    try {
      const result = await onGenerateFromPrompt(trimmed);
      if (result.ok) {
        const familiarityNote =
          typeof result.familiarity_percent === 'number' && result.familiarity_percent > 0
            ? ` (${result.familiarity_percent}% on roads you've ridden)`
            : '';
        const gravelNote =
          typeof result.gravel_actual_pct === 'number'
            ? `, ~${result.gravel_actual_pct}% gravel`
            : '';
        const appliedStats = `${fmtKm(result.distance_km)}, ${fmtM(result.elevation_gain_m)} climbing${gravelNote}`;
        const hasAlternatives = (result.options?.length ?? 0) > 1;

        if (hasAlternatives && result.options) {
          const heading = result.options[0].direction_label
            ? ` heading ${result.options[0].direction_label.toLowerCase()}`
            : '';
          const appliedName = result.name ? ` '${result.name}'` : ' the best match';
          const assistantText = `Planned ${result.options.length} routes${heading} — applied${appliedName} (${appliedStats})${familiarityNote}. Tap a card to switch.`;
          append({
            role: 'assistant',
            text: assistantText,
            kind: 'route-options',
            options: result.options,
            selectedOptionIndex: 0,
          });
          trackRb2('chat_route_options_shown', {
            input_length: trimmed.length,
            count: result.options.length,
            distance_km: result.distance_km,
            elevation_gain_m: result.elevation_gain_m,
          });
          if (persistTurn) {
            // Cards are session-only — persist a readable per-option summary
            // so rehydrated threads still show what was offered.
            const optionLines = result.options
              .map((o) => {
                const og =
                  typeof o.gravel_actual_pct === 'number' ? `, ~${o.gravel_actual_pct}% gravel` : '';
                return `${o.index + 1}) ${o.name} — ${fmtKm(o.distance_km)}, ${fmtM(o.elevation_gain_m)} climbing${og}`;
              })
              .join('  ');
            await persistTurn(trimmed, `${assistantText} ${optionLines}`);
          }
        } else {
          const assistantText = `Built you a ${fmtKm(result.distance_km)} route — ${fmtM(result.elevation_gain_m)} climbing${gravelNote}${familiarityNote}. Want me to tweak it?`;
          append({ role: 'assistant', text: assistantText });
          trackRb2('chat_route_generated', {
            input_length: trimmed.length,
            distance_km: result.distance_km,
            elevation_gain_m: result.elevation_gain_m,
          });
          if (persistTurn) await persistTurn(trimmed, assistantText);
        }
      } else if (result.reason === 'no_start') {
        append({
          role: 'assistant',
          text: 'I need a starting point — open the form to set one, then I can build it.',
        });
        formPanelControl.expand();
        markRefused();
        trackRb2('chat_route_generation_failed', { failure_reason: 'no_start' });
      } else {
        append({
          role: 'assistant',
          text: "Couldn't generate that — want to try the form instead?",
        });
        formPanelControl.expand();
        trackRb2('chat_route_generation_failed', {
          failure_reason: String(result.reason).slice(0, 200),
        });
      }
    } catch (e) {
      const errName = e instanceof Error ? e.name : 'unknown';
      append({ role: 'assistant', text: "Couldn't generate that — want to try the form instead?" });
      formPanelControl.expand();
      trackRb2('chat_error', { error_name: errName });
    } finally {
      setProcessing(false);
    }
    return;
  }

  // Cold start without a generator wired (legacy / tests) — open the form.
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
        ? `${result.assistantText} Now ${fmtKm(result.distance_km)}, ${fmtM(result.elevation_gain_m)} climbing.`
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
