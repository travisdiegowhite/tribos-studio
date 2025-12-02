import React, { useState } from 'react';
import {
  Modal,
  Text,
  Group,
  Stack,
  Button,
  Slider,
  Checkbox,
  Textarea,
  Select,
  Badge,
  Alert,
  Card,
  Collapse,
} from '@mantine/core';
import { ThumbsUp, ThumbsDown, Activity, Info, Check } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useUnits } from '../utils/units';

/**
 * Post-Workout Survey Component
 * Quick RPE survey after completing a ride
 */
const PostWorkoutSurvey = ({ opened, onClose, route, plannedWorkout }) => {
  const { user } = useAuth();
  const { formatElevation } = useUnits();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    perceived_exertion: 5,
    difficulty_rating: 5,
    intervals_completed: true,
    felt_good: true,
    struggled_with: null,
    notes: '',
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);

      const feedbackData = {
        user_id: user.id,
        route_id: route.id,
        planned_workout_id: plannedWorkout?.id || null,
        perceived_exertion: formData.perceived_exertion,
        difficulty_rating: formData.difficulty_rating,
        intervals_completed: formData.intervals_completed,
        felt_good: formData.felt_good,
        struggled_with: formData.struggled_with,
        notes: formData.notes || null,
        workout_date: new Date(route.recorded_at || route.created_at).toISOString().split('T')[0],
      };

      const { error } = await supabase
        .from('workout_feedback')
        .insert([feedbackData]);

      if (error) throw error;

      toast.success('Thanks for the feedback!');
      onClose();

    } catch (err) {
      console.error('Failed to save workout feedback:', err);
      toast.error('Failed to save feedback');
    } finally {
      setLoading(false);
    }
  };

  const getRPEColor = (rpe) => {
    if (rpe <= 3) return 'green';
    if (rpe <= 5) return 'teal';
    if (rpe <= 7) return 'yellow';
    if (rpe <= 9) return 'orange';
    return 'red';
  };

  const getRPELabel = (rpe) => {
    if (rpe <= 2) return 'Very Easy';
    if (rpe <= 4) return 'Easy';
    if (rpe <= 6) return 'Moderate';
    if (rpe <= 8) return 'Hard';
    if (rpe <= 9) return 'Very Hard';
    return 'Maximum Effort';
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <Activity size={20} />
          <Text fw={600}>How was your ride?</Text>
        </Group>
      }
      size="md"
    >
      <Stack gap="lg">
        <Alert icon={<Info size={16} />} color="blue" variant="light">
          Your feedback helps optimize future workouts and track recovery
        </Alert>

        {/* Route Name */}
        <Card withBorder p="sm" bg="gray.0">
          <Text size="sm" fw={600}>
            {route?.name || 'Recent Ride'}
          </Text>
          <Group gap="xs" mt={4}>
            <Badge size="sm" variant="light">
              {route?.distance_km?.toFixed(1)} km
            </Badge>
            {route?.duration_seconds && (
              <Badge size="sm" variant="light">
                {Math.round(route.duration_seconds / 60)} min
              </Badge>
            )}
            {route?.elevation_gain_m && (
              <Badge size="sm" variant="light">
                {formatElevation(route.elevation_gain_m)} elevation
              </Badge>
            )}
          </Group>
        </Card>

        {/* Perceived Exertion (RPE) */}
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="sm" fw={600}>How hard was this ride?</Text>
            <Badge color={getRPEColor(formData.perceived_exertion)} size="lg">
              {formData.perceived_exertion}/10 - {getRPELabel(formData.perceived_exertion)}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">Rate of Perceived Exertion (RPE)</Text>
          <Slider
            value={formData.perceived_exertion}
            onChange={(val) => setFormData({ ...formData, perceived_exertion: val })}
            min={1}
            max={10}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
            color={getRPEColor(formData.perceived_exertion)}
            size="lg"
          />
        </Stack>

        {/* Difficulty Rating */}
        {plannedWorkout && (
          <Stack gap={4}>
            <Text size="sm" fw={600}>Difficulty vs. Expected</Text>
            <Text size="xs" c="dimmed">
              Compared to what you expected, was this {formData.difficulty_rating < 5 ? 'easier' : formData.difficulty_rating > 5 ? 'harder' : 'as expected'}?
            </Text>
            <Slider
              value={formData.difficulty_rating}
              onChange={(val) => setFormData({ ...formData, difficulty_rating: val })}
              min={1}
              max={10}
              step={1}
              marks={[
                { value: 1, label: 'Much Easier' },
                { value: 5, label: 'As Expected' },
                { value: 10, label: 'Much Harder' },
              ]}
              color="blue"
            />
          </Stack>
        )}

        {/* Quick Checkboxes */}
        <Stack gap="xs">
          <Group grow>
            <Card
              withBorder
              p="md"
              style={{
                cursor: 'pointer',
                backgroundColor: formData.felt_good ? 'rgba(50, 205, 50, 0.15)' : '#3d4e5e',
                border: formData.felt_good ? '3px solid #32CD32' : '1px solid #475569',
                position: 'relative',
              }}
              onClick={() => setFormData({ ...formData, felt_good: !formData.felt_good })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({ ...formData, felt_good: !formData.felt_good });
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={formData.felt_good}
              aria-label="Toggle felt good status"
            >
              <Stack gap={4} align="center">
                <ThumbsUp
                  size={24}
                  color={formData.felt_good ? '#32CD32' : '#adb5bd'}
                  strokeWidth={formData.felt_good ? 2.5 : 1.5}
                />
                <Group gap={4} align="center">
                  <Text size="sm" fw={formData.felt_good ? 600 : 400} c="#E8E8E8">Felt Good</Text>
                  {formData.felt_good && <Check size={14} color="#32CD32" strokeWidth={3} />}
                </Group>
              </Stack>
              {formData.felt_good && (
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <Check size={16} color="#32CD32" strokeWidth={3} />
                </div>
              )}
            </Card>

            <Card
              withBorder
              p="md"
              style={{
                cursor: 'pointer',
                backgroundColor: formData.intervals_completed ? 'rgba(50, 205, 50, 0.15)' : '#3d4e5e',
                border: formData.intervals_completed ? '3px solid #32CD32' : '1px solid #475569',
                position: 'relative',
              }}
              onClick={() => setFormData({ ...formData, intervals_completed: !formData.intervals_completed })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({ ...formData, intervals_completed: !formData.intervals_completed });
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={formData.intervals_completed}
              aria-label="Toggle completed plan status"
            >
              <Stack gap={4} align="center">
                <Activity
                  size={24}
                  color={formData.intervals_completed ? '#32CD32' : '#adb5bd'}
                  strokeWidth={formData.intervals_completed ? 2.5 : 1.5}
                />
                <Group gap={4} align="center">
                  <Text size="sm" fw={formData.intervals_completed ? 600 : 400} c="#E8E8E8">Completed Plan</Text>
                  {formData.intervals_completed && <Check size={14} color="#32CD32" strokeWidth={3} />}
                </Group>
              </Stack>
              {formData.intervals_completed && (
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <Check size={16} color="#32CD32" strokeWidth={3} />
                </div>
              )}
            </Card>
          </Group>
        </Stack>

        {/* Struggled With (if applicable) */}
        <Collapse in={!formData.felt_good || !formData.intervals_completed || formData.perceived_exertion >= 8}>
          <Select
            label="Struggled with (optional)"
            placeholder="Select what made it challenging"
            data={[
              { value: 'endurance', label: 'Endurance / Stamina' },
              { value: 'intensity', label: 'High Intensity' },
              { value: 'climbing', label: 'Climbing / Hills' },
              { value: 'duration', label: 'Workout Length' },
              { value: 'recovery', label: 'Insufficient Recovery' },
              { value: 'motivation', label: 'Motivation / Mental' },
              { value: 'weather', label: 'Weather Conditions' },
              { value: 'equipment', label: 'Equipment Issues' },
              { value: 'other', label: 'Other' },
            ]}
            value={formData.struggled_with}
            onChange={(val) => setFormData({ ...formData, struggled_with: val })}
            clearable
          />
        </Collapse>

        {/* Notes */}
        <Textarea
          label="Additional notes (optional)"
          placeholder="Any other feedback about the ride..."
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          minRows={2}
          maxRows={3}
        />

        {/* Action Buttons */}
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Skip
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            Submit Feedback
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default PostWorkoutSurvey;
