import React, { useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Select,
  MultiSelect,
  NumberInput,
  Button,
  Group,
  Stepper,
  Alert,
  Switch,
  Card,
  Text,
  Badge,
  Divider,
  Menu
} from '@mantine/core';
import {
  Save,
  X,
  CheckCircle,
  AlertCircle,
  Activity,
  Info,
  Download,
  FileDown
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import WorkoutStructureEditor from './WorkoutStructureEditor';
import PowerProfileChart from './PowerProfileChart';
import workoutService from '../../services/workoutService';
import exportService from '../../services/exportService';
import { useAuth } from '../../contexts/AuthContext';
import { TRAINING_ZONES } from '../../utils/trainingPlans';

/**
 * WorkoutBuilder
 * Complete UI for creating custom workout templates
 */
const WorkoutBuilder = ({ opened, onClose, onWorkoutCreated, editWorkout = null }) => {
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [workoutData, setWorkoutData] = useState(editWorkout || {
    name: '',
    description: '',
    category: 'endurance',
    difficulty_level: 'intermediate',
    terrain_type: 'mixed',
    focus_area: 'endurance',
    tags: [],
    is_public: false,
    structure: {
      warmup: null,
      main: [],
      cooldown: null
    },
    coach_notes: ''
  });

  // Category options
  const categoryOptions = [
    { value: 'recovery', label: 'Recovery' },
    { value: 'endurance', label: 'Endurance' },
    { value: 'tempo', label: 'Tempo' },
    { value: 'sweet_spot', label: 'Sweet Spot' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'vo2max', label: 'VO2 Max' },
    { value: 'climbing', label: 'Climbing' },
    { value: 'anaerobic', label: 'Anaerobic' },
    { value: 'racing', label: 'Race Prep' }
  ];

  // Difficulty options
  const difficultyOptions = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' }
  ];

  // Terrain options
  const terrainOptions = [
    { value: 'flat', label: 'Flat' },
    { value: 'rolling', label: 'Rolling' },
    { value: 'hilly', label: 'Hilly' },
    { value: 'mountainous', label: 'Mountainous' },
    { value: 'mixed', label: 'Mixed' }
  ];

  // Focus area options
  const focusOptions = [
    { value: 'recovery', label: 'Recovery' },
    { value: 'endurance', label: 'Endurance' },
    { value: 'power', label: 'Power' },
    { value: 'climbing', label: 'Climbing' },
    { value: 'speed', label: 'Speed' },
    { value: 'vo2max', label: 'VO2 Max' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'tempo', label: 'Tempo' }
  ];

  // Common tags
  const tagOptions = [
    'intervals',
    'endurance',
    'recovery',
    'sweet-spot',
    'threshold',
    'vo2max',
    'climbing',
    'tempo',
    'beginner-friendly',
    'advanced',
    'indoor',
    'outdoor',
    'race-prep',
    'base-training',
    'build-phase',
    'peak-phase'
  ];

  // Calculate workout metrics
  const calculateMetrics = () => {
    const structure = workoutData.structure;
    let duration = 0;
    let weightedPower = 0;
    let totalMinutes = 0;

    // Helper to add segment metrics
    const addSegment = (segment) => {
      if (!segment) return;
      const mins = segment.duration || 0;
      const power = segment.powerPctFTP || 65;
      duration += mins;
      weightedPower += mins * (power / 100);
      totalMinutes += mins;
    };

    // Warmup
    addSegment(structure.warmup);

    // Main intervals
    structure.main?.forEach(interval => {
      if (interval.type === 'repeat') {
        const sets = interval.sets || 1;
        const workMins = interval.work?.duration || 0;
        const workPower = interval.work?.powerPctFTP || 95;
        const restMins = interval.rest?.duration || 0;
        const restPower = interval.rest?.powerPctFTP || 55;

        duration += (workMins + restMins) * sets;
        weightedPower += sets * (workMins * (workPower / 100) + restMins * (restPower / 100));
        totalMinutes += (workMins + restMins) * sets;
      } else {
        addSegment(interval);
      }
    });

    // Cooldown
    addSegment(structure.cooldown);

    // Calculate IF and TSS
    const intensityFactor = totalMinutes > 0 ? weightedPower / totalMinutes : 0.65;
    const targetTSS = Math.round((duration / 60) * intensityFactor * intensityFactor * 100);

    // Determine primary zone
    const primaryZone = intensityFactor >= 1.05 ? 5 :
                        intensityFactor >= 0.95 ? 4 :
                        intensityFactor >= 0.85 ? 3 :
                        intensityFactor >= 0.75 ? 2 : 1;

    return {
      duration,
      intensityFactor: parseFloat(intensityFactor.toFixed(2)),
      targetTSS,
      primaryZone
    };
  };

  const metrics = calculateMetrics();

  // Update form field
  const updateField = (field, value) => {
    setWorkoutData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Validate current step
  const validateStep = () => {
    if (activeStep === 0) {
      if (!workoutData.name?.trim()) {
        setError('Workout name is required');
        return false;
      }
      if (!workoutData.description?.trim()) {
        setError('Description is required');
        return false;
      }
    }

    if (activeStep === 1) {
      if (!workoutData.structure.main || workoutData.structure.main.length === 0) {
        setError('At least one main interval is required');
        return false;
      }
    }

    setError(null);
    return true;
  };

  // Next step
  const nextStep = () => {
    if (validateStep()) {
      setActiveStep(prev => prev + 1);
    }
  };

  // Previous step
  const prevStep = () => {
    setError(null);
    setActiveStep(prev => prev - 1);
  };

  // Save workout
  const handleSave = async () => {
    if (!validateStep()) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const workoutPayload = {
        name: workoutData.name.trim(),
        workout_type: workoutData.category,
        description: workoutData.description.trim(),
        structure: workoutData.structure,
        target_tss: metrics.targetTSS,
        duration: metrics.duration,
        terrain_type: workoutData.terrain_type,
        difficulty_level: workoutData.difficulty_level,
        category: workoutData.category,
        coach_notes: workoutData.coach_notes?.trim() || null,
        primary_zone: metrics.primaryZone,
        intensity_factor: metrics.intensityFactor,
        focus_area: workoutData.focus_area,
        tags: workoutData.tags,
        is_public: workoutData.is_public
      };

      let result;
      if (editWorkout) {
        result = await workoutService.updateCustomWorkout(editWorkout.id, workoutPayload);
      } else {
        result = await workoutService.createCustomWorkout(user.id, workoutPayload);
      }

      if (result.error) throw result.error;

      setSuccess(true);
      setTimeout(() => {
        if (onWorkoutCreated) onWorkoutCreated(result.data);
        handleClose();
      }, 1500);

    } catch (err) {
      console.error('Error saving workout:', err);
      setError(err.message || 'Failed to save workout');
    } finally {
      setLoading(false);
    }
  };

  // Export handlers
  const handleExport = (format) => {
    try {
      const workoutForExport = {
        ...workoutData,
        target_tss: metrics.targetTSS,
        duration: metrics.duration
      };

      let content, filename;

      switch (format) {
        case 'zwift':
          content = exportService.exportToZwift(workoutForExport);
          filename = `${exportService.sanitizeFilename || ((s) => s.replace(/[^a-z0-9]/gi, '_'))(workoutData.name || 'workout')}.zwo`;
          exportService.downloadFile(content, filename, 'application/xml');
          notifications.show({
            title: 'Export Successful',
            message: 'Workout exported to Zwift format (.zwo)',
            color: 'green'
          });
          break;

        case 'trainerroad':
          content = exportService.exportToTrainerRoad(workoutForExport);
          filename = `${exportService.sanitizeFilename || ((s) => s.replace(/[^a-z0-9]/gi, '_'))(workoutData.name || 'workout')}.mrc`;
          exportService.downloadFile(content, filename, 'text/plain');
          notifications.show({
            title: 'Export Successful',
            message: 'Workout exported to TrainerRoad format (.mrc)',
            color: 'green'
          });
          break;

        case 'erg':
          content = exportService.exportToERG(workoutForExport);
          filename = `${exportService.sanitizeFilename || ((s) => s.replace(/[^a-z0-9]/gi, '_'))(workoutData.name || 'workout')}.erg`;
          exportService.downloadFile(content, filename, 'text/plain');
          notifications.show({
            title: 'Export Successful',
            message: 'Workout exported to ERG format',
            color: 'green'
          });
          break;

        default:
          throw new Error('Unknown export format');
      }
    } catch (err) {
      console.error('Export error:', err);
      notifications.show({
        title: 'Export Failed',
        message: err.message || 'Failed to export workout',
        color: 'red'
      });
    }
  };

  // Close modal
  const handleClose = () => {
    setActiveStep(0);
    setError(null);
    setSuccess(false);
    setWorkoutData({
      name: '',
      description: '',
      category: 'endurance',
      difficulty_level: 'intermediate',
      terrain_type: 'mixed',
      focus_area: 'endurance',
      tags: [],
      is_public: false,
      structure: {
        warmup: null,
        main: [],
        cooldown: null
      },
      coach_notes: ''
    });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={<Text fw={700} size="lg" c="dark">{editWorkout ? 'Edit Workout' : 'Create Custom Workout'}</Text>}
      size="xl"
      closeOnClickOutside={false}
    >
      <Stack gap="lg">
        <Stepper active={activeStep} onStepClick={setActiveStep}>
          {/* Step 1: Basic Info */}
          <Stepper.Step label="Basic Info" description="Name and details">
            <Stack gap="md" mt="md">
              <TextInput
                label="Workout Name"
                placeholder="e.g., Sweet Spot Intervals"
                required
                value={workoutData.name}
                onChange={(e) => updateField('name', e.target.value)}
                leftSection={<Activity size={16} />}
              />

              <Textarea
                label="Description"
                placeholder="Describe the workout purpose and what athletes should expect..."
                required
                minRows={3}
                value={workoutData.description}
                onChange={(e) => updateField('description', e.target.value)}
              />

              <Group grow>
                <Select
                  label="Category"
                  data={categoryOptions}
                  value={workoutData.category}
                  onChange={(val) => updateField('category', val)}
                />
                <Select
                  label="Difficulty"
                  data={difficultyOptions}
                  value={workoutData.difficulty_level}
                  onChange={(val) => updateField('difficulty_level', val)}
                />
              </Group>

              <Group grow>
                <Select
                  label="Terrain Type"
                  data={terrainOptions}
                  value={workoutData.terrain_type}
                  onChange={(val) => updateField('terrain_type', val)}
                />
                <Select
                  label="Focus Area"
                  data={focusOptions}
                  value={workoutData.focus_area}
                  onChange={(val) => updateField('focus_area', val)}
                />
              </Group>

              <MultiSelect
                label="Tags"
                placeholder="Select or add tags"
                data={tagOptions}
                value={workoutData.tags}
                onChange={(val) => updateField('tags', val)}
                searchable
                creatable
                getCreateLabel={(query) => `+ Add "${query}"`}
              />
            </Stack>
          </Stepper.Step>

          {/* Step 2: Workout Structure */}
          <Stepper.Step label="Structure" description="Build intervals">
            <Stack gap="md" mt="md">
              <WorkoutStructureEditor
                structure={workoutData.structure}
                onChange={(newStructure) => updateField('structure', newStructure)}
              />
            </Stack>
          </Stepper.Step>

          {/* Step 3: Final Details */}
          <Stepper.Step label="Review" description="Final touches">
            <Stack gap="md" mt="md">
              {/* Power Profile Chart */}
              <PowerProfileChart structure={workoutData.structure} height={250} />

              <Divider />

              <Textarea
                label="Coach Notes (Optional)"
                placeholder="Add specific coaching guidance, tips, or notes for this workout..."
                minRows={3}
                value={workoutData.coach_notes}
                onChange={(e) => updateField('coach_notes', e.target.value)}
              />

              <Switch
                label="Make this workout public (visible to all users)"
                description="Public workouts can be used by anyone in the community"
                checked={workoutData.is_public}
                onChange={(e) => updateField('is_public', e.currentTarget.checked)}
              />

              {/* Summary */}
              <Card withBorder p="md">
                <Stack gap="xs">
                  <Text size="sm" fw={600} c="dark">Workout Summary</Text>
                  <Text size="sm"><strong>Name:</strong> {workoutData.name || 'Not set'}</Text>
                  <Text size="sm"><strong>Category:</strong> {workoutData.category}</Text>
                  <Text size="sm"><strong>Difficulty:</strong> {workoutData.difficulty_level}</Text>
                  <Text size="sm"><strong>Intervals:</strong> {workoutData.structure.main.length} main intervals</Text>
                  <Text size="sm"><strong>Tags:</strong> {workoutData.tags.length > 0 ? workoutData.tags.join(', ') : 'None'}</Text>
                </Stack>
              </Card>
            </Stack>
          </Stepper.Step>
        </Stepper>

        {/* Error/Success Messages */}
        {error && (
          <Alert icon={<AlertCircle size={16} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {success && (
          <Alert icon={<CheckCircle size={16} />} color="green">
            Workout {editWorkout ? 'updated' : 'created'} successfully!
          </Alert>
        )}

        {/* Navigation Buttons */}
        <Group justify="space-between">
          <Group>
            {activeStep > 0 && (
              <Button variant="subtle" onClick={prevStep} disabled={loading}>
                Back
              </Button>
            )}
            {activeStep === 2 && workoutData.structure.main.length > 0 && (
              <Menu position="top-start">
                <Menu.Target>
                  <Button variant="light" leftSection={<Download size={16} />}>
                    Export Workout
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Export Format</Menu.Label>
                  <Menu.Item
                    leftSection={<FileDown size={14} />}
                    onClick={() => handleExport('zwift')}
                  >
                    Zwift (.zwo)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<FileDown size={14} />}
                    onClick={() => handleExport('trainerroad')}
                  >
                    TrainerRoad (.mrc)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<FileDown size={14} />}
                    onClick={() => handleExport('erg')}
                  >
                    Generic ERG (.erg)
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>

          <Group>
            <Button variant="subtle" onClick={handleClose} disabled={loading} leftSection={<X size={16} />}>
              Cancel
            </Button>

            {activeStep < 2 ? (
              <Button onClick={nextStep} disabled={loading}>
                Next Step
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                loading={loading}
                leftSection={<Save size={16} />}
                color="green"
              >
                {editWorkout ? 'Update Workout' : 'Create Workout'}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default WorkoutBuilder;
