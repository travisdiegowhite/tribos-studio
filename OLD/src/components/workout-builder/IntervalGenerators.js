import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  NumberInput,
  Select,
  Text,
  Card,
  Badge,
  Divider,
  Alert
} from '@mantine/core';
import { Activity, TrendingUp, Triangle, Zap } from 'lucide-react';

/**
 * IntervalGenerators
 * Auto-generate common interval patterns (pyramid, ramp, descending)
 */
const IntervalGenerators = ({ opened, onClose, onGenerate }) => {
  const [generatorType, setGeneratorType] = useState('pyramid');
  const [settings, setSettings] = useState({
    // Pyramid settings
    pyramidStart: 1,
    pyramidPeak: 5,
    pyramidStep: 1,
    pyramidPowerPct: 95,
    pyramidRestDuration: 2,
    pyramidRestPowerPct: 55,

    // Ramp settings
    rampDuration: 20,
    rampStartPowerPct: 70,
    rampEndPowerPct: 100,
    rampSteps: 4,

    // Descending settings
    descendingStart: 5,
    descendingEnd: 1,
    descendingStep: 1,
    descendingPowerPct: 95,
    descendingRestDuration: 2,
    descendingRestPowerPct: 55
  });

  // Generate pyramid intervals (1, 2, 3, 4, 5, 4, 3, 2, 1)
  const generatePyramid = () => {
    const { pyramidStart, pyramidPeak, pyramidStep, pyramidPowerPct, pyramidRestDuration, pyramidRestPowerPct } = settings;
    const intervals = [];

    // Ascending
    for (let duration = pyramidStart; duration <= pyramidPeak; duration += pyramidStep) {
      intervals.push({
        duration,
        zone: 4,
        powerPctFTP: pyramidPowerPct,
        cadence: '90-100',
        description: `${duration}min hard effort`
      });

      // Add rest between intervals (but not after the last one)
      intervals.push({
        duration: pyramidRestDuration,
        zone: 2,
        powerPctFTP: pyramidRestPowerPct,
        cadence: '85-95',
        description: 'Recovery'
      });
    }

    // Descending (skip the peak, already added)
    for (let duration = pyramidPeak - pyramidStep; duration >= pyramidStart; duration -= pyramidStep) {
      intervals.push({
        duration,
        zone: 4,
        powerPctFTP: pyramidPowerPct,
        cadence: '90-100',
        description: `${duration}min hard effort`
      });

      // Add rest between intervals (but not after the last one)
      if (duration > pyramidStart) {
        intervals.push({
          duration: pyramidRestDuration,
          zone: 2,
          powerPctFTP: pyramidRestPowerPct,
          cadence: '85-95',
          description: 'Recovery'
        });
      }
    }

    return intervals;
  };

  // Generate ramp intervals (gradual power increase)
  const generateRamp = () => {
    const { rampDuration, rampStartPowerPct, rampEndPowerPct, rampSteps } = settings;
    const intervals = [];
    const stepDuration = rampDuration / rampSteps;
    const powerIncrement = (rampEndPowerPct - rampStartPowerPct) / (rampSteps - 1);

    for (let i = 0; i < rampSteps; i++) {
      const powerPct = rampStartPowerPct + (powerIncrement * i);
      const zone = powerPct < 75 ? 3 : powerPct < 90 ? 4 : 5;

      intervals.push({
        duration: stepDuration,
        zone,
        powerPctFTP: Math.round(powerPct),
        cadence: '85-95',
        description: `Ramp step ${i + 1} - ${Math.round(powerPct)}% FTP`
      });
    }

    return intervals;
  };

  // Generate descending intervals (5, 4, 3, 2, 1)
  const generateDescending = () => {
    const { descendingStart, descendingEnd, descendingStep, descendingPowerPct, descendingRestDuration, descendingRestPowerPct } = settings;
    const intervals = [];

    for (let duration = descendingStart; duration >= descendingEnd; duration -= descendingStep) {
      intervals.push({
        duration,
        zone: 4,
        powerPctFTP: descendingPowerPct,
        cadence: '90-100',
        description: `${duration}min hard effort`
      });

      // Add rest between intervals (but not after the last one)
      if (duration > descendingEnd) {
        intervals.push({
          duration: descendingRestDuration,
          zone: 2,
          powerPctFTP: descendingRestPowerPct,
          cadence: '85-95',
          description: 'Recovery'
        });
      }
    }

    return intervals;
  };

  // Handle generate
  const handleGenerate = () => {
    let intervals = [];

    switch (generatorType) {
      case 'pyramid':
        intervals = generatePyramid();
        break;
      case 'ramp':
        intervals = generateRamp();
        break;
      case 'descending':
        intervals = generateDescending();
        break;
      default:
        intervals = [];
    }

    onGenerate(intervals);
    onClose();
  };

  // Preview the generated intervals
  const getPreview = () => {
    switch (generatorType) {
      case 'pyramid':
        return `${settings.pyramidStart}min → ${settings.pyramidPeak}min → ${settings.pyramidStart}min`;
      case 'ramp':
        return `${settings.rampStartPowerPct}% → ${settings.rampEndPowerPct}% over ${settings.rampDuration}min`;
      case 'descending':
        return `${settings.descendingStart}min → ${settings.descendingEnd}min`;
      default:
        return '';
    }
  };

  // Calculate total duration
  const getTotalDuration = () => {
    let intervals = [];
    switch (generatorType) {
      case 'pyramid':
        intervals = generatePyramid();
        break;
      case 'ramp':
        intervals = generateRamp();
        break;
      case 'descending':
        intervals = generateDescending();
        break;
      default:
        return 0;
    }
    return intervals.reduce((sum, interval) => sum + interval.duration, 0);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Zap size={20} />
          <Text fw={600}>Interval Generators</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Alert icon={<Activity size={16} />} color="blue">
          Quickly generate common interval patterns. These will be added to your workout's main set.
        </Alert>

        {/* Generator Type Selection */}
        <Select
          label="Generator Type"
          data={[
            { value: 'pyramid', label: 'Pyramid (1-2-3-4-5-4-3-2-1)' },
            { value: 'ramp', label: 'Ramp (Gradual Power Increase)' },
            { value: 'descending', label: 'Descending (5-4-3-2-1)' }
          ]}
          value={generatorType}
          onChange={setGeneratorType}
        />

        <Divider />

        {/* Pyramid Settings */}
        {generatorType === 'pyramid' && (
          <Card withBorder>
            <Stack gap="sm">
              <Group>
                <Triangle size={16} />
                <Text fw={500}>Pyramid Settings</Text>
              </Group>

              <Group grow>
                <NumberInput
                  label="Start Duration (min)"
                  min={1}
                  max={10}
                  value={settings.pyramidStart}
                  onChange={(val) => setSettings({ ...settings, pyramidStart: val })}
                />
                <NumberInput
                  label="Peak Duration (min)"
                  min={1}
                  max={20}
                  value={settings.pyramidPeak}
                  onChange={(val) => setSettings({ ...settings, pyramidPeak: val })}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label="Step Size (min)"
                  min={1}
                  max={5}
                  value={settings.pyramidStep}
                  onChange={(val) => setSettings({ ...settings, pyramidStep: val })}
                />
                <NumberInput
                  label="Work Power (% FTP)"
                  min={50}
                  max={150}
                  value={settings.pyramidPowerPct}
                  onChange={(val) => setSettings({ ...settings, pyramidPowerPct: val })}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label="Rest Duration (min)"
                  min={1}
                  max={10}
                  value={settings.pyramidRestDuration}
                  onChange={(val) => setSettings({ ...settings, pyramidRestDuration: val })}
                />
                <NumberInput
                  label="Rest Power (% FTP)"
                  min={30}
                  max={80}
                  value={settings.pyramidRestPowerPct}
                  onChange={(val) => setSettings({ ...settings, pyramidRestPowerPct: val })}
                />
              </Group>
            </Stack>
          </Card>
        )}

        {/* Ramp Settings */}
        {generatorType === 'ramp' && (
          <Card withBorder>
            <Stack gap="sm">
              <Group>
                <TrendingUp size={16} />
                <Text fw={500}>Ramp Settings</Text>
              </Group>

              <NumberInput
                label="Total Duration (min)"
                min={5}
                max={60}
                value={settings.rampDuration}
                onChange={(val) => setSettings({ ...settings, rampDuration: val })}
              />

              <Group grow>
                <NumberInput
                  label="Start Power (% FTP)"
                  min={40}
                  max={100}
                  value={settings.rampStartPowerPct}
                  onChange={(val) => setSettings({ ...settings, rampStartPowerPct: val })}
                />
                <NumberInput
                  label="End Power (% FTP)"
                  min={50}
                  max={150}
                  value={settings.rampEndPowerPct}
                  onChange={(val) => setSettings({ ...settings, rampEndPowerPct: val })}
                />
              </Group>

              <NumberInput
                label="Number of Steps"
                min={2}
                max={10}
                value={settings.rampSteps}
                onChange={(val) => setSettings({ ...settings, rampSteps: val })}
              />
            </Stack>
          </Card>
        )}

        {/* Descending Settings */}
        {generatorType === 'descending' && (
          <Card withBorder>
            <Stack gap="sm">
              <Group>
                <Triangle size={16} style={{ transform: 'rotate(180deg)' }} />
                <Text fw={500}>Descending Settings</Text>
              </Group>

              <Group grow>
                <NumberInput
                  label="Start Duration (min)"
                  min={1}
                  max={20}
                  value={settings.descendingStart}
                  onChange={(val) => setSettings({ ...settings, descendingStart: val })}
                />
                <NumberInput
                  label="End Duration (min)"
                  min={1}
                  max={10}
                  value={settings.descendingEnd}
                  onChange={(val) => setSettings({ ...settings, descendingEnd: val })}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label="Step Size (min)"
                  min={1}
                  max={5}
                  value={settings.descendingStep}
                  onChange={(val) => setSettings({ ...settings, descendingStep: val })}
                />
                <NumberInput
                  label="Work Power (% FTP)"
                  min={50}
                  max={150}
                  value={settings.descendingPowerPct}
                  onChange={(val) => setSettings({ ...settings, descendingPowerPct: val })}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label="Rest Duration (min)"
                  min={1}
                  max={10}
                  value={settings.descendingRestDuration}
                  onChange={(val) => setSettings({ ...settings, descendingRestDuration: val })}
                />
                <NumberInput
                  label="Rest Power (% FTP)"
                  min={30}
                  max={80}
                  value={settings.descendingRestPowerPct}
                  onChange={(val) => setSettings({ ...settings, descendingRestPowerPct: val })}
                />
              </Group>
            </Stack>
          </Card>
        )}

        {/* Preview */}
        <Card withBorder bg="gray.0">
          <Stack gap="xs">
            <Text size="sm" fw={500}>Preview</Text>
            <Text size="sm" c="dimmed">{getPreview()}</Text>
            <Group gap="xs">
              <Badge color="blue">Total Duration: {getTotalDuration()} min</Badge>
              <Badge color="green">Intervals: {generatorType === 'ramp' ? settings.rampSteps : Math.ceil((generatorType === 'pyramid' ? (settings.pyramidPeak - settings.pyramidStart) / settings.pyramidStep * 2 + 1 : (settings.descendingStart - settings.descendingEnd) / settings.descendingStep + 1))}</Badge>
            </Group>
          </Stack>
        </Card>

        {/* Actions */}
        <Group justify="space-between">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleGenerate}>
            Generate Intervals
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default IntervalGenerators;
