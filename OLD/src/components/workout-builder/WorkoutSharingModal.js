import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Select,
  Alert,
  Badge,
  ActionIcon,
  Card,
  Divider,
  Loader,
  Center
} from '@mantine/core';
import {
  Share2,
  X,
  Trash2,
  CheckCircle,
  AlertCircle,
  Users
} from 'lucide-react';
import workoutService from '../../services/workoutService';
import { supabase } from '../../supabase';

/**
 * WorkoutSharingModal
 * Share custom workouts with other coaches or athletes
 */
const WorkoutSharingModal = ({ opened, onClose, workout }) => {
  const [loading, setLoading] = useState(false);
  const [loadingShares, setLoadingShares] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [existingShares, setExistingShares] = useState([]);

  // Load users and existing shares
  useEffect(() => {
    if (opened && workout) {
      loadUsers();
      loadExistingShares();
    }
  }, [opened, workout]);

  // Load all users for sharing dropdown
  const loadUsers = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .order('display_name');

      if (fetchError) throw fetchError;

      const userOptions = (data || []).map(user => ({
        value: user.user_id,
        label: user.display_name || user.email || 'Unknown User'
      }));

      setUsers(userOptions);
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Failed to load users');
    }
  };

  // Load existing shares for this workout
  const loadExistingShares = async () => {
    if (!workout?.id) return;

    setLoadingShares(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('workout_shares')
        .select(`
          id,
          shared_with_user_id,
          can_edit,
          created_at,
          shared_with:profiles!shared_with_user_id (
            display_name,
            email
          )
        `)
        .eq('workout_id', workout.id);

      if (fetchError) throw fetchError;

      setExistingShares(data || []);
    } catch (err) {
      console.error('Error loading shares:', err);
    } finally {
      setLoadingShares(false);
    }
  };

  // Share workout with user
  const handleShare = async () => {
    if (!selectedUser) {
      setError('Please select a user to share with');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: shareError } = await workoutService.shareWorkoutWithUser(
        workout.id,
        selectedUser,
        false // can_edit - future feature
      );

      if (shareError) throw shareError;

      setSuccess('Workout shared successfully!');
      setSelectedUser(null);
      loadExistingShares(); // Reload shares list

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error sharing workout:', err);
      setError(err.message || 'Failed to share workout');
    } finally {
      setLoading(false);
    }
  };

  // Remove share
  const handleUnshare = async (sharedWithUserId) => {
    try {
      const { error: unshareError } = await workoutService.unshareWorkout(
        workout.id,
        sharedWithUserId
      );

      if (unshareError) throw unshareError;

      setSuccess('Share removed successfully!');
      loadExistingShares(); // Reload shares list

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error removing share:', err);
      setError(err.message || 'Failed to remove share');
    }
  };

  // Make workout public
  const handleMakePublic = async () => {
    try {
      const { error: updateError } = await workoutService.updateCustomWorkout(
        workout.id,
        { is_public: true }
      );

      if (updateError) throw updateError;

      setSuccess('Workout is now public!');
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error making workout public:', err);
      setError(err.message || 'Failed to make workout public');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Share2 size={20} />
          <Text fw={700} c="dark">Share Workout</Text>
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        {/* Workout Info */}
        <Card withBorder p="sm" bg="gray.0">
          <Text size="sm" fw={600} c="dark">{workout?.name}</Text>
          <Text size="xs" c="dimmed">{workout?.description}</Text>
        </Card>

        {/* Success/Error Messages */}
        {success && (
          <Alert icon={<CheckCircle size={16} />} color="green">
            {success}
          </Alert>
        )}

        {error && (
          <Alert icon={<AlertCircle size={16} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Share with specific user */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dark">Share with User</Text>
          <Group grow>
            <Select
              placeholder="Select a user..."
              data={users}
              value={selectedUser}
              onChange={setSelectedUser}
              searchable
              clearable
            />
            <Button
              onClick={handleShare}
              loading={loading}
              disabled={!selectedUser}
              leftSection={<Share2 size={16} />}
            >
              Share
            </Button>
          </Group>
        </Stack>

        <Divider />

        {/* Make Public Option */}
        {!workout?.is_public && (
          <>
            <Stack gap="xs">
              <Text size="sm" fw={600} c="dark">Make Public</Text>
              <Text size="xs" c="dimmed">
                Make this workout available to all users in the community
              </Text>
              <Button
                variant="light"
                color="blue"
                leftSection={<Users size={16} />}
                onClick={handleMakePublic}
              >
                Make Workout Public
              </Button>
            </Stack>

            <Divider />
          </>
        )}

        {workout?.is_public && (
          <Alert icon={<Users size={16} />} color="blue">
            This workout is public and visible to all users
          </Alert>
        )}

        {/* Existing Shares */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dark">
            Shared With ({existingShares.length})
          </Text>

          {loadingShares ? (
            <Center p="md">
              <Loader size="sm" />
            </Center>
          ) : existingShares.length === 0 ? (
            <Text size="xs" c="dimmed">
              Not currently shared with anyone
            </Text>
          ) : (
            <Stack gap="xs">
              {existingShares.map(share => (
                <Card key={share.id} withBorder p="xs">
                  <Group justify="space-between">
                    <div>
                      <Text size="sm" fw={500} c="dark">
                        {share.shared_with?.display_name || share.shared_with?.email || 'Unknown User'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Shared {new Date(share.created_at).toLocaleDateString()}
                      </Text>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => handleUnshare(share.shared_with_user_id)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>

        {/* Close Button */}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} leftSection={<X size={16} />}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default WorkoutSharingModal;
