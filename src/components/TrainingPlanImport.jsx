import React, { useState, useCallback } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Paper,
  Progress,
  Alert,
  ThemeIcon,
  Badge,
  Tabs,
  TextInput,
  Select,
  NumberInput,
  Textarea,
  Checkbox,
  SimpleGrid,
  Card,
  ActionIcon,
  Divider,
  List,
  Loader,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconUpload,
  IconPhoto,
  IconPencil,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconBike,
  IconClock,
  IconCalendar,
  IconTrash,
  IconEdit,
  IconPlus,
  IconSparkles,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext.jsx';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

const WORKOUT_TYPES = [
  { value: 'recovery', label: 'Recovery', color: 'green' },
  { value: 'endurance', label: 'Endurance', color: 'blue' },
  { value: 'tempo', label: 'Tempo', color: 'yellow' },
  { value: 'sweet_spot', label: 'Sweet Spot', color: 'orange' },
  { value: 'threshold', label: 'Threshold', color: 'red' },
  { value: 'intervals', label: 'Intervals', color: 'pink' },
  { value: 'vo2max', label: 'VO2max', color: 'grape' },
  { value: 'rest', label: 'Rest Day', color: 'gray' },
];

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

function TrainingPlanImport({ opened, onClose, onImportComplete }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('screenshot');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Screenshot upload state
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [parsedWorkouts, setParsedWorkouts] = useState(null);
  const [planInfo, setPlanInfo] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null);

  // Manual entry state
  const [manualWorkouts, setManualWorkouts] = useState([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(4);

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setParsedWorkouts(null);
    setPlanInfo(null);
    setEditingWorkout(null);
    setManualWorkouts([]);
    setError(null);
    setLoading(false);
    onClose();
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, etc.)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large. Please use an image under 10MB.');
      return;
    }

    setSelectedImage(file);
    setError(null);
    setParsedWorkouts(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const event = { target: { files: [file] } };
      handleFileSelect(event);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // Parse screenshot with Claude Vision
  const handleParseScreenshot = async () => {
    if (!selectedImage || !user) return;

    setLoading(true);
    setProgress(0);
    setError(null);

    try {
      // Convert image to base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.readAsDataURL(selectedImage);
      });

      setProgress(30);

      // Send to API for parsing
      const response = await fetch(`${getApiBaseUrl()}/api/parse-training-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'parse_screenshot',
          imageData: base64,
          userId: user.id
        })
      });

      setProgress(70);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse training plan');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to parse training plan');
      }

      setParsedWorkouts(data.workouts);
      setPlanInfo(data.planInfo);
      setProgress(100);

      if (data.extractionNotes) {
        notifications.show({
          title: 'Note',
          message: data.extractionNotes,
          color: 'yellow',
        });
      }

    } catch (err) {
      console.error('Parse error:', err);
      setError(err.message || 'Failed to parse training plan');
    } finally {
      setLoading(false);
    }
  };

  // Save parsed workouts
  const handleSaveParsedPlan = async () => {
    if (!parsedWorkouts || parsedWorkouts.length === 0 || !user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/parse-training-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_plan',
          userId: user.id,
          workouts: parsedWorkouts,
          planInfo: planInfo
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save training plan');
      }

      const data = await response.json();

      notifications.show({
        title: 'Training Plan Imported',
        message: `Successfully imported ${data.workouts.length} workouts`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });

      onImportComplete?.(data);
      handleClose();

    } catch (err) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save training plan');
    } finally {
      setLoading(false);
    }
  };

  // Update a parsed workout
  const handleUpdateWorkout = (index, updates) => {
    setParsedWorkouts(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
    setEditingWorkout(null);
  };

  // Remove a parsed workout
  const handleRemoveWorkout = (index) => {
    setParsedWorkouts(prev => prev.filter((_, i) => i !== index));
  };

  // Add manual workout
  const handleAddManualWorkout = () => {
    const nextMonday = getNextMonday();
    setManualWorkouts(prev => [...prev, {
      id: `manual_${Date.now()}`,
      day_of_week: 'monday',
      scheduled_date: nextMonday.toISOString().split('T')[0],
      workout_type: 'endurance',
      duration_mins: 60,
      description: ''
    }]);
  };

  // Update manual workout
  const handleUpdateManualWorkout = (index, updates) => {
    setManualWorkouts(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  // Remove manual workout
  const handleRemoveManualWorkout = (index) => {
    setManualWorkouts(prev => prev.filter((_, i) => i !== index));
  };

  // Save manual workouts
  const handleSaveManualWorkouts = async () => {
    if (manualWorkouts.length === 0 || !user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/parse-training-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_manual_workouts_batch',
          userId: user.id,
          workouts: manualWorkouts,
          recurring: isRecurring ? { weeks: recurringWeeks } : null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save workouts');
      }

      const data = await response.json();

      notifications.show({
        title: 'Workouts Added',
        message: `Successfully added ${data.count} workouts`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });

      onImportComplete?.(data);
      handleClose();

    } catch (err) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save workouts');
    } finally {
      setLoading(false);
    }
  };

  // Get workout type color
  const getWorkoutColor = (type) => {
    return WORKOUT_TYPES.find(t => t.value === type)?.color || 'gray';
  };

  // Get next Monday
  const getNextMonday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday;
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="orange" variant="light">
            <IconCalendar size={18} />
          </ThemeIcon>
          <Text fw={600}>Import Training Plan</Text>
        </Group>
      }
      size="xl"
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="screenshot" leftSection={<IconPhoto size={16} />}>
            From Screenshot
          </Tabs.Tab>
          <Tabs.Tab value="manual" leftSection={<IconPencil size={16} />}>
            Manual Entry
          </Tabs.Tab>
        </Tabs.List>

        {/* Screenshot Upload Tab */}
        <Tabs.Panel value="screenshot">
          <Stack gap="md">
            {!parsedWorkouts ? (
              <>
                <Text size="sm" c="dimmed">
                  Upload a screenshot of your training plan. We'll use AI to extract the workouts automatically.
                </Text>

                {/* Drop Zone */}
                <Paper
                  withBorder
                  p="xl"
                  style={{
                    borderStyle: 'dashed',
                    backgroundColor: 'var(--mantine-color-dark-7)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minHeight: imagePreview ? 'auto' : 200
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => !imagePreview && document.getElementById('screenshot-input').click()}
                >
                  <input
                    id="screenshot-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />

                  {imagePreview ? (
                    <Stack align="center" gap="sm">
                      <img
                        src={imagePreview}
                        alt="Training plan preview"
                        style={{
                          maxWidth: '100%',
                          maxHeight: 300,
                          borderRadius: 8
                        }}
                      />
                      <Group gap="sm">
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImagePreview(null);
                            setSelectedImage(null);
                          }}
                        >
                          Remove
                        </Button>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById('screenshot-input').click();
                          }}
                        >
                          Change
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={48} variant="light" color="gray">
                        <IconPhoto size={24} />
                      </ThemeIcon>
                      <Text fw={500}>Drop screenshot here or click to browse</Text>
                      <Text size="xs" c="dimmed">PNG, JPG up to 10MB</Text>
                    </Stack>
                  )}
                </Paper>

                {/* Error */}
                {error && (
                  <Alert color="red" icon={<IconAlertCircle size={16} />}>
                    {error}
                  </Alert>
                )}

                {/* Progress */}
                {loading && (
                  <Paper withBorder p="sm">
                    <Group gap="sm" mb="xs">
                      <Loader size="xs" />
                      <Text size="sm">Analyzing training plan...</Text>
                    </Group>
                    <Progress value={progress} animated />
                  </Paper>
                )}

                {/* Parse Button */}
                <Button
                  color="orange"
                  leftSection={<IconSparkles size={16} />}
                  onClick={handleParseScreenshot}
                  disabled={!selectedImage || loading}
                  loading={loading}
                  fullWidth
                >
                  Analyze with AI
                </Button>
              </>
            ) : (
              <>
                {/* Parsed Results */}
                <Alert color="green" icon={<IconCheck size={16} />} mb="sm">
                  Found {parsedWorkouts.length} workouts in your plan
                </Alert>

                {planInfo?.name && (
                  <Text fw={500} mb="sm">{planInfo.name}</Text>
                )}

                <Text size="sm" c="dimmed" mb="sm">
                  Review and edit the extracted workouts before saving:
                </Text>

                {/* Workout List */}
                <Stack gap="xs">
                  {parsedWorkouts.map((workout, index) => (
                    <Card key={workout.id || index} withBorder p="sm">
                      {editingWorkout === index ? (
                        <Stack gap="xs">
                          <Group grow>
                            <Select
                              label="Day"
                              data={DAYS_OF_WEEK}
                              value={workout.day_of_week}
                              onChange={(v) => handleUpdateWorkout(index, { day_of_week: v })}
                            />
                            <Select
                              label="Type"
                              data={WORKOUT_TYPES}
                              value={workout.workout_type}
                              onChange={(v) => handleUpdateWorkout(index, { workout_type: v })}
                            />
                            <NumberInput
                              label="Duration (mins)"
                              value={workout.duration_mins}
                              onChange={(v) => handleUpdateWorkout(index, { duration_mins: v })}
                              min={15}
                              max={480}
                            />
                          </Group>
                          <Textarea
                            label="Description"
                            value={workout.description}
                            onChange={(e) => handleUpdateWorkout(index, { description: e.target.value })}
                          />
                          <Group justify="flex-end">
                            <Button size="xs" onClick={() => setEditingWorkout(null)}>Done</Button>
                          </Group>
                        </Stack>
                      ) : (
                        <Group justify="space-between">
                          <Group gap="sm">
                            <Badge color={getWorkoutColor(workout.workout_type)} size="sm">
                              {workout.day_of_week}
                            </Badge>
                            <Text size="sm" fw={500}>
                              {WORKOUT_TYPES.find(t => t.value === workout.workout_type)?.label || workout.workout_type}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {workout.duration_mins} mins
                            </Text>
                            {workout.confidence === 'low' && (
                              <Badge color="yellow" size="xs" variant="outline">
                                Review
                              </Badge>
                            )}
                          </Group>
                          <Group gap="xs">
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={() => setEditingWorkout(index)}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              onClick={() => handleRemoveWorkout(index)}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      )}
                      {!editingWorkout && workout.description && (
                        <Text size="xs" c="dimmed" mt="xs">
                          {workout.description}
                        </Text>
                      )}
                    </Card>
                  ))}
                </Stack>

                {/* Error */}
                {error && (
                  <Alert color="red" icon={<IconAlertCircle size={16} />}>
                    {error}
                  </Alert>
                )}

                {/* Actions */}
                <Group justify="space-between" mt="md">
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setParsedWorkouts(null);
                      setPlanInfo(null);
                    }}
                  >
                    Start Over
                  </Button>
                  <Button
                    color="orange"
                    leftSection={<IconCheck size={16} />}
                    onClick={handleSaveParsedPlan}
                    loading={loading}
                    disabled={parsedWorkouts.length === 0}
                  >
                    Save Training Plan
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Tabs.Panel>

        {/* Manual Entry Tab */}
        <Tabs.Panel value="manual">
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Add workouts manually. You can add multiple workouts and optionally repeat them weekly.
            </Text>

            {/* Workout List */}
            {manualWorkouts.length > 0 && (
              <Stack gap="xs">
                {manualWorkouts.map((workout, index) => (
                  <Card key={workout.id} withBorder p="sm">
                    <Group grow mb="xs">
                      <DateInput
                        label="Date"
                        value={new Date(workout.scheduled_date)}
                        onChange={(date) => handleUpdateManualWorkout(index, {
                          scheduled_date: date.toISOString().split('T')[0]
                        })}
                      />
                      <Select
                        label="Type"
                        data={WORKOUT_TYPES}
                        value={workout.workout_type}
                        onChange={(v) => handleUpdateManualWorkout(index, { workout_type: v })}
                      />
                      <NumberInput
                        label="Duration (mins)"
                        value={workout.duration_mins}
                        onChange={(v) => handleUpdateManualWorkout(index, { duration_mins: v })}
                        min={15}
                        max={480}
                      />
                    </Group>
                    <Group justify="space-between" align="flex-end">
                      <TextInput
                        label="Description (optional)"
                        value={workout.description}
                        onChange={(e) => handleUpdateManualWorkout(index, { description: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemoveManualWorkout(index)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            {/* Add Workout Button */}
            <Button
              variant="outline"
              leftSection={<IconPlus size={16} />}
              onClick={handleAddManualWorkout}
            >
              Add Workout
            </Button>

            {/* Recurring Option */}
            {manualWorkouts.length > 0 && (
              <Paper withBorder p="sm">
                <Group>
                  <Checkbox
                    label="Repeat weekly"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                  />
                  {isRecurring && (
                    <NumberInput
                      label="For how many weeks?"
                      value={recurringWeeks}
                      onChange={setRecurringWeeks}
                      min={2}
                      max={12}
                      style={{ width: 120 }}
                    />
                  )}
                </Group>
              </Paper>
            )}

            {/* Error */}
            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}

            {/* Save Button */}
            <Button
              color="orange"
              leftSection={<IconCheck size={16} />}
              onClick={handleSaveManualWorkouts}
              disabled={manualWorkouts.length === 0}
              loading={loading}
            >
              Save {manualWorkouts.length} Workout{manualWorkouts.length !== 1 ? 's' : ''}
              {isRecurring && ` (${manualWorkouts.length * recurringWeeks} total)`}
            </Button>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export default TrainingPlanImport;
