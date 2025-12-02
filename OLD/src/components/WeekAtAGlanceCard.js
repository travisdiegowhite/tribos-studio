import React, { useMemo } from 'react';
import { Card, Text, Group, Stack, Badge, Divider } from '@mantine/core';
import { Calendar, CheckCircle, Circle } from 'lucide-react';
import { WORKOUT_TYPES } from '../utils/trainingPlans';

/**
 * Week at a Glance Card
 * Shows compact summary of all workouts for the current week
 */
const WeekAtAGlanceCard = ({ activePlan, plannedWorkouts = [] }) => {
  const weekWorkouts = useMemo(() => {
    if (!activePlan || !plannedWorkouts.length) return null;

    const planStartDate = new Date(activePlan.started_at);
    const today = new Date();
    const daysSinceStart = Math.floor((today - planStartDate) / (24 * 60 * 60 * 1000));
    const currentWeekNumber = Math.floor(daysSinceStart / 7) + 1;

    // Get start of current week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Filter workouts for current week
    const weekWorkouts = plannedWorkouts
      .filter(w => w.week_number === currentWeekNumber)
      .sort((a, b) => a.day_of_week - b.day_of_week);

    // Map to include date info
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const workoutsWithDates = weekWorkouts.map(workout => {
      const workoutDate = new Date(startOfWeek);
      workoutDate.setDate(startOfWeek.getDate() + workout.day_of_week);

      const isToday = workoutDate.toDateString() === today.toDateString();
      const isPast = workoutDate < today && !isToday;

      return {
        ...workout,
        date: workoutDate,
        dayName: dayNames[workout.day_of_week],
        isToday,
        isPast,
        workoutType: WORKOUT_TYPES[workout.workout_type] || WORKOUT_TYPES.endurance
      };
    });

    return {
      currentWeekNumber,
      workouts: workoutsWithDates
    };
  }, [activePlan, plannedWorkouts]);

  if (!weekWorkouts || weekWorkouts.workouts.length === 0) {
    return null;
  }

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        {/* Header */}
        <Group gap="xs">
          <Calendar size={20} />
          <Text size="lg" fw={600}>Week {weekWorkouts.currentWeekNumber} at a Glance</Text>
        </Group>

        <Divider />

        {/* Workouts List */}
        <Stack gap="xs">
          {weekWorkouts.workouts.map((workout, index) => (
            <Group
              key={index}
              justify="space-between"
              p="xs"
              style={{
                backgroundColor: workout.isToday ? '#e7f5ff' : workout.completed ? '#ebfbee' : 'transparent',
                borderRadius: 4,
                border: workout.isToday ? '1px solid #228be6' : '1px solid transparent'
              }}
            >
              {/* Day and Type */}
              <Group gap="sm">
                <Text size="sm" fw={600} w={40} c="dark">
                  {workout.dayName}
                </Text>
                <Group gap={4}>
                  <span style={{ fontSize: '16px' }}>{workout.workoutType.icon}</span>
                  <Text size="sm" fw={500} c="dark">
                    {workout.workoutType.name}
                  </Text>
                </Group>
              </Group>

              {/* Duration and Status */}
              <Group gap="sm">
                {workout.target_duration && (
                  <Text size="xs" c="gray.7">
                    {workout.target_duration}min
                  </Text>
                )}
                {workout.target_tss && (
                  <Badge size="xs" color={workout.workoutType.color} variant="light">
                    {workout.target_tss} TSS
                  </Badge>
                )}
                {workout.workout_type !== 'rest' && (
                  workout.completed ? (
                    <CheckCircle size={16} color="#51cf66" />
                  ) : workout.isPast ? (
                    <Circle size={16} color="#ff6b6b" />
                  ) : (
                    <Circle size={16} color="#adb5bd" />
                  )
                )}
              </Group>
            </Group>
          ))}
        </Stack>

        {/* Week Summary */}
        <Divider />
        <Group justify="space-between">
          <Text size="xs" c="gray.7">
            {weekWorkouts.workouts.filter(w => w.completed).length}/{weekWorkouts.workouts.filter(w => w.workout_type !== 'rest').length} completed
          </Text>
          <Text size="xs" c="gray.7">
            Total: {weekWorkouts.workouts.reduce((sum, w) => sum + (w.target_tss || 0), 0)} TSS planned
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};

export default WeekAtAGlanceCard;
