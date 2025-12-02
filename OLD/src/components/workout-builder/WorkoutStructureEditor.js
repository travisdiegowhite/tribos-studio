import React, { useState } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Button,
  NumberInput,
  Select,
  ActionIcon,
  Badge,
  Divider,
  Alert,
  Paper,
  Switch,
  Collapse
} from '@mantine/core';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Info,
  Copy,
  Repeat,
  Zap
} from 'lucide-react';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import IntervalGenerators from './IntervalGenerators';

/**
 * WorkoutStructureEditor
 * Visual editor for creating workout intervals (warmup, main sets, cooldown)
 */
const WorkoutStructureEditor = ({ structure, onChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generatorOpened, setGeneratorOpened] = useState(false);

  // Initialize structure if not provided
  const currentStructure = structure || {
    warmup: null,
    main: [],
    cooldown: null
  };

  // Zone options for dropdown
  const zoneOptions = Object.entries(TRAINING_ZONES).map(([key, zone]) => ({
    value: key,
    label: `Zone ${key} - ${zone.name} (${zone.range})`
  }));

  // Interval type templates
  const intervalTypes = [
    { value: 'steady', label: 'Steady State' },
    { value: 'repeat', label: 'Intervals (Repeats)' },
    { value: 'pyramid', label: 'Pyramid' },
    { value: 'ramp', label: 'Ramp' }
  ];

  // Update warmup
  const updateWarmup = (field, value) => {
    const newStructure = {
      ...currentStructure,
      warmup: {
        ...currentStructure.warmup,
        [field]: value
      }
    };
    onChange(newStructure);
  };

  // Update cooldown
  const updateCooldown = (field, value) => {
    const newStructure = {
      ...currentStructure,
      cooldown: {
        ...currentStructure.cooldown,
        [field]: value
      }
    };
    onChange(newStructure);
  };

  // Add main interval
  const addMainInterval = (type = 'steady') => {
    const newInterval = type === 'repeat' ? {
      type: 'repeat',
      sets: 3,
      work: {
        duration: 5,
        zone: 4,
        powerPctFTP: 95,
        cadence: '90-100',
        description: 'Hard effort'
      },
      rest: {
        duration: 3,
        zone: 2,
        powerPctFTP: 55,
        cadence: '85-95',
        description: 'Easy recovery'
      }
    } : {
      duration: 10,
      zone: 3,
      powerPctFTP: 75,
      cadence: '85-95',
      description: 'Steady effort'
    };

    const newStructure = {
      ...currentStructure,
      main: [...currentStructure.main, newInterval]
    };
    onChange(newStructure);
  };

  // Update main interval
  const updateMainInterval = (index, field, value) => {
    const newMain = [...currentStructure.main];

    // Handle nested fields for repeat intervals
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      newMain[index] = {
        ...newMain[index],
        [parent]: {
          ...newMain[index][parent],
          [child]: value
        }
      };
    } else {
      newMain[index] = {
        ...newMain[index],
        [field]: value
      };
    }

    onChange({
      ...currentStructure,
      main: newMain
    });
  };

  // Remove main interval
  const removeMainInterval = (index) => {
    const newMain = currentStructure.main.filter((_, i) => i !== index);
    onChange({
      ...currentStructure,
      main: newMain
    });
  };

  // Move interval up/down
  const moveInterval = (index, direction) => {
    const newMain = [...currentStructure.main];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex >= 0 && newIndex < newMain.length) {
      [newMain[index], newMain[newIndex]] = [newMain[newIndex], newMain[index]];
      onChange({
        ...currentStructure,
        main: newMain
      });
    }
  };

  // Duplicate interval
  const duplicateInterval = (index) => {
    const newMain = [...currentStructure.main];
    newMain.splice(index + 1, 0, { ...newMain[index] });
    onChange({
      ...currentStructure,
      main: newMain
    });
  };

  // Handle generated intervals from generator
  const handleGenerateIntervals = (intervals) => {
    const newStructure = {
      ...currentStructure,
      main: [...currentStructure.main, ...intervals]
    };
    onChange(newStructure);
  };

  // Calculate total duration
  const calculateTotalDuration = () => {
    let total = 0;

    if (currentStructure.warmup) {
      total += currentStructure.warmup.duration || 0;
    }

    currentStructure.main.forEach(interval => {
      if (interval.type === 'repeat') {
        total += (interval.work.duration + interval.rest.duration) * interval.sets;
      } else {
        total += interval.duration || 0;
      }
    });

    if (currentStructure.cooldown) {
      total += currentStructure.cooldown.duration || 0;
    }

    return total;
  };

  // Render single interval editor
  const renderSteadyInterval = (interval, index, isMain = true) => {
    const updateFn = isMain ?
      (field, value) => updateMainInterval(index, field, value) :
      (field, value) => isMain === 'warmup' ? updateWarmup(field, value) : updateCooldown(field, value);

    return (
      <Stack gap="xs">
        <Group grow>
          <NumberInput
            label="Duration (min)"
            value={interval.duration || 10}
            onChange={(val) => updateFn('duration', val)}
            min={1}
            max={180}
          />
          <Select
            label="Zone"
            data={zoneOptions}
            value={String(interval.zone || 3)}
            onChange={(val) => updateFn('zone', parseInt(val))}
          />
          <NumberInput
            label="Power (% FTP)"
            value={interval.powerPctFTP || 75}
            onChange={(val) => updateFn('powerPctFTP', val)}
            min={30}
            max={200}
            suffix="%"
          />
        </Group>

        <Collapse in={showAdvanced}>
          <Group grow>
            <NumberInput
              label="Cadence Target"
              value={interval.cadence?.split('-')[0] || 85}
              onChange={(val) => updateFn('cadence', `${val}-${parseInt(val) + 10}`)}
              min={50}
              max={120}
              suffix=" rpm"
            />
          </Group>
        </Collapse>
      </Stack>
    );
  };

  // Render repeat interval editor
  const renderRepeatInterval = (interval, index) => {
    return (
      <Stack gap="sm">
        <NumberInput
          label="Number of Sets"
          value={interval.sets || 3}
          onChange={(val) => updateMainInterval(index, 'sets', val)}
          min={1}
          max={20}
        />

        <Divider label="Work Interval" labelPosition="center" />
        <Group grow>
          <NumberInput
            label="Duration (min)"
            value={interval.work?.duration || 5}
            onChange={(val) => updateMainInterval(index, 'work.duration', val)}
            min={1}
            max={60}
          />
          <Select
            label="Zone"
            data={zoneOptions}
            value={String(interval.work?.zone || 4)}
            onChange={(val) => updateMainInterval(index, 'work.zone', parseInt(val))}
          />
          <NumberInput
            label="Power (% FTP)"
            value={interval.work?.powerPctFTP || 95}
            onChange={(val) => updateMainInterval(index, 'work.powerPctFTP', val)}
            min={30}
            max={200}
            suffix="%"
          />
        </Group>

        <Divider label="Rest Interval" labelPosition="center" />
        <Group grow>
          <NumberInput
            label="Duration (min)"
            value={interval.rest?.duration || 3}
            onChange={(val) => updateMainInterval(index, 'rest.duration', val)}
            min={1}
            max={60}
          />
          <Select
            label="Zone"
            data={zoneOptions}
            value={String(interval.rest?.zone || 2)}
            onChange={(val) => updateMainInterval(index, 'rest.zone', parseInt(val))}
          />
          <NumberInput
            label="Power (% FTP)"
            value={interval.rest?.powerPctFTP || 55}
            onChange={(val) => updateMainInterval(index, 'rest.powerPctFTP', val)}
            min={30}
            max={200}
            suffix="%"
          />
        </Group>
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      {/* Duration Summary */}
      <Alert icon={<Info size={16} />} color="blue">
        <Group justify="space-between">
          <Text size="sm" fw={500}>Total Workout Duration</Text>
          <Badge size="lg" variant="filled">{calculateTotalDuration()} minutes</Badge>
        </Group>
      </Alert>

      {/* Advanced Options Toggle */}
      <Switch
        label="Show advanced options"
        checked={showAdvanced}
        onChange={(e) => setShowAdvanced(e.currentTarget.checked)}
      />

      {/* Warmup Section */}
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} size="sm" c="dark">Warmup (Optional)</Text>
            {!currentStructure.warmup ? (
              <Button
                size="xs"
                variant="light"
                leftSection={<Plus size={14} />}
                onClick={() => updateWarmup('duration', 10)}
              >
                Add Warmup
              </Button>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<Trash2 size={14} />}
                onClick={() => onChange({ ...currentStructure, warmup: null })}
              >
                Remove
              </Button>
            )}
          </Group>

          {currentStructure.warmup && renderSteadyInterval(currentStructure.warmup, 0, 'warmup')}
        </Stack>
      </Card>

      {/* Main Intervals Section */}
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} size="sm" c="dark">Main Set</Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={<Plus size={14} />}
                onClick={() => addMainInterval('steady')}
              >
                Add Steady
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={<Repeat size={14} />}
                onClick={() => addMainInterval('repeat')}
              >
                Add Intervals
              </Button>
              <Button
                size="xs"
                variant="light"
                color="violet"
                leftSection={<Zap size={14} />}
                onClick={() => setGeneratorOpened(true)}
              >
                Generate
              </Button>
            </Group>
          </Group>

          {currentStructure.main.length === 0 ? (
            <Alert icon={<Info size={16} />} color="gray">
              No intervals added. Click "Add Steady" or "Add Intervals" to build your workout.
            </Alert>
          ) : (
            <Stack gap="sm">
              {currentStructure.main.map((interval, index) => (
                <Paper key={index} withBorder p="md" bg="gray.0">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Badge
                        variant="filled"
                        leftSection={interval.type === 'repeat' ? <Repeat size={12} /> : null}
                      >
                        {interval.type === 'repeat' ? `${interval.sets}x Intervals` : 'Steady State'}
                      </Badge>

                      <Group gap={4}>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => moveInterval(index, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp size={16} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => moveInterval(index, 'down')}
                          disabled={index === currentStructure.main.length - 1}
                        >
                          <ChevronDown size={16} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => duplicateInterval(index)}
                        >
                          <Copy size={16} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => removeMainInterval(index)}
                        >
                          <Trash2 size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>

                    {interval.type === 'repeat' ?
                      renderRepeatInterval(interval, index) :
                      renderSteadyInterval(interval, index, true)
                    }
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {/* Cooldown Section */}
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} size="sm" c="dark">Cooldown (Optional)</Text>
            {!currentStructure.cooldown ? (
              <Button
                size="xs"
                variant="light"
                leftSection={<Plus size={14} />}
                onClick={() => updateCooldown('duration', 10)}
              >
                Add Cooldown
              </Button>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<Trash2 size={14} />}
                onClick={() => onChange({ ...currentStructure, cooldown: null })}
              >
                Remove
              </Button>
            )}
          </Group>

          {currentStructure.cooldown && renderSteadyInterval(currentStructure.cooldown, 0, 'cooldown')}
        </Stack>
      </Card>

      {/* Interval Generators Modal */}
      <IntervalGenerators
        opened={generatorOpened}
        onClose={() => setGeneratorOpened(false)}
        onGenerate={handleGenerateIntervals}
      />
    </Stack>
  );
};

export default WorkoutStructureEditor;
