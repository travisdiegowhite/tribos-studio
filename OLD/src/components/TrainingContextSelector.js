import React from 'react';
import { Card, Select, NumberInput, Badge, Group, Text, Stack, Tooltip } from '@mantine/core';
import { WORKOUT_TYPES, TRAINING_PHASES, estimateTSS } from '../utils/trainingPlans';

/**
 * Training Context Selector Component
 * Allows users to specify training context for route generation
 */
const TrainingContextSelector = ({
  value,
  onChange,
  showEstimatedTSS = false,
  routeDistance = 0,
  routeElevation = 0
}) => {
  const workoutTypeOptions = Object.keys(WORKOUT_TYPES).map(key => ({
    value: key,
    label: `${WORKOUT_TYPES[key].icon} ${WORKOUT_TYPES[key].name}`,
    description: WORKOUT_TYPES[key].description
  }));

  const phaseOptions = Object.keys(TRAINING_PHASES).map(key => ({
    value: key,
    label: TRAINING_PHASES[key].name
  }));

  const handleChange = (field, newValue) => {
    const updated = { ...value, [field]: newValue };

    // Auto-update duration and TSS based on workout type
    if (field === 'workoutType' && newValue) {
      const workoutType = WORKOUT_TYPES[newValue];
      updated.targetDuration = workoutType.defaultDuration;
      updated.targetTSS = workoutType.defaultTSS;
      updated.primaryZone = workoutType.primaryZone;
    }

    onChange(updated);
  };

  const selectedWorkout = value.workoutType ? WORKOUT_TYPES[value.workoutType] : null;

  // Calculate estimated TSS if route data is available
  const estimatedRouteTSS = showEstimatedTSS && routeDistance > 0
    ? estimateTSS(value.targetDuration || 60, routeDistance, routeElevation, value.workoutType || 'endurance')
    : null;

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={600}>Training Context</Text>
          {selectedWorkout && (
            <Badge
              color={selectedWorkout.color}
              variant="light"
              leftSection={<span>{selectedWorkout.icon}</span>}
            >
              Zone {selectedWorkout.primaryZone || 'Mixed'}
            </Badge>
          )}
        </Group>

        <Select
          label="Workout Type"
          placeholder="Select workout type"
          data={workoutTypeOptions}
          value={value.workoutType || ''}
          onChange={(val) => handleChange('workoutType', val)}
          searchable
          description={selectedWorkout?.description}
        />

        <Select
          label="Training Phase"
          placeholder="Select training phase"
          data={phaseOptions}
          value={value.phase || ''}
          onChange={(val) => handleChange('phase', val)}
          description={value.phase ? TRAINING_PHASES[value.phase]?.description : 'Optional: Current phase in your training plan'}
        />

        <Group grow>
          <NumberInput
            label="Target Duration"
            placeholder="60"
            value={value.targetDuration || ''}
            onChange={(val) => handleChange('targetDuration', val)}
            min={10}
            max={480}
            suffix=" min"
            description="Planned workout duration"
          />

          <Tooltip label="Training Stress Score - measures workout difficulty" withArrow>
            <NumberInput
              label="Target TSS"
              placeholder="75"
              value={value.targetTSS || ''}
              onChange={(val) => handleChange('targetTSS', val)}
              min={0}
              max={500}
              description="Planned training stress"
            />
          </Tooltip>
        </Group>

        {showEstimatedTSS && estimatedRouteTSS && (
          <Card withBorder p="xs" bg="blue.0">
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Estimated Route TSS:</Text>
              <Badge color="blue" variant="filled">
                {estimatedRouteTSS} TSS
              </Badge>
            </Group>
            {value.targetTSS && Math.abs(estimatedRouteTSS - value.targetTSS) > 20 && (
              <Text size="xs" c="orange" mt="xs">
                Route TSS differs from target by {Math.abs(estimatedRouteTSS - value.targetTSS)} TSS
              </Text>
            )}
          </Card>
        )}

        {selectedWorkout && (
          <Card withBorder p="xs" bg="gray.0">
            <Text size="xs" fw={500} mb={4}>Quick Stats:</Text>
            <Group gap="xs">
              <Badge size="sm" variant="light" color={selectedWorkout.color}>
                Default: {selectedWorkout.defaultDuration}min
              </Badge>
              <Badge size="sm" variant="light" color={selectedWorkout.color}>
                {selectedWorkout.defaultTSS} TSS
              </Badge>
              {selectedWorkout.primaryZone && (
                <Badge size="sm" variant="light" color="blue">
                  Zone {selectedWorkout.primaryZone}
                </Badge>
              )}
            </Group>
          </Card>
        )}
      </Stack>
    </Card>
  );
};

export default TrainingContextSelector;
