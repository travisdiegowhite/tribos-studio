import React, { useState } from 'react';
import {
  Container,
  Paper,
  Title,
  Text,
  Stepper,
  Button,
  Group,
  TextInput,
  Select,
  NumberInput,
  Textarea,
  Stack,
  Card,
  Badge,
  Grid,
  Alert,
  Anchor,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { Calendar, Award, Target, TrendingUp, Check, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import {
  GOAL_TYPES,
  FITNESS_LEVELS,
  TRAINING_PHASES,
  getRecommendedWeeklyTSS,
} from '../utils/trainingPlans';
import WeeklySchedule from './WeeklySchedule';

/**
 * Training Plan Builder - Phase 3
 * Multi-step wizard for creating structured training plans
 */
const TrainingPlanBuilder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Wizard state
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);

  // Plan data
  const [planData, setPlanData] = useState({
    name: '',
    goal_type: 'endurance',
    goal_event_date: null,
    fitness_level: 'intermediate',
    hours_per_week: 8,
    duration_weeks: 12,
    current_phase: 'base',
    ftp: null,
    max_heart_rate: null,
  });

  // Weekly schedule (generated after step 2)
  const [weeklySchedule, setWeeklySchedule] = useState([]);

  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  // Generate weekly schedule based on plan data
  const generateSchedule = () => {
    const { duration_weeks, hours_per_week, fitness_level, goal_type } = planData;
    const recommendedTSS = getRecommendedWeeklyTSS(fitness_level, hours_per_week);

    const schedule = [];

    for (let week = 1; week <= duration_weeks; week++) {
      // Determine phase based on week
      let phase = 'base';
      const progressPercent = (week / duration_weeks) * 100;

      if (progressPercent < 40) {
        phase = 'base';
      } else if (progressPercent < 70) {
        phase = 'build';
      } else if (progressPercent < 90) {
        phase = 'peak';
      } else {
        phase = 'taper';
      }

      // Recovery week every 4th week
      if (week % 4 === 0 && week !== duration_weeks) {
        phase = 'recovery';
      }

      // Generate workouts for each day of the week
      const workouts = generateWeekWorkouts(week, phase, recommendedTSS, goal_type);

      schedule.push({
        week_number: week,
        phase,
        workouts,
        total_tss: workouts.reduce((sum, w) => sum + (w.target_tss || 0), 0),
        total_hours: workouts.reduce((sum, w) => sum + ((w.target_duration || 0) / 60), 0),
      });
    }

    setWeeklySchedule(schedule);
  };

  // Generate workouts for a week based on phase and goals
  const generateWeekWorkouts = (weekNumber, phase, weeklyTSS, goalType) => {
    const workouts = [];

    if (phase === 'base') {
      // Base: Focus on endurance
      workouts.push(
        { day_of_week: 0, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 1, workout_type: 'endurance', target_duration: 60, target_tss: 60 },
        { day_of_week: 2, workout_type: 'endurance', target_duration: 90, target_tss: 75 },
        { day_of_week: 3, workout_type: 'recovery', target_duration: 45, target_tss: 30 },
        { day_of_week: 4, workout_type: 'tempo', target_duration: 75, target_tss: 70 },
        { day_of_week: 5, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 6, workout_type: 'long_ride', target_duration: 150, target_tss: 120 }
      );
    } else if (phase === 'build') {
      // Build: Add intensity
      workouts.push(
        { day_of_week: 0, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 1, workout_type: 'sweet_spot', target_duration: 70, target_tss: 85 },
        { day_of_week: 2, workout_type: 'endurance', target_duration: 90, target_tss: 75 },
        { day_of_week: 3, workout_type: 'recovery', target_duration: 45, target_tss: 30 },
        { day_of_week: 4, workout_type: 'threshold', target_duration: 75, target_tss: 90 },
        { day_of_week: 5, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 6, workout_type: 'long_ride', target_duration: 180, target_tss: 140 }
      );
    } else if (phase === 'peak') {
      // Peak: Race-specific intensity
      workouts.push(
        { day_of_week: 0, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 1, workout_type: 'vo2max', target_duration: 75, target_tss: 95 },
        { day_of_week: 2, workout_type: 'endurance', target_duration: 75, target_tss: 65 },
        { day_of_week: 3, workout_type: 'recovery', target_duration: 45, target_tss: 30 },
        { day_of_week: 4, workout_type: 'intervals', target_duration: 75, target_tss: 85 },
        { day_of_week: 5, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 6, workout_type: 'long_ride', target_duration: 150, target_tss: 130 }
      );
    } else if (phase === 'taper') {
      // Taper: Reduce volume, maintain intensity
      workouts.push(
        { day_of_week: 0, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 1, workout_type: 'intervals', target_duration: 45, target_tss: 50 },
        { day_of_week: 2, workout_type: 'endurance', target_duration: 60, target_tss: 50 },
        { day_of_week: 3, workout_type: 'recovery', target_duration: 30, target_tss: 20 },
        { day_of_week: 4, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 5, workout_type: 'recovery', target_duration: 30, target_tss: 20 },
        { day_of_week: 6, workout_type: 'rest', target_duration: 0, target_tss: 0 }
      );
    } else {
      // Recovery week
      workouts.push(
        { day_of_week: 0, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 1, workout_type: 'recovery', target_duration: 45, target_tss: 30 },
        { day_of_week: 2, workout_type: 'endurance', target_duration: 60, target_tss: 50 },
        { day_of_week: 3, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 4, workout_type: 'recovery', target_duration: 45, target_tss: 30 },
        { day_of_week: 5, workout_type: 'rest', target_duration: 0, target_tss: 0 },
        { day_of_week: 6, workout_type: 'endurance', target_duration: 90, target_tss: 70 }
      );
    }

    // Add terrain preference based on goal
    return workouts.map(w => ({
      ...w,
      terrain_preference: goalType === 'climbing' ? 'hilly' : 'mixed',
      target_zone: getTargetZone(w.workout_type)
    }));
  };

  // Get target zone for workout type
  const getTargetZone = (workoutType) => {
    const zoneMap = {
      rest: null,
      recovery: 1,
      endurance: 2,
      tempo: 3,
      sweet_spot: 3.5,
      threshold: 4,
      vo2max: 5,
      hill_repeats: 4,
      intervals: 4,
      long_ride: 2
    };
    return zoneMap[workoutType] || 2;
  };

  // Create training plan
  const createPlan = async () => {
    // Validate we have a schedule
    if (!weeklySchedule || weeklySchedule.length === 0) {
      toast.error('Please generate a training schedule first');
      return;
    }

    // Check for demo mode - prevent creating plans
    const { isDemoMode } = await import('../utils/demoData');
    if (isDemoMode()) {
      toast.error('Training plan creation is not available in demo mode. Please create an account to save plans.');
      return;
    }

    try {
      setCreating(true);

      // Prepare plan data (convert null date to undefined to avoid DB issues)
      const planToInsert = {
        user_id: user.id,
        name: planData.name,
        goal_type: planData.goal_type,
        goal_event_date: planData.goal_event_date || null,
        fitness_level: planData.fitness_level,
        hours_per_week: planData.hours_per_week,
        duration_weeks: planData.duration_weeks,
        current_week: 1,
        current_phase: planData.current_phase,
        ftp: planData.ftp || null,
        max_heart_rate: planData.max_heart_rate || null,
        status: 'active'
      };

      console.log('Creating plan with data:', planToInsert);

      // Insert training plan
      const { data: plan, error: planError } = await supabase
        .from('training_plans')
        .insert([planToInsert])
        .select()
        .single();

      if (planError) {
        console.error('Plan insert error:', planError);
        throw planError;
      }

      // Insert all planned workouts
      const allWorkouts = [];
      weeklySchedule.forEach(week => {
        week.workouts.forEach(workout => {
          allWorkouts.push({
            plan_id: plan.id,
            week_number: week.week_number,
            ...workout
          });
        });
      });

      console.log(`Inserting ${allWorkouts.length} workouts...`);

      const { error: workoutsError } = await supabase
        .from('planned_workouts')
        .insert(allWorkouts);

      if (workoutsError) {
        console.error('Workouts insert error:', workoutsError);
        throw workoutsError;
      }

      toast.success('Training plan created successfully!');
      navigate('/training');

    } catch (error) {
      console.error('Failed to create training plan:', error);
      toast.error(`Failed to create training plan: ${error.message || 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Paper withBorder p="xl">
        <Title order={2} mb="lg">Create Training Plan</Title>

        <Stepper active={active} onStepClick={setActive} breakpoint="sm">
          {/* Step 1: Plan Details */}
          <Stepper.Step label="Plan Details" description="Basic information">
            <Stack gap="md" mt="xl">
              <TextInput
                label="Plan Name"
                placeholder="e.g., Spring Century Training"
                value={planData.name}
                onChange={(e) => setPlanData({ ...planData, name: e.target.value })}
                required
              />

              <Select
                label="Training Goal"
                data={Object.entries(GOAL_TYPES).map(([key, goal]) => ({
                  value: key,
                  label: `${goal.icon} ${goal.name}`,
                }))}
                value={planData.goal_type}
                onChange={(value) => setPlanData({ ...planData, goal_type: value })}
              />

              <DateInput
                label="Goal Event Date (Optional)"
                placeholder="Select target event date"
                value={planData.goal_event_date}
                onChange={(date) => setPlanData({ ...planData, goal_event_date: date })}
                leftSection={<Calendar size={16} />}
              />

              <Select
                label="Current Fitness Level"
                data={Object.entries(FITNESS_LEVELS).map(([key, level]) => ({
                  value: key,
                  label: level.name,
                  description: level.description
                }))}
                value={planData.fitness_level}
                onChange={(value) => setPlanData({ ...planData, fitness_level: value })}
              />
            </Stack>
          </Stepper.Step>

          {/* Step 2: Training Parameters */}
          <Stepper.Step label="Training Parameters" description="Volume and intensity">
            <Stack gap="md" mt="xl">
              <NumberInput
                label="Hours Per Week"
                description="How many hours can you train each week?"
                value={planData.hours_per_week}
                onChange={(value) => setPlanData({ ...planData, hours_per_week: value })}
                min={3}
                max={25}
                step={1}
              />

              <NumberInput
                label="Plan Duration (Weeks)"
                description="How many weeks until your goal event?"
                value={planData.duration_weeks}
                onChange={(value) => setPlanData({ ...planData, duration_weeks: value })}
                min={4}
                max={52}
                step={1}
              />

              <NumberInput
                label="FTP (Functional Threshold Power)"
                description="Optional - Your 1-hour max power in watts"
                value={planData.ftp}
                onChange={(value) => setPlanData({ ...planData, ftp: value })}
                min={100}
                max={500}
                placeholder="e.g., 250"
              />

              <NumberInput
                label="Max Heart Rate"
                description="Optional - Your maximum heart rate in BPM"
                value={planData.max_heart_rate}
                onChange={(value) => setPlanData({ ...planData, max_heart_rate: value })}
                min={120}
                max={220}
                placeholder="e.g., 185"
              />

              <Alert color="blue" title="Recommended Weekly TSS">
                Based on your fitness level and available time, we recommend{' '}
                <strong>
                  {getRecommendedWeeklyTSS(planData.fitness_level, planData.hours_per_week)} TSS per week
                </strong>
              </Alert>
            </Stack>
          </Stepper.Step>

          {/* Step 3: Review Schedule */}
          <Stepper.Step label="Review Schedule" description="Generated workout plan">
            {weeklySchedule.length === 0 && (
              <Button onClick={generateSchedule} mt="xl" fullWidth>
                Generate Training Schedule
              </Button>
            )}

            {weeklySchedule.length > 0 && (
              <WeeklySchedule
                schedule={weeklySchedule}
                onUpdate={setWeeklySchedule}
              />
            )}
          </Stepper.Step>

          {/* Step 4: Confirm */}
          <Stepper.Completed>
            <Stack gap="md" mt="xl">
              <Card withBorder p="md">
                <Title order={4} mb="md">Plan Summary</Title>
                <Grid>
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">Plan Name</Text>
                    <Text fw={500}>{planData.name}</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">Goal</Text>
                    <Text fw={500}>{GOAL_TYPES[planData.goal_type]?.name}</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">Duration</Text>
                    <Text fw={500}>{planData.duration_weeks} weeks</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">Weekly Hours</Text>
                    <Text fw={500}>{planData.hours_per_week} hours</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">Total Workouts</Text>
                    <Text fw={500}>
                      {weeklySchedule.reduce((sum, w) => sum + w.workouts.length, 0)}
                    </Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">Average Weekly TSS</Text>
                    <Text fw={500}>
                      {Math.round(weeklySchedule.reduce((sum, w) => sum + w.total_tss, 0) / weeklySchedule.length)}
                    </Text>
                  </Grid.Col>
                </Grid>
              </Card>

              <Button
                size="lg"
                leftSection={<Check size={20} />}
                onClick={createPlan}
                loading={creating}
                fullWidth
              >
                Create Training Plan
              </Button>
            </Stack>
          </Stepper.Completed>
        </Stepper>

        {/* Navigation */}
        <Group justify="space-between" mt="xl">
          <Button variant="default" onClick={prevStep} disabled={active === 0}>
            Back
          </Button>
          <Button onClick={nextStep} disabled={active === 3}>
            {active === 2 && weeklySchedule.length > 0 ? 'Review & Confirm' : 'Next'}
          </Button>
        </Group>
      </Paper>

      {/* Research Link */}
      <Container size="lg" py="lg">
        <Card withBorder p="md" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <BookOpen size={24} style={{ color: 'var(--mantine-color-blue-6)' }} />
              <div>
                <Text size="sm" fw={600}>Want to learn about the science behind our training?</Text>
                <Text size="xs" c="dimmed">Read about our research-backed methodologies</Text>
              </div>
            </Group>
            <Anchor href="/training-research" size="sm" fw={600}>
              View Research →
            </Anchor>
          </Group>
        </Card>
      </Container>
    </Container>
  );
};

export default TrainingPlanBuilder;
