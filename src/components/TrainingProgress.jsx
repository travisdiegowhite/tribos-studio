/**
 * TrainingProgress Component
 * Displays comprehensive training plan progress with visual metrics
 */

import { useMemo } from 'react';
import {
  Paper,
  Title,
  Text,
  Group,
  Stack,
  SimpleGrid,
  Progress,
  Badge,
  ThemeIcon,
  RingProgress,
  Divider,
  Box,
  Card,
  Timeline,
  Tooltip,
  Alert,
} from '@mantine/core';
import {
  IconTarget,
  IconTrendingUp,
  IconCalendar,
  IconClock,
  IconFlame,
  IconCheck,
  IconAlertTriangle,
  IconChartBar,
  IconFlag,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { TRAINING_PHASES } from '../utils/trainingPlans';
import { tokens } from '../theme';

export default function TrainingProgress({
  activePlan,
  progress,
  currentWeek,
  currentPhase,
  plannedWorkouts = [],
}) {
  // Calculate phase progress
  const phaseProgress = useMemo(() => {
    if (!activePlan?.template?.phases) return [];

    return activePlan.template.phases.map((phase) => {
      const totalWeeks = phase.weeks.length;
      const completedWeeks = phase.weeks.filter((w) => w < currentWeek).length;
      const isCurrent = phase.weeks.includes(currentWeek);

      return {
        ...phase,
        totalWeeks,
        completedWeeks,
        isCurrent,
        progress: Math.round((completedWeeks / totalWeeks) * 100),
        phaseInfo: TRAINING_PHASES[phase.phase],
      };
    });
  }, [activePlan, currentWeek]);

  // Calculate weekly TSS chart data
  const weeklyTSSData = useMemo(() => {
    if (!progress?.weeklyStats) return [];

    return progress.weeklyStats.map((week) => ({
      week: `W${week.weekNumber}`,
      planned: week.plannedTSS,
      actual: week.actualTSS,
      compliance: week.compliancePercent,
      isCurrent: week.weekNumber === currentWeek,
      isPast: week.weekNumber < currentWeek,
    }));
  }, [progress, currentWeek]);

  // Calculate compliance status
  const complianceStatus = useMemo(() => {
    const compliance = progress?.overallCompliance || 0;
    if (compliance >= 80) return { color: 'green', label: 'On Track', icon: IconCheck };
    if (compliance >= 60) return { color: 'yellow', label: 'Moderate', icon: IconAlertTriangle };
    return { color: 'red', label: 'Behind', icon: IconAlertTriangle };
  }, [progress]);

  // Get next workout
  const nextWorkout = useMemo(() => {
    if (!progress?.nextWorkout) return null;

    const workout = progress.nextWorkout;
    const date = new Date(workout.scheduled_date);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === new Date(today.getTime() + 86400000).toDateString();

    return {
      ...workout,
      dateLabel: isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  }, [progress]);

  if (!activePlan) {
    return (
      <Paper p="lg" radius="md" withBorder>
        <Stack align="center" spacing="md" py="xl">
          <ThemeIcon size={60} radius="xl" color="gray" variant="light">
            <IconTarget size={30} />
          </ThemeIcon>
          <Title order={4}>No Active Training Plan</Title>
          <Text c="dimmed" ta="center">
            Start a training plan to see your progress here
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing="lg">
      {/* Header with overall progress */}
      <Paper p="lg" radius="md" withBorder>
        <Group position="apart" mb="md">
          <div>
            <Title order={3}>{activePlan.name}</Title>
            <Text c="dimmed" size="sm">
              Week {currentWeek} of {activePlan.duration_weeks} &bull; {currentPhase && TRAINING_PHASES[currentPhase]?.name}
            </Text>
          </div>
          <Badge
            size="lg"
            color={complianceStatus.color}
            leftSection={<complianceStatus.icon size={14} />}
          >
            {complianceStatus.label}
          </Badge>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {/* Overall Progress */}
          <Card padding="md" radius="md" withBorder>
            <Group position="apart">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Overall Progress
                </Text>
                <Text size="xl" fw={700}>
                  {Math.round((currentWeek / activePlan.duration_weeks) * 100)}%
                </Text>
              </div>
              <RingProgress
                size={60}
                thickness={6}
                roundCaps
                sections={[
                  { value: (currentWeek / activePlan.duration_weeks) * 100, color: 'blue' },
                ]}
              />
            </Group>
          </Card>

          {/* Compliance */}
          <Card padding="md" radius="md" withBorder>
            <Group position="apart">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Compliance
                </Text>
                <Text size="xl" fw={700} c={complianceStatus.color}>
                  {progress?.overallCompliance || 0}%
                </Text>
              </div>
              <ThemeIcon size={40} radius="md" color={complianceStatus.color} variant="light">
                <IconTarget size={24} />
              </ThemeIcon>
            </Group>
          </Card>

          {/* Workouts Completed */}
          <Card padding="md" radius="md" withBorder>
            <Group position="apart">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Workouts Done
                </Text>
                <Text size="xl" fw={700}>
                  {activePlan.workouts_completed || 0}
                  <Text span size="sm" c="dimmed">
                    /{activePlan.workouts_total || 0}
                  </Text>
                </Text>
              </div>
              <ThemeIcon size={40} radius="md" color="green" variant="light">
                <IconCheck size={24} />
              </ThemeIcon>
            </Group>
          </Card>

          {/* Days Remaining */}
          <Card padding="md" radius="md" withBorder>
            <Group position="apart">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Days Remaining
                </Text>
                <Text size="xl" fw={700}>
                  {progress?.daysRemaining || 0}
                </Text>
              </div>
              <ThemeIcon size={40} radius="md" color="violet" variant="light">
                <IconCalendar size={24} />
              </ThemeIcon>
            </Group>
          </Card>
        </SimpleGrid>
      </Paper>

      {/* Next Workout Alert */}
      {nextWorkout && (
        <Alert
          icon={<IconPlayerPlay size={20} />}
          title={`Next Workout: ${nextWorkout.dateLabel}`}
          color="blue"
          radius="md"
        >
          <Group position="apart">
            <div>
              <Text fw={500}>{nextWorkout.workout?.name || 'Scheduled Workout'}</Text>
              {nextWorkout.workout && (
                <Text size="sm" c="dimmed">
                  {nextWorkout.workout.duration} min &bull; {nextWorkout.workout.targetTSS} TSS
                </Text>
              )}
            </div>
            {nextWorkout.notes && (
              <Text size="sm" c="dimmed" fs="italic">
                {nextWorkout.notes}
              </Text>
            )}
          </Group>
        </Alert>
      )}

      {/* Phase Timeline */}
      <Paper p="lg" radius="md" withBorder>
        <Title order={5} mb="md">Training Phases</Title>
        <Timeline active={phaseProgress.findIndex((p) => p.isCurrent)} bulletSize={24} lineWidth={2}>
          {phaseProgress.map((phase, index) => (
            <Timeline.Item
              key={index}
              bullet={
                phase.completedWeeks === phase.totalWeeks ? (
                  <IconCheck size={14} />
                ) : phase.isCurrent ? (
                  <IconPlayerPlay size={14} />
                ) : (
                  <IconFlag size={14} />
                )
              }
              title={
                <Group spacing="xs">
                  <Text fw={phase.isCurrent ? 700 : 400}>{phase.phaseInfo?.name || phase.phase}</Text>
                  {phase.isCurrent && <Badge size="xs" color="blue">Current</Badge>}
                </Group>
              }
              color={phase.completedWeeks === phase.totalWeeks ? 'green' : phase.isCurrent ? 'blue' : 'gray'}
            >
              <Text size="sm" c="dimmed">{phase.focus}</Text>
              <Text size="xs" mt={4}>
                Weeks {phase.weeks[0]}-{phase.weeks[phase.weeks.length - 1]}
              </Text>
              {phase.isCurrent && (
                <Progress
                  value={phase.progress}
                  size="sm"
                  mt="xs"
                  color="blue"
                  radius="xl"
                />
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      </Paper>

      {/* Weekly TSS Chart */}
      <Paper p="lg" radius="md" withBorder>
        <Title order={5} mb="md">Weekly Training Load (TSS)</Title>
        <Box h={250}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyTSSData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <Paper p="xs" shadow="sm" withBorder>
                      <Text size="sm" fw={500}>{label}</Text>
                      <Text size="xs" c="blue">Planned: {data.planned} TSS</Text>
                      <Text size="xs" c="green">Actual: {data.actual} TSS</Text>
                      <Text size="xs" c="dimmed">Compliance: {data.compliance}%</Text>
                    </Paper>
                  );
                }}
              />
              <Bar dataKey="planned" fill={tokens.colors.primary[200]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" radius={[4, 4, 0, 0]}>
                {weeklyTSSData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isCurrent
                        ? tokens.colors.primary[500]
                        : entry.isPast
                        ? entry.compliance >= 80
                          ? 'var(--tribos-success)'[500]
                          : entry.compliance >= 50
                          ? 'var(--tribos-warning)'[500]
                          : 'var(--tribos-error)'[400]
                        : tokens.colors.neutral[300]
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Group position="center" mt="sm" spacing="lg">
          <Group spacing={4}>
            <Box w={12} h={12} bg={tokens.colors.primary[200]} style={{ borderRadius: 2 }} />
            <Text size="xs" c="dimmed">Planned</Text>
          </Group>
          <Group spacing={4}>
            <Box w={12} h={12} bg={'var(--tribos-success)'[500]} style={{ borderRadius: 2 }} />
            <Text size="xs" c="dimmed">Completed (80%+)</Text>
          </Group>
          <Group spacing={4}>
            <Box w={12} h={12} bg={'var(--tribos-warning)'[500]} style={{ borderRadius: 2 }} />
            <Text size="xs" c="dimmed">Partial (50-80%)</Text>
          </Group>
        </Group>
      </Paper>

      {/* Current Week Stats */}
      {progress?.weeklyStats && progress.weeklyStats[currentWeek - 1] && (
        <Paper p="lg" radius="md" withBorder>
          <Title order={5} mb="md">This Week&apos;s Stats</Title>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Planned TSS</Text>
              <Text size="lg" fw={600}>{progress.weeklyStats[currentWeek - 1].plannedTSS}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Actual TSS</Text>
              <Text size="lg" fw={600}>{progress.weeklyStats[currentWeek - 1].actualTSS}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Planned Duration</Text>
              <Text size="lg" fw={600}>{progress.weeklyStats[currentWeek - 1].plannedDuration} min</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Workouts Done</Text>
              <Text size="lg" fw={600}>
                {progress.weeklyStats[currentWeek - 1].workoutsCompleted}
                <Text span size="sm" c="dimmed">
                  /{progress.weeklyStats[currentWeek - 1].workoutsPlanned}
                </Text>
              </Text>
            </div>
          </SimpleGrid>
        </Paper>
      )}
    </Stack>
  );
}
