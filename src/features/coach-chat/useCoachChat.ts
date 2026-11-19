/**
 * useCoachChat — the conversation state behind the /coach page.
 *
 * Persistence is the same `coach_conversations` rows every coach surface
 * writes (role user|coach, message_type 'chat', coach_type 'strategist'), so
 * the command bar and the Today panel keep sharing one memory with this page.
 * Anything structured that came back with a reply (workout recs, a plan
 * preview, visual specs) rides in the existing `context_snapshot` JSONB:
 * reloading the page re-renders it, and no migration is needed.
 *
 * "New topic" is not a separate thread table. The next user message is saved
 * with `context_snapshot.topic_start = true`, and only turns from the latest
 * topic start onward are sent to the model as history.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../../lib/supabase';
import { scheduleCoachWorkout } from '../../utils/coachWorkoutScheduler';
import { activateTrainingPlan } from '../../utils/coachPlanActivation';
import { postCoach } from './coachApi';
import type { CoachFocus, CoachResponse, HistoryTurn, WorkoutRecommendation } from './coachApi';
import type { CoachVisualSpec } from './visuals/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  timestamp: string;
  topicStart?: boolean;
  focusLabel?: string;
  workoutRecommendations?: WorkoutRecommendation[] | null;
  trainingPlanPreview?: CoachResponse['trainingPlanPreview'];
  planActivated?: boolean;
  visuals?: CoachVisualSpec[] | null;
}

interface SnapshotShape {
  topic_start?: boolean;
  focus_label?: string;
  workoutRecommendations?: WorkoutRecommendation[];
  trainingPlanPreview?: CoachResponse['trainingPlanPreview'];
  planActivated?: boolean;
  visuals?: CoachVisualSpec[];
}

interface Row {
  id: string;
  role: string;
  message: string;
  timestamp: string;
  context_snapshot: SnapshotShape | null;
}

/** How many stored turns the page shows on load. */
const PAGE_SIZE = 60;
/** How many turns of the current topic go to the model (server keeps 10 + a summary). */
const HISTORY_TURNS = 20;

export function rowToMessage(row: Row): ChatMessage {
  const snap = row.context_snapshot || {};
  return {
    id: row.id,
    role: row.role === 'coach' ? 'coach' : 'user',
    content: row.message,
    timestamp: row.timestamp,
    topicStart: !!snap.topic_start,
    focusLabel: snap.focus_label,
    workoutRecommendations: snap.workoutRecommendations ?? null,
    trainingPlanPreview: snap.trainingPlanPreview ?? null,
    planActivated: !!snap.planActivated,
    visuals: Array.isArray(snap.visuals) ? snap.visuals : null,
  };
}

/**
 * The turns of the current topic, in API shape. Recommended workouts are
 * threaded into the assistant turn (as the command bar does) so "add that one"
 * resolves to the right workout.
 */
export function historyForModel(messages: ChatMessage[]): HistoryTurn[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].topicStart) {
      start = i;
      break;
    }
  }
  return messages
    .slice(start)
    .slice(-HISTORY_TURNS)
    .map((m) => {
      const recs = m.workoutRecommendations || [];
      const recsNote =
        m.role === 'coach' && recs.length > 0
          ? `\n\n[Workouts you just recommended: ${recs
              .map(
                (r) =>
                  `${r.name || r.workout_id} (workout_id: ${r.workout_id}${
                    r.scheduled_date ? `, date: ${r.scheduled_date}` : ''
                  })`,
              )
              .join('; ')}]`
          : '';
      const focusNote = m.role === 'user' && m.focusLabel ? ` [about: ${m.focusLabel}]` : '';
      return {
        role: m.role === 'coach' ? ('assistant' as const) : ('user' as const),
        content: m.content + focusNote + recsNote,
        timestamp: m.timestamp,
      };
    });
}

export function useCoachChat(userId: string | null | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentGranting, setConsentGranting] = useState(false);
  const [pendingTopicStart, setPendingTopicStart] = useState(false);
  const localId = useRef(0);
  const nextLocalId = () => `local-${(localId.current += 1)}`;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('ai_consent_granted_at, ai_consent_withdrawn_at')
          .eq('id', userId)
          .single();
        if (!cancelled) setConsent(!!prof?.ai_consent_granted_at && !prof?.ai_consent_withdrawn_at);
      } catch {
        if (!cancelled) setConsent(false);
      }
      try {
        const { data: rows, error: fetchError } = await supabase
          .from('coach_conversations')
          .select('id, role, message, timestamp, context_snapshot')
          .eq('user_id', userId)
          .in('role', ['user', 'coach'])
          .order('timestamp', { ascending: false })
          .limit(PAGE_SIZE);
        if (fetchError) throw fetchError;
        if (!cancelled) setMessages(((rows || []) as Row[]).slice().reverse().map(rowToMessage));
      } catch (err) {
        console.error('coach history load failed', err);
        if (!cancelled) setError('Could not load your conversation history.');
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const grantConsent = useCallback(async () => {
    if (!userId) return;
    setConsentGranting(true);
    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ ai_consent_granted_at: new Date().toISOString(), ai_consent_withdrawn_at: null })
        .eq('id', userId);
      if (updateError) throw updateError;
      setConsent(true);
    } catch (err) {
      console.error('grant AI consent failed', err);
      notifications.show({ title: 'Could not enable the coach', message: 'Please try again.', color: 'red' });
    } finally {
      setConsentGranting(false);
    }
  }, [userId]);

  const persist = useCallback(
    async (role: 'user' | 'coach', content: string, snapshot: SnapshotShape): Promise<string | null> => {
      if (!userId) return null;
      const { data, error: insertError } = await supabase
        .from('coach_conversations')
        .insert({
          user_id: userId,
          role,
          message: content,
          message_type: 'chat',
          context_snapshot: { coach_type: 'training', surface: 'coach_page', ...snapshot },
          coach_type: 'strategist',
          timestamp: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (insertError) {
        console.error('coach persist failed', insertError);
        return null;
      }
      return data?.id ?? null;
    },
    [userId],
  );

  const send = useCallback(
    async (raw: string, focus?: CoachFocus | null) => {
      const message = raw.trim();
      if (!message || sending || !userId || consent !== true) return false;
      setError(null);
      setSending(true);

      const userMsg: ChatMessage = {
        id: nextLocalId(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        topicStart: pendingTopicStart,
        focusLabel: focus?.label,
      };
      const conversationHistory = historyForModel(pendingTopicStart ? [] : messages);
      setMessages((prev) => [...prev, userMsg]);

      try {
        const { label: _label, ...focusRef } = focus || ({} as CoachFocus);
        const data = await postCoach({
          message,
          conversationHistory,
          trainingContext: null,
          userId,
          maxTokens: 1600,
          focus: focus ? focusRef : null,
          canShowVisuals: true,
        });

        const recs = data.workoutRecommendations || [];
        const plan = data.trainingPlanPreview && !data.trainingPlanPreview.error ? data.trainingPlanPreview : null;
        const coachMsg: ChatMessage = {
          id: nextLocalId(),
          role: 'coach',
          content: data.message || 'Sorry — I didn’t finish that response. Mind asking again?',
          timestamp: new Date().toISOString(),
          workoutRecommendations: recs.length ? recs : null,
          trainingPlanPreview: plan,
          planActivated: !!(plan && data.autoActivatedPlan),
          visuals: data.visuals?.length ? data.visuals : null,
        };
        setMessages((prev) => [...prev, coachMsg]);
        setPendingTopicStart(false);

        if (data.autoActivatedPlan) {
          notifications.show({
            title: 'Training plan added',
            message: `${data.autoActivatedPlan.planName ?? 'Your plan'} — ${
              data.autoActivatedPlan.workoutCount ?? ''
            } workouts on your calendar`,
            color: 'sage',
          });
        }
        if (data.scheduleAdjusted || recs.some((r) => r.added)) {
          window.dispatchEvent(new CustomEvent('training-plan-updated'));
          if (data.scheduleAdjusted) {
            notifications.show({ title: 'Calendar updated', message: 'Your coach changed your calendar.', color: 'sage' });
          }
        }

        const [userRowId, coachRowId] = [
          await persist('user', message, {
            ...(userMsg.topicStart ? { topic_start: true } : {}),
            ...(focus ? { focus_label: focus.label } : {}),
          }),
          await persist('coach', coachMsg.content, {
            ...(coachMsg.workoutRecommendations ? { workoutRecommendations: coachMsg.workoutRecommendations } : {}),
            ...(coachMsg.trainingPlanPreview ? { trainingPlanPreview: coachMsg.trainingPlanPreview } : {}),
            ...(coachMsg.planActivated ? { planActivated: true } : {}),
            ...(coachMsg.visuals ? { visuals: coachMsg.visuals } : {}),
          }),
        ];
        // Swap the local ids for row ids so later updates (plan activation) can find the row.
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === userMsg.id && userRowId) return { ...m, id: userRowId };
            if (m.id === coachMsg.id && coachRowId) return { ...m, id: coachRowId };
            return m;
          }),
        );
        return true;
      } catch (err) {
        console.error('coach send failed', err);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setError(err instanceof Error ? err.message : 'Failed to reach your coach. Try again.');
        return false;
      } finally {
        setSending(false);
      }
    },
    [sending, userId, consent, messages, pendingTopicStart, persist],
  );

  const startNewTopic = useCallback(() => setPendingTopicStart(true), []);

  const addWorkout = useCallback(
    async (rec: WorkoutRecommendation) => {
      if (!userId) return;
      const result = await scheduleCoachWorkout(supabase, { userId, recommendation: rec });
      if (!result.success) {
        notifications.show({
          title: 'Could not add the workout',
          message: result.error || 'Please try again.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: result.replaced ? 'Workout replaced' : 'Workout added',
        message: result.replaced
          ? `${result.workoutName} replaced ${result.replacedName} on ${result.scheduledDate}`
          : `${result.workoutName} added to your calendar for ${result.scheduledDate}`,
        color: 'sage',
      });
      window.dispatchEvent(new CustomEvent('training-plan-updated'));
    },
    [userId],
  );

  const activatePlan = useCallback(
    async (messageId: string, plan: Record<string, unknown>) => {
      if (!userId) return;
      const result = await activateTrainingPlan(supabase, { userId, plan });
      if (!result.success) {
        notifications.show({
          title: 'Could not activate the plan',
          message: result.error || 'Please try again.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: 'Training plan activated',
        message: `${result.planName} — ${result.workoutCount} workouts added to your calendar`,
        color: 'sage',
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, planActivated: true } : m)));
      window.dispatchEvent(new CustomEvent('training-plan-activated', { detail: { planId: result.planId } }));
      // Not written back to the stored row: coach_conversations has no UPDATE
      // policy for athletes (migration 013), so a reloaded preview offers
      // activation again, exactly as the command bar always has.
    },
    [userId],
  );

  return {
    messages,
    loadingHistory,
    sending,
    error,
    clearError: () => setError(null),
    consent,
    consentGranting,
    grantConsent,
    send,
    pendingTopicStart,
    startNewTopic,
    addWorkout,
    activatePlan,
  };
}
