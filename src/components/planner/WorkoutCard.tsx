/**
 * WorkoutCard Component
 * Draggable workout card used in both library sidebar and calendar
 */

import { Box, Text, Badge, Group, Tooltip } from '@mantine/core';
import { IconClock, IconFlame, IconGripVertical } from '@tabler/icons-react';
import type { WorkoutDefinition, WorkoutCategory } from '../../types/training';
import type { DragSource } from '../../types/planner';

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

// Category colors matching existing design system
const CATEGORY_COLORS: Record<WorkoutCategory | string, string> = {
  recovery: 'green',
  endurance: 'blue',
  tempo: 'yellow',
  sweet_spot: 'orange',
  threshold: 'red',
  vo2max: 'grape',
  anaerobic: 'pink',
  climbing: 'teal',
  racing: 'violet',
  strength: 'indigo',
  core: 'cyan',
  flexibility: 'lime',
  rest: 'gray',
};

// Category icons
const CATEGORY_ICONS: Record<WorkoutCategory | string, string> = {
  recovery: '🌿',
  endurance: '🚴',
  tempo: '⚡',
  sweet_spot: '🍯',
  threshold: '🔥',
  vo2max: '💨',
  anaerobic: '💥',
  climbing: '⛰️',
  racing: '🏁',
  strength: '💪',
  core: '🎯',
  flexibility: '🧘',
  rest: '😴',
};

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
  const icon = CATEGORY_ICONS[workout.category] || '🚴';

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
              <Text size="xs">{workout.targetTSS} TSS</Text>
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
            padding: '4px 8px',
            borderRadius: 4,
            backgroundColor: `var(--mantine-color-${color}-1)`,
            borderLeft: `3px solid var(--mantine-color-${color}-6)`,
            cursor: 'grab',
            opacity: isDragging ? 0.5 : 1,
          }}
        >
          <Group gap={4} wrap="nowrap">
            <Text size="sm">{icon}</Text>
            <Text size="xs" fw={500} lineClamp={1}>
              {workout.name}
            </Text>
          </Group>
          {(showDuration || showTSS) && (
            <Group gap="xs" mt={2}>
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
        padding: '8px 12px',
        borderRadius: 6,
        backgroundColor: `var(--mantine-color-${color}-1)`,
        borderLeft: `4px solid var(--mantine-color-${color}-6)`,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'transform 0.1s, box-shadow 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Group gap={8} wrap="nowrap" mb={4}>
        <IconGripVertical size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
        <Text size="sm">{icon}</Text>
        <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>
          {workout.name}
        </Text>
      </Group>

      <Group gap="xs" ml={22}>
        <Badge size="xs" color={color} variant="light">
          {workout.category.replace('_', ' ')}
        </Badge>
        {showDuration && (
          <Group gap={2}>
            <IconClock size={12} />
            <Text size="xs" c="dimmed">
              {workout.duration}min
            </Text>
          </Group>
        )}
        {showTSS && (
          <Group gap={2}>
            <IconFlame size={12} />
            <Text size="xs" c="dimmed">
              {workout.targetTSS} TSS
            </Text>
          </Group>
        )}
      </Group>

      {workout.difficulty && (
        <Badge
          size="xs"
          variant="outline"
          color={
            workout.difficulty === 'advanced'
              ? 'red'
              : workout.difficulty === 'intermediate'
              ? 'yellow'
              : 'green'
          }
          ml={22}
          mt={4}
        >
          {workout.difficulty}
        </Badge>
      )}
    </Box>
  );
}

export default WorkoutCard;
