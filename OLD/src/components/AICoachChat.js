/**
 * AI Coach Chat Component
 * Conversational interface for training coaching advice
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Paper,
  Stack,
  TextInput,
  Button,
  Text,
  ScrollArea,
  Group,
  ActionIcon,
  Loader,
  Badge,
  Card,
  Tooltip,
  Alert
} from '@mantine/core';
import {
  MessageCircle,
  Send,
  X,
  MinusCircle,
  Sparkles,
  TrendingUp,
  Activity,
  Map,
  Settings,
  Info,
  History
} from 'lucide-react';
import * as aiCoachOriginal from '../services/aiCoach';
import * as aiCoachOptimized from '../services/aiCoachOptimized';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import WorkoutRecommendationPanel from './WorkoutRecommendationPanel';
import { fetchActiveMessages, saveMessage } from '../services/coachHistory';
import CoachHistoryModal from './CoachHistoryModal';

// Feature flag: Use optimized AI coach
const USE_OPTIMIZED_COACH = process.env.REACT_APP_USE_OPTIMIZED_COACH === 'true';

// Select service based on feature flag
const aiCoach = USE_OPTIMIZED_COACH ? aiCoachOptimized : aiCoachOriginal;
const { sendCoachMessage, getQuickInsight, extractActions, detectMissedWorkoutRecommendations } = aiCoach;

export default function AICoachChat({ initialMessage = null, compact = false, onClose = null }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(!!initialMessage);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const scrollAreaRef = useRef(null);
  const inputRef = useRef(null);

  // Load conversation history on mount
  useEffect(() => {
    if (user?.id) {
      loadConversationHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Send initial message if provided
  useEffect(() => {
    if (initialMessage && messages.length === 0 && !isLoadingHistory) {
      setIsOpen(true); // Open the chat window
      handleSendMessage(initialMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, isLoadingHistory]);

  /**
   * Load conversation history from database
   */
  const loadConversationHistory = async () => {
    if (!user?.id) return;

    setIsLoadingHistory(true);
    try {
      const { data, error: fetchError } = await fetchActiveMessages(user.id);

      if (fetchError) {
        console.warn('Could not load conversation history (API may not be available yet):', fetchError);
        // Don't show error to user - history feature is optional
        // Chat will work fine without persisted history
        return;
      }

      // Convert database format to component format
      const formattedMessages = data.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
        actions: msg.actions || [],
        workoutRecommendations: msg.workout_recommendations || null,
        context: msg.training_context || null,
        id: msg.id // Store DB ID for deletion
      }));

      // Reverse to show oldest first (DB returns newest first)
      setMessages(formattedMessages.reverse());

      console.log(`✅ Loaded ${formattedMessages.length} messages from history`);

    } catch (error) {
      console.warn('Could not load conversation history:', error);
      // Don't block chat functionality if history API isn't available
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  /**
   * Send message to AI coach
   */
  const handleSendMessage = async (messageText = null) => {
    const messageToSend = messageText || inputValue.trim();

    if (!messageToSend) return;

    // Add user message to chat
    const userMessage = {
      role: 'user',
      content: messageToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      // Save user message to database
      const { data: savedUserMessage, error: saveError } = await saveMessage({
        userId: user.id,
        role: 'user',
        content: messageToSend
      });

      if (saveError) {
        console.warn('Failed to save user message to history:', saveError);
        // Continue anyway - don't block the conversation
      } else if (savedUserMessage) {
        // Update message with DB ID for potential deletion
        setMessages(prev => prev.map(msg =>
          msg === userMessage ? { ...msg, id: savedUserMessage.id } : msg
        ));
      }

      // Build conversation history (last 10 messages for context)
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Get response from AI coach
      const response = await sendCoachMessage(user.id, messageToSend, conversationHistory);

      // Extract actions from text response
      const textActions = extractActions(response.message);

      // If there are workout recommendations, always add "View Workouts" action
      // (unless it's already in the actions from text parsing)
      const actions = [...textActions];
      if (response.workoutRecommendations && response.workoutRecommendations.length > 0) {
        const hasViewWorkoutsAction = actions.some(a => a.type === 'view_workouts');
        if (!hasViewWorkoutsAction) {
          actions.push({
            type: 'view_workouts',
            label: 'View Calendar',
            icon: 'Activity'
          });
        }
      }

      // Check if AI missed using the workout tool
      const missedToolUse = detectMissedWorkoutRecommendations(
        response.message,
        response.workoutRecommendations
      );

      // Log optimization metadata if available
      if (response.metadata) {
        console.log('🚀 AI Coach Optimization Metrics:', {
          optimizedCoach: USE_OPTIMIZED_COACH,
          modelUsed: response.metadata.modelUsed,
          modelReason: response.metadata.modelReason,
          responseTime: `${response.metadata.responseTimeMs}ms`,
          cacheHit: response.metadata.cacheHit,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          cachedTokens: response.usage?.cache_read_input_tokens || 0,
          estimatedSavings: response.metadata.estimatedTokensSaved
        });
      }

      // Add assistant message to chat
      const assistantMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        actions: actions,
        workoutRecommendations: response.workoutRecommendations || null,
        context: response.context, // Store context for debugging
        missedToolUse: missedToolUse, // Flag for showing warning
        metadata: response.metadata // Store optimization metadata
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to database
      const { data: savedAssistantMessage, error: saveMsgError } = await saveMessage({
        userId: user.id,
        role: 'assistant',
        content: response.message,
        workoutRecommendations: response.workoutRecommendations || null,
        actions: actions,
        trainingContext: response.context || null
      });

      if (saveMsgError) {
        console.warn('Failed to save assistant message to history:', saveMsgError);
      } else if (savedAssistantMessage) {
        // Update message with DB ID
        setMessages(prev => prev.map(msg =>
          msg === assistantMessage ? { ...msg, id: savedAssistantMessage.id } : msg
        ));
      }

    } catch (err) {
      console.error('Error sending message to coach:', err);
      setError('Failed to get response from coach. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle quick insight buttons
   */
  const handleQuickInsight = async (topic) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getQuickInsight(user.id, topic);

      // Add both user request and assistant response
      const userMessage = {
        role: 'user',
        content: getQuickInsightLabel(topic),
        timestamp: new Date(),
        isQuickInsight: true
      };

      const assistantMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        actions: extractActions(response.message)
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setIsOpen(true);

      // Save both messages to database
      await saveMessage({
        userId: user.id,
        role: 'user',
        content: getQuickInsightLabel(topic)
      });

      await saveMessage({
        userId: user.id,
        role: 'assistant',
        content: response.message,
        actions: extractActions(response.message)
      });

    } catch (err) {
      console.error('Error getting quick insight:', err);
      setError('Failed to get insight. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Get label for quick insight topic
   */
  const getQuickInsightLabel = (topic) => {
    const labels = {
      tsb: 'Explain my TSB',
      workout_today: 'What should I ride today?',
      recovery: 'Do I need more recovery?',
      route: 'Suggest a route for me',
      progress: 'How is my training progressing?',
      metrics: 'Explain my training metrics'
    };
    return labels[topic] || topic;
  };

  /**
   * Handle action button click
   */
  const handleAction = (action) => {
    switch (action.type) {
      case 'generate_route':
        // Navigate to route generator with coach context
        navigate('/smart-route-planner?source=coach');
        break;
      case 'view_workouts':
        navigate('/training?tab=calendar');
        break;
      case 'adjust_plan':
        navigate('/training?tab=overview');
        break;
      default:
        console.log('Unknown action:', action);
    }
  };

  /**
   * Handle applying a workout recommendation
   */
  const handleApplyWorkout = async (recommendation, messageIndex) => {
    try {
      // Call API to add workout to calendar
      const response = await fetch('/api/apply-ai-workout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          athleteId: user.id,
          recommendation: recommendation
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to add workout');
      }

      // Success - remove from message recommendations
      setMessages(prev => prev.map((msg, idx) => {
        if (idx === messageIndex && msg.workoutRecommendations) {
          return {
            ...msg,
            workoutRecommendations: msg.workoutRecommendations.filter(
              rec => rec.id !== recommendation.id
            )
          };
        }
        return msg;
      }));

      // Add success message to chat
      const successMessage = {
        role: 'assistant',
        content: `Workout added to your calendar for ${recommendation.scheduled_date}!`,
        timestamp: new Date(),
        isSystemMessage: true
      };
      setMessages(prev => [...prev, successMessage]);

    } catch (err) {
      console.error('Error applying workout:', err);
      setError(err.message || 'Failed to add workout to calendar. Please try again.');
    }
  };

  /**
   * Handle dismissing a workout recommendation
   */
  const handleDismissWorkout = (recommendation, messageIndex) => {
    setMessages(prev => prev.map((msg, idx) => {
      if (idx === messageIndex && msg.workoutRecommendations) {
        return {
          ...msg,
          workoutRecommendations: msg.workoutRecommendations.filter(
            rec => rec.id !== recommendation.id
          )
        };
      }
      return msg;
    }));
  };


  // Compact mode (just floating button)
  if (!isOpen && compact) {
    return (
      <Tooltip label="Ask your AI coach" position="left">
        <ActionIcon
          size="xl"
          radius="xl"
          variant="gradient"
          gradient={{ from: 'blue', to: 'cyan', deg: 45 }}
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000
          }}
        >
          <Sparkles size={24} />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Paper
      shadow="lg"
      radius="md"
      style={{
        position: compact ? 'fixed' : 'relative',
        bottom: compact ? 24 : 0,
        right: compact ? 24 : 0,
        width: compact ? 420 : '100%',
        height: compact ? 600 : 500,
        display: 'flex',
        flexDirection: 'column',
        zIndex: compact ? 999 : 1,
        border: '1px solid #32CD32',
        backgroundColor: '#1e293b'
      }}
    >
      {/* Header */}
      <Group
        position="apart"
        px="md"
        py="sm"
        style={{
          borderBottom: '1px solid #32CD32',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
          color: '#E8E8E8'
        }}
      >
        <Group spacing="xs">
          <Sparkles size={20} />
          <Text weight={600} size="sm">
            AI Training Coach
          </Text>
          <Badge size="xs" color="yellow" variant="filled">
            BETA v2
          </Badge>
        </Group>

        <Group spacing={4}>
          {console.log('🔍 Rendering History button')}
          <Tooltip label="View History">
            <ActionIcon onClick={() => setShowHistoryModal(true)} color="white" variant="subtle">
              <History size={18} />
            </ActionIcon>
          </Tooltip>

          {compact && (
            <>
              <Tooltip label="Minimize">
                <ActionIcon onClick={() => setIsOpen(false)} color="white" variant="subtle">
                  <MinusCircle size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Close">
                <ActionIcon onClick={onClose || (() => setIsOpen(false))} color="white" variant="subtle">
                  <X size={18} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {/* History Modal */}
      <CoachHistoryModal
        opened={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />

      {/* Quick Actions (shown when no messages) */}
      {messages.length === 0 && !isLoading && (
        <Stack p="md" spacing="xs" style={{ flex: 0 }}>
          <Text size="xs" c="#94a3b8" mb={4}>
            Quick insights:
          </Text>
          <Group spacing="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<TrendingUp size={14} />}
              onClick={() => handleQuickInsight('workout_today')}
            >
              What should I ride?
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<Activity size={14} />}
              onClick={() => handleQuickInsight('tsb')}
            >
              Explain my form
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<Info size={14} />}
              onClick={() => handleQuickInsight('progress')}
            >
              Training progress
            </Button>
          </Group>
        </Stack>
      )}

      {/* Messages */}
      <ScrollArea
        style={{ flex: 1 }}
        viewportRef={scrollAreaRef}
        p="md"
      >
        <Stack spacing="md">
          {isLoadingHistory && (
            <Group spacing="xs" style={{ opacity: 0.7 }}>
              <Loader size="xs" />
              <Text size="sm" color="dimmed">
                Loading conversation history...
              </Text>
            </Group>
          )}

          {messages.map((message, index) => (
            <Message
              key={index}
              message={message}
              messageIndex={index}
              onAction={handleAction}
              onApplyWorkout={handleApplyWorkout}
              onDismissWorkout={handleDismissWorkout}
            />
          ))}

          {isLoading && (
            <Group spacing="xs" style={{ opacity: 0.7 }}>
              <Loader size="xs" />
              <Text size="sm" color="dimmed">
                Coach is thinking...
              </Text>
            </Group>
          )}

          {error && (
            <Alert color="red" title="Error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      </ScrollArea>

      {/* Input */}
      <Group
        spacing="xs"
        px="md"
        py="sm"
        style={{ borderTop: '1px solid #32CD32', backgroundColor: '#0f172a' }}
      >
        <TextInput
          ref={inputRef}
          placeholder="Ask your coach anything..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={isLoading}
          style={{ flex: 1 }}
          size="sm"
          styles={{
            input: {
              backgroundColor: '#1e293b',
              borderColor: '#475569',
              color: '#E8E8E8',
              '&:focus': {
                borderColor: '#32CD32',
              },
            },
          }}
        />
        <ActionIcon
          color="green"
          variant="filled"
          onClick={() => handleSendMessage()}
          disabled={isLoading || !inputValue.trim()}
          size="lg"
        >
          <Send size={18} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}

/**
 * Message component (user or assistant)
 */
function Message({ message, messageIndex, onAction, onApplyWorkout, onDismissWorkout }) {
  const isUser = message.role === 'user';

  return (
    <Group
      position={isUser ? 'right' : 'left'}
      align="flex-start"
      spacing="xs"
      style={{ width: '100%' }}
    >
      {!isUser && (
        <ActionIcon
          size="sm"
          radius="xl"
          variant="light"
          color="violet"
          style={{ marginTop: 4 }}
        >
          <Sparkles size={14} />
        </ActionIcon>
      )}

      <Stack spacing={8} style={{ maxWidth: '80%', flex: 1 }}>
        <Card
          shadow="xs"
          radius="md"
          p="sm"
          style={{
            background: isUser ? '#1e3a5f' : '#475569',
            border: isUser ? '1px solid #32CD32' : '1px solid #64748b'
          }}
        >
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', color: '#E8E8E8' }}>
            {message.content}
          </Text>
        </Card>

        {/* Workout recommendations (assistant messages only) */}
        {!isUser && message.workoutRecommendations && message.workoutRecommendations.length > 0 && (
          <WorkoutRecommendationPanel
            recommendations={message.workoutRecommendations}
            onApply={(rec) => onApplyWorkout(rec, messageIndex)}
            onDismiss={(rec) => onDismissWorkout(rec, messageIndex)}
          />
        )}

        {/* Missed tool use warning (assistant messages only) */}
        {!isUser && message.missedToolUse && (
          <Alert color="orange" icon={<Info size={16} />} styles={{
            root: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: '#f59e0b' },
            message: { color: '#fbbf24', fontSize: '12px' }
          }}>
            <Text size="xs">
              The coach described workouts but didn't add them to your calendar.
              Try asking: <strong>"Add those workouts to my calendar"</strong>
            </Text>
          </Alert>
        )}

        {/* Action buttons (assistant messages only) */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <Group spacing={4}>
            {message.actions.map((action, idx) => (
              <Button
                key={idx}
                size="xs"
                variant="light"
                leftSection={getActionIcon(action.icon)}
                onClick={() => onAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </Group>
        )}

        <Text size="xs" c="#94a3b8">
          {formatTime(message.timestamp)}
        </Text>
      </Stack>

      {isUser && (
        <ActionIcon
          size="sm"
          radius="xl"
          variant="light"
          style={{ marginTop: 4 }}
        >
          <MessageCircle size={14} />
        </ActionIcon>
      )}
    </Group>
  );
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();

  // If today, show time only
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // Otherwise show date and time
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Get icon component from string name
 */
function getActionIcon(iconName) {
  const icons = {
    Map: Map,
    Activity: Activity,
    Settings: Settings
  };
  const IconComponent = icons[iconName] || Activity;
  return <IconComponent size={14} />;
}
