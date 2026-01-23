import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  Box,
  ScrollArea,
  ActionIcon,
  Badge,
  Loader,
  Paper,
  Divider,
  Progress,
  SimpleGrid,
  ThemeIcon,
} from '@mantine/core';
import { IconSend, IconRobot, IconUser, IconPlus, IconClock, IconFlame, IconCalendarPlus, IconCheck, IconCalendar, IconTrendingUp, IconTarget, IconPlayerPlay } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getWorkoutById } from '../data/workoutLibrary';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

// Get the API base URL
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

// Convert relative date strings to YYYY-MM-DD format
const resolveScheduledDate = (dateStr) => {
  if (!dateStr) return null;

  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, etc.

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const formatDate = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const lowerDate = dateStr.toLowerCase().replace(/\s+/g, '_');

  // Handle "today" and "tomorrow"
  if (lowerDate === 'today') {
    return formatDate(today);
  }
  if (lowerDate === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  // Handle "this_monday", "this_saturday", "next_tuesday", etc.
  const thisMatch = lowerDate.match(/^this_(\w+)$/);
  const nextMatch = lowerDate.match(/^next_(\w+)$/);

  if (thisMatch || nextMatch) {
    const targetDayName = (thisMatch || nextMatch)[1];
    const targetDayIndex = dayNames.indexOf(targetDayName);

    if (targetDayIndex !== -1) {
      let daysToAdd;

      if (thisMatch) {
        // "this_X" means the next occurrence of that day within this week or the coming days
        daysToAdd = (targetDayIndex - dayOfWeek + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 0; // If today is that day, use today
      } else {
        // "next_X" means the occurrence in the next week
        daysToAdd = (targetDayIndex - dayOfWeek + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 7; // If today is that day, go to next week
        else daysToAdd += 7; // Add a week
      }

      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      return formatDate(targetDate);
    }
  }

  // If we can't parse it, return null and log warning
  console.warn('Could not parse scheduled date:', dateStr);
  return null;
};

function AICoach({ trainingContext, onAddWorkout, activePlan }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollAreaRef = useRef(null);

  // Load conversation history on mount
  const loadConversationHistory = useCallback(async () => {
    if (!user?.id) {
      setLoadingHistory(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('coach_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: true })
        .limit(100);

      if (error) {
        // Table may not exist yet - fail silently
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('coach_conversations table not yet available');
        } else {
          console.error('Error loading conversation history:', error);
        }
        return;
      }

      if (data && data.length > 0) {
        // Filter to training coach messages only (identified by context_snapshot.coach_type)
        const trainingMessages = data.filter(msg =>
          msg.context_snapshot?.coach_type === 'training'
        );

        setMessages(trainingMessages.map(msg => ({
          id: msg.id,
          role: msg.role === 'coach' ? 'assistant' : msg.role,
          content: msg.message,
          timestamp: msg.timestamp,
          workoutRecommendations: msg.context_snapshot?.workoutRecommendations || null,
        })));
      }
    } catch (err) {
      // Fail silently - chat history is not critical
      console.log('Could not load conversation history:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.id]);

  // Save message to database (fails silently if table doesn't exist)
  const saveMessage = async (role, content, workoutRecommendations = null) => {
    if (!user?.id) return null;

    try {
      // Use context_snapshot to identify training coach messages and store workout recommendations
      const contextSnapshot = {
        coach_type: 'training', // Distinguish from accountability coach
        ...(workoutRecommendations && { workoutRecommendations })
      };

      const { data, error } = await supabase
        .from('coach_conversations')
        .insert({
          user_id: user.id,
          role: role === 'assistant' ? 'coach' : role,
          message: content,
          message_type: 'chat',
          context_snapshot: contextSnapshot,
          timestamp: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        // Fail silently - message persistence is not critical for core functionality
        if (error.code !== '42P01' && !error.message?.includes('does not exist')) {
          console.log('Could not persist message:', error.message);
        }
        return null;
      }

      return data;
    } catch (err) {
      // Fail silently - chat history is not critical
      return null;
    }
  };

  // Load history when user is available
  useEffect(() => {
    loadConversationHistory();
  }, [loadConversationHistory]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // Add user message to chat
    const newUserMessage = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // Save user message to database
      await saveMessage('user', userMessage);

      const response = await fetch(`${getApiBaseUrl()}/api/coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          trainingContext: trainingContext,
          userId: user?.id,
          maxTokens: 2048
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();

      // Add assistant message with workout recommendations and/or training plan preview
      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        workoutRecommendations: data.workoutRecommendations,
        trainingPlanPreview: data.trainingPlanPreview,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to database (include plan preview in context)
      await saveMessage('assistant', data.message, data.workoutRecommendations);
    } catch (error) {
      console.error('Error sending message:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to get coaching response',
        color: 'red'
      });
      // Remove the user message if it failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleAddWorkout = async (recommendation) => {
    const workout = getWorkoutById(recommendation.workout_id);
    if (!workout) {
      notifications.show({
        title: 'Error',
        message: 'Workout not found',
        color: 'red'
      });
      return;
    }

    if (!user?.id) {
      notifications.show({
        title: 'Error',
        message: 'You must be logged in to add workouts',
        color: 'red'
      });
      return;
    }

    // Show loading notification
    const notificationId = notifications.show({
      title: 'Adding Workout',
      message: `Adding ${workout.name} to your training calendar...`,
      loading: true,
      autoClose: false
    });

    try {
      let planId = activePlan?.id;
      let planCreated = false;

      // If no active plan, find or create a "Coach Recommended Workouts" plan
      if (!planId) {
        // Check for existing active plan - use maybeSingle() to handle no results gracefully
        const { data: existingPlan, error: planQueryError } = await supabase
          .from('training_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planQueryError) {
          console.error('Error checking for existing plan:', planQueryError);
        }

        if (existingPlan) {
          planId = existingPlan.id;
        } else {
          // Create a new "Coach Recommended Workouts" plan
          // Match the format used by TrainingPlanBrowser
          const today = new Date();
          const startDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

          const { data: newPlan, error: planError } = await supabase
            .from('training_plans')
            .insert({
              user_id: user.id,
              template_id: 'coach_recommended',
              name: 'Coach Recommended Workouts',
              duration_weeks: 52,
              methodology: 'coach_guided',
              goal: 'general_fitness',
              fitness_level: 'intermediate',
              started_at: startDateStr,
              start_date: startDateStr,
              status: 'active'
            })
            .select()
            .single();

          if (planError) {
            console.error('Training plan creation error:', planError);
            throw new Error(`Failed to create training plan: ${planError.message}`);
          }

          planId = newPlan.id;
          planCreated = true;
        }
      }

      // Resolve relative date (e.g., "this_saturday") to actual date (e.g., "2025-12-21")
      const scheduledDate = resolveScheduledDate(recommendation.scheduled_date);
      if (!scheduledDate) {
        throw new Error(`Could not understand the date "${recommendation.scheduled_date}". Please try again.`);
      }

      // Map workout type to valid database enum value
      const validWorkoutTypes = [
        'endurance', 'tempo', 'threshold', 'intervals', 'recovery',
        'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest'
      ];
      const normalizedWorkoutType = (workout.workoutType || workout.category)?.toLowerCase().replace(/[\s-]/g, '_');
      const dbWorkoutType = validWorkoutTypes.includes(normalizedWorkoutType)
        ? normalizedWorkoutType
        : 'endurance';

      // Calculate week_number and day_of_week from scheduled date
      const schedDate = new Date(scheduledDate);
      const dayOfWeek = schedDate.getDay();

      // Get plan start date to calculate week number
      const { data: planData } = await supabase
        .from('training_plans')
        .select('started_at')
        .eq('id', planId)
        .maybeSingle();

      let weekNumber = 1;
      if (planData?.started_at) {
        const planStart = new Date(planData.started_at);
        const daysSinceStart = Math.floor((schedDate - planStart) / (24 * 60 * 60 * 1000));
        weekNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
      }

      // Save workout directly to planned_workouts table (Tribos calendar)
      // Match the format used by TrainingPlanBrowser
      const { data: workoutRecord, error: dbError } = await supabase
        .from('planned_workouts')
        .insert({
          plan_id: planId,
          user_id: user.id,
          scheduled_date: scheduledDate,
          week_number: weekNumber,
          day_of_week: dayOfWeek,
          workout_type: dbWorkoutType,
          workout_id: recommendation.workout_id,
          name: workout.name,
          duration_minutes: workout.duration || 60,
          target_duration: workout.duration || 60,
          target_tss: workout.targetTSS || 0,
          notes: recommendation.reason ? `Coach recommendation: ${recommendation.reason}` : '',
          completed: false
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error saving workout:', dbError);
        throw new Error(`Failed to save workout: ${dbError.message}`);
      }

      // Build success message
      let successMessage = `${workout.name} added for ${scheduledDate}`;
      if (planCreated) {
        successMessage = `${workout.name} added! A "Coach Recommended Workouts" plan was created for you.`;
      }

      // Update notification to success
      notifications.update({
        id: notificationId,
        title: planCreated ? 'Plan Created & Workout Added!' : 'Workout Added!',
        message: successMessage,
        color: 'lime',
        icon: <IconCalendarPlus size={18} />,
        loading: false,
        autoClose: planCreated ? 6000 : 4000
      });

      // Call parent callback if provided
      if (onAddWorkout) {
        onAddWorkout({
          ...workout,
          scheduledDate: scheduledDate,
          reason: recommendation.reason,
          priority: recommendation.priority,
          workoutId: workoutRecord.id
        });
      }

    } catch (error) {
      console.error('Error adding workout:', error);
      notifications.update({
        id: notificationId,
        title: 'Error',
        message: error.message || 'Failed to add workout to calendar',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    }
  };

  // Activate a full training plan - saves all workouts to the database
  const handleActivatePlan = async (planPreview) => {
    if (!user?.id) {
      notifications.show({
        title: 'Error',
        message: 'You must be logged in to activate a training plan',
        color: 'red'
      });
      return;
    }

    if (!planPreview || planPreview.error) {
      notifications.show({
        title: 'Error',
        message: 'Invalid training plan',
        color: 'red'
      });
      return;
    }

    // Show loading notification
    const notificationId = notifications.show({
      title: 'Activating Training Plan',
      message: `Creating ${planPreview.name} with ${planPreview.summary.total_workouts} workouts...`,
      loading: true,
      autoClose: false
    });

    try {
      // First, deactivate any existing active plan
      if (activePlan?.id) {
        await supabase
          .from('training_plans')
          .update({ status: 'completed', ended_at: new Date().toISOString() })
          .eq('id', activePlan.id);
      }

      // Create the training plan record
      const { data: newPlan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          template_id: 'ai_coach_generated',
          name: planPreview.name,
          duration_weeks: planPreview.duration_weeks,
          methodology: planPreview.methodology,
          goal: planPreview.goal,
          started_at: planPreview.start_date,
          start_date: planPreview.start_date,
          status: 'active'
        })
        .select()
        .single();

      if (planError) {
        console.error('Plan creation error:', planError);
        throw new Error(`Failed to create training plan: ${planError.message}`);
      }

      console.log(`✅ Plan created: ${newPlan.id}`);

      // Prepare all workouts for batch insert
      const workoutsToInsert = planPreview.workouts
        .filter(w => w.workout_type !== 'rest') // Don't insert rest days
        .map(w => ({
          plan_id: newPlan.id,
          user_id: user.id,
          scheduled_date: w.scheduled_date,
          week_number: w.week_number,
          day_of_week: w.day_of_week,
          workout_type: w.workout_type,
          workout_id: w.workout_id,
          name: w.name,
          duration_minutes: w.duration_minutes,
          target_duration: w.duration_minutes,
          target_tss: w.target_tss,
          notes: `AI Coach: ${planPreview.methodology} training - ${w.phase} phase`,
          completed: false
        }));

      console.log(`📝 Inserting ${workoutsToInsert.length} workouts...`);

      // Batch insert all workouts
      const { error: workoutsError } = await supabase
        .from('planned_workouts')
        .insert(workoutsToInsert);

      if (workoutsError) {
        console.error('Workouts insert error:', workoutsError);
        // Try smaller batches if bulk insert fails
        const batchSize = 20;
        let successCount = 0;

        for (let i = 0; i < workoutsToInsert.length; i += batchSize) {
          const batch = workoutsToInsert.slice(i, i + batchSize);
          const { error: batchError } = await supabase
            .from('planned_workouts')
            .insert(batch);

          if (!batchError) {
            successCount += batch.length;
          } else {
            console.error(`Batch ${i / batchSize + 1} failed:`, batchError);
          }
        }

        if (successCount === 0) {
          throw new Error('Failed to create workouts');
        }

        console.log(`⚠️ Created ${successCount} of ${workoutsToInsert.length} workouts via batch insert`);
      } else {
        console.log(`✅ All ${workoutsToInsert.length} workouts created successfully`);
      }

      // Update notification to success
      notifications.update({
        id: notificationId,
        title: 'Training Plan Activated!',
        message: `${planPreview.name} is now active with ${workoutsToInsert.length} workouts scheduled through ${planPreview.end_date}`,
        color: 'lime',
        icon: <IconCalendarPlus size={18} />,
        loading: false,
        autoClose: 6000
      });

      // Call parent callback to refresh the calendar
      if (onAddWorkout) {
        onAddWorkout({
          planActivated: true,
          planId: newPlan.id,
          planName: planPreview.name
        });
      }

    } catch (error) {
      console.error('Error activating plan:', error);
      notifications.update({
        id: notificationId,
        title: 'Error',
        message: error.message || 'Failed to activate training plan',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    }
  };

  return (
    <Card
      style={{
        backgroundColor: tokens.colors.bgSecondary,
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <IconRobot size={24} style={{ color: tokens.colors.electricLime }} />
          <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
            AI Training Coach
          </Text>
        </Group>
        <Badge variant="light" color="gray">
          Powered by Claude
        </Badge>
      </Group>

      {/* Chat Messages */}
      <ScrollArea
        style={{ flex: 1, minHeight: 300 }}
        viewportRef={scrollAreaRef}
      >
        <Stack gap="md" pr="xs">
          {loadingHistory && (
            <Box style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
              <Loader size="sm" color="lime" />
              <Text size="sm" c="dimmed" mt="sm">Loading conversation history...</Text>
            </Box>
          )}

          {!loadingHistory && messages.length === 0 && (
            <Box
              style={{
                padding: tokens.spacing.xl,
                textAlign: 'center',
                borderRadius: tokens.radius.md,
                border: `1px dashed ${tokens.colors.bgTertiary}`,
              }}
            >
              <IconRobot size={48} style={{ color: tokens.colors.textMuted, marginBottom: 12 }} />
              <Text style={{ color: tokens.colors.textSecondary }} mb="xs">
                Hi! I'm your AI training coach.
              </Text>
              <Text size="sm" style={{ color: tokens.colors.textMuted }}>
                Ask me about workouts, training plans, recovery, or get personalized recommendations.
              </Text>
              <Stack gap="xs" mt="md" align="center">
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>Try asking:</Text>
                <Group gap="xs" justify="center" wrap="wrap">
                  {['What should I ride today?', 'Plan my week', 'I feel tired'].map((suggestion) => (
                    <Button
                      key={suggestion}
                      size="xs"
                      variant="light"
                      color="gray"
                      onClick={() => setInputMessage(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Group>
              </Stack>
            </Box>
          )}

          {messages.map((msg, index) => (
            <Box key={index}>
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <Box
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: msg.role === 'user' ? tokens.colors.bgTertiary : tokens.colors.electricLime,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {msg.role === 'user' ? (
                    <IconUser size={18} style={{ color: tokens.colors.textSecondary }} />
                  ) : (
                    <IconRobot size={18} style={{ color: tokens.colors.bgPrimary }} />
                  )}
                </Box>
                <Box style={{ flex: 1 }}>
                  <Text
                    size="sm"
                    style={{
                      color: tokens.colors.textPrimary,
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {msg.content}
                  </Text>

                  {/* Workout Recommendations */}
                  {msg.workoutRecommendations && msg.workoutRecommendations.length > 0 && (
                    <Stack gap="sm" mt="md">
                      {msg.workoutRecommendations.map((rec, recIndex) => {
                        const workout = getWorkoutById(rec.workout_id);
                        if (!workout) return null;

                        return (
                          <Paper
                            key={recIndex}
                            p="sm"
                            style={{
                              backgroundColor: tokens.colors.bgTertiary,
                              border: `1px solid ${tokens.colors.electricLime}33`
                            }}
                          >
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                              <Box style={{ flex: 1 }}>
                                <Group gap="xs" mb={4}>
                                  <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary }}>
                                    {workout.name}
                                  </Text>
                                  <Badge size="xs" color={rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'gray'}>
                                    {rec.priority || 'medium'}
                                  </Badge>
                                </Group>
                                <Group gap="md" mb="xs">
                                  <Group gap={4}>
                                    <IconClock size={14} style={{ color: tokens.colors.textMuted }} />
                                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                                      {workout.duration} min
                                    </Text>
                                  </Group>
                                  <Group gap={4}>
                                    <IconFlame size={14} style={{ color: tokens.colors.textMuted }} />
                                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                                      {workout.targetTSS} TSS
                                    </Text>
                                  </Group>
                                  <Badge size="xs" variant="light" color="gray">
                                    {rec.scheduled_date}
                                  </Badge>
                                </Group>
                                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                                  {rec.reason}
                                </Text>
                              </Box>
                              <ActionIcon
                                variant="light"
                                color="gray"
                                size="lg"
                                onClick={() => handleAddWorkout(rec)}
                              >
                                <IconPlus size={18} />
                              </ActionIcon>
                            </Group>
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}

                  {/* Training Plan Preview */}
                  {msg.trainingPlanPreview && !msg.trainingPlanPreview.error && (
                    <Paper
                      mt="md"
                      p="md"
                      style={{
                        backgroundColor: tokens.colors.bgTertiary,
                        border: `2px solid ${tokens.colors.electricLime}`,
                        borderRadius: tokens.radius.md
                      }}
                    >
                      {/* Plan Header */}
                      <Group justify="space-between" align="flex-start" mb="md">
                        <Box>
                          <Group gap="xs" mb={4}>
                            <ThemeIcon size="md" color="lime" variant="light">
                              <IconCalendar size={16} />
                            </ThemeIcon>
                            <Text fw={700} size="lg" style={{ color: tokens.colors.textPrimary }}>
                              {msg.trainingPlanPreview.name}
                            </Text>
                          </Group>
                          <Group gap="xs">
                            <Badge color="lime" variant="filled" size="sm">
                              {msg.trainingPlanPreview.methodology}
                            </Badge>
                            <Badge variant="light" color="gray" size="sm">
                              {msg.trainingPlanPreview.duration_weeks} weeks
                            </Badge>
                            <Badge variant="outline" color="gray" size="sm">
                              {msg.trainingPlanPreview.goal?.replace('_', ' ')}
                            </Badge>
                          </Group>
                        </Box>
                      </Group>

                      {/* Key Stats */}
                      <SimpleGrid cols={3} spacing="xs" mb="md">
                        <Paper p="xs" withBorder ta="center" style={{ backgroundColor: tokens.colors.bgSecondary }}>
                          <IconTarget size={18} style={{ color: tokens.colors.electricLime, marginBottom: 4 }} />
                          <Text size="lg" fw={700} style={{ color: tokens.colors.textPrimary }}>
                            {msg.trainingPlanPreview.summary.total_workouts}
                          </Text>
                          <Text size="xs" c="dimmed">workouts</Text>
                        </Paper>
                        <Paper p="xs" withBorder ta="center" style={{ backgroundColor: tokens.colors.bgSecondary }}>
                          <IconClock size={18} style={{ color: tokens.colors.electricLime, marginBottom: 4 }} />
                          <Text size="lg" fw={700} style={{ color: tokens.colors.textPrimary }}>
                            {msg.trainingPlanPreview.summary.avg_weekly_hours}
                          </Text>
                          <Text size="xs" c="dimmed">hrs/week</Text>
                        </Paper>
                        <Paper p="xs" withBorder ta="center" style={{ backgroundColor: tokens.colors.bgSecondary }}>
                          <IconTrendingUp size={18} style={{ color: tokens.colors.electricLime, marginBottom: 4 }} />
                          <Text size="lg" fw={700} style={{ color: tokens.colors.textPrimary }}>
                            {msg.trainingPlanPreview.summary.avg_weekly_tss}
                          </Text>
                          <Text size="xs" c="dimmed">TSS/week</Text>
                        </Paper>
                      </SimpleGrid>

                      {/* Phases */}
                      <Box mb="md">
                        <Text size="sm" fw={600} mb="xs" style={{ color: tokens.colors.textSecondary }}>
                          Training Phases
                        </Text>
                        <Stack gap={4}>
                          {msg.trainingPlanPreview.phases.map((phase, idx) => (
                            <Group key={idx} gap="xs" wrap="nowrap">
                              <Badge
                                size="xs"
                                variant="light"
                                color={
                                  phase.phase === 'recovery' ? 'blue' :
                                  phase.phase === 'build' ? 'orange' :
                                  phase.phase === 'peak' ? 'red' :
                                  phase.phase === 'taper' ? 'green' : 'gray'
                                }
                                style={{ minWidth: 60 }}
                              >
                                {phase.weeks}
                              </Badge>
                              <Text size="xs" fw={500} style={{ color: tokens.colors.textPrimary, textTransform: 'capitalize' }}>
                                {phase.phase}
                              </Text>
                              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                                {phase.description}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </Box>

                      {/* Date Range */}
                      <Group gap="lg" mb="md">
                        <Box>
                          <Text size="xs" c="dimmed">Starts</Text>
                          <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
                            {msg.trainingPlanPreview.start_date}
                          </Text>
                        </Box>
                        <Box>
                          <Text size="xs" c="dimmed">Ends</Text>
                          <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
                            {msg.trainingPlanPreview.end_date}
                          </Text>
                        </Box>
                        {msg.trainingPlanPreview.target_event_date && (
                          <Box>
                            <Text size="xs" c="dimmed">Target Event</Text>
                            <Text size="sm" fw={500} style={{ color: tokens.colors.electricLime }}>
                              {msg.trainingPlanPreview.target_event_date}
                            </Text>
                          </Box>
                        )}
                      </Group>

                      <Divider mb="md" />

                      {/* Activate Button */}
                      <Button
                        color="lime"
                        size="md"
                        fullWidth
                        leftSection={<IconPlayerPlay size={18} />}
                        onClick={() => handleActivatePlan(msg.trainingPlanPreview)}
                      >
                        Activate Plan - Add {msg.trainingPlanPreview.summary.total_workouts} Workouts to Calendar
                      </Button>

                      <Text size="xs" c="dimmed" ta="center" mt="xs">
                        This will create {msg.trainingPlanPreview.summary.total_workouts} scheduled workouts in your training calendar
                      </Text>
                    </Paper>
                  )}
                </Box>
              </Group>
            </Box>
          ))}

          {isLoading && (
            <Group gap="sm" align="flex-start">
              <Box
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: tokens.colors.electricLime,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IconRobot size={18} style={{ color: tokens.colors.bgPrimary }} />
              </Box>
              <Box style={{ padding: '8px 0' }}>
                <Loader size="sm" color="lime" type="dots" />
              </Box>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      {/* Input Area */}
      <Group gap="sm" mt="md">
        <TextInput
          placeholder="Ask your coach..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          style={{ flex: 1 }}
          styles={{
            input: {
              backgroundColor: tokens.colors.bgTertiary,
              borderColor: tokens.colors.bgTertiary,
              '&:focus': {
                borderColor: tokens.colors.electricLime
              }
            }
          }}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          color="lime"
          onClick={sendMessage}
          disabled={!inputMessage.trim() || isLoading}
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Card>
  );
}

export default AICoach;
