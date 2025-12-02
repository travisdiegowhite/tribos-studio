import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Stack,
  Group,
  Select,
  NumberInput,
  Textarea,
  Button,
  Alert,
  Divider,
  Badge,
  LoadingOverlay,
  ActionIcon,
  Paper,
} from '@mantine/core';
import {
  Calendar,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Target,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import coachService from '../../services/coachService';

const WORKOUT_TYPES = [
  { value: 'endurance', label: 'Endurance' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'vo2max', label: 'VO2 Max' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'long_ride', label: 'Long Ride' },
  { value: 'intervals', label: 'Intervals' },
];

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
 * Workout Assignment Page
 * Full page for assigning workouts to athletes
 */
const WorkoutAssignment = () => {
  const { user } = useAuth();
  const { athleteId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const [athleteName, setAthleteName] = useState('');
  const [relationship, setRelationship] = useState(null);

  // Form state
  const [workoutType, setWorkoutType] = useState('endurance');
  const [weekNumber, setWeekNumber] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [targetTSS, setTargetTSS] = useState(100);
  const [targetDuration, setTargetDuration] = useState(60);
  const [coachNotes, setCoachNotes] = useState('');

  useEffect(() => {
    if (!user || !athleteId) return;
    loadAthleteInfo();
  }, [user, athleteId]);

  const loadAthleteInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get all athletes to find this one
      const { data: athletes, error: fetchError } = await coachService.getAthletes(
        user.id,
        'active'
      );

      if (fetchError) throw fetchError;

      const rel = athletes?.find(r => r.athlete_id === athleteId);

      if (!rel) {
        throw new Error('Athlete not found or relationship is not active');
      }

      setRelationship(rel);
      setAthleteName(rel.athlete?.display_name || 'Athlete');

      if (!rel.can_assign_workouts) {
        setError('You do not have permission to assign workouts to this athlete');
      }
    } catch (err) {
      console.error('Error loading athlete info:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!relationship?.can_assign_workouts) {
      setError('You do not have permission to assign workouts');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const workoutData = {
        weekNumber: parseInt(weekNumber),
        dayOfWeek: parseInt(dayOfWeek),
        workoutType,
        targetTss: targetTSS,
        targetDuration: targetDuration,
        coachNotes,
      };

      const { error: assignError } = await coachService.assignWorkout(
        user.id,
        athleteId,
        workoutData
      );

      if (assignError) throw assignError;

      setSuccess(true);

      // Reset form
      setTimeout(() => {
        setWorkoutType('endurance');
        setWeekNumber(1);
        setDayOfWeek('1');
        setTargetTSS(100);
        setTargetDuration(60);
        setCoachNotes('');
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Error assigning workout:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container size="md" py="xl">
        <LoadingOverlay visible />
        <div style={{ height: 400 }} />
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack spacing="xl">
        {/* Header */}
        <Group position="apart">
          <Group spacing="sm">
            <ActionIcon
              size="lg"
              variant="light"
              onClick={() => navigate(`/coach/athletes/${athleteId}`)}
            >
              <ArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Title order={1}>Assign Workout</Title>
              <Text c="dimmed">to {athleteName}</Text>
            </div>
          </Group>
          <Badge size="lg" variant="light" color="blue">
            {athleteName}
          </Badge>
        </Group>

        {/* Success Alert */}
        {success && (
          <Alert
            icon={<CheckCircle size={20} />}
            title="Workout Assigned!"
            color="green"
          >
            The workout has been added to {athleteName}'s training calendar.
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
        <form onSubmit={handleSubmit}>
          <Stack spacing="lg">
            {/* Workout Details */}
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="md">
                <Group spacing="xs">
                  <Target size={20} />
                  <Title order={3}>Workout Details</Title>
                </Group>

                <Select
                  label="Workout Type"
                  placeholder="Select workout type"
                  data={WORKOUT_TYPES}
                  value={workoutType}
                  onChange={setWorkoutType}
                  required
                />

                <Group grow>
                  <NumberInput
                    label="Target TSS"
                    description="Training Stress Score"
                    value={targetTSS}
                    onChange={setTargetTSS}
                    min={10}
                    max={500}
                    step={10}
                    required
                    icon={<TrendingUp size={16} />}
                  />

                  <NumberInput
                    label="Target Duration (minutes)"
                    description="Estimated workout time"
                    value={targetDuration}
                    onChange={setTargetDuration}
                    min={15}
                    max={480}
                    step={15}
                    required
                    icon={<Clock size={16} />}
                  />
                </Group>

                <Textarea
                  label="Coach Notes"
                  placeholder="Instructions, focus areas, tips for this workout..."
                  value={coachNotes}
                  onChange={(e) => setCoachNotes(e.target.value)}
                  minRows={3}
                  maxRows={6}
                />
              </Stack>
            </Card>

            {/* Scheduling */}
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="md">
                <Group spacing="xs">
                  <Calendar size={20} />
                  <Title order={3}>Schedule</Title>
                </Group>

                <Group grow>
                  <NumberInput
                    label="Week Number"
                    description="Training plan week"
                    value={weekNumber}
                    onChange={setWeekNumber}
                    min={1}
                    max={52}
                    required
                  />

                  <Select
                    label="Day of Week"
                    data={DAYS_OF_WEEK}
                    value={String(dayOfWeek)}
                    onChange={(val) => setDayOfWeek(val)}
                    required
                  />
                </Group>

                <Paper p="md" withBorder>
                  <Stack spacing="xs">
                    <Text size="sm" weight={500}>
                      Scheduled for:
                    </Text>
                    <Text size="sm" c="dimmed">
                      Week {weekNumber},{' '}
                      {DAYS_OF_WEEK.find(d => d.value === String(dayOfWeek))?.label}
                    </Text>
                  </Stack>
                </Paper>
              </Stack>
            </Card>

            {/* Workout Summary */}
            <Card shadow="sm" p="lg" radius="md" withBorder style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
              <Stack spacing="xs">
                <Text weight={500}>Workout Summary</Text>
                <Divider />
                <Group position="apart">
                  <Text size="sm" c="dimmed">Type:</Text>
                  <Badge>{WORKOUT_TYPES.find(w => w.value === workoutType)?.label}</Badge>
                </Group>
                <Group position="apart">
                  <Text size="sm" c="dimmed">TSS:</Text>
                  <Text size="sm" weight={500}>{targetTSS}</Text>
                </Group>
                <Group position="apart">
                  <Text size="sm" c="dimmed">Duration:</Text>
                  <Text size="sm" weight={500}>{targetDuration} minutes</Text>
                </Group>
                <Group position="apart">
                  <Text size="sm" c="dimmed">Schedule:</Text>
                  <Text size="sm" weight={500}>
                    Week {weekNumber}, {DAYS_OF_WEEK.find(d => d.value === String(dayOfWeek))?.label}
                  </Text>
                </Group>
              </Stack>
            </Card>

            {/* Actions */}
            <Divider />

            <Group position="apart">
              <Button
                variant="subtle"
                onClick={() => navigate(`/coach/athletes/${athleteId}`)}
              >
                Cancel
              </Button>
              <Group>
                <Button
                  variant="light"
                  onClick={() => {
                    setWorkoutType('endurance');
                    setWeekNumber(1);
                    setDayOfWeek('1');
                    setTargetTSS(100);
                    setTargetDuration(60);
                    setCoachNotes('');
                  }}
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  leftIcon={<Calendar size={18} />}
                  loading={submitting}
                  disabled={!relationship?.can_assign_workouts}
                >
                  Assign Workout
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
};

export default WorkoutAssignment;
