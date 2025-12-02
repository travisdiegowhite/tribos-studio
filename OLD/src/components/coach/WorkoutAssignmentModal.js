import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  Button,
  Group,
  Alert,
  LoadingOverlay,
} from '@mantine/core';
import { AlertCircle, CheckCircle } from 'lucide-react';
import coachService from '../../services/coachService';
import { supabase } from '../../supabase';

/**
 * Workout Assignment Modal
 * Allows coaches to assign workouts to athletes
 */
const WorkoutAssignmentModal = ({ opened, onClose, onSuccess, coachId, athleteId }) => {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [weekNumber, setWeekNumber] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [workoutType, setWorkoutType] = useState('endurance');
  const [targetTss, setTargetTss] = useState(50);
  const [targetDuration, setTargetDuration] = useState(60);
  const [coachNotes, setCoachNotes] = useState('');

  // Load workout templates
  useEffect(() => {
    if (opened) {
      loadTemplates();
      resetForm();
    }
  }, [opened]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .order('name');

      if (error) throw error;

      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const resetForm = () => {
    setSelectedTemplate(null);
    setWeekNumber(1);
    setDayOfWeek(1);
    setWorkoutType('endurance');
    setTargetTss(50);
    setTargetDuration(60);
    setCoachNotes('');
    setError(null);
    setSuccess(false);
  };

  const handleTemplateChange = (templateId) => {
    setSelectedTemplate(templateId);

    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        setWorkoutType(template.workout_type);
        setTargetTss(template.target_tss || 50);
        setTargetDuration(template.duration || 60);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const workoutData = {
        athleteId,
        workoutType,
        targetTss,
        targetDuration: targetDuration * 60, // Convert to seconds
        coachNotes,
        weekNumber,
        dayOfWeek
      };

      const { error: assignError } = await coachService.assignWorkout(
        coachId,
        athleteId,
        workoutData
      );

      if (assignError) throw assignError;

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        resetForm();
      }, 1500);

    } catch (err) {
      console.error('Error assigning workout:', err);
      setError(err.message || 'Failed to assign workout');
    } finally {
      setLoading(false);
    }
  };

  const workoutTypes = [
    { value: 'endurance', label: 'Endurance' },
    { value: 'tempo', label: 'Tempo' },
    { value: 'sweet_spot', label: 'Sweet Spot' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'vo2max', label: 'VO2 Max' },
    { value: 'sprint', label: 'Sprint' },
    { value: 'recovery', label: 'Recovery' },
    { value: 'race', label: 'Race' }
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Assign Workout"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Stack spacing="md">
          <LoadingOverlay visible={loading} />

          {/* Success Message */}
          {success && (
            <Alert
              icon={<CheckCircle size={20} />}
              title="Success"
              color="green"
            >
              Workout assigned successfully!
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert
              icon={<AlertCircle size={20} />}
              title="Error"
              color="red"
            >
              {error}
            </Alert>
          )}

          {/* Template Selection (optional) */}
          <Select
            label="Workout Template (Optional)"
            placeholder="Select a template or create custom"
            data={templates.map(t => ({
              value: t.id,
              label: `${t.name} (${t.target_tss} TSS, ${t.duration}min)`
            }))}
            value={selectedTemplate}
            onChange={handleTemplateChange}
            clearable
          />

          {/* Week Number */}
          <NumberInput
            label="Week Number"
            placeholder="Which week of the training plan"
            value={weekNumber}
            onChange={setWeekNumber}
            min={1}
            max={52}
            required
          />

          {/* Day of Week */}
          <Select
            label="Day of Week"
            placeholder="Select day"
            data={[
              { value: '0', label: 'Sunday' },
              { value: '1', label: 'Monday' },
              { value: '2', label: 'Tuesday' },
              { value: '3', label: 'Wednesday' },
              { value: '4', label: 'Thursday' },
              { value: '5', label: 'Friday' },
              { value: '6', label: 'Saturday' }
            ]}
            value={String(dayOfWeek)}
            onChange={(val) => setDayOfWeek(parseInt(val))}
            required
          />

          {/* Workout Type */}
          <Select
            label="Workout Type"
            placeholder="Select type"
            data={workoutTypes}
            value={workoutType}
            onChange={setWorkoutType}
            required
          />

          {/* Target TSS */}
          <NumberInput
            label="Target TSS"
            placeholder="Training Stress Score"
            value={targetTss}
            onChange={setTargetTss}
            min={10}
            max={500}
            required
          />

          {/* Target Duration */}
          <NumberInput
            label="Target Duration (minutes)"
            placeholder="Duration in minutes"
            value={targetDuration}
            onChange={setTargetDuration}
            min={15}
            max={480}
            required
          />

          {/* Coach Notes */}
          <Textarea
            label="Coach Notes"
            placeholder="Instructions, focus points, reminders..."
            value={coachNotes}
            onChange={(e) => setCoachNotes(e.target.value)}
            minRows={3}
            maxRows={6}
          />

          {/* Actions */}
          <Group position="right" mt="md">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || success}>
              Assign Workout
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default WorkoutAssignmentModal;
