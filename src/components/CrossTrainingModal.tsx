/**
 * CrossTrainingModal
 * Modal for logging cross-training activities with detailed metrics
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  NumberInput,
  Textarea,
  Paper,
  SimpleGrid,
  ThemeIcon,
  Badge,
  Divider,
  SegmentedControl,
  Select,
  Slider,
  Chip,
  ActionIcon,
  Tooltip,
  Collapse,
  Box,
  TextInput,
  ColorInput,
  Loader,
  ScrollArea,
} from '@mantine/core';
import {
  IconCheck,
  IconPlus,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconFlame,
  IconMoodSmile,
  IconRun,
  IconYoga,
  IconBarbell,
  IconStretching,
  IconBrain,
  IconActivity,
  IconSettings,
  IconTrash,
  IconEdit,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useCrossTraining, ActivityType, ACTIVITY_CATEGORIES, CreateActivityInput } from '../hooks/useCrossTraining';

// Props
interface CrossTrainingModalProps {
  opened: boolean;
  onClose: () => void;
  onSave?: (activity: unknown) => void;
  selectedDate?: string; // ISO date string
  editingActivity?: {
    id: string;
    activity_type_id: string | null;
    duration_minutes: number;
    intensity: number;
    perceived_effort: number | null;
    metrics: Record<string, unknown>;
    mood_before: number | null;
    mood_after: number | null;
    notes: string | null;
  } | null;
}

// Icon mapping for categories
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  strength: <IconBarbell size={16} />,
  flexibility: <IconYoga size={16} />,
  cardio: <IconRun size={16} />,
  recovery: <IconStretching size={16} />,
  mind_body: <IconBrain size={16} />,
  other: <IconActivity size={16} />,
};

// Mood scale
const MOOD_OPTIONS = [
  { value: '1', label: 'Very Low' },
  { value: '2', label: 'Low' },
  { value: '3', label: 'Okay' },
  { value: '4', label: 'Good' },
  { value: '5', label: 'Great' },
];

// Intensity descriptions
const INTENSITY_LABELS: Record<number, string> = {
  1: 'Very Light',
  2: 'Light',
  3: 'Light-Moderate',
  4: 'Moderate',
  5: 'Moderate',
  6: 'Moderate-Hard',
  7: 'Hard',
  8: 'Very Hard',
  9: 'Extremely Hard',
  10: 'Maximum',
};

// Muscle group options
const MUSCLE_GROUPS = [
  'Full Body',
  'Upper Body',
  'Lower Body',
  'Core',
  'Back',
  'Chest',
  'Shoulders',
  'Arms',
  'Legs',
  'Glutes',
];

export default function CrossTrainingModal({
  opened,
  onClose,
  onSave,
  selectedDate,
  editingActivity,
}: CrossTrainingModalProps) {
  const {
    activityTypes,
    loading: typesLoading,
    createActivity,
    updateActivity,
    createActivityType,
    getFrequentActivityTypes,
  } = useCrossTraining();

  // Form state
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [intensity, setIntensity] = useState<number>(5);
  const [perceivedEffort, setPerceivedEffort] = useState<number | null>(null);
  const [moodBefore, setMoodBefore] = useState<string | null>(null);
  const [moodAfter, setMoodAfter] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});

  // UI state
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCreateType, setShowCreateType] = useState(false);
  const [frequentTypes, setFrequentTypes] = useState<ActivityType[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // New type form state
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState<string>('other');
  const [newTypeColor, setNewTypeColor] = useState('#6366f1');
  const [creatingType, setCreatingType] = useState(false);

  // Get the selected activity type
  const selectedType = useMemo(() => {
    return activityTypes.find(t => t.id === selectedTypeId) || null;
  }, [activityTypes, selectedTypeId]);

  // Filter types by category
  const filteredTypes = useMemo(() => {
    if (!selectedCategory) return activityTypes;
    return activityTypes.filter(t => t.category === selectedCategory);
  }, [activityTypes, selectedCategory]);

  // Load frequent types and set defaults
  useEffect(() => {
    if (opened) {
      getFrequentActivityTypes(5).then(setFrequentTypes);

      // Set date to today if not specified
      if (!selectedDate) {
        // Default values are already set
      }

      // Load editing activity data
      if (editingActivity) {
        setSelectedTypeId(editingActivity.activity_type_id);
        setDuration(editingActivity.duration_minutes);
        setIntensity(editingActivity.intensity);
        setPerceivedEffort(editingActivity.perceived_effort);
        setMoodBefore(editingActivity.mood_before?.toString() || null);
        setMoodAfter(editingActivity.mood_after?.toString() || null);
        setNotes(editingActivity.notes || '');
        setMetrics(editingActivity.metrics || {});
      } else {
        // Reset form for new entry
        resetForm();
      }
    }
  }, [opened, editingActivity, selectedDate, getFrequentActivityTypes]);

  // Update defaults when type changes
  useEffect(() => {
    if (selectedType && !editingActivity) {
      setDuration(selectedType.default_duration_minutes);
      setIntensity(selectedType.default_intensity);
    }
  }, [selectedType, editingActivity]);

  const resetForm = () => {
    setSelectedTypeId(null);
    setDuration(30);
    setIntensity(5);
    setPerceivedEffort(null);
    setMoodBefore(null);
    setMoodAfter(null);
    setNotes('');
    setMetrics({});
    setShowAdvanced(false);
    setShowCreateType(false);
    setSelectedCategory(null);
  };

  const handleSave = async () => {
    if (!selectedTypeId) {
      notifications.show({
        title: 'Select Activity Type',
        message: 'Please select an activity type',
        color: 'orange',
      });
      return;
    }

    setSaving(true);
    try {
      const activityDate = selectedDate || new Date().toISOString().split('T')[0];

      const input: CreateActivityInput = {
        activity_type_id: selectedTypeId,
        activity_date: activityDate,
        duration_minutes: duration,
        intensity: intensity,
        perceived_effort: perceivedEffort,
        metrics: metrics,
        mood_before: moodBefore ? parseInt(moodBefore) : null,
        mood_after: moodAfter ? parseInt(moodAfter) : null,
        notes: notes || null,
      };

      let result;
      if (editingActivity) {
        result = await updateActivity(editingActivity.id, input);
      } else {
        result = await createActivity(input);
      }

      if (result) {
        notifications.show({
          title: editingActivity ? 'Activity Updated' : 'Activity Logged',
          message: `${selectedType?.name || 'Activity'} - ${duration} min`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        onSave?.(result);
        onClose();
        resetForm();
      }
    } catch (err) {
      console.error('Error saving activity:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to save activity',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) {
      notifications.show({
        title: 'Name Required',
        message: 'Please enter a name for the activity type',
        color: 'orange',
      });
      return;
    }

    setCreatingType(true);
    try {
      const newType = await createActivityType({
        name: newTypeName.trim(),
        category: newTypeCategory as ActivityType['category'],
        color: newTypeColor,
      });

      if (newType) {
        setSelectedTypeId(newType.id);
        setShowCreateType(false);
        setNewTypeName('');
        notifications.show({
          title: 'Activity Type Created',
          message: `"${newType.name}" is now available`,
          color: 'green',
        });
      }
    } catch (err) {
      console.error('Error creating activity type:', err);
    } finally {
      setCreatingType(false);
    }
  };

  // Calculate estimated TSS preview
  const estimatedTSS = useMemo(() => {
    if (!selectedType) return null;
    const hours = duration / 60;
    const intensityFactor = 1 + (intensity - 5) * selectedType.tss_intensity_multiplier;
    return Math.round(hours * selectedType.tss_per_hour_base * Math.max(0.3, intensityFactor));
  }, [selectedType, duration, intensity]);

  // Render category-specific metrics
  const renderCategoryMetrics = () => {
    if (!selectedType) return null;

    const config = selectedType.metrics_config as Record<string, unknown>;

    switch (selectedType.category) {
      case 'strength':
        if (config.muscle_groups) {
          return (
            <Box>
              <Text size="sm" fw={500} mb="xs">Muscle Groups</Text>
              <Chip.Group
                multiple
                value={(metrics.muscle_groups as string[]) || []}
                onChange={(value) => setMetrics(prev => ({ ...prev, muscle_groups: value }))}
              >
                <Group gap="xs">
                  {MUSCLE_GROUPS.map(group => (
                    <Chip key={group} value={group.toLowerCase().replace(' ', '_')} size="xs">
                      {group}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </Box>
          );
        }
        break;

      case 'cardio':
        if (config.track_distance) {
          return (
            <NumberInput
              label="Distance (km)"
              placeholder="Optional"
              value={(metrics.distance_km as number) || ''}
              onChange={(v) => setMetrics(prev => ({ ...prev, distance_km: v || null }))}
              min={0}
              max={500}
              decimalScale={1}
            />
          );
        }
        break;

      case 'flexibility':
        if (config.focus_areas) {
          const focusAreas = ['Hips', 'Hamstrings', 'Back', 'Shoulders', 'Full Body'];
          return (
            <Box>
              <Text size="sm" fw={500} mb="xs">Focus Areas</Text>
              <Chip.Group
                multiple
                value={(metrics.focus_areas as string[]) || []}
                onChange={(value) => setMetrics(prev => ({ ...prev, focus_areas: value }))}
              >
                <Group gap="xs">
                  {focusAreas.map(area => (
                    <Chip key={area} value={area.toLowerCase().replace(' ', '_')} size="xs">
                      {area}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </Box>
          );
        }
        break;
    }

    return null;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="indigo" variant="light">
            <IconActivity size={18} />
          </ThemeIcon>
          <Text fw={600}>{editingActivity ? 'Edit Activity' : 'Log Cross-Training'}</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {selectedDate
            ? `Recording activity for ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
            : 'Log your cross-training activity to track your overall training load.'}
        </Text>

        {/* Quick Select - Frequent Activities */}
        {frequentTypes.length > 0 && !showCreateType && (
          <Box>
            <Text size="sm" fw={500} mb="xs">Quick Select</Text>
            <Group gap="xs">
              {frequentTypes.map(type => (
                <Button
                  key={type.id}
                  size="xs"
                  variant={selectedTypeId === type.id ? 'filled' : 'light'}
                  color={selectedTypeId === type.id ? 'indigo' : 'gray'}
                  onClick={() => setSelectedTypeId(type.id)}
                  leftSection={CATEGORY_ICONS[type.category]}
                >
                  {type.name}
                </Button>
              ))}
            </Group>
          </Box>
        )}

        {/* Category Filter */}
        {!showCreateType && (
          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>Activity Type</Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => setShowCreateType(true)}
              >
                Create Custom
              </Button>
            </Group>

            <SegmentedControl
              size="xs"
              fullWidth
              value={selectedCategory || ''}
              onChange={(v) => setSelectedCategory(v || null)}
              data={[
                { value: '', label: 'All' },
                ...Object.entries(ACTIVITY_CATEGORIES).map(([key, { label }]) => ({
                  value: key,
                  label,
                })),
              ]}
              mb="xs"
            />

            {typesLoading ? (
              <Group justify="center" p="md">
                <Loader size="sm" />
              </Group>
            ) : (
              <ScrollArea h={150}>
                <SimpleGrid cols={2} spacing="xs">
                  {filteredTypes.map(type => (
                    <Paper
                      key={type.id}
                      p="xs"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        borderColor: selectedTypeId === type.id ? type.color : undefined,
                        borderWidth: selectedTypeId === type.id ? 2 : 1,
                        backgroundColor: selectedTypeId === type.id ? `${type.color}10` : undefined,
                      }}
                      onClick={() => setSelectedTypeId(type.id)}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <ThemeIcon
                          size="sm"
                          variant="light"
                          style={{ backgroundColor: `${type.color}20`, color: type.color }}
                        >
                          {CATEGORY_ICONS[type.category]}
                        </ThemeIcon>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" fw={500} truncate>
                            {type.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {type.default_duration_minutes}min
                          </Text>
                        </Box>
                        {!type.is_system && (
                          <Badge size="xs" variant="dot" color="blue">
                            Custom
                          </Badge>
                        )}
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
              </ScrollArea>
            )}
          </Box>
        )}

        {/* Create Custom Type Form */}
        <Collapse in={showCreateType}>
          <Paper withBorder p="sm">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" fw={500}>Create Custom Activity</Text>
                <ActionIcon size="sm" variant="subtle" onClick={() => setShowCreateType(false)}>
                  <IconChevronUp size={14} />
                </ActionIcon>
              </Group>
              <TextInput
                label="Name"
                placeholder="e.g., Morning Yoga, Leg Day"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                required
              />
              <Select
                label="Category"
                value={newTypeCategory}
                onChange={(v) => setNewTypeCategory(v || 'other')}
                data={Object.entries(ACTIVITY_CATEGORIES).map(([key, { label }]) => ({
                  value: key,
                  label,
                }))}
              />
              <ColorInput
                label="Color"
                value={newTypeColor}
                onChange={setNewTypeColor}
                swatches={['#ef4444', '#f97316', '#22c55e', '#06b6d4', '#6366f1', '#8b5cf6', '#ec4899']}
              />
              <Button
                onClick={handleCreateType}
                loading={creatingType}
                leftSection={<IconPlus size={16} />}
              >
                Create & Select
              </Button>
            </Stack>
          </Paper>
        </Collapse>

        <Divider />

        {/* Duration & Intensity */}
        <SimpleGrid cols={2} spacing="sm">
          <NumberInput
            label="Duration"
            description="Minutes"
            leftSection={<IconClock size={14} />}
            value={duration}
            onChange={(v) => setDuration(Number(v) || 30)}
            min={5}
            max={480}
            step={5}
          />
          <Box>
            <Text size="sm" fw={500} mb={4}>
              Intensity (RPE)
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              {INTENSITY_LABELS[intensity] || 'Moderate'}
            </Text>
            <Slider
              value={intensity}
              onChange={setIntensity}
              min={1}
              max={10}
              step={1}
              marks={[
                { value: 1, label: '1' },
                { value: 5, label: '5' },
                { value: 10, label: '10' },
              ]}
              color={intensity <= 3 ? 'green' : intensity <= 6 ? 'yellow' : intensity <= 8 ? 'orange' : 'red'}
            />
          </Box>
        </SimpleGrid>

        {/* Category-specific metrics */}
        {renderCategoryMetrics()}

        {/* Advanced Options */}
        <Box>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            rightSection={showAdvanced ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </Button>

          <Collapse in={showAdvanced}>
            <Stack gap="sm" mt="sm">
              {/* Mood tracking */}
              <SimpleGrid cols={2} spacing="sm">
                <Select
                  label="Mood Before"
                  placeholder="Optional"
                  leftSection={<IconMoodSmile size={14} />}
                  value={moodBefore}
                  onChange={setMoodBefore}
                  data={MOOD_OPTIONS}
                  clearable
                />
                <Select
                  label="Mood After"
                  placeholder="Optional"
                  leftSection={<IconMoodSmile size={14} />}
                  value={moodAfter}
                  onChange={setMoodAfter}
                  data={MOOD_OPTIONS}
                  clearable
                />
              </SimpleGrid>

              {/* Perceived effort */}
              <NumberInput
                label="Perceived Effort (RPE)"
                description="How hard did it feel? (1-10)"
                value={perceivedEffort || ''}
                onChange={(v) => setPerceivedEffort(v ? Number(v) : null)}
                min={1}
                max={10}
              />

              {/* Notes */}
              <Textarea
                label="Notes"
                placeholder="How did the session go? Any observations..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                minRows={2}
              />
            </Stack>
          </Collapse>
        </Box>

        {/* TSS Preview */}
        {selectedType && (
          <Paper p="sm" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
            <Group justify="space-between">
              <Group gap="xs">
                <ThemeIcon size="sm" variant="light" color="orange">
                  <IconFlame size={14} />
                </ThemeIcon>
                <Text size="sm">Estimated Training Load</Text>
              </Group>
              <Group gap="xs">
                <Badge color="orange" variant="filled" size="lg">
                  {estimatedTSS} TSS
                </Badge>
                <Text size="xs" c="dimmed">
                  {duration}min @ {INTENSITY_LABELS[intensity]}
                </Text>
              </Group>
            </Group>
          </Paper>
        )}

        {/* Actions */}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="indigo"
            loading={saving}
            onClick={handleSave}
            disabled={!selectedTypeId}
            leftSection={<IconCheck size={16} />}
          >
            {editingActivity ? 'Update Activity' : 'Log Activity'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
