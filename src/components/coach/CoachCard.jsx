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

// Generate proactive suggestion based on training context
function getProactiveSuggestion(trainingContext) {
  if (!trainingContext) {
    return {
      message: "Ready to help with your training. Ask me anything!",
      workout: null,
    };
  }

  // Parse TSB from context if available
  const tsbMatch = trainingContext.match(/TSB[:\s]+(-?\d+)/i);
  const tsb = tsbMatch ? parseInt(tsbMatch[1], 10) : 0;

  // Parse CTL if available
  const ctlMatch = trainingContext.match(/CTL[:\s]+(\d+)/i);
  const ctl = ctlMatch ? parseInt(ctlMatch[1], 10) : 50;

  if (tsb > 15) {
    return {
      message: "You're well-rested. Great day for a hard interval session or threshold work.",
      workout: { workout_id: 'three_by_ten_sst', name: 'Sweet Spot Intervals', scheduled_date: 'today' },
    };
  } else if (tsb > 5) {
    return {
      message: "Good form today. Consider a tempo ride to maintain fitness.",
      workout: { workout_id: 'tempo_30', name: 'Tempo Ride', scheduled_date: 'today' },
    };
  } else if (tsb > -10) {
    return {
      message: "Balanced fatigue. An endurance ride would build aerobic base without overreaching.",
      workout: { workout_id: 'endurance_90', name: 'Endurance Ride', scheduled_date: 'today' },
    };
  } else if (tsb > -20) {
    return {
      message: "Accumulated fatigue detected. A recovery spin will help you absorb recent training.",
      workout: { workout_id: 'recovery_spin', name: 'Recovery Spin', scheduled_date: 'today' },
    };
  } else {
    return {
      message: "High fatigue - consider a rest day or very easy spin to avoid overtraining.",
      workout: { workout_id: 'recovery_spin', name: 'Easy Recovery', scheduled_date: 'today' },
    };
  }
}

function CoachCard({ trainingContext, onAddWorkout, compact = false }) {
  const { user } = useAuth();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [responseActions, setResponseActions] = useState([]);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Get proactive suggestion
  const suggestion = getProactiveSuggestion(trainingContext);

  // Reset response when component unmounts or context changes significantly
  useEffect(() => {
    setResponse(null);
    setResponseActions([]);
    setError(null);
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
          conversationHistory: [],
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderColor: 'var(--tribos-border)',
      }}
    >
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size="sm" color="lime" variant="light" radius="md">
              <IconSparkles size={14} />
            </ThemeIcon>
            <Text fw={600} size="sm">AI Coach</Text>
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

        {/* Proactive Suggestion - show when no response */}
        {!response && !isLoading && !error && (
          <Box>
            <Text size="sm" c="dimmed" mb="xs">
              {suggestion.message}
            </Text>
            {suggestion.workout && (
              <Button
                size="xs"
                variant="light"
                color="lime"
                leftSection={<IconCalendarPlus size={14} />}
                onClick={() => handleAddWorkout(suggestion.workout)}
              >
                Add {suggestion.workout.name}
              </Button>
            )}
          </Box>
        )}

        {/* Loading State */}
        {isLoading && (
          <Group gap="xs">
            <Loader size="xs" color="lime" />
            <Text size="sm" c="dimmed">Thinking...</Text>
          </Group>
        )}

        {/* Response Area */}
        <Collapse in={expanded && (response || error)}>
          {error ? (
            <Paper p="sm" style={{ backgroundColor: 'rgba(255, 68, 68, 0.1)' }}>
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
            <Paper p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
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
            </Paper>
          ) : null}
        </Collapse>

        {/* Input */}
        <Group gap="xs">
          <TextInput
            ref={inputRef}
            placeholder="Ask something else..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            size="sm"
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: 'var(--tribos-bg-tertiary)',
                borderColor: 'var(--tribos-border)',
                '&:focus': {
                  borderColor: 'var(--tribos-lime)',
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
