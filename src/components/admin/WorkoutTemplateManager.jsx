/**
 * WorkoutTemplateManager Component
 * Admin interface for managing workout templates
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Paper,
  Group,
  Text,
  Title,
  Button,
  Table,
  Badge,
  ActionIcon,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Modal,
  Loader,
  Alert,
  Menu,
  Tooltip,
  ScrollArea,
  Card,
  SimpleGrid,
  Divider,
  MultiSelect,
  JsonInput,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDotsVertical,
  IconSearch,
  IconRefresh,
  IconCheck,
  IconAlertCircle,
  IconEye,
  IconCopy,
  IconUpload,
  IconBike,
  IconFlame,
  IconClock,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { WORKOUT_LIBRARY, getAllWorkoutIds } from '../../data/workoutLibrary';

const CATEGORY_OPTIONS = [
  { value: 'recovery', label: 'Recovery', color: 'sage' },
  { value: 'endurance', label: 'Endurance', color: 'blue' },
  { value: 'tempo', label: 'Tempo', color: 'cyan' },
  { value: 'sweet_spot', label: 'Sweet Spot', color: 'orange' },
  { value: 'threshold', label: 'Threshold', color: 'red' },
  { value: 'vo2max', label: 'VO2 Max', color: 'pink' },
  { value: 'anaerobic', label: 'Anaerobic', color: 'grape' },
  { value: 'climbing', label: 'Climbing', color: 'violet' },
  { value: 'racing', label: 'Racing', color: 'yellow' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const TERRAIN_OPTIONS = [
  { value: 'flat', label: 'Flat' },
  { value: 'rolling', label: 'Rolling' },
  { value: 'hilly', label: 'Hilly' },
];

const TAG_OPTIONS = [
  'intervals',
  'steady',
  'recovery',
  'long_ride',
  'high_intensity',
  'low_intensity',
  'indoor',
  'outdoor',
  'power_based',
  'hr_based',
  'beginner_friendly',
  'race_prep',
];

export default function WorkoutTemplateManager() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    description: '',
    category: 'endurance',
    difficulty: 'intermediate',
    duration: 60,
    targetTSS: 50,
    intensityFactor: 0.7,
    focusArea: '',
    tags: [],
    terrainType: 'flat',
    structure: { warmup: null, main: [], cooldown: null },
    coachNotes: '',
  });

  // Load workouts from local library initially
  const loadWorkouts = useCallback(async () => {
    try {
      setLoading(true);

      // Try database first
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('is_active', true);

      if (!error && data && data.length > 0) {
        const mapped = data.map((w) => ({
          id: w.workout_id,
          name: w.name,
          description: w.description,
          category: w.category,
          difficulty: w.difficulty,
          duration: w.duration_minutes,
          targetTSS: w.target_tss,
          intensityFactor: w.intensity_factor,
          focusArea: w.focus_area,
          tags: w.tags || [],
          terrainType: w.terrain_type,
          structure: w.structure || {},
          coachNotes: w.coach_notes,
        }));
        setWorkouts(mapped);
      } else {
        // Fall back to local library
        const localWorkouts = Object.values(WORKOUT_LIBRARY);
        setWorkouts(localWorkouts);
      }
    } catch (err) {
      console.error('Error loading workouts:', err);
      // Fall back to local
      const localWorkouts = Object.values(WORKOUT_LIBRARY);
      setWorkouts(localWorkouts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

  // Filter workouts
  const filteredWorkouts = workouts.filter((w) => {
    const matchesSearch =
      w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || w.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Open edit modal
  const openEditModal = (workout = null) => {
    if (workout) {
      setEditForm({
        id: workout.id,
        name: workout.name,
        description: workout.description || '',
        category: workout.category,
        difficulty: workout.difficulty || 'intermediate',
        duration: workout.duration,
        targetTSS: workout.targetTSS,
        intensityFactor: workout.intensityFactor,
        focusArea: workout.focusArea || '',
        tags: workout.tags || [],
        terrainType: workout.terrainType || 'flat',
        structure: workout.structure || { warmup: null, main: [], cooldown: null },
        coachNotes: workout.coachNotes || '',
      });
    } else {
      setEditForm({
        id: '',
        name: '',
        description: '',
        category: 'endurance',
        difficulty: 'intermediate',
        duration: 60,
        targetTSS: 50,
        intensityFactor: 0.7,
        focusArea: '',
        tags: [],
        terrainType: 'flat',
        structure: { warmup: null, main: [], cooldown: null },
        coachNotes: '',
      });
    }
    setSelectedWorkout(workout);
    setEditModalOpen(true);
  };

  // Open view modal
  const openViewModal = (workout) => {
    setSelectedWorkout(workout);
    setViewModalOpen(true);
  };

  // Open delete confirmation
  const openDeleteConfirm = (workout) => {
    setSelectedWorkout(workout);
    setDeleteConfirmOpen(true);
  };

  // Save workout
  const handleSave = async () => {
    if (!editForm.name || !editForm.id) {
      notifications.show({
        title: 'Validation Error',
        message: 'Name and ID are required',
        color: 'red',
      });
      return;
    }

    try {
      setSaving(true);

      const record = {
        workout_id: editForm.id,
        name: editForm.name,
        description: editForm.description,
        category: editForm.category,
        difficulty: editForm.difficulty,
        duration_minutes: editForm.duration,
        target_tss: editForm.targetTSS,
        intensity_factor: editForm.intensityFactor,
        focus_area: editForm.focusArea,
        tags: editForm.tags,
        terrain_type: editForm.terrainType,
        structure: editForm.structure,
        coach_notes: editForm.coachNotes,
        is_active: true,
        updated_by: user?.id,
      };

      const { error } = await supabase
        .from('workout_templates')
        .upsert(record, { onConflict: 'workout_id' });

      if (error) throw error;

      notifications.show({
        title: 'Success',
        message: selectedWorkout ? 'Workout updated' : 'Workout created',
        color: 'sage',
        icon: <IconCheck size={18} />,
      });
      setEditModalOpen(false);
      loadWorkouts();
    } catch (err) {
      console.error('Error saving workout:', err);
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save workout',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete workout
  const handleDelete = async () => {
    if (!selectedWorkout) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('workout_templates')
        .update({ is_active: false })
        .eq('workout_id', selectedWorkout.id);

      if (error) throw error;

      notifications.show({
        title: 'Deleted',
        message: 'Workout has been deactivated',
        color: 'sage',
        icon: <IconCheck size={18} />,
      });
      setDeleteConfirmOpen(false);
      loadWorkouts();
    } catch (err) {
      console.error('Error deleting workout:', err);
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to delete workout',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Seed workouts from JS files
  const seedFromLocalFiles = async () => {
    try {
      setSaving(true);
      let successCount = 0;

      for (const workout of Object.values(WORKOUT_LIBRARY)) {
        const record = {
          workout_id: workout.id,
          name: workout.name,
          description: workout.description || '',
          category: workout.category,
          difficulty: workout.difficulty || 'intermediate',
          duration_minutes: workout.duration,
          target_tss: workout.targetTSS,
          intensity_factor: workout.intensityFactor,
          focus_area: workout.focusArea || '',
          tags: workout.tags || [],
          terrain_type: workout.terrainType || 'flat',
          structure: workout.structure || {},
          coach_notes: workout.coachNotes || '',
          is_active: true,
          updated_by: user?.id,
        };

        const { error } = await supabase
          .from('workout_templates')
          .upsert(record, { onConflict: 'workout_id' });

        if (!error) successCount++;
      }

      notifications.show({
        title: 'Seeding Complete',
        message: `Imported ${successCount} workouts from local files`,
        color: 'sage',
        icon: <IconCheck size={18} />,
      });
      loadWorkouts();
    } catch (err) {
      console.error('Error seeding workouts:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to seed workouts',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Get category color
  const getCategoryColor = (category) => {
    const option = CATEGORY_OPTIONS.find((o) => o.value === category);
    return option?.color || 'gray';
  };

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading workouts...</Text>
      </Stack>
    );
  }

  return (
    <Stack spacing="md">
      {/* Header Actions */}
      <Paper p="md" withBorder radius="md">
        <Group position="apart">
          <Group>
            <TextInput
              placeholder="Search workouts..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              w={250}
            />
            <Select
              placeholder="All categories"
              data={[{ value: '', label: 'All Categories' }, ...CATEGORY_OPTIONS]}
              value={categoryFilter}
              onChange={setCategoryFilter}
              clearable
              w={180}
            />
            <Button
              variant="subtle"
              leftSection={<IconRefresh size={16} />}
              onClick={loadWorkouts}
            >
              Refresh
            </Button>
          </Group>
          <Group>
            <Button
              variant="light"
              leftSection={<IconUpload size={16} />}
              onClick={seedFromLocalFiles}
              loading={saving}
            >
              Import from JS
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => openEditModal()}
            >
              New Workout
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Category Summary */}
      <ScrollArea>
        <Group spacing="xs" noWrap>
          {CATEGORY_OPTIONS.map((cat) => {
            const count = workouts.filter((w) => w.category === cat.value).length;
            return (
              <Card
                key={cat.value}
                padding="xs"
                withBorder
                style={{
                  cursor: 'pointer',
                  borderColor: categoryFilter === cat.value ? `var(--mantine-color-${cat.color}-5)` : undefined,
                }}
                onClick={() => setCategoryFilter(categoryFilter === cat.value ? '' : cat.value)}
              >
                <Group spacing={4} noWrap>
                  <Badge size="sm" color={cat.color} variant="light">
                    {count}
                  </Badge>
                  <Text size="xs">{cat.label}</Text>
                </Group>
              </Card>
            );
          })}
        </Group>
      </ScrollArea>

      {/* Workouts Table */}
      <Paper withBorder radius="md">
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>TSS</Table.Th>
                <Table.Th>IF</Table.Th>
                <Table.Th>Difficulty</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredWorkouts.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {searchQuery || categoryFilter
                        ? 'No workouts match your filters'
                        : 'No workouts found. Import from JS files or create a new one.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredWorkouts.map((workout) => (
                  <Table.Tr key={workout.id}>
                    <Table.Td>
                      <Text fw={500}>{workout.name}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {workout.description}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getCategoryColor(workout.category)} variant="light">
                        {workout.category?.replace('_', ' ')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group spacing={4}>
                        <IconClock size={14} />
                        <Text size="sm">{workout.duration} min</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group spacing={4}>
                        <IconFlame size={14} />
                        <Text size="sm">{workout.targetTSS}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{workout.intensityFactor?.toFixed(2)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="outline"
                        color={
                          workout.difficulty === 'beginner'
                            ? 'sage'
                            : workout.difficulty === 'advanced'
                            ? 'red'
                            : 'blue'
                        }
                      >
                        {workout.difficulty}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group spacing={4} noWrap>
                        <Tooltip label="View">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => openViewModal(workout)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => openEditModal(workout)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Menu shadow="md" width={160}>
                          <Menu.Target>
                            <ActionIcon variant="subtle">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconCopy size={14} />}
                              onClick={() => {
                                const clone = { ...workout, id: `${workout.id}_copy`, name: `${workout.name} (Copy)` };
                                openEditModal(clone);
                              }}
                            >
                              Duplicate
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={14} />}
                              onClick={() => openDeleteConfirm(workout)}
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {/* Edit Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={
          <Text fw={600}>
            {selectedWorkout ? 'Edit Workout' : 'Create Workout'}
          </Text>
        }
        size="lg"
      >
        <ScrollArea h={500}>
          <Stack spacing="md" pr="sm">
            <TextInput
              label="Workout ID"
              description="Unique identifier (no spaces, use underscores)"
              placeholder="e.g., tempo_intervals_60"
              value={editForm.id}
              onChange={(e) => setEditForm({ ...editForm, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              required
              disabled={!!selectedWorkout}
            />
            <TextInput
              label="Name"
              placeholder="e.g., 60-Minute Tempo Intervals"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
            <Textarea
              label="Description"
              placeholder="Describe the workout..."
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              minRows={2}
            />

            <SimpleGrid cols={3}>
              <Select
                label="Category"
                data={CATEGORY_OPTIONS}
                value={editForm.category}
                onChange={(v) => setEditForm({ ...editForm, category: v })}
              />
              <Select
                label="Difficulty"
                data={DIFFICULTY_OPTIONS}
                value={editForm.difficulty}
                onChange={(v) => setEditForm({ ...editForm, difficulty: v })}
              />
              <Select
                label="Terrain"
                data={TERRAIN_OPTIONS}
                value={editForm.terrainType}
                onChange={(v) => setEditForm({ ...editForm, terrainType: v })}
              />
            </SimpleGrid>

            <SimpleGrid cols={3}>
              <NumberInput
                label="Duration (min)"
                value={editForm.duration}
                onChange={(v) => setEditForm({ ...editForm, duration: v })}
                min={5}
                max={480}
              />
              <NumberInput
                label="Target TSS"
                value={editForm.targetTSS}
                onChange={(v) => setEditForm({ ...editForm, targetTSS: v })}
                min={0}
                max={500}
              />
              <NumberInput
                label="Intensity Factor"
                value={editForm.intensityFactor}
                onChange={(v) => setEditForm({ ...editForm, intensityFactor: v })}
                min={0.4}
                max={1.2}
                step={0.05}
                decimalScale={2}
              />
            </SimpleGrid>

            <TextInput
              label="Focus Area"
              placeholder="e.g., Aerobic base, Lactate threshold"
              value={editForm.focusArea}
              onChange={(e) => setEditForm({ ...editForm, focusArea: e.target.value })}
            />

            <MultiSelect
              label="Tags"
              data={TAG_OPTIONS.map((t) => ({ value: t, label: t.replace('_', ' ') }))}
              value={editForm.tags}
              onChange={(v) => setEditForm({ ...editForm, tags: v })}
              searchable
              clearable
            />

            <Textarea
              label="Coach Notes"
              placeholder="Tips for athletes performing this workout..."
              value={editForm.coachNotes}
              onChange={(e) => setEditForm({ ...editForm, coachNotes: e.target.value })}
              minRows={2}
            />

            <JsonInput
              label="Structure (JSON)"
              description="Warmup, main intervals, cooldown"
              value={JSON.stringify(editForm.structure, null, 2)}
              onChange={(v) => {
                try {
                  setEditForm({ ...editForm, structure: JSON.parse(v) });
                } catch {
                  // Invalid JSON, keep current value
                }
              }}
              minRows={4}
              formatOnBlur
              validationError="Invalid JSON"
            />

            <Group position="right" mt="md">
              <Button variant="subtle" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={saving}>
                {selectedWorkout ? 'Update' : 'Create'}
              </Button>
            </Group>
          </Stack>
        </ScrollArea>
      </Modal>

      {/* View Modal */}
      <Modal
        opened={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={<Text fw={600}>{selectedWorkout?.name}</Text>}
        size="lg"
      >
        {selectedWorkout && (
          <Stack spacing="md">
            <Text>{selectedWorkout.description}</Text>

            <Divider />

            <SimpleGrid cols={3}>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Category</Text>
                <Badge color={getCategoryColor(selectedWorkout.category)}>
                  {selectedWorkout.category?.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Duration</Text>
                <Text fw={500}>{selectedWorkout.duration} min</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Target TSS</Text>
                <Text fw={500}>{selectedWorkout.targetTSS}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Intensity Factor</Text>
                <Text fw={500}>{selectedWorkout.intensityFactor?.toFixed(2)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Difficulty</Text>
                <Text fw={500}>{selectedWorkout.difficulty}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Terrain</Text>
                <Text fw={500}>{selectedWorkout.terrainType}</Text>
              </div>
            </SimpleGrid>

            {selectedWorkout.focusArea && (
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Focus Area</Text>
                <Text>{selectedWorkout.focusArea}</Text>
              </div>
            )}

            {selectedWorkout.tags && selectedWorkout.tags.length > 0 && (
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" mb={4}>Tags</Text>
                <Group spacing={4}>
                  {selectedWorkout.tags.map((tag) => (
                    <Badge key={tag} size="sm" variant="outline">
                      {tag.replace('_', ' ')}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}

            {selectedWorkout.coachNotes && (
              <>
                <Divider />
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase">Coach Notes</Text>
                  <Text size="sm">{selectedWorkout.coachNotes}</Text>
                </div>
              </>
            )}

            {selectedWorkout.structure && Object.keys(selectedWorkout.structure).length > 0 && (
              <>
                <Divider />
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" mb={4}>Workout Structure</Text>
                  <Paper p="sm" withBorder bg="gray.0" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(selectedWorkout.structure, null, 2)}
                    </pre>
                  </Paper>
                </div>
              </>
            )}
          </Stack>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        opened={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={<Text fw={600} c="red">Delete Workout</Text>}
        size="sm"
      >
        <Stack>
          <Text>
            Are you sure you want to delete <strong>{selectedWorkout?.name}</strong>?
          </Text>
          <Text size="sm" c="dimmed">
            This action will deactivate the workout. It can be restored later if needed.
          </Text>
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light">
            Training plans using this workout will fall back to local definitions.
          </Alert>
          <Group position="right" mt="md">
            <Button variant="subtle" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={saving}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
