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
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconSend,
  IconUser,
  IconClock,
  IconCalendar,
  IconBrain,
  IconDotsVertical,
  IconTrash,
  IconRefresh,
  IconMessageCircle,
  IconBike,
  IconActivity,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import ThreadLinkBadge from './conversations/ThreadLinkBadge';

// Pulse theme colors
const PULSE_THEME = {
  primary: '#F97316', // Orange
  primaryLight: '#F9731633',
  icon: IconActivity,
  name: 'Pulse',
  coachType: 'pulse',
};

// Get the API base URL
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

function Pulse({ onOpenMemories, onOpenSchedule, onThreadSelect, linkedThreads = [] }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [todaysWorkout, setTodaysWorkout] = useState(null);
  const [coachSettings, setCoachSettings] = useState(null);
  const [raceGoals, setRaceGoals] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [threads, setThreads] = useState([]);
  const [expandedThreads, setExpandedThreads] = useState({});
  const scrollAreaRef = useRef(null);

  // Load threads
  const loadThreads = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .eq('coach_type', PULSE_THEME.coachType)
        .order('last_message_at', { ascending: false })
        .limit(20);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return;
        }
        throw error;
      }

      if (data) {
        setThreads(data);
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

  // Load conversation history and context on mount
  useEffect(() => {
    if (user?.id) {
      loadThreads();
      loadConversationHistory();
      loadTodaysWorkout();
      loadCoachSettings();
      loadRaceGoals();
    }
  }, [user?.id, loadThreads]);

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
        .eq('coach_type', PULSE_THEME.coachType)
        .order('timestamp', { ascending: true })
        .limit(50);

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
          threadId: msg.thread_id,
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
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return;
        }
        throw error;
      }

      if (data) {
        setRaceGoals(data);
      }
    } catch (err) {
      console.log('Could not load race goals:', err);
    }
  };

  // Get or create a thread for new messages
  const getOrCreateThread = async () => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .rpc('get_or_create_thread', {
          p_user_id: user.id,
          p_coach_type: PULSE_THEME.coachType,
          p_time_gap_hours: 4
        });

      if (!error && data) {
        setCurrentThreadId(data);
        return data;
      }

      // Fallback
      const { data: newThread, error: createError } = await supabase
        .from('conversation_threads')
        .insert({
          user_id: user.id,
          coach_type: PULSE_THEME.coachType,
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
  const saveMessage = async (role, content, messageType = 'chat', contextSnapshot = null) => {
    try {
      let threadId = currentThreadId;
      if (!threadId) {
        threadId = await getOrCreateThread();
      }

      const { data, error } = await supabase
        .from('coach_conversations')
        .insert({
          user_id: user.id,
          role: role === 'assistant' ? 'coach' : role,
          message: content,
          message_type: messageType,
          context_snapshot: contextSnapshot,
          coach_type: PULSE_THEME.coachType,
          thread_id: threadId,
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
      if (todaysWorkout) {
        context.todaysWorkout = {
          type: todaysWorkout.workout_type,
          duration: todaysWorkout.target_duration_mins,
          description: todaysWorkout.description,
          status: todaysWorkout.status,
          committedTime: todaysWorkout.committed_time
        };
      }

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

      if (coachSettings) {
        context.preferences = {
          notificationStyle: coachSettings.notification_style,
          accountabilityLevel: coachSettings.accountability_level,
          coachName: coachSettings.coach_name || 'Pulse',
          preferredName: coachSettings.user_preferred_name
        };
      }

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

    return `You are Pulse, an AI cycling accountability coach for ${preferredName}. Your job is to help them execute their training plan despite a busy life.

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

  // Generate thread title
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
          coachType: PULSE_THEME.coachType
        })
      });

      if (response.ok) {
        const { title, summary } = await response.json();
        if (title && currentThreadId) {
          await supabase
            .from('conversation_threads')
            .update({ title, summary })
            .eq('id', currentThreadId);

          setThreads(prev => prev.map(t =>
            t.id === currentThreadId ? { ...t, title, summary } : t
          ));
        }
      }
    } catch (err) {
      console.log('Could not generate thread title:', err.message);
    }
  };

  // Send message to coach
  const sendMessage = async (messageType = 'chat') => {
    if (!inputMessage.trim() || isLoading || !user) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      messageType
    };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      await saveMessage('user', userMessage, messageType);

      const context = await assembleContext();
      const systemPrompt = buildSystemPrompt(context);

      const recentMessages = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

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

      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        messageType
      };

      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage('assistant', data.message, messageType, context);

      // Generate thread title after first exchange
      if (messages.length <= 1 && currentThreadId) {
        generateThreadTitle(userMessage, data.message);
      }

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

  const clearHistory = async () => {
    if (!user) return;

    try {
      await supabase
        .from('coach_conversations')
        .delete()
        .eq('user_id', user.id)
        .eq('coach_type', PULSE_THEME.coachType);

      setMessages([]);
      notifications.show({
        title: 'History Cleared',
        message: 'Conversation history has been cleared',
        color: 'orange'
      });
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

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

  const toggleThread = (threadId) => {
    setExpandedThreads(prev => ({
      ...prev,
      [threadId]: !prev[threadId]
    }));
  };

  // Get current messages
  const currentMessages = currentThreadId
    ? messages.filter(m => m.threadId === currentThreadId || !m.threadId)
    : messages;

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
          <Loader size="md" color="orange" />
          <Text size="sm" c="dimmed">Loading Pulse...</Text>
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
          <ThemeIcon size="lg" color="orange" variant="light">
            <IconActivity size={20} />
          </ThemeIcon>
          <div>
            <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              {PULSE_THEME.name}
            </Text>
            <Text size="xs" c="dimmed">
              Accountability Partner
            </Text>
          </div>
        </Group>
        <Group gap="xs">
          {onOpenMemories && (
            <Tooltip label="What I Remember">
              <ActionIcon variant="subtle" color="orange" onClick={onOpenMemories}>
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

      {/* Thread List (collapsed threads) */}
      {threads.length > 1 && (
        <Stack gap="xs" mb="md">
          {threads.slice(1, 4).map(thread => (
            <Paper
              key={thread.id}
              p="xs"
              style={{
                backgroundColor: 'var(--tribos-bg-tertiary)',
                cursor: 'pointer',
                border: expandedThreads[thread.id] ? `1px solid ${PULSE_THEME.primary}` : 'none'
              }}
              onClick={() => {
                toggleThread(thread.id);
                if (onThreadSelect) onThreadSelect(thread);
              }}
            >
              <Group justify="space-between">
                <Group gap="xs">
                  {expandedThreads[thread.id] ? (
                    <IconChevronDown size={14} style={{ color: PULSE_THEME.primary }} />
                  ) : (
                    <IconChevronRight size={14} style={{ color: 'var(--tribos-text-muted)' }} />
                  )}
                  <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                    {thread.title}
                  </Text>
                </Group>
                <Group gap="xs">
                  {thread.linked_thread_ids?.length > 0 && (
                    <ThreadLinkBadge
                      threadIds={thread.linked_thread_ids}
                      coachType="strategist"
                      onNavigate={onThreadSelect}
                    />
                  )}
                  <Badge size="xs" color="orange" variant="light">
                    {thread.message_count} msgs
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(thread.last_message_at).toLocaleDateString()}
                  </Text>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Today's Workout Banner */}
      {todaysWorkout && todaysWorkout.status === 'planned' && (
        <Paper
          p="sm"
          mb="md"
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            border: `1px solid ${PULSE_THEME.primaryLight}`
          }}
        >
          <Group justify="space-between">
            <Group gap="sm">
              <IconBike size={18} style={{ color: PULSE_THEME.primary }} />
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
          {currentMessages.length === 0 && (
            <Box
              style={{
                padding: tokens.spacing.xl,
                textAlign: 'center',
                borderRadius: tokens.radius.md,
                border: `1px dashed ${'var(--tribos-bg-tertiary)'}`,
              }}
            >
              <IconActivity size={48} style={{ color: PULSE_THEME.primary, marginBottom: 12, opacity: 0.7 }} />
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="xs">
                {getGreeting()}! I'm Pulse, your accountability partner.
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
                      color="orange"
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

          {currentMessages.map((msg, index) => (
            <Box key={msg.id || index}>
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <Box
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: msg.role === 'user' ? 'var(--tribos-bg-tertiary)' : PULSE_THEME.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {msg.role === 'user' ? (
                    <IconUser size={18} style={{ color: 'var(--tribos-text-secondary)' }} />
                  ) : (
                    <IconActivity size={18} style={{ color: 'white' }} />
                  )}
                </Box>
                <Box style={{ flex: 1 }}>
                  <Group gap="xs" mb={4}>
                    <Text size="xs" c="dimmed">
                      {msg.role === 'user' ? 'You' : PULSE_THEME.name}
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
                  backgroundColor: PULSE_THEME.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IconActivity size={18} style={{ color: 'white' }} />
              </Box>
              <Box style={{ padding: '8px 0' }}>
                <Loader size="sm" color="orange" type="dots" />
              </Box>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      {/* Input Area */}
      <Group gap="sm" mt="md">
        <TextInput
          placeholder="Message Pulse..."
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
                borderColor: PULSE_THEME.primary
              }
            }
          }}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          color="orange"
          onClick={() => sendMessage()}
          disabled={!inputMessage.trim() || isLoading}
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Card>
  );
}

export default Pulse;
