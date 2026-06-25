/**
 * GlanceCoach — the coach conversation, back on Today. The old routing-first
 * glance shipped without it; this restores an immediate, in-page place to
 * interrogate the numbers above ("why am I detraining?", "am I on track for
 * the race?") instead of bouncing out to the command-bar modal.
 *
 * It's *smart* about the invitation: the opening chips are derived from the
 * live `Today` state (see glanceCoachContext.buildSmartPrompts), and every
 * request carries a canonical-metric snapshot as `trainingContext` so the
 * coach answers about the exact FS / TFI / AFI on screen.
 *
 * Conversation plumbing (POST /api/coach, persistence to coach_conversations,
 * structured workout/plan rendering via the shared CoachReply) mirrors the
 * command bar and the old Today CoachConversation, so the surfaces can't
 * diverge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { PaperPlaneRight, ShieldCheck, Sparkle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { scheduleCoachWorkout } from '../../utils/coachWorkoutScheduler';
import { activateTrainingPlan } from '../../utils/coachPlanActivation';
import { CoachReply } from '../../components/coach/CoachReply';
import { C, FONT } from './tokens';
import { buildCoachContextString, buildSmartPrompts } from './glanceCoachContext';
import type { Today } from './types';

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  /** Structured payloads, present only on live in-session coach turns. */
  workoutRecommendations?: unknown[] | null;
  trainingPlanPreview?: Record<string, unknown> | null;
  anchoredPlanPreview?: Record<string, unknown> | null;
}

interface GlanceCoachProps {
  today: Today;
  /** Desktop shows the last 4 turns, mobile the last 2 (per the old Today spec). */
  maxMessages?: number;
}

export function GlanceCoach({ today, maxMessages = 4 }: GlanceCoachProps) {
  const { user } = useAuth() as { user: { id: string } | null };

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentGranting, setConsentGranting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const nextId = () => `m${(idRef.current += 1)}`;

  const contextString = useMemo(() => buildCoachContextString(today), [today]);
  const smartPrompts = useMemo(() => buildSmartPrompts(today), [today]);
  const personaName = today.coach.personaName || 'Your coach';

  // Load AI consent + recent history (for continuity and memory) on mount.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const uid = user.id;

    (async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('ai_consent_granted_at, ai_consent_withdrawn_at')
          .eq('id', uid)
          .single();
        if (!cancelled) {
          setConsent(!!data?.ai_consent_granted_at && !data?.ai_consent_withdrawn_at);
        }
      } catch {
        if (!cancelled) setConsent(false);
      }

      try {
        const { data } = await supabase
          .from('coach_conversations')
          .select('id, role, message, timestamp')
          .eq('user_id', uid)
          .in('role', ['user', 'coach'])
          .order('timestamp', { ascending: false })
          .limit(20);
        if (!cancelled && data) {
          const history: ChatMessage[] = data
            .slice()
            .reverse()
            .map((m: { id?: string; role: string; message: string }) => ({
              id: m.id || nextId(),
              role: m.role === 'coach' ? 'coach' : 'user',
              content: m.message,
            }));
          setMessages(history);
        }
      } catch (err) {
        console.error('coach history load failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const grantConsent = useCallback(async () => {
    if (!user?.id) return;
    setConsentGranting(true);
    try {
      await supabase
        .from('user_profiles')
        .update({ ai_consent_granted_at: new Date().toISOString(), ai_consent_withdrawn_at: null })
        .eq('id', user.id);
      setConsent(true);
    } catch (err) {
      console.error('grant AI consent failed', err);
    } finally {
      setConsentGranting(false);
    }
  }, [user?.id]);

  const saveTurn = useCallback(
    async (role: 'user' | 'coach', content: string, structured?: Record<string, unknown>) => {
      if (!user?.id) return;
      try {
        await supabase.from('coach_conversations').insert({
          user_id: user.id,
          role,
          message: content,
          message_type: 'chat',
          context_snapshot: { coach_type: 'training', surface: 'today', ...(structured || {}) },
          coach_type: 'strategist',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('coach conversation persist failed', err);
      }
    },
    [user?.id],
  );

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || submitting || !user?.id) return;
      if (consent === false) return;

      setError(null);
      setDraft('');
      setSubmitting(true);

      const userMsg: ChatMessage = { id: nextId(), role: 'user', content: message };
      // Memory context from the thread as it stood before this message.
      const conversationHistory = messages.map((m) => ({
        role: m.role === 'coach' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));
      setMessages((prev) => [...prev, userMsg]);

      try {
        const now = new Date();
        const userLocalDate = {
          dayOfWeek: now.getDay(),
          date: now.getDate(),
          month: now.getMonth(),
          year: now.getFullYear(),
          dateString: now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            message,
            conversationHistory,
            trainingContext: contextString,
            userLocalDate,
            userId: user.id,
            maxTokens: 1024,
            quickMode: true,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const workoutRecommendations = data.workoutRecommendations ?? null;
        const trainingPlanPreview =
          data.trainingPlanPreview && !data.trainingPlanPreview.error ? data.trainingPlanPreview : null;
        const anchoredPlanPreview =
          data.anchoredPlanPreview && data.anchoredPlanPreview.ok !== false ? data.anchoredPlanPreview : null;

        const coachMsg: ChatMessage = {
          id: nextId(),
          role: 'coach',
          content: data.message,
          workoutRecommendations,
          trainingPlanPreview,
          anchoredPlanPreview,
        };
        setMessages((prev) => [...prev, coachMsg]);

        if (data.scheduleAdjusted) {
          window.dispatchEvent(new CustomEvent('training-plan-updated'));
        }

        await saveTurn('user', message);
        await saveTurn('coach', data.message, {
          ...(workoutRecommendations ? { workoutRecommendations } : {}),
          ...(trainingPlanPreview ? { trainingPlanPreview } : {}),
          ...(anchoredPlanPreview ? { anchoredPlanPreview } : {}),
        });
      } catch (err) {
        console.error('coach send failed', err);
        // Roll the optimistic user message back so a retry starts clean.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setError(err instanceof Error ? err.message : 'Failed to reach your coach. Try again.');
      } finally {
        setSubmitting(false);
        inputRef.current?.focus();
      }
    },
    [submitting, user?.id, consent, messages, contextString, saveTurn],
  );

  const handleAddWorkout = useCallback(
    async (recommendation: unknown) => {
      if (!user?.id) return;
      const result = (await scheduleCoachWorkout(supabase, {
        userId: user.id,
        recommendation: recommendation as Record<string, unknown>,
      })) as {
        success: boolean;
        error?: string;
        replaced?: boolean;
        workoutName?: string;
        replacedName?: string;
        scheduledDate?: string;
      };
      if (!result.success) {
        notifications.show({
          title: 'Error',
          message: result.error || 'Failed to add workout to calendar.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: result.replaced ? 'Workout Replaced' : 'Workout Added',
        message: result.replaced
          ? `${result.workoutName} replaced ${result.replacedName} on ${result.scheduledDate}`
          : `${result.workoutName} added to your calendar for ${result.scheduledDate}`,
        color: 'sage',
      });
      window.dispatchEvent(new CustomEvent('training-plan-updated'));
    },
    [user?.id],
  );

  const handleActivatePlan = useCallback(
    async (plan: unknown) => {
      if (!user?.id) return;
      const result = (await activateTrainingPlan(supabase, {
        userId: user.id,
        plan: plan as Record<string, unknown>,
      })) as {
        success: boolean;
        error?: string;
        planName?: string;
        workoutCount?: number;
        planId?: string;
      };
      if (!result.success) {
        notifications.show({
          title: 'Error',
          message: result.error || 'Failed to activate training plan.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: 'Training Plan Activated',
        message: `${result.planName} — ${result.workoutCount} workouts added to your calendar`,
        color: 'sage',
      });
      window.dispatchEvent(new CustomEvent('training-plan-activated', { detail: { planId: result.planId } }));
    },
    [user?.id],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const visible = messages.slice(-maxMessages);
  const empty = messages.length === 0;

  return (
    <Box style={{ border: `1px solid ${C.border}`, background: C.card, padding: 16 }}>
      {/* Header */}
      <Group justify="space-between" align="center" mb={12}>
        <Group gap={6} align="center">
          <Sparkle size={13} color={C.teal} weight="fill" />
          <Text
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: C.teal,
            }}
          >
            Coach · {personaName}
          </Text>
        </Group>
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '0.5px', color: C.text3 }}>
          YOUR PROGRESS, EXPLAINED
        </Text>
      </Group>

      {/* Thread / invitation */}
      {empty ? (
        <Text style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 1.5, color: C.text2, marginBottom: 12 }}>
          {submitting
            ? 'Thinking…'
            : 'Ask about what today’s session is for, why your fitness is moving, or how you’re tracking toward your goal. Start here:'}
        </Text>
      ) : (
        <Stack gap={8} mb={12}>
          {visible.map((m) => {
            const isCoach = m.role === 'coach';
            return (
              <Box
                key={m.id}
                style={{
                  backgroundColor: isCoach ? '#FBF6F2' : C.base,
                  borderLeft: `2px solid ${isCoach ? C.teal : C.border}`,
                  padding: '8px 12px',
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: isCoach ? C.teal : C.text3,
                    marginBottom: 2,
                  }}
                >
                  {isCoach ? 'Coach' : 'You'}
                </Text>
                {isCoach ? (
                  <CoachReply
                    message={m.content}
                    workoutRecommendations={m.workoutRecommendations ?? undefined}
                    trainingPlanPreview={m.trainingPlanPreview ?? undefined}
                    anchoredPlanPreview={m.anchoredPlanPreview ?? undefined}
                    planDisplay="cta"
                    onAddWorkout={handleAddWorkout}
                    onActivatePlan={handleActivatePlan}
                  />
                ) : (
                  <Text
                    style={{
                      fontFamily: FONT.body,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: C.text2,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                  </Text>
                )}
              </Box>
            );
          })}
          {submitting && (
            <Group gap={6} align="center" style={{ padding: '4px 2px' }}>
              <Loader size={12} color={C.teal} />
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.text3 }}>Coach is thinking…</Text>
            </Group>
          )}
        </Stack>
      )}

      {/* Smart starter prompts — context-aware, always available as quick-asks. */}
      <Group gap={6} mb={12}>
        {smartPrompts.map((p) => (
          <UnstyledButton
            key={p.label}
            onClick={() => send(p.query)}
            disabled={submitting || consent === false}
            style={{
              border: `1px solid ${C.border}`,
              background: C.base,
              padding: '4px 10px',
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.3px', color: C.text2 }}>
              {p.label}
            </Text>
          </UnstyledButton>
        ))}
      </Group>

      {error && (
        <Text style={{ fontFamily: FONT.body, fontSize: 13, color: C.coral, marginBottom: 8 }}>{error}</Text>
      )}

      {/* Input — or the consent gate when smart features aren't enabled yet. */}
      {consent === false ? (
        <Box style={{ borderLeft: `3px solid ${C.teal}`, background: '#FBF6F2', padding: '10px 12px' }}>
          <Group gap={8} align="center" mb={6}>
            <ShieldCheck size={16} color={C.teal} />
            <Text style={{ fontFamily: FONT.body, fontSize: 13, color: C.text2 }}>
              Coach reviews your training data to explain your progress. Raw GPS and personal info aren’t shared.{' '}
              <Anchor component={Link} to="/privacy#ai" style={{ color: C.teal, fontSize: 13 }}>
                Privacy
              </Anchor>
              .
            </Text>
          </Group>
          <Button
            size="xs"
            color="teal"
            loading={consentGranting}
            onClick={grantConsent}
            styles={{ root: { borderRadius: 0 } }}
          >
            ENABLE COACH
          </Button>
        </Box>
      ) : (
        <Group gap={8} wrap="nowrap">
          <TextInput
            ref={inputRef}
            placeholder="Ask your coach anything…"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            size="sm"
            style={{ flex: 1 }}
            styles={{ input: { borderRadius: 0, borderColor: C.border, backgroundColor: C.card } }}
          />
          <ActionIcon
            size="lg"
            color="teal"
            variant="filled"
            onClick={() => send(draft)}
            disabled={!draft.trim() || submitting}
            aria-label="Send message"
            style={{ borderRadius: 0 }}
          >
            {submitting ? <Loader size={14} color="white" /> : <PaperPlaneRight size={16} />}
          </ActionIcon>
        </Group>
      )}
    </Box>
  );
}
