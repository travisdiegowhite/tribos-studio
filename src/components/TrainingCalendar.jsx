import { useState, useEffect } from 'react';
import { Card, Text, Group, Badge, Stack, ActionIcon, Tooltip, Button } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconCheck, IconCircle } from '@tabler/icons-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { WORKOUT_TYPES } from '../utils/trainingPlans';
import { tokens } from '../theme';

/**
 * Training Calendar Component
 * Displays monthly calendar with planned workouts and completed rides
 */
const TrainingCalendar = ({ activePlan, rides = [] }) => {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);

  // Load planned workouts for current month
  useEffect(() => {
    if (!user?.id || !activePlan?.id) return;
    loadPlannedWorkouts();
  }, [user?.id, activePlan?.id, currentDate]);

  const loadPlannedWorkouts = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      // Calculate which week numbers are in this month
      const planStartDate = new Date(activePlan.started_at);
      const weekNumbers = [];
      for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 7)) {
        const weeksSinceStart = Math.floor((d - planStartDate) / (7 * 24 * 60 * 60 * 1000)) + 1;
        if (weeksSinceStart > 0 && weeksSinceStart <= activePlan.duration_weeks) {
          weekNumbers.push(weeksSinceStart);
        }
      }

      const { data } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', activePlan.id)
        .in('week_number', weekNumbers);

      if (data) {
        setPlannedWorkouts(data);
      }
    } catch (error) {
      console.error('Failed to load planned workouts:', error);
    }
  };

  // Get days in month
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  // Get workout for a specific date
  const getWorkoutForDate = (date) => {
    if (!date || !activePlan) return null;

    const planStartDate = new Date(activePlan.started_at);
    const daysSinceStart = Math.floor((date - planStartDate) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.floor(daysSinceStart / 7) + 1;
    const dayOfWeek = date.getDay();

    return plannedWorkouts.find(
      w => w.week_number === weekNumber && w.day_of_week === dayOfWeek
    );
  };

  // Get rides for a specific date
  const getRidesForDate = (date) => {
    if (!date) return [];

    const dateStr = date.toISOString().split('T')[0];

    return rides.filter(ride => {
      const rideDate = new Date(ride.start_date || ride.recorded_at || ride.created_at);
      const rideDateStr = rideDate.toISOString().split('T')[0];
      return rideDateStr === dateStr;
    });
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  // Toggle workout completion
  const toggleWorkoutCompletion = async (workout) => {
    try {
      const newCompletedStatus = !workout.completed;

      const updates = {
        completed: newCompletedStatus,
        completed_at: newCompletedStatus ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('planned_workouts')
        .update(updates)
        .eq('id', workout.id);

      if (error) throw error;

      // Reload workouts to reflect changes
      loadPlannedWorkouts();
    } catch (error) {
      console.error('Failed to toggle workout completion:', error);
    }
  };

  // Format distance
  const formatDistance = (km) => {
    return `${km?.toFixed(1) || 0} km`;
  };

  const days = getDaysInMonth();
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Card>
      {/* Calendar Header */}
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={600} style={{ color: tokens.colors.textPrimary }}>{monthName}</Text>
        <Group gap="xs">
          <ActionIcon variant="subtle" onClick={previousMonth}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={nextMonth}>
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Show info about no active plan */}
      {!activePlan && rides.length === 0 && (
        <Text style={{ color: tokens.colors.textMuted }} ta="center" py="xl">
          No rides recorded yet. Connect Strava or upload rides to see them on the calendar.
        </Text>
      )}

      {/* Show calendar if there's a plan OR rides */}
      {(activePlan || rides.length > 0) && (
        <>
          {/* Day Names */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '4px',
            marginBottom: '8px'
          }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <Text key={day} size="xs" fw={600} style={{ color: tokens.colors.textMuted }} ta="center">
                {day}
              </Text>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '4px'
          }}>
            {days.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} style={{ minHeight: 70 }} />;
              }

              const workout = getWorkoutForDate(date);
              const dayRides = getRidesForDate(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const isPast = date < new Date() && !isToday;

              // Determine border color based on workout completion
              let borderColor = isToday ? tokens.colors.electricLime : tokens.colors.bgTertiary;
              let backgroundColor = isToday ? `${tokens.colors.electricLime}15` : isPast ? tokens.colors.bgSecondary : tokens.colors.bgTertiary;

              if (workout && isPast) {
                if (workout.completed) {
                  borderColor = '#51cf66';
                  backgroundColor = 'rgba(81, 207, 102, 0.15)';
                } else if (workout.workout_type !== 'rest') {
                  borderColor = '#ff6b6b';
                  backgroundColor = 'rgba(255, 107, 107, 0.15)';
                }
              }

              return (
                <Card
                  key={index}
                  withBorder
                  p="xs"
                  style={{
                    minHeight: 70,
                    backgroundColor: backgroundColor,
                    border: `2px solid ${borderColor}`,
                    opacity: isPast && !workout?.completed ? 0.7 : 1
                  }}
                >
                  <Stack gap={2}>
                    <Group justify="space-between" gap={2}>
                      <Text size="xs" fw={600} style={{ color: tokens.colors.textPrimary }}>
                        {date.getDate()}
                      </Text>
                      {/* Workout completion checkbox */}
                      {workout && workout.workout_type !== 'rest' && (
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color={workout.completed ? 'green' : 'gray'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWorkoutCompletion(workout);
                          }}
                        >
                          {workout.completed ? <IconCheck size={12} /> : <IconCircle size={12} />}
                        </ActionIcon>
                      )}
                    </Group>
                    {/* Planned workout */}
                    {workout && (
                      <Tooltip label={`${WORKOUT_TYPES[workout.workout_type]?.name || workout.workout_type}${workout.completed ? ' ✓' : ''}`}>
                        <Badge
                          size="xs"
                          color={WORKOUT_TYPES[workout.workout_type]?.color || 'gray'}
                          variant={workout.completed ? 'filled' : 'light'}
                          style={{ cursor: 'pointer' }}
                        >
                          {WORKOUT_TYPES[workout.workout_type]?.icon || '🚴'}
                        </Badge>
                      </Tooltip>
                    )}
                    {/* Completed rides */}
                    {dayRides.length > 0 && (
                      <Tooltip label={dayRides.map(r => r.name || 'Ride').join(', ')}>
                        <Badge size="xs" color="green" variant="filled">
                          🚴 {dayRides.length}
                        </Badge>
                      </Tooltip>
                    )}
                    {dayRides.length > 0 && (
                      <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                        {formatDistance(dayRides.reduce((sum, r) => sum + ((r.distance || 0) / 1000), 0))}
                      </Text>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </div>

          {/* Legend */}
          <Stack gap="xs" mt="md">
            <Group gap="xs">
              <Text size="xs" style={{ color: tokens.colors.textMuted }} fw={600}>Workout Types:</Text>
              {Object.entries(WORKOUT_TYPES).slice(1, 6).map(([key, type]) => (
                <Group gap={4} key={key}>
                  <Text size="lg">{type.icon}</Text>
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>{type.name}</Text>
                </Group>
              ))}
            </Group>
            {activePlan && (
              <Group gap="md">
                <Text size="xs" style={{ color: tokens.colors.textMuted }} fw={600}>Status:</Text>
                <Group gap={4}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#51cf66', border: '1px solid #51cf66' }} />
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Completed</Text>
                </Group>
                <Group gap={4}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: 'rgba(255, 107, 107, 0.15)', border: '2px solid #ff6b6b' }} />
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Missed</Text>
                </Group>
                <Group gap={4}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: `${tokens.colors.electricLime}15`, border: `2px solid ${tokens.colors.electricLime}` }} />
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Today</Text>
                </Group>
              </Group>
            )}
          </Stack>
        </>
      )}
    </Card>
  );
};

export default TrainingCalendar;
