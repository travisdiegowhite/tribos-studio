import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  TextInput,
  Button,
  Stack,
  Group,
  Text,
  Divider,
  Portal,
  Transition,
  Kbd,
  UnstyledButton,
  ScrollArea,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconSparkles,
  IconSend,
  IconArrowRight,
  IconHistory,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

import { useCoachCommandBar } from './CoachCommandBarContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { sharedTokens } from '../../theme';

import CoachQuickActions from './CoachQuickActions';
import CoachRecentQuestions from './CoachRecentQuestions';
import CoachResponseArea from './CoachResponseArea';

// Get the API base URL
const getApiBaseUrl = () => '';

function CoachCommandBar({ trainingContext, onAddWorkout }) {
  const { isOpen, close, prefillQuery, clearPrefill } = useCoachCommandBar();
  const { user } = useAuth();
  const inputRef = useRef(null);
  const isMobile = useMediaQuery(`(max-width: ${sharedTokens.breakpoints.sm})`);

  // Local state
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [suggestedActions, setSuggestedActions] = useState([]);
  const [error, setError] = useState(null);
  const [recentQuestions, setRecentQuestions] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Load recent questions
  const loadRecentQuestions = useCallback(async () => {
    if (!user?.id) return;

    setLoadingRecent(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('coach_conversations')
        .select('id, message, timestamp')
        .eq('user_id', user.id)
        .eq('role', 'user')
        .order('timestamp', { ascending: false })
        .limit(10);

      if (fetchError) throw fetchError;

      // Deduplicate by message content and get unique questions
      const seen = new Set();
      const uniqueQuestions = (data || [])
        .filter((msg) => {
          const key = msg.message.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5)
        .map((msg) => ({
          id: msg.id,
          query: msg.message,
          timestamp: msg.timestamp,
        }));

      setRecentQuestions(uniqueQuestions);
    } catch (err) {
      console.error('Error loading recent questions:', err);
    } finally {
      setLoadingRecent(false);
    }
  }, [user?.id]);

  // Handle opening
  useEffect(() => {
    if (isOpen) {
      // Apply prefill query if present
      if (prefillQuery) {
        setQuery(prefillQuery);
        clearPrefill();
      }

      // Focus input after animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

      // Load recent questions
      loadRecentQuestions();
    } else {
      // Reset state when closing
      setQuery('');
      setResponse(null);
      setSuggestedActions([]);
      setError(null);
    }
  }, [isOpen, prefillQuery, clearPrefill, loadRecentQuestions]);

  // Submit query
  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResponse(null);
    setSuggestedActions([]);

    try {
      // Get user's local date
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

      const res = await fetch(`${getApiBaseUrl()}/api/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: query.trim(),
          conversationHistory: [],
          trainingContext: trainingContext,
          userLocalDate: userLocalDate,
          userId: user?.id,
          maxTokens: 1024, // Shorter responses for command bar
          quickMode: true, // Signal to API for concise responses
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await res.json();

      setResponse(data.message);

      // Map workout recommendations to suggested actions if present
      if (data.workoutRecommendations?.length > 0) {
        const workoutActions = data.workoutRecommendations.map((rec, idx) => ({
          id: `workout-${idx}`,
          label: `Add ${rec.workout_id} to calendar`,
          actionType: 'add_to_calendar',
          primary: idx === 0,
          payload: rec,
        }));
        setSuggestedActions(workoutActions);
      } else if (data.suggestedActions) {
        setSuggestedActions(data.suggestedActions);
      }

      // Save to conversation history
      await saveMessage('user', query.trim());
      await saveMessage('assistant', data.message, data.workoutRecommendations);
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to get coaching response');
    } finally {
      setIsLoading(false);
    }
  };

  // Save message to database
  const saveMessage = async (role, content, workoutRecommendations = null) => {
    if (!user?.id) return;

    try {
      const contextSnapshot = {
        coach_type: 'training',
        ...(workoutRecommendations && { workoutRecommendations }),
      };

      await supabase.from('coach_conversations').insert({
        user_id: user.id,
        role: role === 'assistant' ? 'coach' : role,
        message: content,
        message_type: 'chat',
        context_snapshot: contextSnapshot,
        coach_type: 'strategist',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Could not persist message:', err);
    }
  };

  // Handle action button clicks
  const handleActionClick = (action) => {
    if (action.actionType === 'add_to_calendar' && action.payload) {
      onAddWorkout?.(action.payload);
      notifications.show({
        title: 'Workout Added',
        message: `Added to your calendar`,
        color: 'lime',
      });
    }
    // Handle other action types as needed
  };

  // Handle keyboard
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle quick action / recent question selection
  const handleSelectQuery = (selectedQuery) => {
    setQuery(selectedQuery);
    inputRef.current?.focus();
  };

  // Show quick actions and recent only when there's no response
  const showSuggestions = !response && !isLoading && !error;

  return (
    <Portal>
      {/* Backdrop */}
      <Transition mounted={isOpen} transition="fade" duration={150}>
        {(styles) => (
          <Box
            style={{
              ...styles,
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(12px)',
              zIndex: 1000,
            }}
            onClick={close}
          />
        )}
      </Transition>

      {/* Command Bar */}
      <Transition
        mounted={isOpen}
        transition={isMobile ? 'slide-up' : 'pop'}
        duration={200}
      >
        {(styles) => (
          <Box
            style={{
              ...styles,
              position: 'fixed',
              left: isMobile ? 8 : '50%',
              right: isMobile ? 8 : 'auto',
              bottom: isMobile ? 8 : 'auto',
              top: isMobile ? 'auto' : '20%',
              transform: isMobile ? 'none' : 'translateX(-50%)',
              width: isMobile ? 'auto' : 'min(600px, calc(100vw - 32px))',
              maxHeight: isMobile ? '85vh' : '70vh',
              backgroundColor: 'var(--tribos-bg-secondary)',
              border: '1px solid var(--tribos-border)',
              borderRadius: 20,
              boxShadow:
                '0 24px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px rgba(50, 205, 50, 0.08)',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-command-bar-title"
          >
            {/* Hidden title for accessibility */}
            <Text id="coach-command-bar-title" style={{ display: 'none' }}>
              AI Coach Command Bar
            </Text>

            {/* Input Section */}
            <Box p="lg" pb="md">
              <Group gap="md" wrap="nowrap">
                <Box
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'var(--tribos-lime)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconSparkles size={20} color="#000" />
                </Box>

                <TextInput
                  ref={inputRef}
                  placeholder="Ask your coach anything..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  size="md"
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      backgroundColor: 'transparent',
                      border: 'none',
                      fontSize: 16,
                      '&:focus': {
                        border: 'none',
                        boxShadow: 'none',
                      },
                    },
                  }}
                />

                {query.trim() && (
                  <Button
                    size="sm"
                    color="lime"
                    onClick={handleSubmit}
                    loading={isLoading}
                    rightSection={<IconSend size={16} />}
                  >
                    Ask
                  </Button>
                )}
              </Group>
            </Box>

            <Divider color="var(--tribos-border)" />

            {/* Content Section */}
            <ScrollArea
              style={{ flex: 1 }}
              type="auto"
              offsetScrollbars
            >
              <Stack gap="lg" p="lg" pt="md">
                {/* Response Area */}
                <CoachResponseArea
                  isLoading={isLoading}
                  response={response}
                  actions={suggestedActions}
                  error={error}
                  onRetry={handleSubmit}
                  onActionClick={handleActionClick}
                />

                {/* Quick Actions - only show when no response */}
                {showSuggestions && (
                  <CoachQuickActions onSelect={handleSelectQuery} />
                )}

                {/* Recent Questions - only show when no response */}
                {showSuggestions && (
                  <CoachRecentQuestions
                    questions={recentQuestions}
                    onSelect={handleSelectQuery}
                    loading={loadingRecent}
                  />
                )}
              </Stack>
            </ScrollArea>

            {/* Footer */}
            <Divider color="var(--tribos-border)" />
            <Group
              justify="space-between"
              p="sm"
              px="lg"
              style={{
                backgroundColor: 'var(--tribos-bg-primary)',
              }}
            >
              <Group gap="lg">
                <Group gap={4}>
                  <Kbd size="xs">↵</Kbd>
                  <Text size="xs" c="dimmed">
                    to send
                  </Text>
                </Group>
                <Group gap={4}>
                  <Kbd size="xs">esc</Kbd>
                  <Text size="xs" c="dimmed">
                    to close
                  </Text>
                </Group>
              </Group>

              <UnstyledButton
                onClick={() => {
                  close();
                  // Could navigate to full history page
                }}
              >
                <Group gap={4}>
                  <Text size="xs" c="dimmed">
                    View full history
                  </Text>
                  <IconArrowRight size={12} style={{ color: 'var(--tribos-text-muted)' }} />
                </Group>
              </UnstyledButton>
            </Group>
          </Box>
        )}
      </Transition>
    </Portal>
  );
}

export default CoachCommandBar;
