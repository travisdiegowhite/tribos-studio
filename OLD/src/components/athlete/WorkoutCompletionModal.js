import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  NumberInput,
  Textarea,
  Rating,
  Alert,
  Divider
} from '@mantine/core';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  X
} from 'lucide-react';
import athleteWorkoutService from '../../services/athleteWorkoutService';

/**
 * WorkoutCompletionModal
 * Modal for marking workouts as complete or skipped with feedback
 */
const WorkoutCompletionModal = ({ opened, onClose, workout, action = 'complete', onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Completion form state
  const [actualTss, setActualTss] = useState(workout?.target_tss || null);
  const [actualDuration, setActualDuration] = useState(
    workout?.target_duration ? Math.round(workout.target_duration / 60) : null
  );
  const [rating, setRating] = useState(3);
  const [feedback, setFeedback] = useState('');
  const [skipReason, setSkipReason] = useState('');

  const isCompleting = action === 'complete';
  const isSkipping = action === 'skip';

  // Handle submit
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isCompleting) {
        // Mark as complete
        const { error: completeError } = await athleteWorkoutService.completeWorkout(
          workout.id,
          {
            actualTss: actualTss || null,
            actualDuration: actualDuration ? actualDuration * 60 : null, // Convert to seconds
            rating: rating || null,
            feedback: feedback.trim() || null
          }
        );

        if (completeError) throw completeError;
      } else if (isSkipping) {
        // Mark as skipped
        const { error: skipError } = await athleteWorkoutService.skipWorkout(
          workout.id,
          skipReason.trim()
        );

        if (skipError) throw skipError;
      }

      // Success - close modal and refresh
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error updating workout:', err);
      setError(err.message || 'Failed to update workout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          {isCompleting ? (
            <>
              <CheckCircle size={20} color="green" />
              <Text fw={700}>Mark Workout Complete</Text>
            </>
          ) : (
            <>
              <XCircle size={20} color="gray" />
              <Text fw={700}>Skip Workout</Text>
            </>
          )}
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        {/* Workout Info */}
        <div>
          <Text size="sm" fw={600} c="dark">
            {workout?.template?.name || workout?.workout_type}
          </Text>
          <Text size="xs" c="dimmed">
            {new Date(workout?.scheduled_date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
        </div>

        <Divider />

        {/* Completion Form */}
        {isCompleting && (
          <Stack gap="md">
            <Text size="sm" fw={600} c="dark">Workout Details (Optional)</Text>

            <NumberInput
              label="Actual TSS"
              description="Leave blank if you don't know"
              placeholder={workout?.target_tss?.toString()}
              value={actualTss}
              onChange={setActualTss}
              min={0}
              max={500}
            />

            <NumberInput
              label="Actual Duration (minutes)"
              description="How long did you actually ride?"
              placeholder={(workout?.target_duration ? Math.round(workout.target_duration / 60) : 0).toString()}
              value={actualDuration}
              onChange={setActualDuration}
              min={0}
              max={600}
            />

            <div>
              <Text size="sm" fw={500} mb="xs">
                Difficulty Rating
              </Text>
              <Text size="xs" c="dimmed" mb="sm">
                How hard was this workout? (1 = too easy, 3 = just right, 5 = too hard)
              </Text>
              <Rating value={rating} onChange={setRating} size="lg" />
            </div>

            <Textarea
              label="Feedback (Optional)"
              placeholder="How did the workout feel? Any notes for your coach..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              minRows={3}
            />
          </Stack>
        )}

        {/* Skip Form */}
        {isSkipping && (
          <Stack gap="md">
            <Textarea
              label="Reason for Skipping (Optional)"
              placeholder="E.g., Not feeling well, too tired, schedule conflict..."
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              minRows={3}
            />

            <Alert icon={<AlertCircle size={16} />} color="yellow">
              Your coach will be notified that you skipped this workout.
            </Alert>
          </Stack>
        )}

        {/* Error Message */}
        {error && (
          <Alert icon={<AlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {/* Action Buttons */}
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={onClose}
            disabled={loading}
            leftSection={<X size={16} />}
          >
            Cancel
          </Button>

          {isCompleting && (
            <Button
              onClick={handleSubmit}
              loading={loading}
              leftSection={<CheckCircle size={16} />}
              color="green"
            >
              Mark Complete
            </Button>
          )}

          {isSkipping && (
            <Button
              onClick={handleSubmit}
              loading={loading}
              leftSection={<XCircle size={16} />}
              color="gray"
            >
              Skip Workout
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default WorkoutCompletionModal;
