/**
 * ActivePlanCard Component
 * Displays the currently active training plan with progress and actions
 */

import {
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Progress,
  Badge,
  Button,
  Menu,
  ActionIcon,
  ThemeIcon,
  RingProgress,
  Divider,
  Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { TRAINING_PHASES } from '../../utils/trainingPlans';
import { exportTrainingPlan, downloadPlanExport } from '../../utils/trainingPlanExport';
import { ArrowsClockwise, Barbell, Calendar, Check, DotsThreeVertical, DownloadSimple, Pause, Play, Target, Trash, TrendUp, WarningCircle } from '@phosphor-icons/react';

export default function ActivePlanCard({
  plan,
  currentWeek,
  currentPhase,
  progress,
  plannedWorkouts,
  onPause,
  onResume,
  onComplete,
  onRegenerate,
  onDelete,
  onViewCalendar,
  onAddSupplement,
  compact = false,
}) {
  const isPaused = plan?.status === 'paused';
  const phaseInfo = currentPhase ? TRAINING_PHASES[currentPhase] : null;

  // Calculate compliance color
  const complianceColor = (progress?.overallCompliance || 0) >= 80
    ? 'green'
    : (progress?.overallCompliance || 0) >= 50
    ? 'yellow'
    : 'red';

  if (!plan) {
    return (
      <Paper p="lg" radius="md" withBorder>
        <Stack align="center" spacing="md" py="xl">
          <ThemeIcon size={60} radius="xl" color="gray" variant="light">
            <Target size={30} />
          </ThemeIcon>
          <Title order={4}>No Active Training Plan</Title>
          <Text c="dimmed" ta="center" maw={400}>
            Choose a training plan to get started with structured workouts
          </Text>
        </Stack>
      </Paper>
    );
  }

  if (compact) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Group position="apart">
          <div style={{ flex: 1 }}>
            <Group spacing="xs">
              <Text fw={600}>{plan.name}</Text>
              <Badge size="sm" color={isPaused ? 'yellow' : 'green'}>
                {isPaused ? 'Paused' : 'Active'}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Week {currentWeek} of {plan.duration_weeks} &bull; {phaseInfo?.name || 'In Progress'}
            </Text>
          </div>
          <Group spacing="xs">
            <RingProgress
              size={50}
              thickness={4}
              roundCaps
              sections={[{ value: progress?.overallCompliance || 0, color: complianceColor }]}
              label={
                <Text size="xs" ta="center" fw={700}>
                  {progress?.overallCompliance || 0}%
                </Text>
              }
            />
            <Button size="xs" variant="light" onClick={onViewCalendar}>
              View
            </Button>
          </Group>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper p="lg" radius="md" withBorder>
      {/* Header */}
      <Group position="apart" mb="md">
        <div>
          <Group spacing="sm">
            <Title order={4}>{plan.name}</Title>
            <Badge size="lg" color={isPaused ? 'yellow' : 'green'} variant="light">
              {isPaused ? 'Paused' : 'Active'}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            {plan.methodology?.replace('_', ' ')} training &bull; {plan.fitness_level}
          </Text>
        </div>

        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle">
              <DotsThreeVertical size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {isPaused ? (
              <Menu.Item
                icon={<Play size={16} />}
                onClick={onResume}
              >
                Resume Plan
              </Menu.Item>
            ) : (
              <Menu.Item
                icon={<Pause size={16} />}
                onClick={onPause}
              >
                Pause Plan
              </Menu.Item>
            )}
            <Menu.Item
              icon={<Check size={16} />}
              onClick={onComplete}
            >
              Mark as Complete
            </Menu.Item>
            <Menu.Item
              icon={<ArrowsClockwise size={16} />}
              onClick={onRegenerate}
            >
              Regenerate Workouts
            </Menu.Item>
            {plannedWorkouts && plannedWorkouts.length > 0 && (
              <>
                <Menu.Divider />
                <Menu.Label>Export Plan</Menu.Label>
                <Menu.Item
                  icon={<DownloadSimple size={16} />}
                  onClick={() => {
                    try {
                      const result = exportTrainingPlan(plan, plannedWorkouts, { format: 'csv' }, progress);
                      downloadPlanExport(result);
                      notifications.show({ title: 'Plan Exported', message: 'CSV downloaded', color: 'green' });
                    } catch (e) {
                      notifications.show({ title: 'Export Failed', message: e.message, color: 'red' });
                    }
                  }}
                >
                  Export as CSV
                </Menu.Item>
                <Menu.Item
                  icon={<DownloadSimple size={16} />}
                  onClick={() => {
                    try {
                      const result = exportTrainingPlan(plan, plannedWorkouts, { format: 'ical' }, progress);
                      downloadPlanExport(result);
                      notifications.show({ title: 'Plan Exported', message: 'Calendar file downloaded', color: 'green' });
                    } catch (e) {
                      notifications.show({ title: 'Export Failed', message: e.message, color: 'red' });
                    }
                  }}
                >
                  Export as Calendar (.ics)
                </Menu.Item>
              </>
            )}
            <Menu.Divider />
            <Menu.Item
              icon={<Trash size={16} />}
              color="red"
              onClick={onDelete}
            >
              Delete Plan
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Progress Stats */}
      <Stack spacing="md">
        {/* Current Phase */}
        {phaseInfo && (
          <Alert
            icon={<TrendUp size={18} />}
            color={phaseInfo.color || 'blue'}
            variant="light"
            radius="md"
          >
            <Text fw={500}>{phaseInfo.name}</Text>
            <Text size="sm" c="dimmed">{phaseInfo.focus}</Text>
          </Alert>
        )}

        {/* Week Progress */}
        <div>
          <Group position="apart" mb={4}>
            <Text size="sm" fw={500}>Week Progress</Text>
            <Text size="sm" c="dimmed">
              Week {currentWeek} of {plan.duration_weeks}
            </Text>
          </Group>
          <Progress
            value={(currentWeek / plan.duration_weeks) * 100}
            size="lg"
            radius="xl"
            color="blue"
          />
        </div>

        {/* Compliance */}
        <div>
          <Group position="apart" mb={4}>
            <Text size="sm" fw={500}>Workout Compliance</Text>
            <Text size="sm" c={complianceColor} fw={500}>
              {progress?.overallCompliance || 0}%
            </Text>
          </Group>
          <Progress
            value={progress?.overallCompliance || 0}
            size="lg"
            radius="xl"
            color={complianceColor}
          />
          <Text size="xs" c="dimmed" mt={4}>
            {plan.workouts_completed || 0} of {plan.workouts_total || 0} workouts completed
          </Text>
        </div>

        <Divider />

        {/* Actions */}
        <Group grow>
          <Button
            variant="light"
            leftIcon={<Calendar size={18} />}
            onClick={onViewCalendar}
          >
            View Calendar
          </Button>
          {onAddSupplement && (
            <Button
              variant="light"
              color="pink"
              leftIcon={<Barbell size={18} />}
              onClick={onAddSupplement}
            >
              Add Supplement
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
