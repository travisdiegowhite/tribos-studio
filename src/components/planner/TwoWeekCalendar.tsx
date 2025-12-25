/**
 * TwoWeekCalendar Component
 * 2-week (14-day) calendar view for the training planner
 */

import { useMemo } from 'react';
import { Box, Group, Text, ActionIcon, SimpleGrid, Paper, Badge } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconFlame } from '@tabler/icons-react';
import { CalendarDayCell } from './CalendarDayCell';
import type { PlannerWorkout } from '../../types/planner';

interface TwoWeekCalendarProps {
  startDate: string;
  workouts: Record<string, PlannerWorkout>;
  activities?: Record<string, { id: string; tss: number | null; duration_seconds: number }>;
  dropTargetDate: string | null;
  onDrop: (date: string) => void;
  onDragOver: (date: string) => void;
  onDragLeave: () => void;
  onRemoveWorkout: (date: string) => void;
  onDateClick: (date: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TwoWeekCalendar({
  startDate,
  workouts,
  activities = {},
  dropTargetDate,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveWorkout,
  onDateClick,
  onNavigate,
}: TwoWeekCalendarProps) {
  // Generate 14 days starting from startDate
  const days = useMemo(() => {
    const result: Array<{
      date: string;
      dayOfWeek: string;
      dayNumber: number;
      monthName: string;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    const start = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 14; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);

      // Adjust for week starting on Monday
      const dayIndex = (date.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0

      result.push({
        date: date.toISOString().split('T')[0],
        dayOfWeek: DAY_NAMES[dayIndex],
        dayNumber: date.getDate(),
        monthName: date.toLocaleDateString('en-US', { month: 'short' }),
        isToday: date.getTime() === today.getTime(),
        isPast: date < today,
      });
    }

    return result;
  }, [startDate]);

  // Calculate week summaries
  const weekSummaries = useMemo(() => {
    const week1Days = days.slice(0, 7);
    const week2Days = days.slice(7, 14);

    const calculateWeekTSS = (weekDays: typeof days) => {
      let planned = 0;
      let actual = 0;

      for (const day of weekDays) {
        const workout = workouts[day.date];
        const activity = activities[day.date];

        if (workout) {
          planned += workout.targetTSS || 0;
          actual += workout.actualTSS || activity?.tss || 0;
        } else if (activity) {
          actual += activity.tss || 0;
        }
      }

      return { planned, actual };
    };

    return {
      week1: calculateWeekTSS(week1Days),
      week2: calculateWeekTSS(week2Days),
    };
  }, [days, workouts, activities]);

  // Format date range for header
  const dateRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(startDate);
    end.setDate(end.getDate() + 13);

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
    }

    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }, [startDate]);

  return (
    <Box>
      {/* Header with navigation */}
      <Group justify="space-between" mb="md">
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => onNavigate('prev')}
        >
          <IconChevronLeft />
        </ActionIcon>

        <Text size="lg" fw={600}>
          {dateRange}
        </Text>

        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => onNavigate('next')}
        >
          <IconChevronRight />
        </ActionIcon>
      </Group>

      {/* Day headers */}
      <SimpleGrid cols={7} spacing="xs" mb="xs">
        {DAY_NAMES.map((day) => (
          <Text
            key={day}
            size="xs"
            fw={600}
            ta="center"
            c="dimmed"
            tt="uppercase"
          >
            {day}
          </Text>
        ))}
      </SimpleGrid>

      {/* Week 1 */}
      <Paper p="xs" mb="xs" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={500} c="dimmed">Week 1</Text>
          <Group gap="xs">
            <Badge size="xs" color="gray" variant="light">
              <Group gap={4}>
                <IconFlame size={10} />
                <Text size="xs">{weekSummaries.week1.planned} TSS planned</Text>
              </Group>
            </Badge>
            {weekSummaries.week1.actual > 0 && (
              <Badge size="xs" color="lime" variant="light">
                {weekSummaries.week1.actual} done
              </Badge>
            )}
          </Group>
        </Group>

        <SimpleGrid cols={7} spacing="xs">
          {days.slice(0, 7).map((day) => (
            <CalendarDayCell
              key={day.date}
              date={day.date}
              dayOfWeek={day.dayOfWeek}
              dayNumber={day.dayNumber}
              plannedWorkout={workouts[day.date] || null}
              actualActivity={activities[day.date]}
              isToday={day.isToday}
              isDropTarget={dropTargetDate === day.date}
              isPast={day.isPast}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onRemoveWorkout={onRemoveWorkout}
              onClick={onDateClick}
            />
          ))}
        </SimpleGrid>
      </Paper>

      {/* Week 2 */}
      <Paper p="xs" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={500} c="dimmed">Week 2</Text>
          <Group gap="xs">
            <Badge size="xs" color="gray" variant="light">
              <Group gap={4}>
                <IconFlame size={10} />
                <Text size="xs">{weekSummaries.week2.planned} TSS planned</Text>
              </Group>
            </Badge>
            {weekSummaries.week2.actual > 0 && (
              <Badge size="xs" color="lime" variant="light">
                {weekSummaries.week2.actual} done
              </Badge>
            )}
          </Group>
        </Group>

        <SimpleGrid cols={7} spacing="xs">
          {days.slice(7, 14).map((day) => (
            <CalendarDayCell
              key={day.date}
              date={day.date}
              dayOfWeek={day.dayOfWeek}
              dayNumber={day.dayNumber}
              plannedWorkout={workouts[day.date] || null}
              actualActivity={activities[day.date]}
              isToday={day.isToday}
              isDropTarget={dropTargetDate === day.date}
              isPast={day.isPast}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onRemoveWorkout={onRemoveWorkout}
              onClick={onDateClick}
            />
          ))}
        </SimpleGrid>
      </Paper>
    </Box>
  );
}

export default TwoWeekCalendar;
