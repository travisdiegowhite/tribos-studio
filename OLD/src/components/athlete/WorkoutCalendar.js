import React, { useState, useEffect } from 'react';
import {
  Container,
  Stack,
  Group,
  Text,
  Button,
  Card,
  Badge,
  ActionIcon,
  Select,
  Alert,
  Loader,
  Center,
  Grid,
  Paper,
  Title,
  Divider
} from '@mantine/core';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import athleteWorkoutService from '../../services/athleteWorkoutService';
import WorkoutDetailView from './WorkoutDetailView';
import { TRAINING_ZONES } from '../../utils/trainingPlans';

/**
 * WorkoutCalendar
 * Calendar view for athletes to see their assigned workouts
 */
const WorkoutCalendar = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Date navigation
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'month'

  // Workouts data
  const [workouts, setWorkouts] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  // Load workouts for current view
  useEffect(() => {
    if (user?.id) {
      loadWorkouts();
      loadStats();
    }
  }, [user?.id, currentDate, viewMode]);

  const loadWorkouts = async () => {
    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = getDateRange();

      const { data, error: fetchError } = await athleteWorkoutService.getWorkoutsByDateRange(
        user.id,
        startDate,
        endDate
      );

      if (fetchError) throw fetchError;

      setWorkouts(data || []);
    } catch (err) {
      console.error('Error loading workouts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error: statsError } = await athleteWorkoutService.getWorkoutStats(
        user.id,
        thirtyDaysAgo,
        new Date()
      );

      if (statsError) throw statsError;
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // Get date range based on view mode
  const getDateRange = () => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === 'week') {
      // Get week start (Monday)
      const dayOfWeek = start.getDay();
      const diff = start.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);

      // Get week end (Sunday)
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // Get month start
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      // Get month end
      end.setMonth(start.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }

    return { startDate: start, endDate: end };
  };

  // Navigate date
  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);

    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }

    setCurrentDate(newDate);
  };

  // Go to today
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get workouts for a specific date
  const getWorkoutsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return workouts.filter(w => w.scheduled_date === dateStr);
  };

  // Render week view
  const renderWeekView = () => {
    const { startDate } = getDateRange();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }

    return (
      <Grid gutter="xs">
        {days.map((date, index) => {
          const dayWorkouts = getWorkoutsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();
          const isPast = date < new Date() && !isToday;

          return (
            <Grid.Col key={index} span={{ base: 12, sm: 6, md: 4, lg: 12 / 7 }}>
              <Paper
                withBorder
                p="sm"
                bg={isToday ? 'blue.0' : undefined}
                style={{ minHeight: 150 }}
              >
                <Stack gap="xs">
                  <Group justify="space-between">
                    <div>
                      <Text size="xs" c="dimmed">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </Text>
                      <Text fw={isToday ? 700 : 500} size="lg" c={isToday ? 'blue' : 'dark'}>
                        {date.getDate()}
                      </Text>
                    </div>
                    {isToday && (
                      <Badge size="xs" variant="filled" color="blue">
                        Today
                      </Badge>
                    )}
                  </Group>

                  {dayWorkouts.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" mt="md">
                      {isPast ? 'Rest' : 'No workout'}
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {dayWorkouts.map(workout => (
                        <WorkoutCard
                          key={workout.id}
                          workout={workout}
                          onClick={() => setSelectedWorkout(workout)}
                          compact
                        />
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            </Grid.Col>
          );
        })}
      </Grid>
    );
  };

  // Render month view
  const renderMonthView = () => {
    const { startDate, endDate } = getDateRange();
    const firstDay = startDate.getDay();
    const daysInMonth = endDate.getDate();

    const days = [];

    // Add empty cells for days before month start
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
      days.push(null);
    }

    // Add all days in month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(startDate);
      date.setDate(i);
      days.push(date);
    }

    return (
      <Grid gutter="xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <Grid.Col key={day} span={12 / 7}>
            <Text size="xs" fw={600} ta="center" c="dimmed">
              {day}
            </Text>
          </Grid.Col>
        ))}

        {days.map((date, index) => {
          if (!date) {
            return <Grid.Col key={`empty-${index}`} span={12 / 7} />;
          }

          const dayWorkouts = getWorkoutsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <Grid.Col key={index} span={12 / 7}>
              <Paper
                withBorder
                p="xs"
                bg={isToday ? 'blue.0' : undefined}
                style={{ minHeight: 80, cursor: dayWorkouts.length > 0 ? 'pointer' : 'default' }}
                onClick={() => dayWorkouts.length > 0 && setSelectedWorkout(dayWorkouts[0])}
              >
                <Stack gap={4}>
                  <Text size="sm" fw={isToday ? 700 : 400} c={isToday ? 'blue' : 'dark'}>
                    {date.getDate()}
                  </Text>
                  {dayWorkouts.map(workout => (
                    <Badge
                      key={workout.id}
                      size="xs"
                      variant="dot"
                      color={getWorkoutColor(workout)}
                    >
                      {workout.target_tss}
                    </Badge>
                  ))}
                </Stack>
              </Paper>
            </Grid.Col>
          );
        })}
      </Grid>
    );
  };

  // Get workout color based on status and type
  const getWorkoutColor = (workout) => {
    if (workout.completion_status === 'completed') return 'green';
    if (workout.completion_status === 'skipped') return 'gray';
    if (workout.completion_status === 'missed') return 'red';

    // Color by workout type for scheduled workouts
    const zoneColors = {
      recovery: 'blue',
      endurance: 'green',
      tempo: 'yellow',
      sweet_spot: 'orange',
      threshold: 'red',
      vo2max: 'grape',
      anaerobic: 'violet'
    };

    return zoneColors[workout.workout_type] || 'gray';
  };

  // Workout card component
  const WorkoutCard = ({ workout, onClick, compact = false }) => {
    const statusIcon = {
      completed: <CheckCircle size={14} color="green" />,
      skipped: <XCircle size={14} color="gray" />,
      missed: <AlertCircle size={14} color="red" />,
      scheduled: <Clock size={14} color="gray" />
    };

    return (
      <Card
        withBorder
        p={compact ? 'xs' : 'sm'}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      >
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="xs" fw={600} lineClamp={1} c="dark">
              {workout.template?.name || workout.workout_type}
            </Text>
            {statusIcon[workout.completion_status]}
          </Group>

          <Group gap="xs">
            <Badge size="xs" variant="light">
              {workout.target_tss} TSS
            </Badge>
            {!compact && workout.target_duration && (
              <Badge size="xs" variant="light">
                {Math.round(workout.target_duration / 60)}min
              </Badge>
            )}
          </Group>
        </Stack>
      </Card>
    );
  };

  if (loading) {
    return (
      <Center h={400}>
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">Loading your workouts...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>My Workouts</Title>
            <Text size="sm" c="dimmed">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          </div>

          <Group>
            <Select
              value={viewMode}
              onChange={setViewMode}
              data={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' }
              ]}
              w={100}
            />
          </Group>
        </Group>

        {/* Stats */}
        {stats && (
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm">
                <Stack gap="xs">
                  <Group gap="xs">
                    <Activity size={16} color="var(--mantine-color-blue-6)" />
                    <Text size="xs" c="dimmed">Completion Rate</Text>
                  </Group>
                  <Text size="xl" fw={700}>
                    {stats.completion_rate || 0}%
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm">
                <Stack gap="xs">
                  <Group gap="xs">
                    <CheckCircle size={16} color="var(--mantine-color-green-6)" />
                    <Text size="xs" c="dimmed">Completed</Text>
                  </Group>
                  <Text size="xl" fw={700}>
                    {stats.completed_workouts || 0}
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm">
                <Stack gap="xs">
                  <Group gap="xs">
                    <TrendingUp size={16} color="var(--mantine-color-orange-6)" />
                    <Text size="xs" c="dimmed">Total TSS (30d)</Text>
                  </Group>
                  <Text size="xl" fw={700}>
                    {stats.total_tss || 0}
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder p="sm">
                <Stack gap="xs">
                  <Group gap="xs">
                    <Activity size={16} color="var(--mantine-color-violet-6)" />
                    <Text size="xs" c="dimmed">Avg Rating</Text>
                  </Group>
                  <Text size="xl" fw={700}>
                    {stats.avg_rating ? `${stats.avg_rating}/5` : '-'}
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        )}

        {/* Navigation */}
        <Group justify="space-between">
          <Group gap="xs">
            <ActionIcon variant="light" onClick={() => navigateDate('prev')}>
              <ChevronLeft size={20} />
            </ActionIcon>
            <ActionIcon variant="light" onClick={() => navigateDate('next')}>
              <ChevronRight size={20} />
            </ActionIcon>
          </Group>

          <Button variant="light" onClick={goToToday} leftSection={<CalendarIcon size={16} />}>
            Today
          </Button>
        </Group>

        {/* Error Alert */}
        {error && (
          <Alert icon={<AlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {/* Calendar View */}
        <Card withBorder p="md">
          {viewMode === 'week' ? renderWeekView() : renderMonthView()}
        </Card>

        {/* Workout Detail Modal */}
        {selectedWorkout && (
          <WorkoutDetailView
            workout={selectedWorkout}
            onClose={() => setSelectedWorkout(null)}
            onWorkoutUpdated={loadWorkouts}
          />
        )}
      </Stack>
    </Container>
  );
};

export default WorkoutCalendar;
