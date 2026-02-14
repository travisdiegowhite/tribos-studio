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
import {
  IconSparkles,
  IconSend,
  IconCalendarPlus,
  IconRefresh,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { depth } from '../../theme';
import TrainingPlanPreview from './TrainingPlanPreview';
import { useUserAvailability } from '../../hooks/useUserAvailability';
import { redistributeWorkouts } from '../../utils/trainingPlans';

// Generate coaching message — now includes workout recommendation for consistency
function getCoachingMessage(trainingContext, workoutRecommendation) {
  if (!trainingContext) {
    return "Ready to help with your training. Ask me about your fitness, race prep, or training strategy.";
  }

  // If we have a recommendation from the unified service, reference it
  const rec = workoutRecommendation?.primary;
  if (rec?.workout?.name && rec?.reason) {
    return `Today I'd suggest ${rec.workout.name} — ${rec.reason.charAt(0).toLowerCase() + rec.reason.slice(1)} Ask me if you want to adjust or discuss alternatives.`;
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
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Get coaching message based on current form
  const coachingMessage = getCoachingMessage(trainingContext, workoutRecommendation);

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

        // Full history for API context
        const history = allMessages.map((msg) => ({
          role: msg.role === 'coach' ? 'assistant' : 'user',
          content: msg.message,
        }));
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

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Add coach response to chat
      const coachMsg = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        workoutRecommendations: data.workoutRecommendations || null,
      };
      setChatMessages((prev) => [...prev, coachMsg]);

      // Update full conversation history for API
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: data.message },
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

  const handleAddWorkout = (workout) => {
    if (onAddWorkout) {
      onAddWorkout(workout);
      notifications.show({
        title: 'Workout Added',
        message: `${workout.name || workout.workout_id} added to your calendar`,
        color: 'sage',
      });
    }
  };

  const handleActivatePlan = async (planData) => {
    if (!user?.id) return;

    try {
      // Mark existing active plans as completed
      await supabase
        .from('training_plans')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'active');

      const actualWorkouts = planData.workouts.filter(
        (w) => w.workout_type !== 'rest' && w.workout_id
      );

      const { data: newPlan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          template_id: `ai_coach_${planData.methodology}`,
          name: planData.name,
          duration_weeks: planData.duration_weeks,
          methodology: planData.methodology,
          goal: planData.goal,
          status: 'active',
          start_date: planData.start_date,
          current_week: 1,
          workouts_completed: 0,
          workouts_total: actualWorkouts.length,
          compliance_percentage: 0,
        })
        .select()
        .single();

      if (planError) throw planError;

      // Build initial workouts list
      let workoutsToInsert = planData.workouts.map((w) => ({
        plan_id: newPlan.id,
        user_id: user.id,
        week_number: w.week_number,
        day_of_week: w.day_of_week,
        scheduled_date: w.scheduled_date,
        workout_type: w.workout_type || 'rest',
        workout_id: w.workout_id || null,
        name: w.name || w.workout_id || 'Workout',
        target_tss: w.target_tss || null,
        target_duration: w.duration_minutes || null,
        duration_minutes: w.duration_minutes || 0,
        completed: false,
      }));

      // Apply schedule-aware redistribution if user has availability set
      const hasBlockedDays = weeklyAvailability.some((d) => d.status === 'blocked');
      let redistributionCount = 0;

      if (hasBlockedDays) {
        const workoutsForRedistribution = workoutsToInsert
          .filter((w) => w.workout_id && w.workout_type !== 'rest')
          .map((w) => ({
            originalDate: w.scheduled_date,
            dayOfWeek: w.day_of_week,
            weekNumber: w.week_number,
            workoutId: w.workout_id,
            workoutType: w.workout_type,
            targetTSS: w.target_tss,
            targetDuration: w.target_duration,
          }));

        const redistributions = redistributeWorkouts(
          workoutsForRedistribution,
          weeklyAvailability,
          dateOverrides,
          {
            maxWorkoutsPerWeek: availabilityPreferences?.maxWorkoutsPerWeek ?? null,
            preferWeekendLongRides: availabilityPreferences?.preferWeekendLongRides ?? true,
          }
        );

        // Apply redistributions to workouts
        const movedDates = new Map();
        for (const r of redistributions) {
          if (r.originalDate !== r.newDate) {
            movedDates.set(r.originalDate + '|' + r.workoutId, r.newDate);
            redistributionCount++;
          }
        }

        if (movedDates.size > 0) {
          workoutsToInsert = workoutsToInsert.map((w) => {
            const key = w.scheduled_date + '|' + w.workout_id;
            const newDate = movedDates.get(key);
            if (newDate) {
              const newDateObj = new Date(newDate + 'T12:00:00');
              return {
                ...w,
                scheduled_date: newDate,
                day_of_week: newDateObj.getDay(),
              };
            }
            return w;
          });
        }
      }

      const { error: workoutsError } = await supabase
        .from('planned_workouts')
        .insert(workoutsToInsert);

      if (workoutsError) throw workoutsError;

      const scheduleNote = redistributionCount > 0
        ? ` (${redistributionCount} workout${redistributionCount > 1 ? 's' : ''} moved to fit your schedule)`
        : '';

      notifications.show({
        title: 'Training Plan Activated',
        message: `${planData.name} — ${actualWorkouts.length} workouts added to your calendar${scheduleNote}`,
        color: 'sage',
      });

      setTrainingPlanPreview(null);

      // Dispatch event so dashboard reloads plan + calendar without page refresh
      window.dispatchEvent(new CustomEvent('training-plan-activated', {
        detail: { planId: newPlan.id },
      }));

      if (onAddWorkout) {
        onAddWorkout({ _planActivated: true, planId: newPlan.id });
      }
    } catch (err) {
      console.error('Error activating plan:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to activate training plan. Please try again.',
        color: 'red',
      });
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
        background: `linear-gradient(135deg, rgba(196, 120, 92, 0.15), transparent), ${depth.card.background}`,
        border: depth.card.border,
        borderTop: depth.card.borderTop,
        boxShadow: depth.card.boxShadow,
      }}
    >
      <Stack gap="md" h="100%" justify="space-between">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size="lg" color="terracotta" variant="light" radius="md">
              <IconSparkles size={18} />
            </ThemeIcon>
            <Text fw={600}>AI Coach</Text>
          </Group>
        </Group>

        {/* Chat area */}
        <Box style={{ flex: 1, minHeight: 0 }}>
          {/* Empty state — coaching message when no history */}
          {!hasMessages && !isLoading && !loadingHistory && (
            <Text size="sm" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.6 }}>
              {coachingMessage}
            </Text>
          )}

          {/* Loading history spinner */}
          {loadingHistory && (
            <Group gap="xs" justify="center" py="md">
              <Loader size="xs" color="terracotta" />
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
                        {msg.role === 'user' ? <IconUser size={10} /> : <IconRobot size={10} />}
                      </ThemeIcon>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          size="xs"
                          style={{
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.5,
                            color: msg.role === 'user' ? 'var(--tribos-text-secondary)' : 'var(--tribos-text-primary)',
                          }}
                        >
                          {msg.content}
                        </Text>
                        {/* Workout action buttons on coach messages */}
                        {msg.workoutRecommendations?.length > 0 && (
                          <Group gap={4} mt={4}>
                            {msg.workoutRecommendations.map((rec, rIdx) => (
                              <Button
                                key={rIdx}
                                size="compact-xs"
                                variant="light"
                                color="terracotta"
                                leftSection={<IconCalendarPlus size={12} />}
                                onClick={() => handleAddWorkout(rec)}
                              >
                                Add {rec.name || rec.workout_id}
                              </Button>
                            ))}
                          </Group>
                        )}
                      </Box>
                    </Group>
                  </Box>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <Group gap={6} align="center">
                    <ThemeIcon size="xs" variant="light" color="terracotta" radius="xl">
                      <IconRobot size={10} />
                    </ThemeIcon>
                    <Group gap={4}>
                      <Loader size="xs" color="terracotta" />
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
              <Loader size="sm" color="terracotta" />
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
                  <IconRefresh size={12} />
                </ActionIcon>
              </Group>
            </Paper>
          )}

          {/* Training plan preview */}
          {trainingPlanPreview && (
            <Box mt="xs">
              <TrainingPlanPreview
                plan={trainingPlanPreview}
                onActivate={handleActivatePlan}
                onDismiss={() => setTrainingPlanPreview(null)}
                compact
              />
            </Box>
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
                  borderColor: 'var(--tribos-green-border)',
                },
              },
            }}
          />
          <ActionIcon
            size="lg"
            color="terracotta"
            variant={query.trim() ? 'filled' : 'light'}
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Card>
  );
}

export default CoachCard;
