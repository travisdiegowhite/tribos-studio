import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Button,
  Badge,
  ActionIcon,
  Menu,
  Alert,
  Loader,
  Center,
  Modal,
  TextInput
} from '@mantine/core';
import {
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Share2,
  Copy,
  Eye,
  Clock,
  Activity,
  Zap,
  Search,
  AlertCircle,
  CheckCircle,
  UserPlus,
  Download
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import workoutService from '../../services/workoutService';
import coachService from '../../services/coachService';
import exportService from '../../services/exportService';
import { useAuth } from '../../contexts/AuthContext';
import WorkoutBuilder from './WorkoutBuilder';
import WorkoutSharingModal from './WorkoutSharingModal';
import QuickAssignModal from '../coach/QuickAssignModal';
import WorkoutPreviewModal from '../coach/WorkoutPreviewModal';

/**
 * CustomWorkoutsList
 * Displays and manages user's custom workouts
 */
const CustomWorkoutsList = () => {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [sharingWorkout, setSharingWorkout] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workoutToDelete, setWorkoutToDelete] = useState(null);
  const [assigningWorkout, setAssigningWorkout] = useState(null);
  const [previewingWorkout, setPreviewingWorkout] = useState(null);

  // Athletes data for assignment
  const [athletes, setAthletes] = useState([]);

  // Success/error messages
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Load user's custom workouts
  useEffect(() => {
    loadWorkouts();
  }, [user?.id]);

  // Load athletes for assignment
  useEffect(() => {
    if (user?.id) {
      loadAthletes();
    }
  }, [user?.id]);

  const loadAthletes = async () => {
    try {
      const { data, error: fetchError } = await coachService.getAthletes(
        user.id,
        'active'
      );

      if (fetchError) throw fetchError;

      // Filter athletes where coach can assign workouts
      const assignableAthletes = (data || []).filter(rel => rel.can_assign_workouts);
      setAthletes(assignableAthletes);
    } catch (err) {
      console.error('Error loading athletes:', err);
    }
  };

  const loadWorkouts = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await workoutService.getUserCustomWorkouts(user.id);

      if (fetchError) throw fetchError;

      setWorkouts(data || []);
    } catch (err) {
      console.error('Error loading custom workouts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle workout created/updated
  const handleWorkoutSaved = (workout) => {
    loadWorkouts(); // Reload list
    setSuccessMessage(editingWorkout ? 'Workout updated successfully!' : 'Workout created successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Open builder for new workout
  const handleCreateNew = () => {
    setEditingWorkout(null);
    setBuilderOpen(true);
  };

  // Open builder for editing
  const handleEdit = (workout) => {
    setEditingWorkout({
      ...workout,
      structure: workout.structure,
      tags: workout.tags || []
    });
    setBuilderOpen(true);
  };

  // Close builder
  const handleCloseBuilder = () => {
    setBuilderOpen(false);
    setEditingWorkout(null);
  };

  // Delete workout
  const handleDelete = async (workoutId) => {
    try {
      const { error: deleteError } = await workoutService.deleteCustomWorkout(workoutId);

      if (deleteError) throw deleteError;

      setSuccessMessage('Workout deleted successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
      loadWorkouts();
    } catch (err) {
      console.error('Error deleting workout:', err);
      setErrorMessage(err.message);
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setDeleteConfirmOpen(false);
      setWorkoutToDelete(null);
    }
  };

  // Duplicate workout
  const handleDuplicate = (workout) => {
    setEditingWorkout({
      ...workout,
      name: `${workout.name} (Copy)`,
      is_public: false,
      structure: workout.structure,
      tags: workout.tags || []
    });
    setBuilderOpen(true);
  };

  // Open sharing modal
  const handleShare = (workout) => {
    setSharingWorkout(workout);
  };

  // Open assign modal
  const handleAssign = (workout) => {
    setAssigningWorkout(workout);
  };

  // Handle successful assignment
  const handleAssignSuccess = () => {
    setSuccessMessage('Workout assigned successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Export workout
  const handleExport = (workout, format) => {
    try {
      let content, filename;
      const sanitize = (s) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      switch (format) {
        case 'zwift':
          content = exportService.exportToZwift(workout);
          filename = `${sanitize(workout.name)}.zwo`;
          exportService.downloadFile(content, filename, 'application/xml');
          notifications.show({
            title: 'Export Successful',
            message: 'Workout exported to Zwift format',
            color: 'green'
          });
          break;

        case 'trainerroad':
          content = exportService.exportToTrainerRoad(workout);
          filename = `${sanitize(workout.name)}.mrc`;
          exportService.downloadFile(content, filename, 'text/plain');
          notifications.show({
            title: 'Export Successful',
            message: 'Workout exported to TrainerRoad format',
            color: 'green'
          });
          break;

        case 'erg':
          content = exportService.exportToERG(workout);
          filename = `${sanitize(workout.name)}.erg`;
          exportService.downloadFile(content, filename, 'text/plain');
          notifications.show({
            title: 'Export Successful',
            message: 'Workout exported to ERG format',
            color: 'green'
          });
          break;

        default:
          throw new Error('Unknown format');
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

  // Filter workouts by search
  const filteredWorkouts = workouts.filter(workout =>
    workout.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    workout.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    workout.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Workout card component
  const WorkoutCard = ({ workout }) => {
    const zoneInfo = workout.primary_zone ? TRAINING_ZONES[workout.primary_zone] : null;

    return (
      <Card withBorder p="md">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <div style={{ flex: 1 }}>
              <Group gap="xs">
                <Text fw={600} size="sm" c="dark">{workout.name}</Text>
                {workout.is_public && (
                  <Badge size="xs" variant="light" color="blue">Public</Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" lineClamp={2} mt={4}>
                {workout.description}
              </Text>
            </div>

            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm">
                  <MoreVertical size={16} />
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Eye size={14} />}
                  onClick={() => setPreviewingWorkout(workout)}
                >
                  View Details
                </Menu.Item>
                {athletes.length > 0 && (
                  <Menu.Item
                    leftSection={<UserPlus size={14} />}
                    onClick={() => handleAssign(workout)}
                    color="blue"
                  >
                    Assign to Athletes
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item leftSection={<Edit size={14} />} onClick={() => handleEdit(workout)}>
                  Edit
                </Menu.Item>
                <Menu.Item leftSection={<Copy size={14} />} onClick={() => handleDuplicate(workout)}>
                  Duplicate
                </Menu.Item>
                <Menu.Item leftSection={<Share2 size={14} />} onClick={() => handleShare(workout)}>
                  Share
                </Menu.Item>
                <Menu.Divider />
                <Menu label="Export">
                  <Menu.Item
                    leftSection={<Download size={14} />}
                    onClick={() => handleExport(workout, 'zwift')}
                  >
                    Zwift (.zwo)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Download size={14} />}
                    onClick={() => handleExport(workout, 'trainerroad')}
                  >
                    TrainerRoad (.mrc)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Download size={14} />}
                    onClick={() => handleExport(workout, 'erg')}
                  >
                    Generic ERG (.erg)
                  </Menu.Item>
                </Menu>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Trash2 size={14} />}
                  color="red"
                  onClick={() => {
                    setWorkoutToDelete(workout);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Group gap="xs" wrap="wrap">
            <Badge size="sm" variant="light" leftSection={<Clock size={12} />}>
              {workout.duration}min
            </Badge>
            <Badge size="sm" variant="light" leftSection={<Activity size={12} />}>
              {workout.target_tss} TSS
            </Badge>
            <Badge size="sm" variant="light" leftSection={<Zap size={12} />}>
              IF: {workout.intensity_factor?.toFixed(2)}
            </Badge>
            {zoneInfo && (
              <Badge size="sm" variant="light" color={zoneInfo.color}>
                {zoneInfo.name}
              </Badge>
            )}
            <Badge
              size="sm"
              variant="outline"
              color={
                workout.difficulty_level === 'beginner' ? 'green' :
                workout.difficulty_level === 'intermediate' ? 'yellow' : 'red'
              }
            >
              {workout.difficulty_level}
            </Badge>
          </Group>

          {workout.tags && workout.tags.length > 0 && (
            <Group gap={4}>
              {workout.tags.slice(0, 3).map(tag => (
                <Badge key={tag} size="xs" variant="dot">
                  {tag}
                </Badge>
              ))}
              {workout.tags.length > 3 && (
                <Badge size="xs" variant="dot">
                  +{workout.tags.length - 3} more
                </Badge>
              )}
            </Group>
          )}

          <Text size="xs" c="dimmed">
            Created {new Date(workout.created_at).toLocaleDateString()}
          </Text>
        </Stack>
      </Card>
    );
  };

  // Loading state
  if (loading) {
    return (
      <Center p="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">Loading your custom workouts...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="md">
      {/* Success/Error Messages */}
      {successMessage && (
        <Alert icon={<CheckCircle size={16} />} color="green" onClose={() => setSuccessMessage(null)} withCloseButton>
          {successMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert icon={<AlertCircle size={16} />} color="red" onClose={() => setErrorMessage(null)} withCloseButton>
          {errorMessage}
        </Alert>
      )}

      {/* Header */}
      <Group justify="space-between">
        <div>
          <Text size="lg" fw={700} c="dark">My Custom Workouts</Text>
          <Text size="sm" c="dimmed">
            {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
          </Text>
        </div>
        <Button leftSection={<Plus size={16} />} onClick={handleCreateNew}>
          Create Workout
        </Button>
      </Group>

      {/* Search */}
      <TextInput
        placeholder="Search workouts by name, description, or tags..."
        leftSection={<Search size={16} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Workouts List */}
      {error ? (
        <Alert icon={<AlertCircle size={16} />} color="red">
          Error loading workouts: {error}
        </Alert>
      ) : filteredWorkouts.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="md">
            <Activity size={48} color="gray" />
            <Text size="lg" fw={600} c="dimmed">
              {searchQuery ? 'No workouts match your search' : 'No custom workouts yet'}
            </Text>
            {!searchQuery && (
              <>
                <Text size="sm" c="dimmed" ta="center">
                  Create your first custom workout to get started!
                </Text>
                <Button leftSection={<Plus size={16} />} onClick={handleCreateNew}>
                  Create Your First Workout
                </Button>
              </>
            )}
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {filteredWorkouts.map(workout => (
            <WorkoutCard key={workout.id} workout={workout} />
          ))}
        </Stack>
      )}

      {/* Workout Builder Modal */}
      <WorkoutBuilder
        opened={builderOpen}
        onClose={handleCloseBuilder}
        onWorkoutCreated={handleWorkoutSaved}
        editWorkout={editingWorkout}
      />

      {/* Sharing Modal */}
      {sharingWorkout && (
        <WorkoutSharingModal
          opened={!!sharingWorkout}
          onClose={() => setSharingWorkout(null)}
          workout={sharingWorkout}
        />
      )}

      {/* Quick Assign Modal */}
      {assigningWorkout && (
        <QuickAssignModal
          opened={!!assigningWorkout}
          onClose={() => setAssigningWorkout(null)}
          workout={assigningWorkout}
          athletes={athletes}
          coachId={user?.id}
          onSuccess={handleAssignSuccess}
        />
      )}

      {/* Workout Preview Modal */}
      {previewingWorkout && (
        <WorkoutPreviewModal
          opened={!!previewingWorkout}
          onClose={() => setPreviewingWorkout(null)}
          workout={previewingWorkout}
          onAssign={athletes.length > 0 ? handleAssign : null}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setWorkoutToDelete(null);
        }}
        title={<Text fw={700} c="dark">Delete Workout</Text>}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete "{workoutToDelete?.name}"? This action cannot be undone.
          </Text>

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setWorkoutToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<Trash2 size={16} />}
              onClick={() => handleDelete(workoutToDelete.id)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default CustomWorkoutsList;
