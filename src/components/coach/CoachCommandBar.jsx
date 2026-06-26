import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActionIcon,
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
  Alert,
  Anchor,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';

import { useCoachCommandBar } from './CoachCommandBarContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { sharedTokens } from '../../theme';
import { scheduleCoachWorkout } from '../../utils/coachWorkoutScheduler';

import CoachQuickActions from './CoachQuickActions';
import CoachRecentQuestions from './CoachRecentQuestions';
import CoachResponseArea from './CoachResponseArea';
import { CoachReply } from './CoachReply';
import { activateTrainingPlan } from '../../utils/coachPlanActivation';
import { ArrowRight, ClockCounterClockwise, PaperPlaneRight, ShieldCheck, Sparkle, X } from '@phosphor-icons/react';

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
  const [conversationHistory, setConversationHistory] = useState([]);
  const [trainingPlanPreview, setTrainingPlanPreview] = useState(null);
  const [anchoredPlanPreview, setAnchoredPlanPreview] = useState(null);
  const [aiConsentStatus, setAiConsentStatus] = useState(null); // null=loading, true=granted, false=not granted
  const [consentGranting, setConsentGranting] = useState(false);

  // Load conversation history for AI memory
  const loadConversationHistory = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('coach_conversations')
        .select('role, message, timestamp')
        .eq('user_id', user.id)
        .in('role', ['user', 'coach'])
        .order('timestamp', { ascending: false })
        .limit(20);

      if (fetchError) throw fetchError;

      // Reverse to chronological order and map to API format
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
  }, [user?.id]);

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

  // Check AI consent status on open
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    supabase
      .from('user_profiles')
      .select('ai_consent_granted_at, ai_consent_withdrawn_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setAiConsentStatus(!!data?.ai_consent_granted_at && !data?.ai_consent_withdrawn_at);
      })
      .catch(() => setAiConsentStatus(false));
  }, [isOpen, user?.id]);

  // Grant AI consent inline
  const grantAiConsent = async () => {
    setConsentGranting(true);
    try {
      await supabase
        .from('user_profiles')
        .update({ ai_consent_granted_at: new Date().toISOString(), ai_consent_withdrawn_at: null })
        .eq('id', user.id);
      setAiConsentStatus(true);
    } catch (err) {
      console.error('Error granting AI consent:', err);
    } finally {
      setConsentGranting(false);
    }
  };

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

      // Load recent questions and conversation history
      loadRecentQuestions();
      loadConversationHistory();
    } else {
      // Reset state when closing
      setQuery('');
      setResponse(null);
      setSuggestedActions([]);
      setError(null);
      setTrainingPlanPreview(null);
    }
  }, [isOpen, prefillQuery, clearPrefill, loadRecentQuestions, loadConversationHistory]);

  // Submit query
  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;
    if (!aiConsentStatus) return; // Consent required

    setIsLoading(true);
    setError(null);
    setResponse(null);
    setSuggestedActions([]);
    setTrainingPlanPreview(null);

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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${getApiBaseUrl()}/api/coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
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
      // Event-anchored (sequencer) plan preview — confirm to anchor.
      if (data.anchoredPlanPreview && data.anchoredPlanPreview.ok !== false) {
        setAnchoredPlanPreview(data.anchoredPlanPreview);
      }

      // Map workout recommendations to suggested actions if present. recommend_workout
      // now persists server-side (rec.added), so those are already on the calendar —
      // surface only any not-yet-added recs as "Add" buttons; the rest are confirmed
      // by the coach's reply text.
      const recs = data.workoutRecommendations || [];
      const pendingRecs = recs.filter((rec) => !rec.added);
      if (pendingRecs.length > 0) {
        const workoutActions = pendingRecs.map((rec, idx) => ({
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

      // If the coach adjusted the schedule OR auto-added a workout server-side, notify
      // the dashboard/planner to refresh.
      if (data.scheduleAdjusted || recs.some((rec) => rec.added)) {
        window.dispatchEvent(new CustomEvent('training-plan-updated'));
      }

      // Update in-session conversation history. Thread the recommended workout(s) into
      // the assistant turn so a follow-up like "add that to the calendar" can resolve the
      // reference and the coach re-emits the right workout card.
      const recsNote = data.workoutRecommendations?.length > 0
        ? `\n\n[Workouts you just recommended: ${data.workoutRecommendations
            .map((r) => `${r.name || r.workout_id} (workout_id: ${r.workout_id}${r.scheduled_date ? `, date: ${r.scheduled_date}` : ''})`)
            .join('; ')}]`
        : '';
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: query.trim() },
        { role: 'assistant', content: data.message + recsNote },
      ]);

      // Save to conversation history in DB
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

  // Handle plan activation from AI preview
  const handleActivatePlan = useCallback(async (planData) => {
    if (!user?.id) return;

    const result = await activateTrainingPlan(supabase, {
      userId: user.id,
      plan: planData,
    });

    if (!result.success) {
      notifications.show({
        title: 'Error',
        message: result.error || 'Failed to activate training plan. Please try again.',
        color: 'red',
      });
      return;
    }

    notifications.show({
      title: 'Training Plan Activated',
      message: `${result.planName} — ${result.workoutCount} workouts added to your calendar`,
      color: 'sage',
    });

    setTrainingPlanPreview(null);

    // Dispatch event so dashboard reloads plan + calendar without page refresh
    window.dispatchEvent(new CustomEvent('training-plan-activated', {
      detail: { planId: result.planId },
    }));

    onAddWorkout?.({ _planActivated: true, planId: result.planId });
  }, [user?.id, onAddWorkout]);

  // Handle action button clicks (direct DB writes — CoachCommandBar is a global modal with no parent callbacks)
  const handleActionClick = async (action) => {
    if (action.actionType === 'add_to_calendar' && action.payload) {
      const result = await scheduleCoachWorkout(supabase, {
        userId: user.id,
        recommendation: action.payload,
      });

      if (!result.success) {
        notifications.show({
          title: 'Error',
          message: result.error || 'Failed to add workout to calendar. Please try again.',
          color: 'red',
        });
        return;
      }

      notifications.show({
        title: result.replaced ? 'Workout Replaced' : 'Workout Added',
        message: result.replaced
          ? `${result.workoutName} replaced ${result.replacedName} on ${result.scheduledDate}`
          : `${result.workoutName} added to your calendar for ${result.scheduledDate}`,
        color: 'sage',
      });

      // Notify dashboard to refresh
      window.dispatchEvent(new CustomEvent('training-plan-updated'));
    }
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
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--tribos-border)',
              borderRadius: 20,
              boxShadow:
                '0 24px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px rgba(158, 90, 60, 0.08)',
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
              Coach Command Bar
            </Text>

            {/* Input Section */}
            <Box p="lg" pb="md">
              <Group gap="md" wrap="nowrap">
                <Box
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'var(--color-teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Sparkle size={20} color="#000" />
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
                    color="teal"
                    onClick={handleSubmit}
                    loading={isLoading}
                    rightSection={<PaperPlaneRight size={16} />}
                  >
                    Ask
                  </Button>
                )}

                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={close}
                  aria-label="Close coach"
                  style={{ flexShrink: 0 }}
                >
                  <X size={18} />
                </ActionIcon>
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
                {/* AI Consent Prompt */}
                {aiConsentStatus === false && (
                  <Alert
                    variant="light"
                    color="teal"
                    icon={<ShieldCheck size={20} />}
                    title="Enable Coach"
                  >
                    <Stack gap="sm">
                      <Text size="sm">
                        Coach uses smart analysis to review your training data and provide
                        personalized insights. Your activity summaries and fitness profile are processed
                        securely — raw GPS data and personal info are not shared.
                      </Text>
                      <Text size="sm">
                        See our{' '}
                        <Anchor component={Link} to="/privacy#ai" onClick={close} style={{ color: 'var(--color-teal)' }}>
                          Privacy Policy
                        </Anchor>{' '}
                        for full details. You can disable smart features anytime in Settings.
                      </Text>
                      <Group gap="sm">
                        <Button
                          size="sm"
                          color="teal"
                          loading={consentGranting}
                          onClick={grantAiConsent}
                        >
                          Enable Coach
                        </Button>
                        <Button size="sm" variant="subtle" color="gray" onClick={close}>
                          Not Now
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                )}

                {/* Response Area */}
                <CoachResponseArea
                  isLoading={isLoading}
                  response={response}
                  actions={suggestedActions}
                  error={error}
                  onRetry={handleSubmit}
                  onActionClick={handleActionClick}
                />

                {/* Training Plan Preview (shared renderer, inline) */}
                {trainingPlanPreview && (
                  <CoachReply
                    showMessage={false}
                    trainingPlanPreview={trainingPlanPreview}
                    planDisplay="inline"
                    onActivatePlan={handleActivatePlan}
                    onDismissPlan={() => setTrainingPlanPreview(null)}
                  />
                )}

                {/* Event-anchored (sequencer) plan preview (shared renderer, inline) */}
                {anchoredPlanPreview && (
                  <CoachReply
                    showMessage={false}
                    anchoredPlanPreview={anchoredPlanPreview}
                    planDisplay="inline"
                    onDismissAnchored={() => setAnchoredPlanPreview(null)}
                  />
                )}

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
                backgroundColor: 'var(--color-bg)',
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
                  <ArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
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
