import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Select,
  NumberInput,
  Textarea,
  Button,
  Alert,
  Badge,
  Divider,
  Paper,
  LoadingOverlay,
  Checkbox,
  Card,
  ScrollArea,
  MultiSelect,
} from '@mantine/core';
import {
  CheckCircle,
  AlertCircle,
  Calendar,
  Clock,
  TrendingUp,
  User,
  Users,
  Activity,
  Zap,
} from 'lucide-react';
import coachService from '../../services/coachService';
import { TRAINING_ZONES } from '../../utils/trainingPlans';

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

/**
 * Quick Assign Modal
 * Allows coaches to quickly assign a workout from the library to one or more athletes
 * Supports both single and batch assignment
 */
const QuickAssignModal = ({
  opened,
  onClose,
  workout,
  athletes,
  coachId,
  onSuccess,
}) => {
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [weekNumber, setWeekNumber] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [coachNotes, setCoachNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (opened) {
      setSelectedAthletes([]);
      setWeekNumber(1);
      setDayOfWeek('1');
      setCoachNotes('');
      setError(null);
      setSuccess(false);
    }
  }, [opened]);

  // Auto-populate coach notes from workout if available
  useEffect(() => {
    if (workout?.coach_notes && opened) {
      setCoachNotes(workout.coach_notes);
    }
  }, [workout, opened]);

  const handleAssign = async () => {
    if (selectedAthletes.length === 0) {
      setError('Please select at least one athlete');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Assign workout to each selected athlete
      const assignmentPromises = selectedAthletes.map(athleteId => {
        const workoutData = {
          workoutType: workout.primary_zone || workout.category || 'endurance',
          targetTss: workout.target_tss || workout.targetTSS || 50,
          targetDuration: workout.duration * 60, // Convert to seconds
          coachNotes: coachNotes || workout.description,
          weekNumber: weekNumber,
          dayOfWeek: parseInt(dayOfWeek),
          // Link to workout template from database
          templateId: workout.id,
        };

        return coachService.assignWorkout(
          coachId,
          athleteId,
          workoutData
        );
      });

      const results = await Promise.all(assignmentPromises);

      // Check for errors
      const failures = results.filter(r => r.error);
      if (failures.length > 0) {
        throw new Error(`Failed to assign to ${failures.length} athlete(s)`);
      }

      setSuccess(true);

      // Call success callback after short delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error assigning workout:', err);
      setError(err.message || 'Failed to assign workout');
    } finally {
      setSubmitting(false);
    }
  };

  const athleteOptions = athletes.map((rel) => ({
    value: rel.athlete_id,
    label: rel.athlete?.display_name || 'Unknown Athlete',
  }));

  const toggleAthlete = (athleteId) => {
    setSelectedAthletes(prev =>
      prev.includes(athleteId)
        ? prev.filter(id => id !== athleteId)
        : [...prev, athleteId]
    );
  };

  const selectAll = () => {
    setSelectedAthletes(athletes.map(a => a.athlete_id));
  };

  const deselectAll = () => {
    setSelectedAthletes([]);
  };

  const zoneInfo = workout?.primary_zone ? TRAINING_ZONES[workout.primary_zone] : null;

  if (!workout) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Assign Workout to Athletes"
      size="lg"
    >
      <LoadingOverlay visible={submitting} />

      <Stack spacing="lg">
        {/* Workout Summary */}
        <Paper p="md" withBorder bg="blue.0">
          <Stack spacing="xs">
            <Group position="apart">
              <Text weight={600} size="lg" c="dark">
                {workout.name}
              </Text>
              <Badge size="lg" variant="light" color={
                workout.difficulty_level === 'beginner' ? 'green' :
                workout.difficulty_level === 'intermediate' ? 'blue' : 'orange'
              }>
                {workout.difficulty_level || 'intermediate'}
              </Badge>
            </Group>

            <Text size="sm" c="dimmed">
              {workout.description}
            </Text>

            <Divider my="xs" />

            <Group spacing="md">
              <Badge size="md" variant="light" leftSection={<Clock size={14} />}>
                {workout.duration} min
              </Badge>
              <Badge size="md" variant="light" leftSection={<Activity size={14} />}>
                {workout.target_tss || workout.targetTSS} TSS
              </Badge>
              <Badge size="md" variant="light" leftSection={<Zap size={14} />}>
                IF: {workout.intensity_factor?.toFixed(2)}
              </Badge>
              {zoneInfo && (
                <Badge size="md" variant="light" color={zoneInfo.color}>
                  {zoneInfo.name}
                </Badge>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* Success Alert */}
        {success && (
          <Alert
            icon={<CheckCircle size={20} />}
            title="Workout Assigned!"
            color="green"
          >
            {workout.name} has been assigned to {selectedAthletes.length} athlete{selectedAthletes.length !== 1 ? 's' : ''} successfully.
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert
            icon={<AlertCircle size={20} />}
            title="Error"
            color="red"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        {/* Assignment Form */}
        {!success && (
          <>
            {/* Athlete Multi-Select */}
            <div>
              <Group position="apart" mb="xs">
                <Text size="sm" fw={600} c="dark">
                  Select Athletes ({selectedAthletes.length} selected)
                </Text>
                <Group spacing="xs">
                  <Button size="xs" variant="subtle" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button size="xs" variant="subtle" onClick={deselectAll}>
                    Clear
                  </Button>
                </Group>
              </Group>

              {athletes.length === 0 ? (
                <Alert icon={<AlertCircle size={16} />} color="yellow">
                  You don't have any athletes yet. Add athletes in the Coach Dashboard.
                </Alert>
              ) : (
                <ScrollArea h={200} type="auto">
                  <Stack spacing="xs">
                    {athletes.map(rel => (
                      <Card
                        key={rel.athlete_id}
                        withBorder
                        p="xs"
                        onClick={() => toggleAthlete(rel.athlete_id)}
                        style={{ cursor: 'pointer' }}
                        bg={selectedAthletes.includes(rel.athlete_id) ? 'blue.0' : undefined}
                      >
                        <Group position="apart">
                          <Group spacing="xs">
                            <Checkbox
                              checked={selectedAthletes.includes(rel.athlete_id)}
                              onChange={() => toggleAthlete(rel.athlete_id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div>
                              <Text size="sm" fw={500} c="dark">
                                {rel.athlete?.display_name || 'Unknown'}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {rel.athlete?.email}
                              </Text>
                            </div>
                          </Group>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                </ScrollArea>
              )}
            </div>

            <Divider />

            {/* Week Number */}
            <NumberInput
              label="Week Number"
              description="Which week of their training plan?"
              placeholder="1"
              value={weekNumber}
              onChange={setWeekNumber}
              min={1}
              max={52}
              icon={<Calendar size={16} />}
              required
            />

            {/* Day of Week */}
            <Select
              label="Day of Week"
              placeholder="Select day"
              data={DAYS_OF_WEEK}
              value={dayOfWeek}
              onChange={setDayOfWeek}
              icon={<Calendar size={16} />}
              required
            />

            {/* Coach Notes */}
            <Textarea
              label="Coach Notes (Optional)"
              description="Add specific instructions or modifications for this athlete"
              placeholder="E.g., Focus on maintaining Zone 2 heart rate throughout..."
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              minRows={3}
              maxRows={6}
            />

            {/* Action Buttons */}
            <Group position="right" mt="md">
              <Button variant="subtle" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                loading={submitting}
                disabled={selectedAthletes.length === 0}
                leftIcon={selectedAthletes.length > 1 ? <Users size={18} /> : <CheckCircle size={18} />}
              >
                Assign to {selectedAthletes.length} Athlete{selectedAthletes.length !== 1 ? 's' : ''}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
};

export default QuickAssignModal;
