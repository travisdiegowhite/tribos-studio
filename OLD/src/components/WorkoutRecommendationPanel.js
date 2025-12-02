import React from 'react';
import { Card, Stack, Group, Text, Button, ActionIcon, Badge, Tooltip } from '@mantine/core';
import { Calendar, Clock, Zap, X, Info } from 'lucide-react';
import { WORKOUT_LIBRARY } from '../data/workoutLibrary';

/**
 * Displays AI-recommended workouts with actions to add them to training calendar
 * @param {Array} recommendations - Array of workout recommendations from AI
 * @param {Function} onApply - Callback when user applies a workout
 * @param {Function} onDismiss - Callback when user dismisses a recommendation
 */
export default function WorkoutRecommendationPanel({ recommendations, onApply, onDismiss }) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'red';
      case 'medium':
        return 'yellow';
      case 'low':
        return 'gray';
      default:
        return 'blue';
    }
  };

  const formatScheduledDate = (dateStr) => {
    if (!dateStr) return 'Unscheduled';

    // Handle relative dates
    const relativeDates = {
      'today': 'Today',
      'tomorrow': 'Tomorrow',
      'this_monday': 'This Monday',
      'this_tuesday': 'This Tuesday',
      'this_wednesday': 'This Wednesday',
      'this_thursday': 'This Thursday',
      'this_friday': 'This Friday',
      'this_saturday': 'This Saturday',
      'this_sunday': 'This Sunday',
      'next_monday': 'Next Monday',
      'next_tuesday': 'Next Tuesday',
      'next_wednesday': 'Next Wednesday',
      'next_thursday': 'Next Thursday',
      'next_friday': 'Next Friday',
      'next_saturday': 'Next Saturday',
      'next_sunday': 'Next Sunday',
    };

    if (relativeDates[dateStr.toLowerCase()]) {
      return relativeDates[dateStr.toLowerCase()];
    }

    // Try to parse as date
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <Card
      p="md"
      withBorder
      style={{
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: '#10b981',
        borderWidth: '2px',
      }}
    >
      <Stack spacing="sm">
        <Group position="apart">
          <Group spacing="xs">
            <Zap size={18} color="#10b981" />
            <Text size="sm" weight={600} c="#10b981">
              Recommended Workouts
            </Text>
          </Group>
          <Badge size="sm" variant="filled" color="teal">
            {recommendations.length} {recommendations.length === 1 ? 'workout' : 'workouts'}
          </Badge>
        </Group>

        {recommendations.map((rec, index) => {
          const template = WORKOUT_LIBRARY[rec.workout_id];

          if (!template) {
            console.warn(`Workout template not found: ${rec.workout_id}`);
            return null;
          }

          const targetTSS = rec.modifications?.target_tss || template.targetTSS;
          const duration = rec.modifications?.duration || template.duration;

          return (
            <Card
              key={rec.id || index}
              p="sm"
              withBorder
              style={{
                backgroundColor: '#1a1b1e',
                borderColor: '#373A40',
              }}
            >
              <Stack spacing="xs">
                <Group position="apart" align="flex-start">
                  <div style={{ flex: 1 }}>
                    <Group spacing="xs" mb={4}>
                      <Text weight={500} size="sm">
                        {template.name}
                      </Text>
                      {rec.priority && (
                        <Badge
                          size="xs"
                          color={getPriorityColor(rec.priority)}
                          variant="filled"
                        >
                          {rec.priority}
                        </Badge>
                      )}
                    </Group>

                    <Group spacing="md" mb={8}>
                      <Group spacing={4}>
                        <Calendar size={14} />
                        <Text size="xs" c="dimmed">
                          {formatScheduledDate(rec.scheduled_date)}
                        </Text>
                      </Group>
                      <Group spacing={4}>
                        <Clock size={14} />
                        <Text size="xs" c="dimmed">
                          {duration} min
                        </Text>
                      </Group>
                      <Group spacing={4}>
                        <Zap size={14} />
                        <Text size="xs" c="dimmed">
                          {targetTSS} TSS
                        </Text>
                      </Group>
                    </Group>

                    {rec.reason && (
                      <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                        {rec.reason}
                      </Text>
                    )}
                  </div>

                  <Tooltip label="Dismiss">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() => onDismiss && onDismiss(rec)}
                    >
                      <X size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Group spacing="xs" mt={4}>
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    onClick={() => onApply(rec)}
                    leftSection={<Calendar size={14} />}
                  >
                    Add to Calendar
                  </Button>
                  <Tooltip label={template.description}>
                    <ActionIcon size="xs" variant="subtle">
                      <Info size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Card>
  );
}
