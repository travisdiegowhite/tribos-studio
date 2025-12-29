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
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconSend,
  IconUser,
  IconPlus,
  IconClock,
  IconFlame,
  IconCalendarPlus,
  IconChartLine,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getWorkoutById } from '../data/workoutLibrary';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import ThreadLinkBadge from './conversations/ThreadLinkBadge';

// Training Strategist theme colors
const STRATEGIST_THEME = {
  primary: '#3B82F6', // Blue
  primaryLight: '#3B82F633',
  icon: IconChartLine,
  name: 'Training Strategist',
  coachType: 'strategist',
};

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

function TrainingStrategist({ trainingContext, onAddWorkout, activePlan, onThreadSelect }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [threads, setThreads] = useState([]);
  const [expandedThreads, setExpandedThreads] = useState({});
  const scrollAreaRef = useRef(null);

  // Load threads and conversation history on mount
  const loadThreads = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .eq('coach_type', STRATEGIST_THEME.coachType)
        .order('last_message_at', { ascending: false })
        .limit(20);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('conversation_threads table not yet available');
          return;
        }
        throw error;
      }

      if (data) {
        setThreads(data);
        // Set the most recent active thread as current
        const activeThread = data.find(t => t.status === 'active');
        if (activeThread) {
          setCurrentThreadId(activeThread.id);
          setExpandedThreads({ [activeThread.id]: true });
        }
      }
    } catch (err) {
      console.log('Could not load threads:', err.message);
    }
  }, [user?.id]);

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
        .eq('coach_type', STRATEGIST_THEME.coachType)
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
        setMessages(data.map(msg => ({
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
      // Try to use the database function first
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
        coach_type: 'training', // Keep for backwards compatibility
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

  useEffect(() => {
    loadThreads();
    loadConversationHistory();
  }, [loadThreads, loadConversationHistory]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    const newUserMessage = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
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

          // Update local state
          setThreads(prev => prev.map(t =>
            t.id === currentThreadId ? { ...t, title, summary } : t
          ));
        }
      }
    } catch (err) {
      console.log('Could not generate thread title:', err.message);
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

    const notificationId = notifications.show({
      title: 'Adding Workout',
      message: `Adding ${workout.name} to your training calendar...`,
      loading: true,
      autoClose: false
    });

    try {
      let planId = activePlan?.id;
      let planCreated = false;

      if (!planId) {
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
        throw new Error(`Could not understand the date "${recommendation.scheduled_date}". Please try again.`);
      }

      const validWorkoutTypes = [
        'endurance', 'tempo', 'threshold', 'intervals', 'recovery',
        'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest'
      ];
      const normalizedWorkoutType = (workout.workoutType || workout.category)?.toLowerCase().replace(/[\s-]/g, '_');
      const dbWorkoutType = validWorkoutTypes.includes(normalizedWorkoutType)
        ? normalizedWorkoutType
        : 'endurance';

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
        throw new Error(`Failed to save workout: ${dbError.message}`);
      }

      let successMessage = `${workout.name} added for ${scheduledDate}`;
      if (planCreated) {
        successMessage = `${workout.name} added! A "Coach Recommended Workouts" plan was created for you.`;
      }

      notifications.update({
        id: notificationId,
        title: planCreated ? 'Plan Created & Workout Added!' : 'Workout Added!',
        message: successMessage,
        color: 'blue',
        icon: <IconCalendarPlus size={18} />,
        loading: false,
        autoClose: planCreated ? 6000 : 4000
      });

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

  const toggleThread = (threadId) => {
    setExpandedThreads(prev => ({
      ...prev,
      [threadId]: !prev[threadId]
    }));
  };

  // Get messages for a specific thread
  const getThreadMessages = (threadId) => {
    return messages.filter(m => m.threadId === threadId);
  };

  // Get messages for current/unthreaded display
  const currentMessages = currentThreadId
    ? messages.filter(m => m.threadId === currentThreadId || !m.threadId)
    : messages;

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
          <ThemeIcon size="lg" color="blue" variant="light">
            <IconChartLine size={20} />
          </ThemeIcon>
          <div>
            <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
              {STRATEGIST_THEME.name}
            </Text>
            <Text size="xs" c="dimmed">
              Training & Performance
            </Text>
          </div>
        </Group>
        <Badge variant="light" color="blue">
          Powered by Claude
        </Badge>
      </Group>

      {/* Thread List (collapsed threads) */}
      {threads.length > 1 && (
        <Stack gap="xs" mb="md">
          {threads.slice(1, 4).map(thread => (
            <Paper
              key={thread.id}
              p="xs"
              style={{
                backgroundColor: tokens.colors.bgTertiary,
                cursor: 'pointer',
                border: expandedThreads[thread.id] ? `1px solid ${STRATEGIST_THEME.primary}` : 'none'
              }}
              onClick={() => {
                toggleThread(thread.id);
                if (onThreadSelect) onThreadSelect(thread);
              }}
            >
              <Group justify="space-between">
                <Group gap="xs">
                  {expandedThreads[thread.id] ? (
                    <IconChevronDown size={14} style={{ color: STRATEGIST_THEME.primary }} />
                  ) : (
                    <IconChevronRight size={14} style={{ color: tokens.colors.textMuted }} />
                  )}
                  <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
                    {thread.title}
                  </Text>
                </Group>
                <Group gap="xs">
                  <Badge size="xs" color="blue" variant="light">
                    {thread.message_count} msgs
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(thread.last_message_at).toLocaleDateString()}
                  </Text>
                </Group>
              </Group>
              {thread.summary && expandedThreads[thread.id] && (
                <Text size="xs" c="dimmed" mt="xs" pl="xl">
                  {thread.summary}
                </Text>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      {/* Chat Messages */}
      <ScrollArea
        style={{ flex: 1, minHeight: 300 }}
        viewportRef={scrollAreaRef}
      >
        <Stack gap="md" pr="xs">
          {loadingHistory && (
            <Box style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
              <Loader size="sm" color="blue" />
              <Text size="sm" c="dimmed" mt="sm">Loading conversation history...</Text>
            </Box>
          )}

          {!loadingHistory && currentMessages.length === 0 && (
            <Box
              style={{
                padding: tokens.spacing.xl,
                textAlign: 'center',
                borderRadius: tokens.radius.md,
                border: `1px dashed ${tokens.colors.bgTertiary}`,
              }}
            >
              <IconChartLine size={48} style={{ color: STRATEGIST_THEME.primary, marginBottom: 12, opacity: 0.7 }} />
              <Text style={{ color: tokens.colors.textSecondary }} mb="xs">
                Hi! I'm your Training Strategist.
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
                      color="blue"
                      onClick={() => setInputMessage(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Group>
              </Stack>
            </Box>
          )}

          {currentMessages.map((msg, index) => (
            <Box key={index}>
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <Box
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: msg.role === 'user' ? tokens.colors.bgTertiary : STRATEGIST_THEME.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {msg.role === 'user' ? (
                    <IconUser size={18} style={{ color: tokens.colors.textSecondary }} />
                  ) : (
                    <IconChartLine size={18} style={{ color: 'white' }} />
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
                              border: `1px solid ${STRATEGIST_THEME.primaryLight}`
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
                                  <Badge size="xs" variant="light" color="blue">
                                    {rec.scheduled_date}
                                  </Badge>
                                </Group>
                                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                                  {rec.reason}
                                </Text>
                              </Box>
                              <ActionIcon
                                variant="light"
                                color="blue"
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
                  backgroundColor: STRATEGIST_THEME.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IconChartLine size={18} style={{ color: 'white' }} />
              </Box>
              <Box style={{ padding: '8px 0' }}>
                <Loader size="sm" color="blue" type="dots" />
              </Box>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      {/* Input Area */}
      <Group gap="sm" mt="md">
        <TextInput
          placeholder="Ask your strategist..."
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
                borderColor: STRATEGIST_THEME.primary
              }
            }
          }}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          color="blue"
          onClick={sendMessage}
          disabled={!inputMessage.trim() || isLoading}
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Card>
  );
}

export default TrainingStrategist;
