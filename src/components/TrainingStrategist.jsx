import { useState, useEffect, useCallback } from 'react';
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
  Tooltip,
  Collapse,
  UnstyledButton,
} from '@mantine/core';
import {
  IconSend,
  IconUser,
  IconPlus,
  IconClock,
  IconCalendarPlus,
  IconChartLine,
  IconChevronDown,
  IconChevronUp,
  IconHistory,
  IconTrash,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getWorkoutById } from '../data/workoutLibrary';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

// Training Strategist theme colors
const STRATEGIST_THEME = {
  primary: '#5C7A5E', // Teal
  primaryLight: '#5C7A5E33',
  name: 'Training Strategist',
  coachType: 'strategist',
};

// Number of recent messages to show by default
const RECENT_MESSAGE_COUNT = 4;

// Get the API base URL - use relative URL for both dev and prod
// In dev, run with `npm run dev:vercel` to have API routes available
const getApiBaseUrl = () => {
  return '';
};

// Convert relative date strings to YYYY-MM-DD format
const resolveScheduledDate = (dateStr) => {
  if (!dateStr) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const formatDate = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const lowerDate = dateStr.toLowerCase().replace(/\s+/g, '_');

  if (lowerDate === 'today') {
    return formatDate(today);
  }
  if (lowerDate === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  const thisMatch = lowerDate.match(/^this_(\w+)$/);
  const nextMatch = lowerDate.match(/^next_(\w+)$/);

  if (thisMatch || nextMatch) {
    const targetDayName = (thisMatch || nextMatch)[1];
    const targetDayIndex = dayNames.indexOf(targetDayName);

    if (targetDayIndex !== -1) {
      let daysToAdd;

      if (thisMatch) {
        daysToAdd = (targetDayIndex - dayOfWeek + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 0;
      } else {
        daysToAdd = (targetDayIndex - dayOfWeek + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 7;
        else daysToAdd += 7;
      }

      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      return formatDate(targetDate);
    }
  }

  console.warn('Could not parse scheduled date:', dateStr);
  return null;
};

// Compact workout chip component
function WorkoutChip({ recommendation, onAdd }) {
  const workout = getWorkoutById(recommendation.workout_id);
  if (!workout) return null;

  return (
    <Group
      gap={6}
      style={{
        backgroundColor: 'var(--tribos-bg-tertiary)',
        borderRadius: 6,
        padding: '4px 8px',
        border: `1px solid ${STRATEGIST_THEME.primaryLight}`,
      }}
    >
      <Text size="xs" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
        {workout.name}
      </Text>
      <Badge size="xs" variant="light" color="gray">
        {workout.duration}m
      </Badge>
      <Badge size="xs" variant="light" color="blue">
        {recommendation.scheduled_date}
      </Badge>
      <Tooltip label="Add to calendar">
        <ActionIcon size="sm" variant="light" color="blue" onClick={() => onAdd(recommendation)}>
          <IconPlus size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function TrainingStrategist({ trainingContext, onAddWorkout, activePlan, onThreadSelect }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

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
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('coach_conversations table not yet available');
        } else {
          console.error('Error loading conversation history:', error);
        }
        return;
      }

      if (data && data.length > 0) {
        // Filter to training coach messages
        const trainingMessages = data.filter(msg =>
          msg.context_snapshot?.coach_type === 'training' ||
          msg.coach_type === 'strategist'
        );

        setMessages(trainingMessages.map(msg => ({
          id: msg.id,
          role: msg.role === 'coach' ? 'assistant' : msg.role,
          content: msg.message,
          timestamp: msg.timestamp,
          threadId: msg.thread_id,
          workoutRecommendations: msg.context_snapshot?.workoutRecommendations || null,
        })));
      }
    } catch (err) {
      console.log('Could not load conversation history:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.id]);

  // Get or create a thread for new messages
  const getOrCreateThread = async () => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .rpc('get_or_create_thread', {
          p_user_id: user.id,
          p_coach_type: STRATEGIST_THEME.coachType,
          p_time_gap_hours: 4
        });

      if (!error && data) {
        setCurrentThreadId(data);
        return data;
      }

      // Fallback: create thread manually if function doesn't exist
      const { data: newThread, error: createError } = await supabase
        .from('conversation_threads')
        .insert({
          user_id: user.id,
          coach_type: STRATEGIST_THEME.coachType,
          title: 'New Conversation',
          status: 'active'
        })
        .select()
        .single();

      if (createError) {
        console.log('Could not create thread:', createError.message);
        return null;
      }

      setCurrentThreadId(newThread.id);
      return newThread.id;
    } catch (err) {
      console.log('Thread creation error:', err.message);
      return null;
    }
  };

  // Save message to database
  const saveMessage = async (role, content, workoutRecommendations = null) => {
    if (!user?.id) return null;

    try {
      let threadId = currentThreadId;
      if (!threadId) {
        threadId = await getOrCreateThread();
      }

      const contextSnapshot = {
        coach_type: 'training',
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
          coach_type: STRATEGIST_THEME.coachType,
          thread_id: threadId,
          timestamp: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        if (error.code !== '42P01' && !error.message?.includes('does not exist')) {
          console.log('Could not persist message:', error.message);
        }
        return null;
      }

      return data;
    } catch (err) {
      return null;
    }
  };

  // Delete a message from the conversation
  const deleteMessage = async (messageId, messageIndex) => {
    if (!user?.id) return;

    try {
      // If we have a database ID, delete from Supabase
      if (messageId) {
        const { error } = await supabase
          .from('coach_conversations')
          .delete()
          .eq('id', messageId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Error deleting message:', error);
          notifications.show({
            title: 'Error',
            message: 'Failed to delete message',
            color: 'red'
          });
          return;
        }
      }

      // Remove from local state
      setMessages(prev => prev.filter((_, idx) => idx !== messageIndex));

      notifications.show({
        title: 'Deleted',
        message: 'Message removed',
        color: 'gray',
        autoClose: 2000
      });
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  useEffect(() => {
    loadConversationHistory();
  }, [loadConversationHistory]);

  useEffect(() => {
    // Messages updated - could add scroll-to-bottom behavior here if needed
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setShowAllMessages(true); // Expand when chatting

    const newUserMessage = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      await saveMessage('user', userMessage);

      // Get user's local date for the API (server runs in UTC)
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
          day: 'numeric'
        })
      };

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
          userLocalDate: userLocalDate,
          userId: user?.id,
          maxTokens: 2048
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();

      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        workoutRecommendations: data.workoutRecommendations,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage('assistant', data.message, data.workoutRecommendations);

      // Generate thread title after first exchange
      if (messages.length <= 1 && currentThreadId) {
        generateThreadTitle(userMessage, data.message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to get coaching response',
        color: 'red'
      });
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // Generate AI title for thread
  const generateThreadTitle = async (userMessage, assistantMessage) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/generate-thread-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: assistantMessage }
          ],
          coachType: STRATEGIST_THEME.coachType
        })
      });

      if (response.ok) {
        const { title, summary } = await response.json();
        if (title && currentThreadId) {
          await supabase
            .from('conversation_threads')
            .update({ title, summary })
            .eq('id', currentThreadId);
        }
      }
    } catch (err) {
      console.log('Could not generate thread title:', err.message);
    }
  };

  const handleKeyDown = (e) => {
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

    const notificationId = notifications.show({
      title: 'Adding Workout',
      message: `Adding ${workout.name}...`,
      loading: true,
      autoClose: false
    });

    try {
      let planId = activePlan?.id;
      let planCreated = false;

      if (!planId) {
        const { data: existingPlan } = await supabase
          .from('training_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingPlan) {
          planId = existingPlan.id;
        } else {
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
            throw new Error(`Failed to create training plan: ${planError.message}`);
          }

          planId = newPlan.id;
          planCreated = true;
        }
      }

      const scheduledDate = resolveScheduledDate(recommendation.scheduled_date);
      if (!scheduledDate) {
        throw new Error(`Could not understand the date "${recommendation.scheduled_date}".`);
      }

      const validWorkoutTypes = [
        'endurance', 'tempo', 'threshold', 'intervals', 'recovery',
        'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest'
      ];
      const normalizedWorkoutType = (workout.workoutType || workout.category)?.toLowerCase().replace(/[\s-]/g, '_');
      const dbWorkoutType = validWorkoutTypes.includes(normalizedWorkoutType) ? normalizedWorkoutType : 'endurance';

      const schedDate = new Date(scheduledDate);
      const dayOfWeek = schedDate.getDay();

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

      // Check if there's an existing workout on this date (for notification message)
      let replacedWorkoutName = null;
      const { data: existingWorkout } = await supabase
        .from('planned_workouts')
        .select('id, name')
        .eq('plan_id', planId)
        .eq('scheduled_date', scheduledDate)
        .maybeSingle();

      if (existingWorkout) {
        replacedWorkoutName = existingWorkout.name;
        console.log(`Will replace existing workout: ${existingWorkout.id} (${existingWorkout.name})`);
      }

      // Use UPSERT - insert or update if (plan_id, scheduled_date) already exists
      // This is atomic and avoids race conditions with DELETE + INSERT
      const workoutData = {
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
        notes: recommendation.reason ? `Coach: ${recommendation.reason}` : '',
        completed: false
      };

      const { data: workoutRecord, error: dbError } = await supabase
        .from('planned_workouts')
        .upsert(workoutData, {
          onConflict: 'plan_id,scheduled_date',
          ignoreDuplicates: false  // Update existing record
        })
        .select()
        .single();

      if (dbError) {
        console.error('Upsert failed:', dbError);
        throw new Error(`Failed to save workout: ${dbError.message}`);
      }

      console.log('Successfully upserted workout:', workoutRecord?.id, 'for date:', scheduledDate);

      notifications.update({
        id: notificationId,
        title: replacedWorkoutName ? 'Replaced!' : 'Added!',
        message: replacedWorkoutName
          ? `${workout.name} replaced ${replacedWorkoutName} on ${scheduledDate}`
          : `${workout.name} → ${scheduledDate}`,
        color: 'blue',
        icon: <IconCalendarPlus size={16} />,
        loading: false,
        autoClose: 3000
      });

      if (onAddWorkout) {
        onAddWorkout({
          ...workout,
          scheduledDate,
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
        message: error.message || 'Failed to add workout',
        color: 'red',
        loading: false,
        autoClose: 4000
      });
    }
  };

  // Get visible messages (recent or all) - reversed so most recent is at top
  const visibleMessages = showAllMessages
    ? [...messages].reverse()
    : [...messages].slice(-RECENT_MESSAGE_COUNT).reverse();

  const hiddenMessageCount = messages.length - RECENT_MESSAGE_COUNT;
  const hasHiddenMessages = hiddenMessageCount > 0 && !showAllMessages;

  // Calculate actual index in original messages array (accounting for reversed display)
  const getActualIndex = (visibleIndex) => {
    if (showAllMessages) {
      return messages.length - 1 - visibleIndex;
    } else {
      const recentStartIndex = Math.max(0, messages.length - RECENT_MESSAGE_COUNT);
      return messages.length - 1 - visibleIndex;
    }
  };

  return (
    <Card
      p="sm"
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Compact Header */}
      <UnstyledButton onClick={() => setIsExpanded(!isExpanded)} style={{ width: '100%' }}>
        <Group justify="space-between" mb={isExpanded ? 'sm' : 0}>
          <Group gap="xs">
            <Box
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: STRATEGIST_THEME.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconChartLine size={14} style={{ color: 'white' }} />
            </Box>
            <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              {STRATEGIST_THEME.name}
            </Text>
            {messages.length > 0 && (
              <Badge size="xs" variant="light" color="blue">
                {messages.length} msgs
              </Badge>
            )}
          </Group>
          <ActionIcon variant="subtle" size="sm">
            {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
        </Group>
      </UnstyledButton>

      <Collapse in={isExpanded}>
        {/* Input Area - at top since messages flow downward */}
        <Group gap={8} mb="sm">
          <TextInput
            placeholder="Ask strategist..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            size="sm"
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: 'var(--tribos-bg-tertiary)',
                borderColor: 'var(--tribos-bg-tertiary)',
                '&:focus': {
                  borderColor: STRATEGIST_THEME.primary
                }
              }
            }}
          />
          <ActionIcon
            size="md"
            variant="filled"
            color="blue"
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>

        {/* Chat Messages */}
        <ScrollArea
          h={300}
          type="always"
          offsetScrollbars
        >
          <Stack gap="xs">
            {loadingHistory && (
              <Box style={{ textAlign: 'center', padding: '12px' }}>
                <Loader size="xs" color="blue" />
              </Box>
            )}

            {/* Empty state - minimal */}
            {!loadingHistory && messages.length === 0 && (
              <Box style={{ padding: '8px 0' }}>
                <Text size="xs" c="dimmed" mb="xs">
                  Ask about workouts, plans, or recovery
                </Text>
                <Group gap={4}>
                  {['What today?', 'Plan week', 'Tired'].map((suggestion) => (
                    <Button
                      key={suggestion}
                      size="compact-xs"
                      variant="light"
                      color="blue"
                      onClick={() => setInputMessage(
                        suggestion === 'What today?' ? 'What should I ride today?' :
                        suggestion === 'Plan week' ? 'Plan my week' :
                        'I feel tired'
                      )}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Group>
              </Box>
            )}

            {/* Messages */}
            {visibleMessages.map((msg, index) => {
              const actualIndex = getActualIndex(index);
              // First 2 messages (index 0, 1) are the most recent exchange
              const isRecentMessage = index < 2;
              const isOlderMessage = !isRecentMessage;
              // Show divider before first older message
              const showDivider = index === 2;

              return (
              <Box key={msg.id || index}>
                {/* Divider between recent and older messages */}
                {showDivider && (
                  <Box
                    style={{
                      borderTop: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                      margin: '8px 0',
                      position: 'relative',
                    }}
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'var(--tribos-bg-secondary)',
                        padding: '0 8px',
                      }}
                    >
                      Earlier
                    </Text>
                  </Box>
                )}

                <Box
                  style={{
                    position: 'relative',
                    opacity: isOlderMessage ? 0.6 : 1,
                    paddingLeft: isOlderMessage ? 8 : 0,
                    borderLeft: isOlderMessage ? `2px solid ${'var(--tribos-bg-tertiary)'}` : 'none',
                  }}
                  className="message-item"
                >
                  <Group gap={8} align="flex-start" wrap="nowrap">
                    <Box
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: msg.role === 'user'
                          ? 'var(--tribos-bg-tertiary)'
                          : isOlderMessage ? '#6B7280' : STRATEGIST_THEME.primary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {msg.role === 'user' ? (
                        <IconUser size={14} style={{ color: 'var(--tribos-text-secondary)' }} />
                      ) : (
                        <IconChartLine size={14} style={{ color: 'white' }} />
                      )}
                    </Box>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="sm"
                        style={{
                          color: msg.role === 'user'
                            ? '#5C7A5E'  // Teal for user questions
                            : isOlderMessage ? 'var(--tribos-text-secondary)' : 'var(--tribos-text-primary)',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.5,
                          fontWeight: msg.role === 'user' ? 500 : 400,
                        }}
                      >
                        {msg.content}
                      </Text>

                    {/* Workout Recommendations */}
                    {msg.workoutRecommendations && msg.workoutRecommendations.length > 0 && (
                      <Group gap={6} mt={8} wrap="wrap">
                        {msg.workoutRecommendations.map((rec, recIndex) => (
                          <WorkoutChip
                            key={recIndex}
                            recommendation={rec}
                            onAdd={handleAddWorkout}
                          />
                        ))}
                      </Group>
                    )}
                  </Box>
                  {/* Delete button */}
                  <Tooltip label="Delete message" position="left">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => deleteMessage(msg.id, actualIndex)}
                      style={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                  </Group>
                </Box>
              </Box>
              );
            })}

            {/* Loading indicator - shown at top since messages are reversed */}
            {isLoading && (
              <Group gap={8} align="flex-start">
                <Box
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: STRATEGIST_THEME.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconChartLine size={14} style={{ color: 'white' }} />
                </Box>
                <Loader size="sm" color="blue" type="dots" />
              </Group>
            )}

            {/* Show older messages button - at bottom since messages are reversed */}
            {hasHiddenMessages && (
              <UnstyledButton
                onClick={() => setShowAllMessages(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 0',
                }}
              >
                <IconHistory size={14} style={{ color: 'var(--tribos-text-muted)' }} />
                <Text size="sm" c="dimmed">
                  Show {hiddenMessageCount} older messages
                </Text>
              </UnstyledButton>
            )}
          </Stack>
        </ScrollArea>
      </Collapse>
    </Card>
  );
}

export default TrainingStrategist;
