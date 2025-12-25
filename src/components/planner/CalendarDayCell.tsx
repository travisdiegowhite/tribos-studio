/**
 * CalendarDayCell Component
 * Individual day cell in the 2-week calendar with drop zone
 */

import { Box, Text, ActionIcon, Group, Tooltip, Badge, Progress, Stack } from '@mantine/core';
import { IconX, IconCheck, IconPlus, IconArrowUp, IconArrowDown, IconMinus } from '@tabler/icons-react';
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
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOver(date);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only trigger leave if we're actually leaving the cell, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      onDragLeave();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  // Calculate percentage for progress visualization
  const tssPercentage = hasComparison && plannedWorkout.targetTSS && actualActivity.tss
    ? Math.min(150, (actualActivity.tss / plannedWorkout.targetTSS) * 100)
    : 0;

  // Determine status color and icon
  const getComparisonStatus = () => {
    if (!tssVariance) return { color: 'gray', icon: null, label: 'No data' };
    const percentDiff = (tssVariance / (plannedWorkout?.targetTSS || 1)) * 100;

    if (Math.abs(percentDiff) <= 10) {
      return { color: 'green', icon: <IconCheck size={10} />, label: 'On target' };
    } else if (percentDiff > 10) {
      return { color: 'blue', icon: <IconArrowUp size={10} />, label: 'Exceeded' };
    } else {
      return { color: 'orange', icon: <IconArrowDown size={10} />, label: 'Under target' };
    }
  };

  const comparisonStatus = hasComparison ? getComparisonStatus() : null;

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <Box
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onClick(date)}
      style={{
        minHeight: 120,
        padding: 8,
        borderRadius: 8,
        border: isDropTarget
          ? '2px dashed var(--mantine-color-lime-4)'
          : isToday
          ? '2px solid var(--mantine-color-lime-6)'
          : '1px solid var(--mantine-color-dark-4)',
        backgroundColor: isDropTarget
          ? 'rgba(163, 230, 53, 0.15)'
          : isPast
          ? 'var(--mantine-color-dark-7)'
          : 'var(--mantine-color-dark-6)',
        opacity: isPast ? 0.7 : 1,
        cursor: 'pointer',
        transition: 'all 0.1s ease',
        position: 'relative',
        boxShadow: isDropTarget ? '0 0 0 2px var(--mantine-color-lime-5)' : 'none',
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

          {/* Enhanced Planned vs Actual comparison */}
          {hasComparison && comparisonStatus && (
            <Tooltip
              label={
                <Stack gap={4}>
                  <Text size="xs" fw={500}>{comparisonStatus.label}</Text>
                  <Group gap="xs">
                    <Text size="xs">Planned:</Text>
                    <Text size="xs" fw={500}>{plannedWorkout.targetTSS} TSS</Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs">Actual:</Text>
                    <Text size="xs" fw={500}>{actualActivity.tss || 0} TSS</Text>
                  </Group>
                  {tssVariance !== null && (
                    <Text
                      size="xs"
                      c={comparisonStatus.color}
                      fw={500}
                    >
                      {tssVariance >= 0 ? '+' : ''}{tssVariance} TSS ({Math.round(tssPercentage)}%)
                    </Text>
                  )}
                  {actualActivity.duration_seconds && (
                    <Text size="xs" c="dimmed">
                      Duration: {formatDuration(actualActivity.duration_seconds)}
                    </Text>
                  )}
                </Stack>
              }
            >
              <Box mt={6}>
                {/* Progress bar showing actual vs planned */}
                <Box
                  style={{
                    position: 'relative',
                    height: 6,
                    backgroundColor: 'var(--mantine-color-dark-4)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  {/* Target line at 100% */}
                  <Box
                    style={{
                      position: 'absolute',
                      left: `${Math.min(100, (100 / Math.max(tssPercentage, 100)) * 100)}%`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: 'var(--mantine-color-gray-5)',
                      zIndex: 2,
                    }}
                  />
                  {/* Actual progress */}
                  <Box
                    style={{
                      height: '100%',
                      width: `${Math.min(100, tssPercentage * (100 / Math.max(tssPercentage, 100)))}%`,
                      backgroundColor: `var(--mantine-color-${comparisonStatus.color}-6)`,
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </Box>
                {/* Status badge */}
                <Group gap={4} mt={4} justify="space-between">
                  <Badge
                    size="xs"
                    color={comparisonStatus.color}
                    variant="light"
                    leftSection={comparisonStatus.icon}
                  >
                    {actualActivity.tss || 0}/{plannedWorkout.targetTSS}
                  </Badge>
                  {tssVariance !== null && Math.abs(tssVariance) > 0 && (
                    <Text size="xs" c={comparisonStatus.color} fw={500}>
                      {tssVariance > 0 ? '+' : ''}{tssVariance}
                    </Text>
                  )}
                </Group>
              </Box>
            </Tooltip>
          )}

          {/* Planned but not yet completed (future or today) */}
          {plannedWorkout && !actualActivity && !isPast && (
            <Box mt={4}>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Target:</Text>
                <Text size="xs" c="lime">{plannedWorkout.targetTSS} TSS</Text>
              </Group>
            </Box>
          )}

          {/* Planned but missed (past without activity) */}
          {plannedWorkout && !actualActivity && isPast && !plannedWorkout.completed && (
            <Tooltip label="Workout was planned but not completed">
              <Badge size="xs" color="red" variant="light" mt={4}>
                Missed
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

      {/* Activity without planned workout - unplanned workout */}
      {actualActivity && !plannedWorkout && (
        <Tooltip
          label={
            <Stack gap={4}>
              <Text size="xs" fw={500}>Unplanned Activity</Text>
              <Text size="xs">TSS: {actualActivity.tss || 0}</Text>
              {actualActivity.duration_seconds && (
                <Text size="xs">Duration: {formatDuration(actualActivity.duration_seconds)}</Text>
              )}
            </Stack>
          }
        >
          <Box
            mt={4}
            p={6}
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              borderRadius: 4,
              borderLeft: '3px solid var(--mantine-color-blue-5)',
            }}
          >
            <Group gap={4}>
              <IconPlus size={12} color="var(--mantine-color-blue-5)" />
              <Text size="xs" c="blue.4">Unplanned</Text>
            </Group>
            <Text size="sm" fw={500} c="blue.3" mt={2}>
              {actualActivity.tss || 0} TSS
            </Text>
            {actualActivity.duration_seconds && (
              <Text size="xs" c="dimmed">
                {formatDuration(actualActivity.duration_seconds)}
              </Text>
            )}
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}

export default CalendarDayCell;
