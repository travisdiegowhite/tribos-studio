import { useState, useRef, useEffect } from 'react';
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
} from '@mantine/core';
import { IconSend, IconRobot, IconUser, IconPlus, IconClock, IconFlame, IconCalendarCheck, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getWorkoutById } from '../data/workoutLibrary';
import { googleCalendarService } from '../utils/googleCalendarService';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

// Get the API base URL
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

function AICoach({ trainingContext, onAddWorkout, activePlan }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollAreaRef = useRef(null);

  // Load conversation history on mount
  useEffect(() => {
    if (user?.id) {
      loadConversationHistory();
    }
  }, [user?.id]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Load recent conversation history from database
  const loadConversationHistory = async () => {
    try {
      setLoadingHistory(true);
      const { data, error } = await supabase
        .from('coach_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('message_type', 'training_coach') // Filter to training coach messages
        .order('timestamp', { ascending: true })
        .limit(50);

      if (error) {
        console.error('Error loading conversation history:', error);
        return;
      }

      if (data && data.length > 0) {
        setMessages(data.map(msg => ({
          id: msg.id,
          role: msg.role === 'coach' ? 'assistant' : msg.role,
          content: msg.message,
          timestamp: msg.timestamp,
          workoutRecommendations: msg.context_snapshot?.workoutRecommendations || null,
        })));
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Save a message to the database
  const saveMessage = async (role, content, workoutRecommendations = null) => {
    if (!user?.id) return;

    try {
      await supabase
        .from('coach_conversations')
        .insert({
          user_id: user.id,
          role: role === 'assistant' ? 'coach' : role,
          message: content,
          message_type: 'training_coach',
          context_snapshot: workoutRecommendations ? { workoutRecommendations } : null,
        });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // Add user message to chat
    const newUserMessage = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    // Save user message to database
    await saveMessage('user', userMessage);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages,
          trainingContext: trainingContext,
          maxTokens: 2048
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();

      // Add assistant message with workout recommendations
      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        workoutRecommendations: data.workoutRecommendations
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to database
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

    // Show loading notification
    const notificationId = notifications.show({
      title: 'Adding Workout',
      message: `Scheduling ${workout.name}...`,
      loading: true,
      autoClose: false
    });

    try {
      // Create workout event via the calendar service (which also saves to DB)
      // If no active plan exists, the API will auto-create a "Coach Workouts" plan
      const result = await googleCalendarService.createWorkoutEvent({
        name: workout.name,
        description: workout.description,
        duration: workout.duration,
        scheduledDate: recommendation.scheduled_date,
        workoutType: workout.workoutType || workout.category,
        reason: recommendation.reason,
        planId: activePlan?.id, // Optional - API will find/create plan if not provided
        targetTss: workout.targetTSS
      });

      // Build success message based on what happened
      let successMessage = `${workout.name} scheduled for ${recommendation.scheduled_date}`;
      if (result.planCreated) {
        successMessage = `${workout.name} added! A "Coach Recommended Workouts" plan was created for you.`;
      } else if (result.calendarSynced) {
        successMessage = `${workout.name} added to your calendar for ${recommendation.scheduled_date}`;
      }

      // Update notification to success
      notifications.update({
        id: notificationId,
        title: result.planCreated ? 'Plan Created & Workout Added!' : 'Workout Scheduled!',
        message: successMessage,
        color: 'lime',
        icon: result.calendarSynced ? <IconCalendarCheck size={18} /> : <IconCheck size={18} />,
        loading: false,
        autoClose: result.planCreated ? 6000 : 4000
      });

      // Call parent callback if provided
      if (onAddWorkout) {
        onAddWorkout({
          ...workout,
          scheduledDate: recommendation.scheduled_date,
          reason: recommendation.reason,
          priority: recommendation.priority,
          workoutId: result.workoutId,
          calendarEventId: result.calendarEventId
        });
      }

    } catch (error) {
      console.error('Error adding workout:', error);
      notifications.update({
        id: notificationId,
        title: 'Error',
        message: error.message || 'Failed to schedule workout',
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
        <Badge variant="light" color="lime">
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
            <Box style={{ padding: tokens.spacing.xl, textAlign: 'center' }}>
              <Loader size="sm" color="lime" type="dots" />
              <Text size="sm" style={{ color: tokens.colors.textMuted, marginTop: 8 }}>
                Loading conversation history...
              </Text>
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
                                color="lime"
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
