import React, { useState, useEffect } from 'react';
import {
  Container,
  Stack,
  Group,
  Text,
  Card,
  Badge,
  SimpleGrid,
  Timeline,
  Loader,
  Center,
  Title,
  RingProgress,
  Paper,
  Divider,
} from '@mantine/core';
import {
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Award,
  TrendingUp,
  Calendar,
  Target,
  Flame,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import analyticsService from '../../services/analyticsService';
import { TRAINING_ZONES } from '../../utils/trainingPlans';

/**
 * WorkoutHistoryView
 * Athlete's workout history and statistics
 */
const WorkoutHistoryView = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [workouts, setWorkouts] = useState([]);

  useEffect(() => {
    if (user?.id) {
      loadHistory();
    }
  }, [user?.id]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await analyticsService.getAthleteWorkoutStats(user.id);

      if (error) throw error;

      if (data) {
        setStats(data.stats);
        setWorkouts(data.workouts || []);
      }
    } catch (err) {
      console.error('Error loading workout history:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center p="xl">
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text size="sm" c="dimmed">Loading workout history...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container size="xl" py="xl">
        <Card withBorder p="xl">
          <Stack align="center" gap="md">
            <Activity size={48} color="gray" />
            <Text size="lg" fw={600} c="dimmed">No Workout History</Text>
            <Text size="sm" c="dimmed" ta="center">
              Your workout history will appear here once you complete workouts
            </Text>
          </Stack>
        </Card>
      </Container>
    );
  }

  const completionRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0;

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Title order={2} c="dark">Workout History</Title>
          <Text size="sm" c="dimmed">
            Your training stats and completed workouts
          </Text>
        </div>

        {/* Stats Overview */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          {/* Total Completed */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Completed
                </Text>
                <CheckCircle size={18} color="var(--mantine-color-green-6)" />
              </Group>
              <Text size="xl" fw={700} c="dark">
                {stats.completed}
              </Text>
              <Text size="xs" c="dimmed">
                of {stats.total} workouts
              </Text>
            </Stack>
          </Card>

          {/* Total TSS */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Total TSS
                </Text>
                <Activity size={18} color="var(--mantine-color-blue-6)" />
              </Group>
              <Text size="xl" fw={700} c="dark">
                {stats.totalTss.toLocaleString()}
              </Text>
              <Text size="xs" c="dimmed">
                Training Stress Score
              </Text>
            </Stack>
          </Card>

          {/* Average Rating */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Avg Rating
                </Text>
                <Award size={18} color="var(--mantine-color-yellow-6)" />
              </Group>
              <Text size="xl" fw={700} c="dark">
                {stats.avgRating || 'N/A'}
                {stats.avgRating && <Text component="span" size="md" c="dimmed"> / 5</Text>}
              </Text>
              <Text size="xs" c="dimmed">
                Difficulty rating
              </Text>
            </Stack>
          </Card>

          {/* Current Streak */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Current Streak
                </Text>
                <Flame size={18} color="var(--mantine-color-orange-6)" />
              </Group>
              <Group align="flex-end" gap={4}>
                <Text size="xl" fw={700} c="dark">
                  {stats.currentStreak}
                </Text>
                <Text size="sm" c="dimmed" mb={2}>weeks</Text>
              </Group>
              <Text size="xs" c="dimmed">
                Longest: {stats.longestStreak} weeks
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Completion Stats */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text fw={600} c="dark">Workout Completion</Text>
            <Group grow>
              <Paper p="md" withBorder>
                <Stack gap="xs" align="center">
                  <RingProgress
                    size={120}
                    thickness={12}
                    sections={[
                      { value: parseFloat(completionRate), color: 'green' }
                    ]}
                    label={
                      <Text ta="center" size="xl" fw={700}>
                        {completionRate}%
                      </Text>
                    }
                  />
                  <Text size="sm" c="dimmed">Completion Rate</Text>
                </Stack>
              </Paper>

              <Stack gap="sm">
                <Group justify="space-between">
                  <Group gap="xs">
                    <CheckCircle size={16} color="green" />
                    <Text size="sm">Completed</Text>
                  </Group>
                  <Badge size="lg" variant="light" color="green">
                    {stats.completed}
                  </Badge>
                </Group>

                <Group justify="space-between">
                  <Group gap="xs">
                    <XCircle size={16} color="gray" />
                    <Text size="sm">Skipped</Text>
                  </Group>
                  <Badge size="lg" variant="light" color="gray">
                    {stats.skipped}
                  </Badge>
                </Group>

                <Group justify="space-between">
                  <Group gap="xs">
                    <Clock size={16} color="blue" />
                    <Text size="sm">Upcoming</Text>
                  </Group>
                  <Badge size="lg" variant="light" color="blue">
                    {stats.upcoming}
                  </Badge>
                </Group>
              </Stack>
            </Group>
          </Stack>
        </Card>

        {/* Recent Workouts Timeline */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} c="dark">Recent Workouts</Text>
              <Badge size="sm" variant="light">Last 20</Badge>
            </Group>

            <Divider />

            {workouts.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                No workouts yet
              </Text>
            ) : (
              <Timeline active={-1} bulletSize={24} lineWidth={2}>
                {workouts.slice(0, 20).map((workout, index) => {
                  const zoneInfo = workout.workout_templates?.primary_zone
                    ? TRAINING_ZONES[workout.workout_templates.primary_zone]
                    : null;

                  const icon = workout.completion_status === 'completed' ? (
                    <CheckCircle size={16} color="green" />
                  ) : workout.completion_status === 'skipped' ? (
                    <XCircle size={16} color="gray" />
                  ) : (
                    <Clock size={16} color="blue" />
                  );

                  return (
                    <Timeline.Item key={index} bullet={icon}>
                      <Card withBorder p="sm">
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Text size="sm" fw={600} c="dark">
                                {workout.workout_templates?.name || 'Workout'}
                              </Text>
                              <Group gap="xs" mt={4}>
                                <Calendar size={12} />
                                <Text size="xs" c="dimmed">
                                  {formatDate(workout.scheduled_date)}
                                </Text>
                              </Group>
                            </div>

                            <Badge
                              size="sm"
                              variant="light"
                              color={
                                workout.completion_status === 'completed' ? 'green' :
                                workout.completion_status === 'skipped' ? 'gray' : 'blue'
                              }
                            >
                              {workout.completion_status || 'scheduled'}
                            </Badge>
                          </Group>

                          <Group gap="xs">
                            {workout.actual_tss ? (
                              <Badge size="xs" variant="light" leftSection={<Activity size={10} />}>
                                {workout.actual_tss} TSS
                              </Badge>
                            ) : workout.target_tss ? (
                              <Badge size="xs" variant="outline" leftSection={<Target size={10} />}>
                                {workout.target_tss} TSS
                              </Badge>
                            ) : null}

                            {zoneInfo && (
                              <Badge size="xs" variant="light" color={zoneInfo.color}>
                                {zoneInfo.name}
                              </Badge>
                            )}

                            {workout.athlete_rating && (
                              <Badge size="xs" variant="light" color="yellow" leftSection={<Award size={10} />}>
                                {workout.athlete_rating}/5
                              </Badge>
                            )}

                            {workout.workout_templates?.difficulty_level && (
                              <Badge
                                size="xs"
                                variant="outline"
                                color={
                                  workout.workout_templates.difficulty_level === 'beginner' ? 'green' :
                                  workout.workout_templates.difficulty_level === 'intermediate' ? 'blue' : 'orange'
                                }
                              >
                                {workout.workout_templates.difficulty_level}
                              </Badge>
                            )}
                          </Group>
                        </Stack>
                      </Card>
                    </Timeline.Item>
                  );
                })}
              </Timeline>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};

export default WorkoutHistoryView;
