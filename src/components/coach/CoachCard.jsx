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
  Collapse,
  Paper,
} from '@mantine/core';
import {
  IconSparkles,
  IconSend,
  IconCalendarPlus,
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { depth } from '../../theme';
import TrainingPlanPreview from './TrainingPlanPreview';

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

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [responseActions, setResponseActions] = useState([]);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [trainingPlanPreview, setTrainingPlanPreview] = useState(null);

  // Get coaching message based on current form
  const coachingMessage = getCoachingMessage(trainingContext, workoutRecommendation);

  // Load conversation history from DB on mount
  useEffect(() => {
    if (!user?.id) return;

    const loadHistory = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('coach_conversations')
          .select('role, message, timestamp')
          .eq('user_id', user.id)
          .in('role', ['user', 'coach'])
          .order('timestamp', { ascending: false })
          .limit(20);

        if (fetchError) throw fetchError;

        const history = (data || [])
          .reverse()
          .map((msg) => ({
            role: msg.role === 'coach' ? 'assistant' : 'user',
            content: msg.message,
          }));

        setConversationHistory(history);
      } catch (err) {
        console.error('Error loading conversation history:', err);
      }
    };

    loadHistory();
  }, [user?.id]);

  // Reset response when context changes significantly
  useEffect(() => {
    setResponse(null);
    setResponseActions([]);
    setError(null);
    setTrainingPlanPreview(null);
  }, [trainingContext]);

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setExpanded(true);

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
          message: query.trim(),
          conversationHistory: conversationHistory,
          trainingContext: trainingContext,
          userLocalDate: userLocalDate,
          userId: user?.id,
          maxTokens: 1024,
          quickMode: true,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await res.json();
      setResponse(data.message);

      // Handle training plan preview from AI
      if (data.trainingPlanPreview && !data.trainingPlanPreview.error) {
        setTrainingPlanPreview(data.trainingPlanPreview);
      }

      // Map workout recommendations to actions
      if (data.workoutRecommendations?.length > 0) {
        setResponseActions(data.workoutRecommendations.map((rec, idx) => ({
          id: `workout-${idx}`,
          label: rec.name || rec.workout_id,
          workout: rec,
        })));
      } else {
        setResponseActions([]);
      }

      // Update in-session conversation history
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: query.trim() },
        { role: 'assistant', content: data.message },
      ]);

      // Save to DB for persistence across sessions
      try {
        await supabase.from('coach_conversations').insert([
          {
            user_id: user.id,
            role: 'user',
            message: query.trim(),
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

      setQuery('');
    } catch (err) {
      console.error('Coach error:', err);
      setError(err.message || 'Failed to get response');
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
        color: 'lime',
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

      const workoutsToInsert = planData.workouts.map((w) => ({
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

      const { error: workoutsError } = await supabase
        .from('planned_workouts')
        .insert(workoutsToInsert);

      if (workoutsError) throw workoutsError;

      notifications.show({
        title: 'Training Plan Activated',
        message: `${planData.name} — ${actualWorkouts.length} workouts added to your calendar`,
        color: 'lime',
      });

      setTrainingPlanPreview(null);
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

  return (
    <Card
      padding="lg"
      radius="xl"
      h="100%"
      className="tribos-depth-card no-hover"
      style={{
        background: `linear-gradient(135deg, rgba(34, 197, 94, 0.15), transparent), ${depth.card.background}`,
        border: depth.card.border,
        borderTop: depth.card.borderTop,
        boxShadow: depth.card.boxShadow,
      }}
    >
      <Stack gap="md" h="100%" justify="space-between">
        {/* Header */}
        <Box>
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <ThemeIcon size="lg" color="lime" variant="light" radius="md">
                <IconSparkles size={18} />
              </ThemeIcon>
              <Text fw={600}>AI Coach</Text>
            </Group>
            {(response || error) && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </ActionIcon>
            )}
          </Group>

          {/* Coaching Message - show when no response */}
          {!response && !isLoading && !error && (
            <Text size="sm" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.6 }}>
              {coachingMessage}
            </Text>
          )}

          {/* Loading State */}
          {isLoading && (
            <Group gap="xs">
              <Loader size="sm" color="lime" />
              <Text size="sm" c="dimmed">Thinking...</Text>
            </Group>
          )}

          {/* Response Area */}
          <Collapse in={expanded && (response || error)}>
            {error ? (
              <Paper p="sm" mt="sm" style={{ backgroundColor: 'var(--tribos-red-surface)', border: '1px solid var(--tribos-border-subtle)' }}>
                <Group justify="space-between">
                  <Text size="sm" c="red">{error}</Text>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      setError(null);
                      handleSubmit();
                    }}
                  >
                    <IconRefresh size={14} />
                  </ActionIcon>
                </Group>
              </Paper>
            ) : response ? (
              <Paper p="sm" mt="sm" style={{ background: depth.recessed.background, border: depth.recessed.border, boxShadow: depth.recessed.boxShadow }}>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {response}
                </Text>
                {responseActions.length > 0 && (
                  <Group gap="xs" mt="sm">
                    {responseActions.map((action) => (
                      <Button
                        key={action.id}
                        size="xs"
                        variant="light"
                        color="lime"
                        leftSection={<IconCalendarPlus size={14} />}
                        onClick={() => handleAddWorkout(action.workout)}
                      >
                        Add {action.label}
                      </Button>
                    ))}
                  </Group>
                )}
                {trainingPlanPreview && (
                  <Box mt="sm">
                    <TrainingPlanPreview
                      plan={trainingPlanPreview}
                      onActivate={handleActivatePlan}
                      onDismiss={() => setTrainingPlanPreview(null)}
                      compact
                    />
                  </Box>
                )}
              </Paper>
            ) : null}
          </Collapse>
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
            color="lime"
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
