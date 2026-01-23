/**
 * CalendarDayCell Component
 * Individual day cell in the 2-week calendar with drop zone
 */

import { Box, Text, ActionIcon, Group, Tooltip, Badge, Progress, Stack, Menu, ThemeIcon } from '@mantine/core';
import { IconX, IconCheck, IconPlus, IconArrowUp, IconArrowDown, IconMinus, IconBike, IconHome, IconCalendarOff, IconStar, IconCalendarEvent, IconLock, IconLockOpen, IconTrophy } from '@tabler/icons-react';
import { WorkoutCard } from './WorkoutCard';
import type { PlannerWorkout } from '../../types/planner';
import type { ResolvedAvailability, AvailabilityStatus, WorkoutDefinition } from '../../types/training';

// Race goal type for calendar display
interface RaceGoal {
  id: string;
  race_date: string;
  name: string;
  race_type: string;
  priority: 'A' | 'B' | 'C';
  distance_km?: number;
  location?: string;
}

// Race type display info
const RACE_TYPE_INFO: Record<string, { icon: string; label: string }> = {
  road_race: { icon: '🚴', label: 'Road Race' },
  criterium: { icon: '🔄', label: 'Criterium' },
  time_trial: { icon: '⏱️', label: 'Time Trial' },
  gran_fondo: { icon: '🏔️', label: 'Gran Fondo' },
  century: { icon: '💯', label: 'Century' },
  gravel: { icon: '🪨', label: 'Gravel' },
  cyclocross: { icon: '🌲', label: 'Cyclocross' },
  mtb: { icon: '🏔️', label: 'MTB' },
  triathlon: { icon: '🏊', label: 'Triathlon' },
  other: { icon: '🎯', label: 'Event' },
};

interface CalendarDayCellProps {
  date: string;
  dayOfWeek: string;
  dayNumber: number;
  plannedWorkout: PlannerWorkout | null;
  actualActivity?: {
    id: string;
    name?: string;
    type?: string;
    tss: number | null;
    duration_seconds: number;
    distance?: number | null;
    trainer?: boolean;
  };
  raceGoal?: RaceGoal;
  isToday: boolean;
  isDropTarget: boolean;
  isPast: boolean;
  availability?: ResolvedAvailability;
  onDrop: (date: string) => void;
  onDragOver: (date: string) => void;
  onDragLeave: () => void;
  onRemoveWorkout: (date: string) => void;
  onClick: (date: string) => void;
  onSetAvailability?: (date: string, status: AvailabilityStatus) => void;
  onWorkoutClick?: (workout: WorkoutDefinition) => void;
}

// Helper to format distance (in meters to km/mi)
function formatDistance(meters: number | null | undefined): string {
  if (!meters) return '';
  const km = meters / 1000;
  const mi = km * 0.621371;
  // Use miles for now, could make configurable
  return `${mi.toFixed(1)} mi`;
}

// Helper to get activity type display
function getActivityTypeInfo(type?: string, trainer?: boolean): { label: string; color: string; isIndoor: boolean } {
  const isIndoor = trainer || type === 'VirtualRide' || type?.toLowerCase().includes('indoor');

  if (isIndoor) {
    return { label: 'Indoor', color: 'grape', isIndoor: true };
  }

  switch (type) {
    case 'Ride':
      return { label: 'Ride', color: 'blue', isIndoor: false };
    case 'GravelRide':
      return { label: 'Gravel', color: 'orange', isIndoor: false };
    case 'MountainBikeRide':
      return { label: 'MTB', color: 'teal', isIndoor: false };
    case 'EBikeRide':
      return { label: 'E-Bike', color: 'cyan', isIndoor: false };
    default:
      return { label: type || 'Activity', color: 'blue', isIndoor: false };
  }
}

export function CalendarDayCell({
  date,
  dayOfWeek,
  dayNumber,
  plannedWorkout,
  actualActivity,
  raceGoal,
  isToday,
  isDropTarget,
  isPast,
  availability,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveWorkout,
  onClick,
  onSetAvailability,
  onWorkoutClick,
}: CalendarDayCellProps) {
  const isBlocked = availability?.status === 'blocked';
  const isPreferred = availability?.status === 'preferred';
  const hasOverride = availability?.isOverride;
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

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Get background color based on availability
  const getBackgroundColor = () => {
    if (isDropTarget) return 'rgba(163, 230, 53, 0.15)';
    if (isBlocked) return 'rgba(250, 82, 82, 0.1)';
    if (isPreferred) return 'rgba(250, 204, 21, 0.1)';
    if (isPast) return 'var(--mantine-color-dark-7)';
    return 'var(--mantine-color-dark-6)';
  };

  // Get border color based on state
  const getBorderStyle = () => {
    if (isDropTarget) return '2px dashed var(--mantine-color-lime-4)';
    if (isToday) return '2px solid var(--mantine-color-lime-6)';
    if (isBlocked) return '1px solid var(--mantine-color-red-7)';
    if (isPreferred) return '1px solid var(--mantine-color-yellow-7)';
    return '1px solid var(--mantine-color-dark-4)';
  };

  const cellContent = (
    <Box
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onClick(date)}
      onContextMenu={handleContextMenu}
      style={{
        minHeight: 120,
        padding: 8,
        borderRadius: 8,
        border: getBorderStyle(),
        backgroundColor: getBackgroundColor(),
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
          {/* Race indicator */}
          {raceGoal && (
            <Tooltip label={`${raceGoal.name} - ${RACE_TYPE_INFO[raceGoal.race_type]?.label || 'Race'}`}>
              <Badge size="xs" color="orange" variant="filled" px={4}>
                <IconTrophy size={10} />
              </Badge>
            </Tooltip>
          )}
          {/* Availability indicators */}
          {isBlocked && !raceGoal && (
            <Tooltip label={hasOverride ? 'Blocked (override for this date)' : 'Blocked day'}>
              <Badge size="xs" color="red" variant="light" px={4}>
                <IconCalendarOff size={10} />
              </Badge>
            </Tooltip>
          )}
          {isPreferred && !raceGoal && (
            <Tooltip label={hasOverride ? 'Preferred (override for this date)' : 'Preferred day'}>
              <Badge size="xs" color="yellow" variant="light" px={4}>
                <IconStar size={10} />
              </Badge>
            </Tooltip>
          )}
        </Group>

        {/* Completion indicator */}
        {plannedWorkout?.completed && (
          <Badge size="xs" color="green" variant="filled">
            <IconCheck size={10} />
          </Badge>
        )}
      </Group>

      {/* Race Goal Display */}
      {raceGoal && (() => {
        const raceTypeInfo = RACE_TYPE_INFO[raceGoal.race_type] || RACE_TYPE_INFO.other;
        const priorityColor = raceGoal.priority === 'A' ? 'red' : raceGoal.priority === 'B' ? 'orange' : 'gray';

        return (
          <Tooltip
            label={
              <Stack gap={4}>
                <Text size="xs" fw={600}>{raceGoal.name}</Text>
                <Text size="xs">{raceTypeInfo.label}</Text>
                {raceGoal.location && <Text size="xs" c="dimmed">{raceGoal.location}</Text>}
                {raceGoal.distance_km && (
                  <Text size="xs" c="dimmed">{Math.round(raceGoal.distance_km * 0.621371)} mi</Text>
                )}
              </Stack>
            }
          >
            <Box
              mb={8}
              p={6}
              style={{
                backgroundColor: 'rgba(250, 176, 5, 0.2)',
                borderRadius: 4,
                borderLeft: `3px solid var(--mantine-color-${priorityColor}-5)`,
              }}
            >
              <Group gap={4} wrap="nowrap">
                <Text size="sm">{raceTypeInfo.icon}</Text>
                <Badge size="xs" color={priorityColor} variant="filled">
                  {raceGoal.priority}
                </Badge>
                <Text size="xs" fw={500} lineClamp={1} style={{ flex: 1 }}>
                  {raceGoal.name}
                </Text>
              </Group>
            </Box>
          </Tooltip>
        );
      })()}

      {/* Workout Card or Empty State */}
      {plannedWorkout?.workout ? (
        <Box style={{ position: 'relative' }}>
          <Box
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (onWorkoutClick && plannedWorkout.workout) {
                onWorkoutClick(plannedWorkout.workout);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <WorkoutCard
              workout={plannedWorkout.workout}
              source="calendar"
              sourceDate={date}
              isCompact
              showDuration
              showTSS
            />
          </Box>

          {/* Remove button */}
          <ActionIcon
            size="sm"
            color="red"
            variant="subtle"
            onClick={handleRemove}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              opacity: 0.7,
            }}
          >
            <IconX size={14} />
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
      {actualActivity && !plannedWorkout && (() => {
        const typeInfo = getActivityTypeInfo(actualActivity.type, actualActivity.trainer);
        const activityName = actualActivity.name || 'Activity';

        return (
          <Tooltip
            label={
              <Stack gap={4}>
                <Text size="xs" fw={500}>{activityName}</Text>
                <Group gap="xs">
                  <Badge size="xs" color={typeInfo.color} variant="light">
                    {typeInfo.isIndoor ? <IconHome size={10} style={{ marginRight: 2 }} /> : <IconBike size={10} style={{ marginRight: 2 }} />}
                    {typeInfo.label}
                  </Badge>
                </Group>
                <Text size="xs">TSS: {actualActivity.tss || 0}</Text>
                {actualActivity.duration_seconds && (
                  <Text size="xs">Duration: {formatDuration(actualActivity.duration_seconds)}</Text>
                )}
                {actualActivity.distance && (
                  <Text size="xs">Distance: {formatDistance(actualActivity.distance)}</Text>
                )}
              </Stack>
            }
          >
            <Box
              mt={4}
              p={6}
              style={{
                backgroundColor: `rgba(${typeInfo.isIndoor ? '139, 92, 246' : '59, 130, 246'}, 0.15)`,
                borderRadius: 4,
                borderLeft: `3px solid var(--mantine-color-${typeInfo.color}-5)`,
              }}
            >
              <Group gap={4} wrap="nowrap">
                {typeInfo.isIndoor ? (
                  <IconHome size={12} color={`var(--mantine-color-${typeInfo.color}-5)`} />
                ) : (
                  <IconBike size={12} color={`var(--mantine-color-${typeInfo.color}-5)`} />
                )}
                <Text size="xs" c={`${typeInfo.color}.4`} lineClamp={1} style={{ flex: 1 }}>
                  {activityName}
                </Text>
              </Group>
              <Group gap={8} mt={4}>
                <Text size="sm" fw={500} c={`${typeInfo.color}.3`}>
                  {actualActivity.tss || 0} TSS
                </Text>
                {actualActivity.distance && (
                  <Text size="xs" c="dimmed">
                    {formatDistance(actualActivity.distance)}
                  </Text>
                )}
              </Group>
              {actualActivity.duration_seconds && (
                <Text size="xs" c="dimmed">
                  {formatDuration(actualActivity.duration_seconds)}
                </Text>
              )}
            </Box>
          </Tooltip>
        );
      })()}
    </Box>
  );

  // Wrap in context menu if availability callback is provided
  if (onSetAvailability) {
    return (
      <Menu trigger={"contextMenu" as "click"} position="bottom-start" withArrow>
        <Menu.Target>
          {cellContent}
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Day Availability</Menu.Label>
          <Menu.Item
            leftSection={<IconCalendarEvent size={14} />}
            onClick={() => onSetAvailability(date, 'available')}
            disabled={availability?.status === 'available'}
          >
            Mark as Available
          </Menu.Item>
          <Menu.Item
            leftSection={<IconStar size={14} color="var(--mantine-color-yellow-5)" />}
            onClick={() => onSetAvailability(date, 'preferred')}
            disabled={availability?.status === 'preferred'}
          >
            Mark as Preferred
          </Menu.Item>
          <Menu.Item
            leftSection={<IconCalendarOff size={14} color="var(--mantine-color-red-5)" />}
            onClick={() => onSetAvailability(date, 'blocked')}
            disabled={availability?.status === 'blocked'}
          >
            Block this Day
          </Menu.Item>
          {hasOverride && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconLockOpen size={14} />}
                onClick={() => onSetAvailability(date, 'available')}
                c="dimmed"
              >
                Remove Override (use weekly default)
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    );
  }

  return cellContent;
}

export default CalendarDayCell;
