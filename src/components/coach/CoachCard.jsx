import { useState, useEffect, useRef } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  TextInput,
  ActionIcon,
  Button,
  Box,
  ThemeIcon,
  Loader,
  Paper,
  ScrollArea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { depth } from '../../theme';
import { CoachReply } from './CoachReply';
import { useUserAvailability } from '../../hooks/useUserAvailability';
import { activateTrainingPlan } from '../../utils/coachPlanActivation';
import { ArrowsClockwise, PaperPlaneRight, Robot, Sparkle, User } from '@phosphor-icons/react';
import { CoachMarkdown } from './CoachMarkdown';
import { scheduleCoachWorkout } from '../../utils/coachWorkoutScheduler';
import { PERSONAS, COLD_START_PROMPTS, DEFAULT_COLD_START_PROMPTS } from '../../data/coachingPersonas';
import { Link } from 'react-router-dom';

// Generate coaching message — now includes workout recommendation for consistency
function getCoachingMessage(trainingContext, workoutRecommendation) {
  if (!trainingContext) {
    return "Ready to help with your training. Ask me about your fitness, race prep, or training strategy.";
  }

  // Planned rest day from training plan
  if (workoutRecommendation?.plannedRest) {
    return "Your plan has a rest day today. Recovery is when your body adapts and gets stronger. Ask me if you're unsure whether to rest or ride.";
  }

  // If we have a recommendation from the unified service, reference it
  const rec = workoutRecommendation?.primary;
  if (rec?.workout?.name && rec?.reason) {
    const sourceNote = rec.source === 'plan' ? ' (from your training plan)' : '';
    return `Today I'd suggest ${rec.workout.name}${sourceNote} — ${rec.reason.charAt(0).toLowerCase() + rec.reason.slice(1)} Ask me if you want to adjust or discuss alternatives.`;
  }

  // Fallback: TSB-based message if no recommendation available
  const tsbMatch = trainingContext.match(/TSB[:\s]+(-?\d+)/i);
  const tsb = tsbMatch ? parseInt(tsbMatch[1], 10) : 0;

  if (tsb > 15) {
    return "You're feeling fresh and ready to push. Ask me about interval strategies, race tactics, or how to make the most of today's energy.";
  } else if (tsb > 5) {
    return "Good form right now. Want to discuss pacing for your next race, or how to balance intensity with recovery this week?";
  } else if (tsb > -10) {
    return "You're in a productive training phase. Ask me about optimizing your training load, nutrition timing, or upcoming goals.";
  } else if (tsb > -20) {
    return "I notice some accumulated fatigue. Let's talk about recovery strategies, sleep optimization, or adjusting your training plan.";
  } else {
    return "Your body is asking for rest. I can help you think through recovery protocols, when to return to intensity, or mental training during rest days.";
  }
}

function CoachCard({ trainingContext, workoutRecommendation, onAddWorkout }) {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  // Load user availability for schedule-aware plan activation
  const {
    weeklyAvailability,
    dateOverrides,
    preferences: availabilityPreferences,
  } = useUserAvailability({ userId: user?.id ?? null, autoLoad: true });

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  // Chat messages displayed in the mini-chat: { role, content, timestamp, workoutRecommendations? }
  const [chatMessages, setChatMessages] = useState([]);
  // Full conversation history sent to API (includes older messages not displayed)
  const [conversationHistory, setConversationHistory] = useState([]);
  const [trainingPlanPreview, setTrainingPlanPreview] = useState(null);
  const [anchoredPlanPreview, setAnchoredPlanPreview] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [personaId, setPersonaId] = useState(null);

  // Fetch coaching persona for display
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.coaching_persona && data.coaching_persona !== 'pending') {
          setPersonaId(data.coaching_persona);
        }
      });
  }, [user?.id]);

  // Get coaching message based on current form
  const coachingMessage = getCoachingMessage(trainingContext, workoutRecommendation);

  // Persona-specific cold-start prompts
  const coldStartPrompts = personaId
    ? (COLD_START_PROMPTS[personaId] || DEFAULT_COLD_START_PROMPTS)
    : DEFAULT_COLD_START_PROMPTS;

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [chatMessages, isLoading]);

  // Load conversation history from DB on mount
  useEffect(() => {
    if (!user?.id) {
      setLoadingHistory(false);
      return;
    }

    const loadHistory = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('coach_conversations')
          .select('role, message, timestamp, context_snapshot')
          .eq('user_id', user.id)
          .in('role', ['user', 'coach'])
          .order('timestamp', { ascending: false })
          .limit(20);

        if (fetchError) throw fetchError;

        const allMessages = (data || []).reverse();

        // Full history for API context. Re-thread any stored workout recommendations
        // into the assistant turn (mirrors the in-session append) so a follow-up "add
        // that to the calendar" still resolves after a page reload.
        const history = allMessages.map((msg) => {
          const role = msg.role === 'coach' ? 'assistant' : 'user';
          const recs = msg.context_snapshot?.workoutRecommendations;
          const recsNote = role === 'assistant' && recs?.length > 0
            ? `\n\n[Workouts you just recommended: ${recs
                .map((r) => `${r.name || r.workout_id} (workout_id: ${r.workout_id}${r.scheduled_date ? `, date: ${r.scheduled_date}` : ''})`)
                .join('; ')}]`
            : '';
          return { role, content: msg.message + recsNote };
        });
        setConversationHistory(history);

        // Last 10 messages for display in mini-chat
        const displayMessages = allMessages.slice(-10).map((msg) => ({
          role: msg.role === 'coach' ? 'assistant' : 'user',
          content: msg.message,
          timestamp: msg.timestamp,
          workoutRecommendations: msg.context_snapshot?.workoutRecommendations || null,
        }));
        setChatMessages(displayMessages);
      } catch (err) {
        console.error('Error loading conversation history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [user?.id]);

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    const userMessage = query.trim();
    setIsLoading(true);
    setError(null);

    // Immediately show user message in chat
    const userMsg = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMsg]);
    setQuery('');

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
      };

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: conversationHistory,
          trainingContext: trainingContext,
          userLocalDate: userLocalDate,
          userId: user?.id,
          maxTokens: 1024,
          quickMode: true,
          userAvailability: weeklyAvailability.length > 0 ? {
            weeklyAvailability: weeklyAvailability.map((d) => ({
              dayOfWeek: d.dayOfWeek,
              dayName: d.dayName,
              status: d.status,
              maxDurationMinutes: d.maxDurationMinutes,
            })),
            preferences: availabilityPreferences ? {
              maxWorkoutsPerWeek: availabilityPreferences.maxWorkoutsPerWeek,
              preferWeekendLongRides: availabilityPreferences.preferWeekendLongRides,
            } : null,
          } : null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await res.json();

      // Handle training plan preview from AI
      if (data.trainingPlanPreview && !data.trainingPlanPreview.error) {
        setTrainingPlanPreview(data.trainingPlanPreview);
      }
      // Event-anchored (sequencer) plan preview — confirm to anchor.
      if (data.anchoredPlanPreview && data.anchoredPlanPreview.ok !== false) {
        setAnchoredPlanPreview(data.anchoredPlanPreview);
      }

      // Add coach response to chat
      const coachMsg = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        workoutRecommendations: data.workoutRecommendations || null,
      };
      setChatMessages((prev) => [...prev, coachMsg]);

      // Update full conversation history for API. Thread the recommended workout(s)
      // into the assistant turn so a follow-up like "add that to the calendar" can
      // resolve the reference — without this, the model only sees the prose and can't
      // re-emit the right workout card. The visible bubble (coachMsg.content) stays clean.
      const recsNote = data.workoutRecommendations?.length > 0
        ? `\n\n[Workouts you just recommended: ${data.workoutRecommendations
            .map((r) => `${r.name || r.workout_id} (workout_id: ${r.workout_id}${r.scheduled_date ? `, date: ${r.scheduled_date}` : ''})`)
            .join('; ')}]`
        : '';
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: data.message + recsNote },
      ]);

      // Save to DB for persistence across sessions
      try {
        await supabase.from('coach_conversations').insert([
          {
            user_id: user.id,
            role: 'user',
            message: userMessage,
            message_type: 'chat',
            context_snapshot: { coach_type: 'training' },
            coach_type: 'strategist',
            timestamp: new Date().toISOString(),
          },
          {
            user_id: user.id,
            role: 'coach',
            message: data.message,
            message_type: 'chat',
            context_snapshot: {
              coach_type: 'training',
              ...(data.workoutRecommendations && { workoutRecommendations: data.workoutRecommendations }),
            },
            coach_type: 'strategist',
            timestamp: new Date().toISOString(),
          },
        ]);
      } catch (dbErr) {
        console.error('Could not persist messages:', dbErr);
      }
    } catch (err) {
      console.error('Coach error:', err);
      setError(err.message || 'Failed to get response');
      // Remove the optimistic user message on error
      setChatMessages((prev) => prev.filter((m) => m !== userMsg));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddWorkout = async (recommendation) => {
    if (!user?.id) return;

    const result = await scheduleCoachWorkout(supabase, {
      userId: user.id,
      recommendation,
    });

    if (!result.success) {
      notifications.show({
        title: 'Error',
        message: result.error || 'Failed to add workout to calendar. Please try again.',
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

    // Notify other components (Training Dashboard) to refresh
    window.dispatchEvent(new CustomEvent('training-plan-updated'));

    // Optional parent callback
    if (onAddWorkout) {
      onAddWorkout({ ...recommendation, scheduledDate: result.scheduledDate, name: result.workoutName });
    }
  };

  const handleActivatePlan = async (planData) => {
    if (!user?.id) return;

    const result = await activateTrainingPlan(supabase, {
      userId: user.id,
      plan: planData,
      availability: {
        weeklyAvailability,
        dateOverrides,
        preferences: availabilityPreferences,
      },
    });

    if (!result.success) {
      notifications.show({
        title: 'Error',
        message: result.error || 'Failed to activate training plan. Please try again.',
        color: 'red',
      });
      return;
    }

    const scheduleNote = result.redistributionCount > 0
      ? ` (${result.redistributionCount} workout${result.redistributionCount > 1 ? 's' : ''} moved to fit your schedule)`
      : '';

    notifications.show({
      title: 'Training Plan Activated',
      message: `${result.planName} — ${result.workoutCount} workouts added to your calendar${scheduleNote}`,
      color: 'sage',
    });

    setTrainingPlanPreview(null);

    // Dispatch event so dashboard reloads plan + calendar without page refresh
    window.dispatchEvent(new CustomEvent('training-plan-activated', {
      detail: { planId: result.planId },
    }));

    if (onAddWorkout) {
      onAddWorkout({ _planActivated: true, planId: result.planId });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasMessages = chatMessages.length > 0;

  return (
    <Card
      padding="lg"
      radius="xl"
      h="100%"
      className="tribos-depth-card no-hover"
      style={{
        background: `linear-gradient(135deg, rgba(158, 90, 60, 0.15), transparent), ${depth.card.background}`,
        border: depth.card.border,
        boxShadow: depth.card.boxShadow,
      }}
    >
      <Stack gap="md" h="100%" justify="space-between">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size="lg" color="teal" variant="light" radius="md">
              <Sparkle size={18} />
            </ThemeIcon>
            <Text fw={600}>
              Coach{personaId && PERSONAS[personaId] ? ` · ${PERSONAS[personaId].name}` : ''}
            </Text>
            {!personaId && (
              <Button component={Link} to="/train" variant="subtle" size="compact-xs" color="teal">
                Set up coach
              </Button>
            )}
          </Group>
        </Group>

        {/* Chat area */}
        <Box style={{ flex: 1, minHeight: 0 }}>
          {/* Empty state — coaching message + suggested prompts when no history */}
          {!hasMessages && !isLoading && !loadingHistory && (
            <Stack gap="sm">
              <Text size="sm" style={{ color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                {coachingMessage}
              </Text>
              <Text size="xs" fw={500} style={{ color: 'var(--color-text-muted)' }}>
                Try asking:
              </Text>
              <Stack gap={4}>
                {coldStartPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="light"
                    color="gray"
                    size="compact-xs"
                    justify="flex-start"
                    styles={{
                      root: { height: 'auto', padding: '6px 10px' },
                      label: { whiteSpace: 'normal', textAlign: 'left' },
                    }}
                    onClick={() => {
                      setQuery(prompt);
                    }}
                  >
                    <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {prompt}
                    </Text>
                  </Button>
                ))}
              </Stack>
            </Stack>
          )}

          {/* Loading history spinner */}
          {loadingHistory && (
            <Group gap="xs" justify="center" py="md">
              <Loader size="xs" color="teal" />
              <Text size="xs" c="dimmed">Loading history...</Text>
            </Group>
          )}

          {/* Message history */}
          {hasMessages && (
            <ScrollArea
              h={280}
              viewportRef={scrollRef}
              type="auto"
              offsetScrollbars
              scrollbarSize={4}
            >
              <Stack gap={8} pb={4}>
                {chatMessages.map((msg, idx) => (
                  <Box key={idx}>
                    <Group gap={6} align="flex-start" wrap="nowrap">
                      <ThemeIcon
                        size="xs"
                        variant="light"
                        color={msg.role === 'user' ? 'teal' : 'terracotta'}
                        radius="xl"
                        mt={3}
                        style={{ flexShrink: 0 }}
                      >
                        {msg.role === 'user' ? <User size={10} /> : <Robot size={10} />}
                      </ThemeIcon>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        {msg.role === 'user' ? (
                          <Text
                            size="xs"
                            style={{
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.5,
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {msg.content}
                          </Text>
                        ) : (
                          <CoachMarkdown
                            size="xs"
                            color="var(--color-text-primary)"
                          >
                            {msg.content}
                          </CoachMarkdown>
                        )}
                        {/* Workout action buttons on coach messages (shared renderer) */}
                        {msg.role !== 'user' && (
                          <CoachReply
                            showMessage={false}
                            workoutRecommendations={msg.workoutRecommendations}
                            onAddWorkout={handleAddWorkout}
                          />
                        )}
                      </Box>
                    </Group>
                  </Box>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <Group gap={6} align="center">
                    <ThemeIcon size="xs" variant="light" color="teal" radius="xl">
                      <Robot size={10} />
                    </ThemeIcon>
                    <Group gap={4}>
                      <Loader size="xs" color="teal" />
                      <Text size="xs" c="dimmed">Thinking...</Text>
                    </Group>
                  </Group>
                )}
              </Stack>
            </ScrollArea>
          )}

          {/* Loading state when no messages yet */}
          {!hasMessages && isLoading && (
            <Group gap="xs">
              <Loader size="sm" color="teal" />
              <Text size="sm" c="dimmed">Thinking...</Text>
            </Group>
          )}

          {/* Error display */}
          {error && (
            <Paper p="xs" mt="xs" style={{ backgroundColor: 'var(--tribos-red-surface)', border: '1px solid var(--tribos-border-subtle)' }}>
              <Group justify="space-between">
                <Text size="xs" c="red">{error}</Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setError(null);
                    handleSubmit();
                  }}
                >
                  <ArrowsClockwise size={12} />
                </ActionIcon>
              </Group>
            </Paper>
          )}

          {/* Training plan preview (shared renderer, inline) */}
          {trainingPlanPreview && (
            <CoachReply
              showMessage={false}
              trainingPlanPreview={trainingPlanPreview}
              planDisplay="inline"
              onActivatePlan={handleActivatePlan}
              onDismissPlan={() => setTrainingPlanPreview(null)}
            />
          )}

          {/* Event-anchored (sequencer) plan preview (shared renderer, inline) */}
          {anchoredPlanPreview && (
            <CoachReply
              showMessage={false}
              anchoredPlanPreview={anchoredPlanPreview}
              planDisplay="inline"
              onDismissAnchored={() => setAnchoredPlanPreview(null)}
            />
          )}
        </Box>

        {/* Input - at bottom */}
        <Group gap="xs">
          <TextInput
            ref={inputRef}
            placeholder="Ask your coach anything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            size="sm"
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: 'var(--tribos-input)',
                borderColor: 'var(--tribos-border-subtle)',
                boxShadow: 'var(--tribos-shadow-inset)',
                '&:focus': {
                  borderColor: 'var(--tribos-terracotta-border)',
                },
              },
            }}
          />
          <ActionIcon
            size="lg"
            color="teal"
            variant={query.trim() ? 'filled' : 'light'}
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading}
          >
            <PaperPlaneRight size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Card>
  );
}

export default CoachCard;
