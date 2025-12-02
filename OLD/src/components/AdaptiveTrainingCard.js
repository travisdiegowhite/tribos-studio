import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Text,
  Group,
  Button,
  Badge,
  Alert,
  Collapse,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  X,
  Calendar,
  Check,
  Info
} from 'lucide-react';
import {
  getPendingAdaptations,
  respondToAdaptation,
  getAdaptationTypeLabel,
  getAdaptationTypeColor
} from '../services/adaptiveTraining';
import { notifications } from '@mantine/notifications';

export default function AdaptiveTrainingCard({ user, onAdaptationResponded }) {
  const [adaptations, setAdaptations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [responding, setResponding] = useState(null); // ID of adaptation being responded to

  useEffect(() => {
    if (user?.id) {
      loadPendingAdaptations();
    }
  }, [user]);

  const loadPendingAdaptations = async () => {
    setLoading(true);
    try {
      const data = await getPendingAdaptations(user.id);
      setAdaptations(data);
    } catch (error) {
      console.error('Error loading pending adaptations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (adaptationId, accept, feedback = null) => {
    setResponding(adaptationId);
    try {
      await respondToAdaptation(adaptationId, accept, feedback);

      notifications.show({
        title: accept ? 'Adaptation Accepted' : 'Adaptation Rejected',
        message: accept ? 'Workout has been updated' : 'Workout will remain unchanged',
        color: accept ? 'green' : 'gray'
      });

      // Remove from list
      setAdaptations(prev => prev.filter(a => a.id !== adaptationId));

      if (onAdaptationResponded) onAdaptationResponded();
    } catch (error) {
      console.error('Error responding to adaptation:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to process response',
        color: 'red'
      });
    } finally {
      setResponding(null);
    }
  };

  const getAdaptationIcon = (adaptationType) => {
    switch (adaptationType) {
      case 'increase':
        return <TrendingUp size={16} />;
      case 'decrease':
        return <TrendingDown size={16} />;
      case 'substitute':
        return <RefreshCw size={16} />;
      case 'skip':
        return <X size={16} />;
      case 'reschedule':
        return <Calendar size={16} />;
      default:
        return <Info size={16} />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const formatReason = (reason) => {
    if (!reason) return 'No reason provided';
    if (reason.length > 150) {
      return reason.substring(0, 147) + '...';
    }
    return reason;
  };

  if (loading) {
    return null; // Don't show while loading
  }

  if (adaptations.length === 0) {
    return null; // Don't show if no pending adaptations
  }

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Brain size={20} />
            <Text fw={600}>Adaptive Training Suggestions</Text>
            <Badge color="blue" variant="light">
              {adaptations.length}
            </Badge>
          </Group>
          <ActionIcon
            variant="subtle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </ActionIcon>
        </Group>

        <Collapse in={expanded}>
          <Stack gap="sm">
            {adaptations.map((adaptation) => {
              const workout = adaptation.planned_workouts;
              const adaptationType = adaptation.adaptation_type;
              const color = getAdaptationTypeColor(adaptationType);

              return (
                <Card
                  key={adaptation.id}
                  withBorder
                  p="md"
                  style={{
                    borderLeft: `4px solid var(--mantine-color-${color}-6)`
                  }}
                >
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Badge color={color} variant="light" leftSection={getAdaptationIcon(adaptationType)}>
                          {getAdaptationTypeLabel(adaptationType)}
                        </Badge>
                        {workout && (
                          <Text size="sm" fw={600}>
                            {workout.workout_name || workout.workout_type}
                          </Text>
                        )}
                      </Group>
                      {workout?.workout_date && (
                        <Text size="sm" c="dimmed">
                          {formatDate(workout.workout_date)}
                        </Text>
                      )}
                    </Group>

                    {(adaptation.old_workout_level || adaptation.new_workout_level) && (
                      <Group gap="md">
                        {adaptation.old_workout_level && (
                          <div>
                            <Text size="xs" c="dimmed">
                              Current Level
                            </Text>
                            <Text size="sm" fw={600}>
                              {adaptation.old_workout_level.toFixed(1)}
                            </Text>
                          </div>
                        )}
                        {adaptation.new_workout_level && (
                          <>
                            <Text c="dimmed">→</Text>
                            <div>
                              <Text size="xs" c="dimmed">
                                Suggested Level
                              </Text>
                              <Text size="sm" fw={600} c={color}>
                                {adaptation.new_workout_level.toFixed(1)}
                              </Text>
                            </div>
                          </>
                        )}
                        {adaptation.level_change && (
                          <div>
                            <Text size="xs" c="dimmed">
                              Change
                            </Text>
                            <Text size="sm" fw={600} c={color}>
                              {adaptation.level_change > 0 ? '+' : ''}
                              {adaptation.level_change.toFixed(1)}
                            </Text>
                          </div>
                        )}
                      </Group>
                    )}

                    <Alert
                      icon={<Info size={14} />}
                      color={color}
                      variant="light"
                      p="xs"
                    >
                      <Text size="xs">{formatReason(adaptation.reason)}</Text>
                    </Alert>

                    {adaptation.tsb_value && (
                      <Group gap="md">
                        <Tooltip label="Training Stress Balance">
                          <Text size="xs" c="dimmed">
                            TSB: <strong>{adaptation.tsb_value.toFixed(1)}</strong>
                          </Text>
                        </Tooltip>
                        {adaptation.recent_completion_rate && (
                          <Tooltip label="Recent workout completion rate">
                            <Text size="xs" c="dimmed">
                              Completion: <strong>{adaptation.recent_completion_rate.toFixed(0)}%</strong>
                            </Text>
                          </Tooltip>
                        )}
                        {adaptation.recent_avg_rpe && (
                          <Tooltip label="Recent average RPE">
                            <Text size="xs" c="dimmed">
                              Avg RPE: <strong>{adaptation.recent_avg_rpe.toFixed(1)}</strong>
                            </Text>
                          </Tooltip>
                        )}
                      </Group>
                    )}

                    <Group justify="flex-end" mt="xs">
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => handleRespond(adaptation.id, false)}
                        loading={responding === adaptation.id}
                        leftSection={<X size={14} />}
                      >
                        Ignore
                      </Button>
                      <Button
                        size="xs"
                        color={color}
                        onClick={() => handleRespond(adaptation.id, true)}
                        loading={responding === adaptation.id}
                        leftSection={<Check size={14} />}
                      >
                        Accept
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}
