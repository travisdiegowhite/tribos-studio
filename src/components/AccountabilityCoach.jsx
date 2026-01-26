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
  Menu,
  Modal,
  ThemeIcon,
  Divider,
  Tooltip,
} from '@mantine/core';
import {
  IconSend,
  IconRobot,
  IconUser,
  IconPlus,
  IconClock,
  IconCalendar,
  IconBrain,
  IconDotsVertical,
  IconTrash,
  IconRefresh,
  IconMessageCircle,
  IconTarget,
  IconBike,
  IconSun,
  IconMoon,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

// Get the API base URL
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

function AccountabilityCoach({ onOpenMemories, onOpenSchedule }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [todaysWorkout, setTodaysWorkout] = useState(null);
  const [coachSettings, setCoachSettings] = useState(null);
  const [raceGoals, setRaceGoals] = useState([]);
  const scrollAreaRef = useRef(null);

  // Load conversation history and context on mount
  useEffect(() => {
    if (user?.id) {
      loadConversationHistory();
      loadTodaysWorkout();
      loadCoachSettings();
      loadRaceGoals();
    }
  }, [user?.id]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Load recent conversation history
  const loadConversationHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('coach_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: true })
        .limit(50); // Last 50 messages

      if (error) {
        console.error('Error loading conversation history:', error);
        return;
      }

      if (data) {
        setMessages(data.map(msg => ({
          id: msg.id,
          role: msg.role === 'coach' ? 'assistant' : msg.role,
          content: msg.message,
          timestamp: msg.timestamp,
          messageType: msg.message_type,
        })));
      }
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load today's scheduled workout
  const loadTodaysWorkout = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('scheduled_workouts')
        .select('*')
        .eq('user_id', user.id)
        .eq('scheduled_date', today)
        .single();

      if (!error && data) {
        setTodaysWorkout(data);
      }
    } catch (err) {
      // No workout today is fine
    }
  };

  // Load coach settings
  const loadCoachSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_coach_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setCoachSettings(data);
      }
    } catch (err) {
      // No settings yet is fine
    }
  };

  // Load upcoming race goals
  const loadRaceGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'upcoming')
        .gte('race_date', new Date().toISOString().split('T')[0])
        .order('race_date', { ascending: true })
        .limit(5);

      if (error) {
        // Table might not exist yet - fail silently
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('race_goals table not yet available');
          return;
        }
        throw error;
      }

      if (data) {
        setRaceGoals(data);
      }
    } catch (err) {
      // Race goals not available yet
      console.log('Could not load race goals:', err);
    }
  };

  // Save message to database
  const saveMessage = async (role, content, messageType = 'chat', contextSnapshot = null) => {
    try {
      const { data, error } = await supabase
        .from('coach_conversations')
        .insert({
          user_id: user.id,
          role: role === 'assistant' ? 'coach' : role,
          message: content,
          message_type: messageType,
          context_snapshot: contextSnapshot,
          timestamp: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving message:', error);
      }

      return data;
    } catch (err) {
      console.error('Error saving message:', err);
    }
  };

  // Assemble context for the AI
  const assembleContext = useCallback(async () => {
    const context = {
      timestamp: new Date().toISOString(),
      today: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    };

    try {
      // Get today's workout
      if (todaysWorkout) {
        context.todaysWorkout = {
          type: todaysWorkout.workout_type,
          duration: todaysWorkout.target_duration_mins,
          description: todaysWorkout.description,
          status: todaysWorkout.status,
          committedTime: todaysWorkout.committed_time
        };
      }

      // Get this week's compliance
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const { data: weekWorkouts } = await supabase
        .from('scheduled_workouts')
        .select('status')
        .eq('user_id', user.id)
        .gte('scheduled_date', weekStart.toISOString().split('T')[0])
        .lte('scheduled_date', new Date().toISOString().split('T')[0]);

      if (weekWorkouts) {
        const completed = weekWorkouts.filter(w => w.status === 'completed').length;
        const total = weekWorkouts.filter(w => w.status !== 'rest').length;
        context.thisWeek = {
          completed,
          total,
          rate: total > 0 ? Math.round((completed / total) * 100) : null
        };
      }

      // Get recent memories
      const { data: memories } = await supabase
        .from('coach_memory')
        .select('category, content, memory_type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10);

      if (memories && memories.length > 0) {
        context.memories = memories;
      }

      // Get user's preferences
      if (coachSettings) {
        context.preferences = {
          notificationStyle: coachSettings.notification_style,
          accountabilityLevel: coachSettings.accountability_level,
          coachName: coachSettings.coach_name,
          preferredName: coachSettings.user_preferred_name
        };
      }

      // Add upcoming race goals
      if (raceGoals && raceGoals.length > 0) {
        context.raceGoals = raceGoals.map(race => {
          const raceDate = new Date(race.race_date + 'T00:00:00');
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const daysUntil = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));

          return {
            name: race.name,
            date: race.race_date,
            daysUntil,
            priority: race.priority,
            type: race.race_type,
            distance: race.distance_km,
            goalPlacement: race.goal_placement,
            notes: race.notes
          };
        });
      }

    } catch (err) {
      console.error('Error assembling context:', err);
    }

    return context;
  }, [user?.id, todaysWorkout, coachSettings, raceGoals]);

  // Build accountability coach system prompt
  const buildSystemPrompt = (context) => {
    const preferredName = context.preferences?.preferredName || 'there';
    const accountabilityLevel = context.preferences?.accountabilityLevel || 'medium';
    const coachName = context.preferences?.coachName || 'Coach';

    let personalityDirective = '';
    switch (accountabilityLevel) {
      case 'low':
        personalityDirective = 'Be supportive and encouraging. Avoid pressure. Acknowledge challenges and celebrate small wins.';
        break;
      case 'high':
        personalityDirective = 'Be direct and challenging. Call out excuses. Push for commitments and follow through.';
        break;
      default:
        personalityDirective = 'Balance support with accountability. Be firm but understanding. Push when needed, back off when appropriate.';
    }

    let workoutContext = '';
    if (context.todaysWorkout) {
      workoutContext = `
TODAY'S WORKOUT:
- Type: ${context.todaysWorkout.type}
- Target Duration: ${context.todaysWorkout.duration} minutes
- Description: ${context.todaysWorkout.description || 'No description'}
- Status: ${context.todaysWorkout.status}
${context.todaysWorkout.committedTime ? `- Committed Time: ${context.todaysWorkout.committedTime}` : ''}`;
    } else {
      workoutContext = 'TODAY\'S WORKOUT: None scheduled';
    }

    let weekContext = '';
    if (context.thisWeek) {
      weekContext = `
THIS WEEK'S PROGRESS:
- Completed: ${context.thisWeek.completed} of ${context.thisWeek.total} workouts
- Compliance: ${context.thisWeek.rate}%`;
    }

    let memoriesContext = '';
    if (context.memories && context.memories.length > 0) {
      memoriesContext = `
WHAT I REMEMBER ABOUT YOU:
${context.memories.map(m => `- [${m.category}] ${m.content}`).join('\n')}`;
    }

    let raceGoalsContext = '';
    if (context.raceGoals && context.raceGoals.length > 0) {
      const nextARace = context.raceGoals.find(r => r.priority === 'A');
      raceGoalsContext = `
UPCOMING RACE GOALS:
${context.raceGoals.map(race => {
  const priorityLabel = race.priority === 'A' ? '*** A-RACE (MAIN GOAL)' :
                       race.priority === 'B' ? 'B-Race' : 'C-Race (training)';
  return `- ${race.name} (${priorityLabel}) - ${race.daysUntil} days away${race.goalPlacement ? ` | Goal: ${race.goalPlacement}` : ''}`;
}).join('\n')}

${nextARace ? `IMPORTANT: Their main goal race "${nextARace.name}" is in ${nextARace.daysUntil} days. ${
  nextARace.daysUntil <= 7 ? 'RACE WEEK! Focus on rest and mental prep.' :
  nextARace.daysUntil <= 14 ? 'Taper time - reduce volume, keep them fresh.' :
  nextARace.daysUntil <= 28 ? 'Final build phase - last hard efforts before taper.' :
  'Plenty of time to build fitness.'
}` : ''}`;
    }

    return `You are ${coachName}, an AI cycling accountability coach for ${preferredName}. Your job is to help them execute their training plan despite a busy life.

PERSONALITY:
- Direct and realistic. No sugarcoating.
- Treat them like an adult who can handle the truth.
- Brief acknowledgment for success ("4 for 4. Solid."), no excessive praise.
- Watch for overtraining—rest matters too.
${personalityDirective}

WHEN THEY'RE SLIPPING:
- Be more direct: "You're 0 for 2 this week. What's going on?"
- After 3+ weeks of <50% completion, have the hard conversation:
  "Let's be real. You've hit X of your last Y planned rides. This isn't a bad week—it's a pattern. Either the plan doesn't fit your life, or cycling isn't the priority you thought it was. Both are fine. But I'm not going to keep pretending next week will be different. What do you actually want?"

CURRENT CONTEXT:
Date: ${context.today}
${workoutContext}
${weekContext}
${raceGoalsContext}
${memoriesContext}

CONSTRAINTS:
- Keep responses concise (2-3 sentences typically)
- Don't ask IF they're riding—ask WHEN (commitment was already made)
- Remember what they tell you—important context for future conversations
- When they share personal context (life events, obstacles, goals), acknowledge it and note it matters
- Be natural, not robotic. Use casual language.

Remember: You're their accountability partner, not a cheerleader. Help them show up consistently.`;
  };

  // Send message to coach
  const sendMessage = async (messageType = 'chat') => {
    if (!inputMessage.trim() || isLoading || !user) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // Add user message to chat immediately
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      messageType
    };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // Save user message
      await saveMessage('user', userMessage, messageType);

      // Assemble context
      const context = await assembleContext();

      // Build system prompt
      const systemPrompt = buildSystemPrompt(context);

      // Build conversation history for API (last 10 messages)
      const recentMessages = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Call the coach API
      const response = await fetch(`${getApiBaseUrl()}/api/accountability-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: recentMessages,
          systemPrompt,
          context,
          userId: user.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();

      // Add assistant message
      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        messageType
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message with context snapshot
      await saveMessage('assistant', data.message, messageType, context);

      // Extract and save memories if any
      if (data.extractedMemories) {
        for (const memory of data.extractedMemories) {
          await supabase.from('coach_memory').insert({
            user_id: user.id,
            memory_type: memory.type,
            category: memory.category,
            content: memory.content,
            source_type: 'conversation'
          });
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to get coaching response',
        color: 'red'
      });
      // Remove the failed user message
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Clear conversation history
  const clearHistory = async () => {
    if (!user) return;

    try {
      await supabase
        .from('coach_conversations')
        .delete()
        .eq('user_id', user.id);

      setMessages([]);
      notifications.show({
        title: 'History Cleared',
        message: 'Conversation history has been cleared',
        color: 'blue'
      });
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  // Get time of day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loadingHistory) {
    return (
      <Card
        style={{
          backgroundColor: 'var(--tribos-bg-secondary)',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Stack align="center" gap="sm">
          <Loader size="md" color="lime" />
          <Text size="sm" c="dimmed">Loading coach...</Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <ThemeIcon size="lg" color="lime" variant="light">
            <IconRobot size={20} />
          </ThemeIcon>
          <div>
            <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              {coachSettings?.coach_name || 'Coach'}
            </Text>
            <Text size="xs" c="dimmed">
              Accountability Partner
            </Text>
          </div>
        </Group>
        <Group gap="xs">
          {onOpenMemories && (
            <Tooltip label="What I Remember">
              <ActionIcon variant="subtle" onClick={onOpenMemories}>
                <IconBrain size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <Menu>
            <Menu.Target>
              <ActionIcon variant="subtle">
                <IconDotsVertical size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconRefresh size={14} />}
                onClick={loadConversationHistory}
              >
                Refresh
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={clearHistory}
              >
                Clear History
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {/* Today's Workout Banner */}
      {todaysWorkout && todaysWorkout.status === 'planned' && (
        <Paper
          p="sm"
          mb="md"
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            border: `1px solid ${'var(--tribos-lime)'}33`
          }}
        >
          <Group justify="space-between">
            <Group gap="sm">
              <IconBike size={18} style={{ color: 'var(--tribos-lime)' }} />
              <div>
                <Text size="sm" fw={500}>
                  Today: {todaysWorkout.workout_type} ({todaysWorkout.target_duration_mins} min)
                </Text>
                {todaysWorkout.description && (
                  <Text size="xs" c="dimmed">{todaysWorkout.description}</Text>
                )}
              </div>
            </Group>
            <Badge color="yellow" variant="light">
              Not started
            </Badge>
          </Group>
        </Paper>
      )}

      {/* Chat Messages */}
      <ScrollArea
        style={{ flex: 1, minHeight: 300 }}
        viewportRef={scrollAreaRef}
      >
        <Stack gap="md" pr="xs">
          {messages.length === 0 && (
            <Box
              style={{
                padding: tokens.spacing.xl,
                textAlign: 'center',
                borderRadius: tokens.radius.md,
                border: `1px dashed ${'var(--tribos-bg-tertiary)'}`,
              }}
            >
              <IconRobot size={48} style={{ color: 'var(--tribos-text-muted)', marginBottom: 12 }} />
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="xs">
                {getGreeting()}! I'm your accountability coach.
              </Text>
              <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
                I'm here to help you stick to your training plan.
              </Text>
              <Stack gap="xs" mt="md" align="center">
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Quick actions:</Text>
                <Group gap="xs" justify="center" wrap="wrap">
                  {[
                    { text: "What's my plan today?", icon: <IconCalendar size={14} /> },
                    { text: "I'm ready to ride", icon: <IconBike size={14} /> },
                    { text: "I'm not feeling it today", icon: <IconMessageCircle size={14} /> }
                  ].map((suggestion) => (
                    <Button
                      key={suggestion.text}
                      size="xs"
                      variant="light"
                      color="gray"
                      leftSection={suggestion.icon}
                      onClick={() => setInputMessage(suggestion.text)}
                    >
                      {suggestion.text}
                    </Button>
                  ))}
                </Group>
              </Stack>
            </Box>
          )}

          {messages.map((msg, index) => (
            <Box key={msg.id || index}>
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <Box
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: msg.role === 'user' ? 'var(--tribos-bg-tertiary)' : 'var(--tribos-lime)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {msg.role === 'user' ? (
                    <IconUser size={18} style={{ color: 'var(--tribos-text-secondary)' }} />
                  ) : (
                    <IconRobot size={18} style={{ color: 'var(--tribos-bg-primary)' }} />
                  )}
                </Box>
                <Box style={{ flex: 1 }}>
                  <Group gap="xs" mb={4}>
                    <Text size="xs" c="dimmed">
                      {msg.role === 'user' ? 'You' : (coachSettings?.coach_name || 'Coach')}
                    </Text>
                    {msg.timestamp && (
                      <Text size="xs" c="dimmed">
                        {formatTime(msg.timestamp)}
                      </Text>
                    )}
                  </Group>
                  <Text
                    size="sm"
                    style={{
                      color: 'var(--tribos-text-primary)',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {msg.content}
                  </Text>
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
                  backgroundColor: 'var(--tribos-lime)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IconRobot size={18} style={{ color: 'var(--tribos-bg-primary)' }} />
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
          placeholder="Message your coach..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          style={{ flex: 1 }}
          styles={{
            input: {
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderColor: 'var(--tribos-bg-tertiary)',
              '&:focus': {
                borderColor: 'var(--tribos-lime)'
              }
            }
          }}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          color="lime"
          onClick={() => sendMessage()}
          disabled={!inputMessage.trim() || isLoading}
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Card>
  );
}

export default AccountabilityCoach;
