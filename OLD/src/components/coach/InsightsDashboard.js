import React, { useState, useEffect } from 'react';
import {
  Container,
  Stack,
  Group,
  Text,
  Card,
  Badge,
  SimpleGrid,
  RingProgress,
  Progress,
  Table,
  Loader,
  Center,
  Paper,
  Title,
} from '@mantine/core';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Award,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import analyticsService from '../../services/analyticsService';
import { TRAINING_ZONES } from '../../utils/trainingPlans';

/**
 * InsightsDashboard
 * Coach analytics and insights dashboard
 */
const InsightsDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [templateRates, setTemplateRates] = useState([]);
  const [mostAssigned, setMostAssigned] = useState([]);

  useEffect(() => {
    if (user?.id) {
      loadAnalytics();
    }
  }, [user?.id]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Load all analytics data
      const [statsRes, templatesRes, assignedRes] = await Promise.all([
        analyticsService.getWorkoutCompletionStats(user.id),
        analyticsService.getTemplateCompletionRates(user.id),
        analyticsService.getMostAssignedWorkouts(user.id, 10)
      ]);

      if (statsRes.data) {
        setStats(statsRes.data.stats);
      }

      if (templatesRes.data) {
        setTemplateRates(templatesRes.data);
      }

      if (assignedRes.data) {
        setMostAssigned(assignedRes.data);
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center p="xl">
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text size="sm" c="dimmed">Loading analytics...</Text>
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
            <BarChart3 size={48} color="gray" />
            <Text size="lg" fw={600} c="dimmed">No Data Available</Text>
            <Text size="sm" c="dimmed" ta="center">
              Start assigning workouts to see analytics and insights
            </Text>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Title order={2} c="dark">Workout Insights</Title>
          <Text size="sm" c="dimmed">
            Analytics and performance metrics for your coaching
          </Text>
        </div>

        {/* Overview Stats */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          {/* Total Workouts */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Total Workouts
                </Text>
                <Activity size={18} color="var(--mantine-color-blue-6)" />
              </Group>
              <Text size="xl" fw={700} c="dark">
                {stats.total}
              </Text>
              <Group gap="xs">
                <Badge size="xs" variant="light" color="green">
                  {stats.completed} completed
                </Badge>
              </Group>
            </Stack>
          </Card>

          {/* Completion Rate */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Completion Rate
                </Text>
                <CheckCircle size={18} color="var(--mantine-color-green-6)" />
              </Group>
              <Group align="flex-end" gap="xs">
                <Text size="xl" fw={700} c="dark">
                  {stats.completionRate}%
                </Text>
                <RingProgress
                  size={40}
                  thickness={4}
                  sections={[{ value: parseFloat(stats.completionRate), color: 'green' }]}
                />
              </Group>
              <Progress
                value={parseFloat(stats.completionRate)}
                color="green"
                size="sm"
              />
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
                {stats.avgRating && <Text component="span" size="md" c="dimmed"> / 5.0</Text>}
              </Text>
              {stats.avgRating && (
                <Progress
                  value={(parseFloat(stats.avgRating) / 5) * 100}
                  color="yellow"
                  size="sm"
                />
              )}
            </Stack>
          </Card>

          {/* TSS Accuracy */}
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  TSS Accuracy
                </Text>
                <TrendingUp size={18} color="var(--mantine-color-purple-6)" />
              </Group>
              <Text size="xl" fw={700} c="dark">
                {stats.avgTssAccuracy || 'N/A'}
                {stats.avgTssAccuracy && '%'}
              </Text>
              <Text size="xs" c="dimmed">
                Actual vs Target
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Completion Breakdown */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text fw={600} c="dark">Workout Status Breakdown</Text>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
              <Paper p="sm" withBorder>
                <Stack gap={4} align="center">
                  <CheckCircle size={24} color="green" />
                  <Text size="xl" fw={700} c="dark">{stats.completed}</Text>
                  <Text size="xs" c="dimmed">Completed</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder>
                <Stack gap={4} align="center">
                  <Clock size={24} color="blue" />
                  <Text size="xl" fw={700} c="dark">{stats.scheduled}</Text>
                  <Text size="xs" c="dimmed">Scheduled</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder>
                <Stack gap={4} align="center">
                  <XCircle size={24} color="gray" />
                  <Text size="xl" fw={700} c="dark">{stats.skipped}</Text>
                  <Text size="xs" c="dimmed">Skipped</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder>
                <Stack gap={4} align="center">
                  <TrendingDown size={24} color="red" />
                  <Text size="xl" fw={700} c="dark">{stats.missed}</Text>
                  <Text size="xs" c="dimmed">Missed</Text>
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Card>

        {/* Most Assigned Workouts */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} c="dark">Most Assigned Workouts</Text>
              <Badge size="sm" variant="light">Top 10</Badge>
            </Group>

            {mostAssigned.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No workout assignments yet
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Workout</Table.Th>
                    <Table.Th>Difficulty</Table.Th>
                    <Table.Th>Zone</Table.Th>
                    <Table.Th>TSS</Table.Th>
                    <Table.Th>Assignments</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {mostAssigned.map((workout, index) => {
                    const zoneInfo = workout.primary_zone ? TRAINING_ZONES[workout.primary_zone] : null;
                    return (
                      <Table.Tr key={index}>
                        <Table.Td>
                          <Text size="sm" fw={500}>{workout.name}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            variant="light"
                            color={
                              workout.difficulty_level === 'beginner' ? 'green' :
                              workout.difficulty_level === 'intermediate' ? 'blue' : 'orange'
                            }
                          >
                            {workout.difficulty_level || 'intermediate'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {zoneInfo && (
                            <Badge size="sm" variant="light" color={zoneInfo.color}>
                              {zoneInfo.name}
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{workout.target_tss}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="filled">
                            {workout.count}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>

        {/* Template Completion Rates */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} c="dark">Workout Template Performance</Text>
              <Badge size="sm" variant="light">Completion Rates</Badge>
            </Group>

            {templateRates.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No template data available
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Workout</Table.Th>
                    <Table.Th>Total</Table.Th>
                    <Table.Th>Completed</Table.Th>
                    <Table.Th>Skipped</Table.Th>
                    <Table.Th>Completion Rate</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {templateRates.slice(0, 10).map((template, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{template.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{template.total}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color="green">
                          {template.completed}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color="gray">
                          {template.skipped}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Progress
                            value={parseFloat(template.completionRate)}
                            color={
                              parseFloat(template.completionRate) >= 80 ? 'green' :
                              parseFloat(template.completionRate) >= 60 ? 'yellow' : 'red'
                            }
                            size="sm"
                            style={{ flex: 1 }}
                          />
                          <Text size="sm" fw={600}>
                            {template.completionRate}%
                          </Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};

export default InsightsDashboard;
