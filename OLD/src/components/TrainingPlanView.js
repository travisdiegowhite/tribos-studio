import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Button,
  Badge,
  Card,
  Progress,
  Grid,
  ActionIcon,
  Tooltip,
  Alert,
  Tabs,
  RingProgress,
  Divider,
} from '@mantine/core';
import {
  Calendar,
  TrendingUp,
  Award,
  ChevronLeft,
  Edit,
  Trash2,
  Play,
  Check,
  X,
  Info,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { GOAL_TYPES, TRAINING_PHASES, WORKOUT_TYPES } from '../utils/trainingPlans';
import TrainingCalendar from './TrainingCalendar';
import WeeklySchedule from './WeeklySchedule';
import { getPlanCompletionStats } from '../services/workoutCompliance';

/**
 * Training Plan View Component
 * Displays a single training plan with progress tracking
 */
const TrainingPlanView = () => {
  const { planId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState([]);
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    completedWorkouts: 0,
    totalTSS: 0,
    completedTSS: 0,
    weeksCompleted: 0,
    completion_rate: 0,
    excellent_count: 0,
    good_count: 0,
    partial_count: 0,
    poor_count: 0,
  });

  // Load plan data
  useEffect(() => {
    if (!user?.id || !planId) return;
    loadPlanData();
  }, [user?.id, planId]);

  const loadPlanData = async () => {
    try {
      setLoading(true);

      // Check for demo mode - redirect to training page
      const { isDemoMode } = await import('../utils/demoData');
      if (isDemoMode()) {
        console.log('✅ Demo mode: training plans not available');
        toast.error('Training plans are not available in demo mode');
        navigate('/training');
        return;
      }

      // Load training plan
      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .select('*')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single();

      if (planError) throw planError;
      if (!planData) {
        toast.error('Training plan not found');
        navigate('/training');
        return;
      }

      setPlan(planData);

      // Load all workouts for this plan
      const { data: workoutsData, error: workoutsError } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', planId)
        .order('week_number', { ascending: true })
        .order('day_of_week', { ascending: true });

      if (workoutsError) throw workoutsError;

      setWorkouts(workoutsData || []);

      // Organize workouts by week
      const weekMap = {};
      (workoutsData || []).forEach(workout => {
        if (!weekMap[workout.week_number]) {
          weekMap[workout.week_number] = {
            week_number: workout.week_number,
            phase: determinePhase(workout.week_number, planData.duration_weeks),
            workouts: [],
            total_tss: 0,
            total_hours: 0,
          };
        }

        weekMap[workout.week_number].workouts.push(workout);
        weekMap[workout.week_number].total_tss += workout.target_tss || 0;
        weekMap[workout.week_number].total_hours += (workout.target_duration || 0) / 60;
      });

      const schedule = Object.values(weekMap).sort((a, b) => a.week_number - b.week_number);
      setWeeklySchedule(schedule);

      // Calculate stats
      const totalWorkouts = workoutsData.length;
      const completedWorkouts = workoutsData.filter(w => w.completed).length;
      const totalTSS = workoutsData.reduce((sum, w) => sum + (w.target_tss || 0), 0);
      const completedTSS = workoutsData.filter(w => w.completed).reduce((sum, w) => sum + (w.actual_tss || w.target_tss || 0), 0);

      // Calculate weeks completed (all workouts in week are done)
      let weeksCompleted = 0;
      schedule.forEach(week => {
        const allCompleted = week.workouts.every(w => w.completed || w.workout_type === 'rest');
        if (allCompleted) weeksCompleted++;
      });

      // Get detailed completion stats from database
      const completionStats = await getPlanCompletionStats(planId);

      setStats({
        totalWorkouts,
        completedWorkouts,
        totalTSS,
        completedTSS,
        weeksCompleted,
        completion_rate: completionStats.completion_rate || 0,
        excellent_count: completionStats.excellent_count || 0,
        good_count: completionStats.good_count || 0,
        partial_count: completionStats.partial_count || 0,
        poor_count: completionStats.poor_count || 0,
      });

    } catch (error) {
      console.error('Failed to load plan:', error);
      toast.error('Failed to load training plan');
    } finally {
      setLoading(false);
    }
  };

  // Determine phase based on week number
  const determinePhase = (weekNumber, totalWeeks) => {
    const progress = (weekNumber / totalWeeks) * 100;
    if (progress < 40) return 'base';
    if (progress < 70) return 'build';
    if (progress < 90) return 'peak';
    return 'taper';
  };

  // Mark workout as completed
  const markWorkoutCompleted = async (workoutId) => {
    try {
      const { error } = await supabase
        .from('planned_workouts')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', workoutId);

      if (error) throw error;

      toast.success('Workout marked as completed!');
      loadPlanData(); // Reload to update stats
    } catch (error) {
      console.error('Failed to mark workout completed:', error);
      toast.error('Failed to update workout');
    }
  };

  // Delete plan
  const deletePlan = async () => {
    if (!window.confirm('Are you sure you want to delete this training plan? This cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;

      toast.success('Training plan deleted');
      navigate('/training');
    } catch (error) {
      console.error('Failed to delete plan:', error);
      toast.error('Failed to delete plan');
    }
  };

  // Pause/Resume plan
  const togglePlanStatus = async () => {
    const newStatus = plan.status === 'active' ? 'paused' : 'active';

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({ status: newStatus })
        .eq('id', planId);

      if (error) throw error;

      setPlan({ ...plan, status: newStatus });
      toast.success(`Plan ${newStatus === 'active' ? 'resumed' : 'paused'}`);
    } catch (error) {
      console.error('Failed to update plan status:', error);
      toast.error('Failed to update plan');
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Text>Loading training plan...</Text>
      </Container>
    );
  }

  if (!plan) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="Plan Not Found">
          This training plan could not be found.
        </Alert>
      </Container>
    );
  }

  const completionPercentage = stats.totalWorkouts > 0
    ? Math.round((stats.completedWorkouts / stats.totalWorkouts) * 100)
    : 0;

  const goal = GOAL_TYPES[plan.goal_type];
  const currentPhase = TRAINING_PHASES[plan.current_phase];

  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Group>
          <ActionIcon variant="subtle" onClick={() => navigate('/training')}>
            <ChevronLeft size={20} />
          </ActionIcon>
          <div>
            <Title order={2}>{plan.name}</Title>
            <Group gap="xs" mt="xs">
              <Badge color={currentPhase?.color || 'gray'} variant="light">
                {currentPhase?.name || plan.current_phase}
              </Badge>
              <Badge color={plan.status === 'active' ? 'green' : 'gray'}>
                {plan.status}
              </Badge>
              {goal && (
                <Text size="sm" c="dimmed">
                  {goal.icon} {goal.name}
                </Text>
              )}
            </Group>
          </div>
        </Group>

        <Group>
          <Button
            variant="light"
            onClick={togglePlanStatus}
          >
            {plan.status === 'active' ? 'Pause Plan' : 'Resume Plan'}
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<Trash2 size={16} />}
            onClick={deletePlan}
          >
            Delete
          </Button>
        </Group>
      </Group>

      {/* Progress Overview */}
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder p="md">
            <Group justify="space-between" mb="md">
              <Text size="sm" fw={600}>Overall Progress</Text>
              <RingProgress
                size={80}
                thickness={8}
                sections={[{ value: completionPercentage, color: 'blue' }]}
                label={
                  <Text size="xs" ta="center" fw={700}>
                    {completionPercentage}%
                  </Text>
                }
              />
            </Group>
            <Text size="xs" c="dimmed">
              {stats.completedWorkouts} of {stats.totalWorkouts} workouts completed
            </Text>
            <Progress value={completionPercentage} mt="xs" />
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" fw={600} mb="xs">Training Load</Text>
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed">Completed TSS</Text>
              <Text size="sm" fw={600}>{stats.completedTSS}</Text>
            </Group>
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed">Total TSS</Text>
              <Text size="sm" fw={600}>{stats.totalTSS}</Text>
            </Group>
            <Progress
              value={(stats.completedTSS / stats.totalTSS) * 100}
              mt="xs"
              color="green"
            />
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" fw={600} mb="xs">Plan Details</Text>
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed">Current Week</Text>
              <Text size="sm" fw={600}>{plan.current_week} of {plan.duration_weeks}</Text>
            </Group>
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed">Weeks Completed</Text>
              <Text size="sm" fw={600}>{stats.weeksCompleted}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Hours/Week</Text>
              <Text size="sm" fw={600}>{plan.hours_per_week}h</Text>
            </Group>
          </Card>
        </Grid.Col>

        {/* Completion Quality Card */}
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" fw={600} mb="xs">Completion Quality</Text>
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap={4}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#51cf66' }} />
                  <Text size="xs" c="dimmed">Excellent</Text>
                </Group>
                <Text size="sm" fw={600}>{stats.excellent_count}</Text>
              </Group>
              <Group justify="space-between">
                <Group gap={4}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#74c0fc' }} />
                  <Text size="xs" c="dimmed">Good</Text>
                </Group>
                <Text size="sm" fw={600}>{stats.good_count}</Text>
              </Group>
              <Group justify="space-between">
                <Group gap={4}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ffd43b' }} />
                  <Text size="xs" c="dimmed">Partial</Text>
                </Group>
                <Text size="sm" fw={600}>{stats.partial_count}</Text>
              </Group>
              <Group justify="space-between">
                <Group gap={4}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff6b6b' }} />
                  <Text size="xs" c="dimmed">Poor</Text>
                </Group>
                <Text size="sm" fw={600}>{stats.poor_count}</Text>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Current Phase Info */}
      {currentPhase && (
        <Alert
          icon={<Info size={16} />}
          title={`${currentPhase.name} - Week ${plan.current_week}`}
          color={currentPhase.color}
          mb="lg"
        >
          <Text size="sm">{currentPhase.description}</Text>
          <Text size="xs" c="dimmed" mt="xs">
            Focus: {currentPhase.focus}
          </Text>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="schedule">
        <Tabs.List mb="md">
          <Tabs.Tab value="schedule" leftSection={<Calendar size={16} />}>
            Weekly Schedule
          </Tabs.Tab>
          <Tabs.Tab value="calendar" leftSection={<Calendar size={16} />}>
            Calendar View
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="schedule">
          <WeeklySchedule
            schedule={weeklySchedule}
            showGenerateRoute={true}
            onUpdate={(updated) => {
              // Handle schedule updates if needed
              console.log('Schedule updated:', updated);
            }}
          />
        </Tabs.Panel>

        <Tabs.Panel value="calendar">
          <TrainingCalendar activePlan={plan} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
};

export default TrainingPlanView;
