import React, { useState } from 'react';
import {
  Accordion,
  Badge,
  Card,
  Group,
  Text,
  Stack,
  Grid,
  ActionIcon,
  Tooltip,
  Select,
  NumberInput,
  Button,
  Modal,
} from '@mantine/core';
import { Edit, Trash2, Plus, Map } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WORKOUT_TYPES, TRAINING_PHASES } from '../utils/trainingPlans';

/**
 * Weekly Schedule Component
 * Displays and allows editing of weekly workout schedules
 */
const WeeklySchedule = ({ schedule, onUpdate, showGenerateRoute = false }) => {
  const navigate = useNavigate();
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Open edit modal
  const openEditModal = (weekNumber, workoutIndex) => {
    const week = schedule.find(w => w.week_number === weekNumber);
    setEditingWorkout({
      weekNumber,
      workoutIndex,
      data: { ...week.workouts[workoutIndex] }
    });
    setEditModalOpen(true);
  };

  // Save edited workout
  const saveWorkout = () => {
    if (!editingWorkout) return;

    const updatedSchedule = schedule.map(week => {
      if (week.week_number === editingWorkout.weekNumber) {
        const updatedWorkouts = [...week.workouts];
        updatedWorkouts[editingWorkout.workoutIndex] = editingWorkout.data;

        return {
          ...week,
          workouts: updatedWorkouts,
          total_tss: updatedWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0),
          total_hours: updatedWorkouts.reduce((sum, w) => sum + ((w.target_duration || 0) / 60), 0),
        };
      }
      return week;
    });

    onUpdate(updatedSchedule);
    setEditModalOpen(false);
    setEditingWorkout(null);
  };

  // Delete workout
  const deleteWorkout = (weekNumber, workoutIndex) => {
    const updatedSchedule = schedule.map(week => {
      if (week.week_number === weekNumber) {
        const updatedWorkouts = week.workouts.filter((_, i) => i !== workoutIndex);
        return {
          ...week,
          workouts: updatedWorkouts,
          total_tss: updatedWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0),
          total_hours: updatedWorkouts.reduce((sum, w) => sum + ((w.target_duration || 0) / 60), 0),
        };
      }
      return week;
    });

    onUpdate(updatedSchedule);
  };

  return (
    <>
      <Stack gap="md" mt="md">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {schedule.length} Week Training Plan
          </Text>
          <Text size="xs" c="dimmed">
            Click on any workout to edit
          </Text>
        </Group>

        <Accordion variant="separated">
          {schedule.map((week) => (
            <Accordion.Item key={week.week_number} value={`week-${week.week_number}`}>
              <Accordion.Control>
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>Week {week.week_number}</Text>
                    <Text size="xs" c="dimmed">
                      {TRAINING_PHASES[week.phase]?.name || week.phase}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Badge color={TRAINING_PHASES[week.phase]?.color || 'gray'} variant="light">
                      {Math.round(week.total_hours)}h
                    </Badge>
                    <Badge color="blue" variant="light">
                      {week.total_tss} TSS
                    </Badge>
                  </Group>
                </Group>
              </Accordion.Control>

              <Accordion.Panel>
                <Stack gap="xs">
                  {week.workouts.map((workout, workoutIndex) => {
                    const workoutType = WORKOUT_TYPES[workout.workout_type];

                    return (
                      <Card
                        key={workoutIndex}
                        withBorder
                        p="sm"
                        style={{ backgroundColor: 'white' }}
                      >
                        <Group justify="space-between">
                          <Group gap="sm">
                            <Text size="lg">{workoutType?.icon || '🚴'}</Text>
                            <div>
                              <Text size="sm" fw={500} c="dark">
                                {dayNames[workout.day_of_week]} - {workoutType?.name || workout.workout_type}
                              </Text>
                              <Group gap="xs">
                                {workout.target_duration > 0 && (
                                  <Badge size="xs" variant="light">
                                    {workout.target_duration}min
                                  </Badge>
                                )}
                                {workout.target_tss > 0 && (
                                  <Badge size="xs" variant="light" color="blue">
                                    {workout.target_tss} TSS
                                  </Badge>
                                )}
                                {workout.target_zone && (
                                  <Badge size="xs" variant="light" color="orange">
                                    Zone {workout.target_zone}
                                  </Badge>
                                )}
                              </Group>
                            </div>
                          </Group>

                          <Group gap="xs">
                            {showGenerateRoute && workout.id && workout.workout_type !== 'rest' && (
                              <Tooltip label="Generate smart route for this workout">
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="blue"
                                  onClick={() => navigate('/?workout=' + workout.id)}
                                >
                                  <Map size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            <Tooltip label="Edit workout">
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                onClick={() => openEditModal(week.week_number, workoutIndex)}
                              >
                                <Edit size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete workout">
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="red"
                                onClick={() => deleteWorkout(week.week_number, workoutIndex)}
                              >
                                <Trash2 size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Group>
                      </Card>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Stack>

      {/* Edit Workout Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingWorkout(null);
        }}
        title="Edit Workout"
        size="md"
      >
        {editingWorkout && (
          <Stack gap="md">
            <Select
              label="Workout Type"
              data={Object.entries(WORKOUT_TYPES).map(([key, type]) => ({
                value: key,
                label: `${type.icon} ${type.name}`
              }))}
              value={editingWorkout.data.workout_type}
              onChange={(value) => setEditingWorkout({
                ...editingWorkout,
                data: { ...editingWorkout.data, workout_type: value }
              })}
            />

            <NumberInput
              label="Duration (minutes)"
              value={editingWorkout.data.target_duration}
              onChange={(value) => setEditingWorkout({
                ...editingWorkout,
                data: { ...editingWorkout.data, target_duration: value }
              })}
              min={0}
              max={480}
            />

            <NumberInput
              label="Target TSS"
              value={editingWorkout.data.target_tss}
              onChange={(value) => setEditingWorkout({
                ...editingWorkout,
                data: { ...editingWorkout.data, target_tss: value }
              })}
              min={0}
              max={500}
            />

            <NumberInput
              label="Target Zone"
              value={editingWorkout.data.target_zone}
              onChange={(value) => setEditingWorkout({
                ...editingWorkout,
                data: { ...editingWorkout.data, target_zone: value }
              })}
              min={1}
              max={5}
              step={0.5}
              precision={1}
            />

            <Select
              label="Terrain Preference"
              data={[
                { value: 'flat', label: 'Flat' },
                { value: 'rolling', label: 'Rolling' },
                { value: 'hilly', label: 'Hilly' },
                { value: 'mixed', label: 'Mixed' },
              ]}
              value={editingWorkout.data.terrain_preference}
              onChange={(value) => setEditingWorkout({
                ...editingWorkout,
                data: { ...editingWorkout.data, terrain_preference: value }
              })}
            />

            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingWorkout(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveWorkout}>
                Save Changes
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
};

export default WeeklySchedule;
