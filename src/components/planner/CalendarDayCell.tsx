/**
 * CalendarDayCell Component
 * Individual day cell in the 2-week calendar with drop zone
 */

import { Box, Text, ActionIcon, Group, Tooltip, Badge } from '@mantine/core';
import { IconX, IconCheck, IconPlus } from '@tabler/icons-react';
import { WorkoutCard } from './WorkoutCard';
import type { PlannerWorkout } from '../../types/planner';

interface CalendarDayCellProps {
  date: string;
  dayOfWeek: string;
  dayNumber: number;
  plannedWorkout: PlannerWorkout | null;
  actualActivity?: {
    id: string;
    tss: number | null;
    duration_seconds: number;
  };
  isToday: boolean;
  isDropTarget: boolean;
  isPast: boolean;
  onDrop: (date: string) => void;
  onDragOver: (date: string) => void;
  onDragLeave: () => void;
  onRemoveWorkout: (date: string) => void;
  onClick: (date: string) => void;
}

export function CalendarDayCell({
  date,
  dayOfWeek,
  dayNumber,
  plannedWorkout,
  actualActivity,
  isToday,
  isDropTarget,
  isPast,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveWorkout,
  onClick,
}: CalendarDayCellProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(date);
  };

  const handleDragLeave = () => {
    onDragLeave();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDrop(date);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemoveWorkout(date);
  };

  // Calculate comparison if both planned and actual exist
  const hasComparison = plannedWorkout && actualActivity;
  const tssVariance = hasComparison && plannedWorkout.targetTSS && actualActivity.tss
    ? actualActivity.tss - plannedWorkout.targetTSS
    : null;

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onClick(date)}
      style={{
        minHeight: 120,
        padding: 8,
        borderRadius: 8,
        border: isDropTarget
          ? '2px dashed var(--mantine-color-lime-5)'
          : isToday
          ? '2px solid var(--mantine-color-lime-6)'
          : '1px solid var(--mantine-color-dark-4)',
        backgroundColor: isDropTarget
          ? 'var(--mantine-color-lime-9)'
          : isPast
          ? 'var(--mantine-color-dark-7)'
          : 'var(--mantine-color-dark-6)',
        opacity: isPast ? 0.7 : 1,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Date Header */}
      <Group justify="space-between" mb={8}>
        <Group gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase">
            {dayOfWeek}
          </Text>
          <Text
            size="sm"
            fw={isToday ? 700 : 500}
            c={isToday ? 'lime' : undefined}
          >
            {dayNumber}
          </Text>
        </Group>

        {/* Completion indicator */}
        {plannedWorkout?.completed && (
          <Badge size="xs" color="green" variant="filled">
            <IconCheck size={10} />
          </Badge>
        )}
      </Group>

      {/* Workout Card or Empty State */}
      {plannedWorkout?.workout ? (
        <Box style={{ position: 'relative' }}>
          <WorkoutCard
            workout={plannedWorkout.workout}
            source="calendar"
            sourceDate={date}
            isCompact
            showDuration
            showTSS
          />

          {/* Remove button */}
          <ActionIcon
            size="xs"
            color="red"
            variant="subtle"
            onClick={handleRemove}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              opacity: 0.6,
            }}
          >
            <IconX size={12} />
          </ActionIcon>

          {/* Planned vs Actual comparison */}
          {hasComparison && (
            <Tooltip
              label={
                <Box>
                  <Text size="xs">Planned: {plannedWorkout.targetTSS} TSS</Text>
                  <Text size="xs">Actual: {actualActivity.tss || 0} TSS</Text>
                  {tssVariance !== null && (
                    <Text
                      size="xs"
                      c={tssVariance >= 0 ? 'green' : 'red'}
                    >
                      {tssVariance >= 0 ? '+' : ''}{tssVariance} TSS
                    </Text>
                  )}
                </Box>
              }
            >
              <Badge
                size="xs"
                color={
                  tssVariance === null
                    ? 'gray'
                    : Math.abs(tssVariance) <= 10
                    ? 'green'
                    : tssVariance > 0
                    ? 'blue'
                    : 'orange'
                }
                variant="light"
                mt={4}
              >
                {actualActivity.tss || 0} / {plannedWorkout.targetTSS}
              </Badge>
            </Tooltip>
          )}
        </Box>
      ) : (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 60,
            border: '1px dashed var(--mantine-color-dark-4)',
            borderRadius: 4,
            opacity: 0.5,
          }}
        >
          <Group gap={4}>
            <IconPlus size={14} />
            <Text size="xs" c="dimmed">
              Drop workout
            </Text>
          </Group>
        </Box>
      )}

      {/* Activity without planned workout */}
      {actualActivity && !plannedWorkout && (
        <Tooltip label="Unplanned activity">
          <Badge size="xs" color="blue" variant="light" mt={4}>
            {actualActivity.tss || 0} TSS (unplanned)
          </Badge>
        </Tooltip>
      )}
    </Box>
  );
}

export default CalendarDayCell;
