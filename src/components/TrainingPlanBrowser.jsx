import { useState, useMemo } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Button,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Paper,
  Progress,
  Divider,
  ThemeIcon,
  Timeline,
  Alert,
} from '@mantine/core';
import {
  IconTarget,
  IconClock,
  IconTrendingUp,
  IconCalendar,
  IconInfoCircle,
  IconChevronRight,
  IconCheck,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getAllPlans, getPlansByGoal, getPlansByFitnessLevel } from '../data/trainingPlanTemplates';
import { TRAINING_PHASES, GOAL_TYPES, FITNESS_LEVELS, WORKOUT_TYPES } from '../utils/trainingPlans';
import { WORKOUT_LIBRARY } from '../data/workoutLibrary';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Training Plan Browser Component
 * Allows users to browse, preview, and activate training plans
 */
const TrainingPlanBrowser = ({ activePlan, onPlanActivated, compact = false }) => {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activating, setActivating] = useState(false);

  // Get all plans and filter
  const allPlans = useMemo(() => getAllPlans(), []);

  const filteredPlans = useMemo(() => {
    if (filter === 'all') return allPlans;
    if (['beginner', 'intermediate', 'advanced'].includes(filter)) {
      return getPlansByFitnessLevel(filter);
    }
    return getPlansByGoal(filter);
  }, [allPlans, filter]);

  // Get methodology color
  const getMethodologyColor = (methodology) => {
    const colors = {
      polarized: 'blue',
      sweet_spot: 'orange',
      pyramidal: 'grape',
      threshold: 'red',
      endurance: 'teal',
    };
    return colors[methodology] || 'gray';
  };

  // Get goal icon
  const getGoalIcon = (goal) => {
    return GOAL_TYPES[goal]?.icon || '🚴';
  };

  // Activate a training plan
  const handleActivatePlan = async (plan) => {
    if (!user?.id) {
      notifications.show({
        title: 'Sign In Required',
        message: 'Please sign in to start a training plan',
        color: 'yellow',
      });
      return;
    }

    setActivating(true);

    try {
      // Deactivate any existing active plan
      if (activePlan?.id) {
        await supabase
          .from('training_plans')
          .update({ status: 'completed', ended_at: new Date().toISOString() })
          .eq('id', activePlan.id);
      }

      // Create new training plan
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1); // Start tomorrow
      startDate.setHours(0, 0, 0, 0);

      const { data: newPlan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          template_id: plan.id,
          name: plan.name,
          duration_weeks: plan.duration,
          methodology: plan.methodology,
          goal: plan.goal,
          fitness_level: plan.fitnessLevel,
          started_at: startDate.toISOString(),
          status: 'active',
        })
        .select()
        .single();

      if (planError) throw planError;

      // Generate planned workouts for each week
      if (plan.weekTemplates) {
        const workouts = [];

        for (let week = 1; week <= plan.duration; week++) {
          const weekTemplate = plan.weekTemplates[week] || plan.weekTemplates[1];

          if (weekTemplate) {
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

            dayNames.forEach((dayName, dayIndex) => {
              const dayPlan = weekTemplate[dayName];
              if (dayPlan) {
                const workoutInfo = dayPlan.workout ? WORKOUT_LIBRARY[dayPlan.workout] : null;

                workouts.push({
                  plan_id: newPlan.id,
                  week_number: week,
                  day_of_week: dayIndex,
                  workout_type: dayPlan.workout || 'rest',
                  workout_id: dayPlan.workout,
                  notes: dayPlan.notes || '',
                  target_tss: workoutInfo?.targetTSS || 0,
                  target_duration: workoutInfo?.duration || 0,
                  completed: false,
                });
              }
            });
          }
        }

        if (workouts.length > 0) {
          const { error: workoutError } = await supabase
            .from('planned_workouts')
            .insert(workouts);

          if (workoutError) {
            console.error('Failed to create workouts:', workoutError);
          }
        }
      }

      notifications.show({
        title: 'Plan Activated',
        message: `${plan.name} starts tomorrow!`,
        color: 'lime',
        icon: <IconCheck size={16} />,
      });

      setPreviewOpen(false);
      setSelectedPlan(null);

      if (onPlanActivated) {
        onPlanActivated(newPlan);
      }
    } catch (error) {
      console.error('Failed to activate plan:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to activate training plan. Please try again.',
        color: 'red',
      });
    } finally {
      setActivating(false);
    }
  };

  // Preview a plan
  const handlePreviewPlan = (plan) => {
    setSelectedPlan(plan);
    setPreviewOpen(true);
  };

  // Render plan card
  const renderPlanCard = (plan) => (
    <Card
      key={plan.id}
      withBorder
      p="md"
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderColor: tokens.colors.bgTertiary,
      }}
      onClick={() => handlePreviewPlan(plan)}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box style={{ flex: 1 }}>
            <Group gap="xs" mb={4}>
              <Text size="lg">{getGoalIcon(plan.goal)}</Text>
              <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary }}>
                {plan.name}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {plan.description}
            </Text>
          </Box>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Badge size="xs" color={getMethodologyColor(plan.methodology)} variant="light">
            {plan.methodology}
          </Badge>
          <Badge size="xs" variant="outline">
            {plan.duration} weeks
          </Badge>
          <Badge size="xs" color="gray" variant="light">
            {FITNESS_LEVELS[plan.fitnessLevel]?.name || plan.fitnessLevel}
          </Badge>
        </Group>

        <Group gap="lg">
          <Group gap={4}>
            <IconClock size={14} style={{ color: tokens.colors.textMuted }} />
            <Text size="xs" c="dimmed">
              {plan.hoursPerWeek?.min}-{plan.hoursPerWeek?.max} hrs/wk
            </Text>
          </Group>
          <Group gap={4}>
            <IconTrendingUp size={14} style={{ color: tokens.colors.textMuted }} />
            <Text size="xs" c="dimmed">
              {plan.weeklyTSS?.min}-{plan.weeklyTSS?.max} TSS
            </Text>
          </Group>
        </Group>

        <Button
          variant="light"
          color="lime"
          size="xs"
          fullWidth
          rightSection={<IconChevronRight size={14} />}
        >
          Preview Plan
        </Button>
      </Stack>
    </Card>
  );

  // Render plan preview modal
  const renderPlanPreview = () => {
    if (!selectedPlan) return null;

    return (
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          <Group gap="sm">
            <Text size="xl">{getGoalIcon(selectedPlan.goal)}</Text>
            <Text fw={600} size="lg">{selectedPlan.name}</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          {/* Plan Overview */}
          <Text size="sm" c="dimmed">{selectedPlan.description}</Text>

          {/* Key Stats */}
          <SimpleGrid cols={3} spacing="xs">
            <Paper p="sm" withBorder ta="center">
              <IconCalendar size={20} style={{ color: tokens.colors.textMuted, marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.duration}</Text>
              <Text size="xs" c="dimmed">weeks</Text>
            </Paper>
            <Paper p="sm" withBorder ta="center">
              <IconClock size={20} style={{ color: tokens.colors.textMuted, marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.hoursPerWeek?.min}-{selectedPlan.hoursPerWeek?.max}</Text>
              <Text size="xs" c="dimmed">hrs/week</Text>
            </Paper>
            <Paper p="sm" withBorder ta="center">
              <IconTrendingUp size={20} style={{ color: tokens.colors.textMuted, marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.weeklyTSS?.min}-{selectedPlan.weeklyTSS?.max}</Text>
              <Text size="xs" c="dimmed">weekly TSS</Text>
            </Paper>
          </SimpleGrid>

          {/* Badges */}
          <Group gap="xs">
            <Badge color={getMethodologyColor(selectedPlan.methodology)} variant="filled">
              {selectedPlan.methodology} Training
            </Badge>
            <Badge color="gray" variant="light">
              {FITNESS_LEVELS[selectedPlan.fitnessLevel]?.name}
            </Badge>
            <Badge color="blue" variant="light">
              {GOAL_TYPES[selectedPlan.goal]?.name}
            </Badge>
          </Group>

          <Divider />

          {/* Phases Timeline */}
          <Box>
            <Text fw={600} size="sm" mb="sm">Training Phases</Text>
            <Timeline active={-1} bulletSize={24} lineWidth={2}>
              {selectedPlan.phases?.map((phase, idx) => {
                const phaseInfo = TRAINING_PHASES[phase.phase];
                const weekRange = phase.weeks.length === 1
                  ? `Week ${phase.weeks[0]}`
                  : `Weeks ${phase.weeks[0]}-${phase.weeks[phase.weeks.length - 1]}`;

                return (
                  <Timeline.Item
                    key={idx}
                    bullet={
                      <ThemeIcon size={24} color={phaseInfo?.color || 'gray'} radius="xl">
                        <IconTarget size={14} />
                      </ThemeIcon>
                    }
                    title={
                      <Group gap="xs">
                        <Text size="sm" fw={500}>{phaseInfo?.name || phase.phase}</Text>
                        <Badge size="xs" variant="light">{weekRange}</Badge>
                      </Group>
                    }
                  >
                    <Text size="xs" c="dimmed">{phase.focus}</Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </Box>

          {/* Expected Gains */}
          {selectedPlan.expectedGains && (
            <>
              <Divider />
              <Box>
                <Text fw={600} size="sm" mb="sm">Expected Outcomes</Text>
                <Stack gap="xs">
                  {Object.entries(selectedPlan.expectedGains).map(([key, value]) => (
                    <Group key={key} gap="sm">
                      <ThemeIcon size="sm" color="lime" variant="light">
                        <IconCheck size={12} />
                      </ThemeIcon>
                      <Text size="sm">
                        <Text span fw={500}>{key.replace(/_/g, ' ')}: </Text>
                        {value}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Target Audience */}
          {selectedPlan.targetAudience && (
            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="sm">{selectedPlan.targetAudience}</Text>
            </Alert>
          )}

          {/* Activate Button */}
          <Button
            color="lime"
            size="md"
            fullWidth
            leftSection={<IconPlayerPlay size={18} />}
            onClick={() => handleActivatePlan(selectedPlan)}
            loading={activating}
            disabled={activePlan?.template_id === selectedPlan.id}
          >
            {activePlan?.template_id === selectedPlan.id
              ? 'Currently Active'
              : activePlan
              ? 'Switch to This Plan'
              : 'Start This Plan'}
          </Button>

          {activePlan && activePlan.template_id !== selectedPlan.id && (
            <Text size="xs" c="dimmed" ta="center">
              Starting a new plan will end your current plan
            </Text>
          )}
        </Stack>
      </Modal>
    );
  };

  // Compact view for sidebar
  if (compact) {
    return (
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <ThemeIcon size="md" color="lime" variant="light">
              <IconCalendar size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">Training Plans</Text>
          </Group>
          <Badge size="xs" color="lime" variant="light">
            {allPlans.length} plans
          </Badge>
        </Group>

        <Stack gap="xs">
          {allPlans.slice(0, 3).map((plan) => (
            <Paper
              key={plan.id}
              p="sm"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => handlePreviewPlan(plan)}
            >
              <Group justify="space-between">
                <Box>
                  <Text size="sm" fw={500}>{plan.name}</Text>
                  <Text size="xs" c="dimmed">{plan.duration} weeks</Text>
                </Box>
                <IconChevronRight size={16} style={{ color: tokens.colors.textMuted }} />
              </Group>
            </Paper>
          ))}

          <Button variant="subtle" color="lime" size="xs" fullWidth>
            View All Plans
          </Button>
        </Stack>

        {renderPlanPreview()}
      </Card>
    );
  }

  // Full view
  return (
    <Box>
      {/* Filter Controls */}
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Text fw={600} size="lg" style={{ color: tokens.colors.textPrimary }}>
          Training Plans
        </Text>
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Beginner', value: 'beginner' },
            { label: 'Intermediate', value: 'intermediate' },
            { label: 'Advanced', value: 'advanced' },
          ]}
        />
      </Group>

      {/* Goal Filter Badges */}
      <Group gap="xs" mb="md">
        {Object.entries(GOAL_TYPES).map(([key, goal]) => (
          <Badge
            key={key}
            variant={filter === key ? 'filled' : 'light'}
            color={filter === key ? 'lime' : 'gray'}
            style={{ cursor: 'pointer' }}
            onClick={() => setFilter(filter === key ? 'all' : key)}
          >
            {goal.icon} {goal.name}
          </Badge>
        ))}
      </Group>

      {/* Active Plan Banner */}
      {activePlan && (
        <Alert
          icon={<IconPlayerPlay size={16} />}
          color="lime"
          variant="light"
          mb="md"
        >
          <Group justify="space-between">
            <Box>
              <Text size="sm" fw={500}>Active Plan: {activePlan.name}</Text>
              <Text size="xs" c="dimmed">
                Started {new Date(activePlan.started_at).toLocaleDateString()}
              </Text>
            </Box>
            <Badge color="lime">{activePlan.status}</Badge>
          </Group>
        </Alert>
      )}

      {/* Plan Grid */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {filteredPlans.map(renderPlanCard)}
      </SimpleGrid>

      {filteredPlans.length === 0 && (
        <Paper p="xl" ta="center" withBorder>
          <Text c="dimmed">No plans match your filter criteria</Text>
        </Paper>
      )}

      {renderPlanPreview()}
    </Box>
  );
};

export default TrainingPlanBrowser;
