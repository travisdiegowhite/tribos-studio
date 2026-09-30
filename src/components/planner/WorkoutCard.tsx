/**
 * WorkoutCard Component
 * Draggable workout card used in both library sidebar and calendar
 */

import { Box, Text, Badge, Group, Tooltip } from '@mantine/core';
import type { WorkoutDefinition, WorkoutCategory } from '../../types/training';
import type { DragSource } from '../../types/planner';
import { Clock, DotsSixVertical, Fire } from '@phosphor-icons/react';
import { WORKOUT_CATEGORY_PALETTE as CATEGORY_COLORS } from '../../utils/trainingPlans';

interface WorkoutCardProps {
  workout: WorkoutDefinition;
  source: DragSource;
  sourceDate?: string;
  isCompact?: boolean;
  showDuration?: boolean;
  showTSS?: boolean;
  isDragging?: boolean;
  onDragStart?: (workoutId: string, source: DragSource, sourceDate?: string) => void;
  onDragEnd?: () => void;
}

// Category colours come from the one shared map in utils/trainingPlans.

export function WorkoutCard({
  workout,
  source,
  sourceDate,
  isCompact = false,
  showDuration = true,
  showTSS = true,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: WorkoutCardProps) {
  const color = CATEGORY_COLORS[workout.category] || 'gray';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', workout.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      workoutId: workout.id,
      source,
      sourceDate,
    }));
    onDragStart?.(workout.id, source, sourceDate);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  if (isCompact) {
    return (
      <Tooltip
        label={
          <Box>
            <Text fw={500}>{workout.name}</Text>
            <Text size="xs" c="dimmed">{workout.description}</Text>
            <Group gap="xs" mt={4}>
              <Badge size="xs" color={color}>{workout.category}</Badge>
              <Text size="xs">{workout.duration}min</Text>
              <Text size="xs">{workout.targetTSS} stress</Text>
            </Group>
          </Box>
        }
        multiline
        w={250}
        position="left"
      >
        <Box
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          style={{
            padding: '6px 10px',
            borderRadius: 0,
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderTop: `2px solid var(--mantine-color-${color}-5)`,
            cursor: 'grab',
            opacity: isDragging ? 0.5 : 1,
          }}
        >
          <Group gap={6} wrap="nowrap">
            <Text size="xs" fw={600} lineClamp={1} style={{ color: 'var(--color-text-primary)' }}>
              {workout.name}
            </Text>
          </Group>
          {(showDuration || showTSS) && (
            <Group gap="xs" mt={4}>
              {showDuration && (
                <Text size="xs" c="dimmed">
                  {workout.duration}m
                </Text>
              )}
              {showTSS && (
                <Text size="xs" c="dimmed">
                  {workout.targetTSS}
                </Text>
              )}
            </Group>
          )}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        padding: '10px 12px',
        borderRadius: 0,
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderTop: `2px solid var(--mantine-color-${color}-5)`,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'transform 0.1s, box-shadow 0.1s',
      }}
      className="tribos-workout-card"
    >
      <Group gap={8} wrap="nowrap" mb={6}>
        <DotsSixVertical size={14} style={{ opacity: 0.5, flexShrink: 0, color: 'var(--color-text-muted)' }} />
        <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1, color: 'var(--color-text-primary)' }}>
          {workout.name}
        </Text>
      </Group>

      <Group gap="xs" ml={22}>
        <Badge size="xs" color={color} variant="light">
          {workout.category.replace('_', ' ')}
        </Badge>
        {showDuration && (
          <Group gap={2}>
            <Clock size={12} color="var(--color-text-muted)" />
            <Text size="xs" c="dimmed">
              {workout.duration}min
            </Text>
          </Group>
        )}
        {showTSS && (
          <Group gap={2}>
            <Fire size={12} color="var(--color-text-muted)" />
            <Text size="xs" c="dimmed">
              {workout.targetTSS} stress
            </Text>
          </Group>
        )}
      </Group>

      {workout.difficulty && (
        <Badge
          size="xs"
          variant="light"
          color={
            workout.difficulty === 'advanced'
              ? 'signal'
              : workout.difficulty === 'intermediate'
              ? 'moss'
              : 'easy'
          }
          ml={22}
          mt={6}
        >
          {workout.difficulty}
        </Badge>
      )}
    </Box>
  );
}

export default WorkoutCard;
