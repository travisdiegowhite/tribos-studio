/**
 * SupplementWorkoutModal Component
 * Allows users to add strength, core, and flexibility workouts to their active plan
 * with smart day placement suggestions
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
  Tabs,
  Paper,
  SimpleGrid,
  ThemeIcon,
  ScrollArea,
  Tooltip,
  Divider,
  Alert,
  RingProgress,
  ActionIcon,
} from '@mantine/core';
import {
  IconBarbell,
  IconYoga,
  IconStretching,
  IconCalendar,
  IconCheck,
  IconPlus,
  IconAlertCircle,
  IconClock,
  IconInfoCircle,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getWorkoutById } from '../../data/workoutLibrary';
import { getSupplementType } from '../../utils/trainingPlans';

// Group supplement workouts by category
const SUPPLEMENT_CATEGORIES = {
  strength: {
    name: 'Strength',
    description: 'Build power and muscle endurance',
    icon: IconBarbell,
    color: 'pink',
    workouts: [
      'strength_express_circuit',
      'strength_quick_lower',
      'strength_maintenance',
      'strength_anatomical_adaptation',
      'strength_muscle_endurance',
      'strength_max_lower',
      'strength_explosive_power',
    ],
  },
  core: {
    name: 'Core',
    description: 'Stability and transfer of power',
    icon: IconYoga,
    color: 'violet',
    workouts: [
      'core_foundation',
      'core_stability',
      'core_power',
    ],
  },
  flexibility: {
    name: 'Flexibility',
    description: 'Recovery and mobility',
    icon: IconStretching,
    color: 'teal',
    workouts: [
      'flexibility_post_ride',
      'flexibility_hip_mobility',
      'flexibility_yoga_cyclist',
      'flexibility_full_body_recovery',
      'flexibility_dynamic_warmup',
    ],
  },
};

// Format date for display
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Get score color
function getScoreColor(score) {
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  return 'orange';
}

export default function SupplementWorkoutModal({
  opened,
  onClose,
  onAddWorkout,
  getSuggestedDays,
  activePlan,
}) {
  const [selectedCategory, setSelectedCategory] = useState('strength');
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [adding, setAdding] = useState(false);

  // Get suggested days for the selected workout
  const suggestedDays = useMemo(() => {
    if (!selectedWorkout || !getSuggestedDays) return [];
    return getSuggestedDays(selectedWorkout, 4); // 4 weeks ahead
  }, [selectedWorkout, getSuggestedDays]);

  // Get workout details for a workout ID
  const getWorkout = (workoutId) => {
    const workout = getWorkoutById(workoutId);
    return workout;
  };

  // Handle workout selection
  const handleSelectWorkout = (workoutId) => {
    setSelectedWorkout(workoutId);
    setSelectedDate(null); // Reset date selection
  };

  // Handle date selection
  const handleSelectDate = (dateStr) => {
    setSelectedDate(dateStr);
  };

  // Handle adding the workout
  const handleAddWorkout = async () => {
    if (!selectedWorkout || !selectedDate) return;

    try {
      setAdding(true);
      const date = new Date(selectedDate);
      const workout = getWorkout(selectedWorkout);

      const success = await onAddWorkout(selectedWorkout, date);

      if (success) {
        notifications.show({
          title: 'Workout Added',
          message: `${workout?.name || 'Supplement workout'} added for ${formatDate(selectedDate)}`,
          color: 'green',
          icon: <IconCheck size={18} />,
        });

        // Reset selections but keep modal open for adding more
        setSelectedWorkout(null);
        setSelectedDate(null);
      }
    } catch (err) {
      console.error('Error adding supplement workout:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to add workout to your plan',
        color: 'red',
      });
    } finally {
      setAdding(false);
    }
  };

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedWorkout(null);
    setSelectedDate(null);
    setSelectedCategory('strength');
    onClose();
  };

  const selectedWorkoutDetails = selectedWorkout ? getWorkout(selectedWorkout) : null;
  const supplementType = selectedWorkout ? getSupplementType(selectedWorkout) : null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconBarbell size={20} />
          <Text fw={600}>Add Supplement Workout</Text>
        </Group>
      }
      size="xl"
    >
      <Stack gap="md">
        {/* Info Alert */}
        <Alert icon={<IconInfoCircle size={18} />} color="blue" variant="light">
          Add strength, core, or flexibility workouts to complement your cycling training.
          We'll suggest the best days based on your current plan.
        </Alert>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onChange={(value) => {
          setSelectedCategory(value);
          setSelectedWorkout(null);
          setSelectedDate(null);
        }}>
          <Tabs.List grow>
            {Object.entries(SUPPLEMENT_CATEGORIES).map(([key, cat]) => (
              <Tabs.Tab
                key={key}
                value={key}
                leftSection={<cat.icon size={16} />}
                color={cat.color}
              >
                {cat.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {Object.entries(SUPPLEMENT_CATEGORIES).map(([key, cat]) => (
            <Tabs.Panel key={key} value={key} pt="md">
              <Text size="sm" c="dimmed" mb="md">{cat.description}</Text>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {cat.workouts.map((workoutId) => {
                  const workout = getWorkout(workoutId);
                  if (!workout) return null;

                  const isSelected = selectedWorkout === workoutId;
                  const type = getSupplementType(workoutId);
                  const isHeavy = type === 'heavy_strength';

                  return (
                    <Card
                      key={workoutId}
                      padding="sm"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        borderColor: isSelected ? `var(--mantine-color-${cat.color}-5)` : undefined,
                        backgroundColor: isSelected ? `var(--mantine-color-${cat.color}-0)` : undefined,
                      }}
                      onClick={() => handleSelectWorkout(workoutId)}
                    >
                      <Group justify="space-between" mb={4}>
                        <Group gap="xs">
                          <Text fw={500} size="sm">{workout.name}</Text>
                          {isHeavy && (
                            <Tooltip label="Heavy workout - needs 48-72h before hard bike sessions">
                              <Badge size="xs" color="red" variant="light">Heavy</Badge>
                            </Tooltip>
                          )}
                        </Group>
                        {isSelected && (
                          <ThemeIcon size="sm" color={cat.color} variant="filled">
                            <IconCheck size={12} />
                          </ThemeIcon>
                        )}
                      </Group>

                      <Text size="xs" c="dimmed" lineClamp={2} mb="xs">
                        {workout.description}
                      </Text>

                      <Group gap="xs">
                        <Badge size="xs" variant="light" leftSection={<IconClock size={10} />}>
                          {workout.duration} min
                        </Badge>
                        <Badge size="xs" variant="outline" color="gray">
                          {workout.difficulty}
                        </Badge>
                      </Group>
                    </Card>
                  );
                })}
              </SimpleGrid>
            </Tabs.Panel>
          ))}
        </Tabs>

        {/* Selected Workout Details & Day Selection */}
        {selectedWorkout && selectedWorkoutDetails && (
          <>
            <Divider />

            <Paper p="md" withBorder radius="md">
              <Group justify="space-between" mb="sm">
                <div>
                  <Text fw={600}>{selectedWorkoutDetails.name}</Text>
                  <Text size="sm" c="dimmed">Select a day to add this workout</Text>
                </div>
                {supplementType === 'heavy_strength' && (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="orange"
                    variant="light"
                    p="xs"
                    style={{ maxWidth: 300 }}
                  >
                    <Text size="xs">
                      Allow 48-72h before hard bike sessions after heavy leg work
                    </Text>
                  </Alert>
                )}
              </Group>

              {/* Coach Notes */}
              {selectedWorkoutDetails.coachNotes && (
                <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light" mb="md">
                  <Text size="xs">{selectedWorkoutDetails.coachNotes}</Text>
                </Alert>
              )}

              {/* Suggested Days */}
              <Text size="sm" fw={500} mb="xs">Suggested Days (Best to Good)</Text>

              {suggestedDays.length === 0 ? (
                <Alert color="yellow">
                  No suitable days found in the next 4 weeks. The workout may conflict with your current training schedule.
                </Alert>
              ) : (
                <ScrollArea>
                  <Group gap="xs" pb="xs" style={{ flexWrap: 'nowrap' }}>
                    {suggestedDays.slice(0, 14).map((suggestion) => {
                      const isSelected = selectedDate === suggestion.date;
                      const scoreColor = getScoreColor(suggestion.score);

                      return (
                        <Tooltip
                          key={suggestion.date}
                          label={suggestion.reason}
                          multiline
                          w={200}
                        >
                          <Card
                            padding="xs"
                            withBorder
                            style={{
                              cursor: 'pointer',
                              minWidth: 80,
                              borderColor: isSelected ? `var(--mantine-color-blue-5)` : undefined,
                              backgroundColor: isSelected ? `var(--mantine-color-blue-0)` : undefined,
                            }}
                            onClick={() => handleSelectDate(suggestion.date)}
                          >
                            <Stack gap={4} align="center">
                              <RingProgress
                                size={36}
                                thickness={4}
                                sections={[{ value: suggestion.score, color: scoreColor }]}
                                label={
                                  <Text size="xs" ta="center" fw={700}>
                                    {suggestion.score}
                                  </Text>
                                }
                              />
                              <Text size="xs" fw={500}>
                                {formatDate(suggestion.date).split(',')[0]}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {formatDate(suggestion.date).split(' ').slice(1).join(' ')}
                              </Text>
                              {isSelected && (
                                <Badge size="xs" color="blue">Selected</Badge>
                              )}
                            </Stack>
                          </Card>
                        </Tooltip>
                      );
                    })}
                  </Group>
                </ScrollArea>
              )}
            </Paper>
          </>
        )}

        {/* Action Buttons */}
        <Group justify="space-between" mt="md">
          <Button variant="subtle" onClick={handleClose}>
            {selectedWorkout ? 'Cancel' : 'Close'}
          </Button>

          <Group gap="xs">
            {selectedWorkout && (
              <Button
                variant="light"
                onClick={() => {
                  setSelectedWorkout(null);
                  setSelectedDate(null);
                }}
              >
                Back to Workouts
              </Button>
            )}
            <Button
              onClick={handleAddWorkout}
              loading={adding}
              disabled={!selectedWorkout || !selectedDate}
              leftSection={<IconPlus size={18} />}
            >
              Add to Plan
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
