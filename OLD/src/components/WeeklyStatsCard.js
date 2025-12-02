import React, { useMemo } from 'react';
import { Card, Text, Group, Stack, Progress, Badge, SimpleGrid, Box } from '@mantine/core';
import { Calendar, TrendingUp, Clock, CheckCircle, Flame } from 'lucide-react';

/**
 * Weekly Stats Card
 * Shows quick overview of current week's training progress
 */
const WeeklyStatsCard = ({ activePlan, rides = [], plannedWorkouts = [] }) => {
  const weekStats = useMemo(() => {
    if (!activePlan) return null;

    // Calculate current week number based on plan start date
    const planStartDate = new Date(activePlan.started_at);
    const today = new Date();
    const daysSinceStart = Math.floor((today - planStartDate) / (24 * 60 * 60 * 1000));
    const currentWeekNumber = Math.floor(daysSinceStart / 7) + 1;

    // Get start of current week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Get end of current week (Saturday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Filter workouts for current week
    const weekWorkouts = plannedWorkouts.filter(w => w.week_number === currentWeekNumber);

    // Filter rides for current week
    const weekRides = rides.filter(ride => {
      const rideDate = new Date(ride.recorded_at || ride.created_at);
      return rideDate >= startOfWeek && rideDate <= endOfWeek;
    });

    // Calculate planned stats (exclude rest days)
    const activeWorkouts = weekWorkouts.filter(w => w.workout_type !== 'rest');
    const plannedWorkouts_count = activeWorkouts.length;
    const plannedTSS = activeWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);
    const plannedHours = activeWorkouts.reduce((sum, w) => sum + (w.target_duration || 0), 0) / 60;

    // Calculate completed stats
    const completedWorkouts = activeWorkouts.filter(w => w.completed);
    const completedCount = completedWorkouts.length;
    const completedTSS = completedWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);
    const completedHours = completedWorkouts.reduce((sum, w) => sum + (w.target_duration || 0), 0) / 60;

    // Calculate actual stats from rides
    const actualTSS = weekRides.reduce((sum, r) => sum + (r.tss || 0), 0);
    const actualHours = weekRides.reduce((sum, r) => sum + (r.moving_time_seconds || r.elapsed_time_seconds || 0), 0) / 3600;

    // Calculate daily TSS for sparkline chart (Sun-Sat)
    const dailyTSS = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      dayDate.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Get rides for this day
      const dayRides = weekRides.filter(ride => {
        const rideDate = new Date(ride.recorded_at || ride.created_at);
        return rideDate >= dayDate && rideDate <= dayEnd;
      });

      const tss = dayRides.reduce((sum, r) => sum + (r.tss || 0), 0);
      dailyTSS.push({
        day: dayNames[i],
        tss,
        isToday: dayDate.toDateString() === today.toDateString()
      });
    }

    const maxDailyTSS = Math.max(...dailyTSS.map(d => d.tss), 100); // Min scale of 100

    // Calculate compliance percentage
    const compliancePercent = plannedWorkouts_count > 0
      ? Math.round((completedCount / plannedWorkouts_count) * 100)
      : 0;

    // Determine compliance status
    let complianceStatus = 'On Track';
    let complianceColor = 'green';
    if (compliancePercent < 50) {
      complianceStatus = 'Needs Attention';
      complianceColor = 'red';
    } else if (compliancePercent < 80) {
      complianceStatus = 'Good Progress';
      complianceColor = 'yellow';
    }

    // Calculate workout completion streak (consecutive days with completed workouts)
    // Sort all workouts by date (newest first)
    const sortedWorkouts = [...plannedWorkouts]
      .filter(w => w.workout_type !== 'rest')
      .sort((a, b) => {
        const dateA = new Date(planStartDate);
        dateA.setDate(dateA.getDate() + (a.week_number - 1) * 7 + a.day_of_week);
        const dateB = new Date(planStartDate);
        dateB.setDate(dateB.getDate() + (b.week_number - 1) * 7 + b.day_of_week);
        return dateB - dateA; // Descending order (newest first)
      });

    // Calculate streak by counting consecutive completed workouts from today backwards
    let streak = 0;
    let lastWorkoutDate = null;

    for (const workout of sortedWorkouts) {
      const workoutDate = new Date(planStartDate);
      workoutDate.setDate(workoutDate.getDate() + (workout.week_number - 1) * 7 + workout.day_of_week);
      workoutDate.setHours(0, 0, 0, 0);

      // Only count workouts in the past or today
      if (workoutDate > today) continue;

      if (workout.completed) {
        // Check if this is consecutive with previous workout
        if (lastWorkoutDate === null) {
          // First completed workout
          streak = 1;
          lastWorkoutDate = workoutDate;
        } else {
          // Check if workouts are reasonably close (within 5 days to allow for rest days)
          const daysBetween = Math.floor((lastWorkoutDate - workoutDate) / (24 * 60 * 60 * 1000));
          if (daysBetween <= 5) {
            streak++;
            lastWorkoutDate = workoutDate;
          } else {
            // Gap too large, streak broken
            break;
          }
        }
      } else {
        // Incomplete workout breaks the streak
        break;
      }
    }

    return {
      currentWeekNumber,
      plannedWorkouts: plannedWorkouts_count,
      completedWorkouts: completedCount,
      plannedTSS,
      actualTSS,
      completedTSS,
      plannedHours,
      actualHours,
      completedHours,
      compliancePercent,
      complianceStatus,
      complianceColor,
      ridesCount: weekRides.length,
      streak,
      dailyTSS,
      maxDailyTSS
    };
  }, [activePlan, rides, plannedWorkouts]);

  if (!activePlan || !weekStats) {
    return null;
  }

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <Calendar size={20} />
            <Text size="lg" fw={600}>This Week (Week {weekStats.currentWeekNumber})</Text>
          </Group>
          <Group gap="xs">
            {weekStats.streak > 0 && (
              <Badge color="orange" variant="light" leftSection={<Flame size={14} />}>
                {weekStats.streak} day streak
              </Badge>
            )}
            <Badge color={weekStats.complianceColor} variant="light">
              {weekStats.complianceStatus}
            </Badge>
          </Group>
        </Group>

        {/* Stats Grid */}
        <SimpleGrid cols={3} spacing="md">
          {/* Workouts Completed */}
          <Stack gap={4}>
            <Group gap={4}>
              <CheckCircle size={16} color="#228be6" />
              <Text size="xs" c="gray.7" fw={500}>Workouts</Text>
            </Group>
            <Text size="xl" fw={700}>
              {weekStats.completedWorkouts}/{weekStats.plannedWorkouts}
            </Text>
            <Progress
              value={weekStats.compliancePercent}
              color={weekStats.complianceColor}
              size="sm"
            />
          </Stack>

          {/* TSS Progress */}
          <Stack gap={4}>
            <Group gap={4}>
              <TrendingUp size={16} color="#228be6" />
              <Text size="xs" c="gray.7" fw={500}>TSS</Text>
            </Group>
            <Text size="xl" fw={700}>
              {Math.round(weekStats.actualTSS)}/{Math.round(weekStats.plannedTSS)}
            </Text>
            <Progress
              value={weekStats.plannedTSS > 0 ? (weekStats.actualTSS / weekStats.plannedTSS) * 100 : 0}
              color="blue"
              size="sm"
            />
          </Stack>

          {/* Hours Progress */}
          <Stack gap={4}>
            <Group gap={4}>
              <Clock size={16} color="#228be6" />
              <Text size="xs" c="gray.7" fw={500}>Hours</Text>
            </Group>
            <Text size="xl" fw={700}>
              {weekStats.actualHours.toFixed(1)}/{weekStats.plannedHours.toFixed(1)}
            </Text>
            <Progress
              value={weekStats.plannedHours > 0 ? (weekStats.actualHours / weekStats.plannedHours) * 100 : 0}
              color="blue"
              size="sm"
            />
          </Stack>
        </SimpleGrid>

        {/* Daily TSS Sparkline */}
        <Box>
          <Text size="xs" c="gray.7" mb={4}>Daily TSS This Week</Text>
          <Group gap={2} align="flex-end" style={{ height: 40 }}>
            {weekStats.dailyTSS.map((day, index) => {
              const heightPercent = weekStats.maxDailyTSS > 0
                ? (day.tss / weekStats.maxDailyTSS) * 100
                : 0;
              const barHeight = Math.max(heightPercent * 0.35, day.tss > 0 ? 5 : 2); // Max 35px, min 5px if has TSS

              return (
                <Stack key={index} gap={2} align="center" style={{ flex: 1 }}>
                  <Box
                    style={{
                      width: '100%',
                      height: `${barHeight}px`,
                      backgroundColor: day.isToday ? '#228be6' : day.tss > 0 ? '#74c0fc' : '#e9ecef',
                      borderRadius: 2,
                      transition: 'all 0.2s ease'
                    }}
                  />
                  <Text size="9px" c={day.isToday ? 'blue' : 'dimmed'} fw={day.isToday ? 600 : 400}>
                    {day.day}
                  </Text>
                </Stack>
              );
            })}
          </Group>
        </Box>

        {/* Footer Stats */}
        <Group justify="space-between">
          <Text size="xs" c="gray.7">
            {weekStats.ridesCount} rides recorded this week
          </Text>
          <Text size="xs" c="gray.7">
            Compliance: {weekStats.compliancePercent}%
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};

export default WeeklyStatsCard;
