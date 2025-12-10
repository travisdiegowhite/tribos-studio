/**
 * PlanCustomizationModal Component
 * Allows users to customize a training plan before starting
 */

import { useState, useMemo } from 'react';
import {
  Modal,
  Text,
  Group,
  Stack,
  Button,
  Card,
  Badge,
  Checkbox,
  Slider,
  Divider,
  Alert,
  Paper,
  SimpleGrid,
  ThemeIcon,
  Timeline,
  ScrollArea,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconCalendar,
  IconSettings,
  IconCheck,
  IconAlertCircle,
  IconClock,
  IconFlame,
  IconTarget,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { TRAINING_PHASES, FITNESS_LEVELS } from '../../utils/trainingPlans';
import { getWorkoutById } from '../../data/workoutLibrary';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function PlanCustomizationModal({
  opened,
  onClose,
  plan,
  onStartPlan,
}) {
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  });

  const [restDays, setRestDays] = useState([0]); // Default: Sunday
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState(
    plan?.hoursPerWeek ? (plan.hoursPerWeek.min + plan.hoursPerWeek.max) / 2 : 6
  );
  const [starting, setStarting] = useState(false);

  // Calculate first week preview
  const firstWeekPreview = useMemo(() => {
    if (!plan?.weekTemplates?.[1]) return [];

    const weekTemplate = plan.weekTemplates[1];
    const preview = [];

    for (let i = 0; i < 7; i++) {
      const dayIndex = (startDate.getDay() + i) % 7;
      const dayName = DAY_NAMES[dayIndex];
      const dayPlan = weekTemplate[dayName];
      const isRestDay = restDays.includes(dayIndex);

      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      preview.push({
        date,
        dayName: DAYS_OF_WEEK[dayIndex].label,
        workout: dayPlan,
        workoutDetails: dayPlan?.workout ? getWorkoutById(dayPlan.workout) : null,
        isRestDay,
        isOverridden: isRestDay && dayPlan?.workout,
      });
    }

    return preview;
  }, [plan, startDate, restDays]);

  // Calculate total weekly TSS and duration
  const weeklyStats = useMemo(() => {
    let tss = 0;
    let duration = 0;
    let workoutCount = 0;

    firstWeekPreview.forEach((day) => {
      if (!day.isRestDay && day.workoutDetails) {
        tss += day.workoutDetails.targetTSS || 0;
        duration += day.workoutDetails.duration || 0;
        workoutCount++;
      }
    });

    return { tss, duration, workoutCount };
  }, [firstWeekPreview]);

  // Toggle rest day
  const toggleRestDay = (dayIndex) => {
    setRestDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  // Handle start plan
  const handleStartPlan = async () => {
    try {
      setStarting(true);
      await onStartPlan({
        startDate,
        restDays,
        weeklyHoursTarget,
      });
      notifications.show({
        title: 'Plan Started!',
        message: `${plan.name} has been activated`,
        color: 'green',
        icon: <IconCheck size={18} />,
      });
      onClose();
    } catch (err) {
      console.error('Error starting plan:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to start the training plan',
        color: 'red',
      });
    } finally {
      setStarting(false);
    }
  };

  if (!plan) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <IconSettings size={20} />
          <Text fw={600}>Customize Your Plan</Text>
        </Group>
      }
      size="lg"
    >
      <Stack spacing="lg">
        {/* Plan Summary */}
        <Paper p="md" radius="md" withBorder bg="gray.0">
          <Group position="apart">
            <div>
              <Text fw={600} size="lg">
                {plan.name}
              </Text>
              <Text size="sm" c="dimmed">
                {plan.duration} weeks &bull; {plan.methodology?.replace('_', ' ')}
              </Text>
            </div>
            <Badge size="lg" variant="light">
              {FITNESS_LEVELS[plan.fitnessLevel]?.name || plan.fitnessLevel}
            </Badge>
          </Group>
        </Paper>

        {/* Start Date */}
        <div>
          <Text fw={500} mb="xs">
            Start Date
          </Text>
          <DatePickerInput
            value={startDate}
            onChange={setStartDate}
            minDate={new Date()}
            placeholder="Select start date"
            leftSection={<IconCalendar size={16} />}
            clearable={false}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Your plan will begin on {startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </div>

        <Divider />

        {/* Rest Days */}
        <div>
          <Text fw={500} mb="xs">
            Rest Days
          </Text>
          <Text size="sm" c="dimmed" mb="sm">
            Select which days you prefer to rest. Workouts on these days will be skipped or moved.
          </Text>
          <Group spacing="xs">
            {DAYS_OF_WEEK.map((day) => (
              <Tooltip key={day.value} label={day.label}>
                <Button
                  size="xs"
                  variant={restDays.includes(day.value) ? 'filled' : 'outline'}
                  color={restDays.includes(day.value) ? 'blue' : 'gray'}
                  onClick={() => toggleRestDay(day.value)}
                  w={50}
                >
                  {day.short}
                </Button>
              </Tooltip>
            ))}
          </Group>
          {restDays.length === 0 && (
            <Alert color="yellow" mt="sm" icon={<IconAlertCircle size={16} />}>
              Consider adding at least one rest day per week for recovery.
            </Alert>
          )}
        </div>

        <Divider />

        {/* Weekly Hours Target */}
        <div>
          <Group position="apart" mb="xs">
            <Text fw={500}>Weekly Hours Target</Text>
            <Badge size="lg">{weeklyHoursTarget} hours</Badge>
          </Group>
          <Slider
            value={weeklyHoursTarget}
            onChange={setWeeklyHoursTarget}
            min={plan.hoursPerWeek?.min || 3}
            max={plan.hoursPerWeek?.max || 15}
            step={0.5}
            marks={[
              { value: plan.hoursPerWeek?.min || 3, label: `${plan.hoursPerWeek?.min || 3}h` },
              { value: plan.hoursPerWeek?.max || 15, label: `${plan.hoursPerWeek?.max || 15}h` },
            ]}
            label={(value) => `${value}h`}
          />
          <Text size="xs" c="dimmed" mt="xs">
            Recommended: {plan.hoursPerWeek?.min}-{plan.hoursPerWeek?.max} hours/week for this plan
          </Text>
        </div>

        <Divider />

        {/* First Week Preview */}
        <div>
          <Text fw={500} mb="sm">
            First Week Preview
          </Text>
          <ScrollArea>
            <SimpleGrid cols={7} spacing={4}>
              {firstWeekPreview.map((day, index) => (
                <Card
                  key={index}
                  padding="xs"
                  withBorder
                  style={{
                    opacity: day.isRestDay ? 0.6 : 1,
                    borderColor: day.isOverridden ? 'var(--mantine-color-yellow-5)' : undefined,
                  }}
                >
                  <Stack spacing={2} align="center">
                    <Text size="xs" c="dimmed">
                      {day.dayName.slice(0, 3)}
                    </Text>
                    <Text size="sm" fw={500}>
                      {day.date.getDate()}
                    </Text>
                    {day.isRestDay ? (
                      <Badge size="xs" color="gray" variant="light">
                        Rest
                      </Badge>
                    ) : day.workoutDetails ? (
                      <Tooltip label={day.workoutDetails.name}>
                        <Badge
                          size="xs"
                          color={
                            day.workoutDetails.category === 'recovery'
                              ? 'green'
                              : day.workoutDetails.category === 'endurance'
                              ? 'blue'
                              : day.workoutDetails.category === 'vo2max'
                              ? 'red'
                              : 'orange'
                          }
                          variant="light"
                        >
                          {day.workoutDetails.duration}m
                        </Badge>
                      </Tooltip>
                    ) : day.workout ? (
                      <Badge size="xs" color="gray" variant="outline">
                        {day.workout.notes?.slice(0, 8) || 'Rest'}
                      </Badge>
                    ) : null}
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </ScrollArea>
        </div>

        {/* Weekly Stats Summary */}
        <Paper p="md" radius="md" withBorder bg="blue.0">
          <Group position="apart">
            <div>
              <Text size="sm" c="dimmed">
                Estimated First Week
              </Text>
              <Group spacing="lg" mt={4}>
                <Group spacing={4}>
                  <IconClock size={16} />
                  <Text fw={500}>{Math.round(weeklyStats.duration / 60 * 10) / 10}h</Text>
                </Group>
                <Group spacing={4}>
                  <IconFlame size={16} />
                  <Text fw={500}>{weeklyStats.tss} TSS</Text>
                </Group>
                <Group spacing={4}>
                  <IconTarget size={16} />
                  <Text fw={500}>{weeklyStats.workoutCount} workouts</Text>
                </Group>
              </Group>
            </div>
          </Group>
        </Paper>

        {/* Action Buttons */}
        <Group position="apart" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleStartPlan}
            loading={starting}
            leftIcon={<IconPlayerPlay size={18} />}
            size="md"
          >
            Start Training Plan
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
