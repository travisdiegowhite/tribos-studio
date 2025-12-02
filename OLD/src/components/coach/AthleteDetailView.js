import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Title,
  Button,
  ThemeIcon,
  SimpleGrid,
  Paper,
  Alert,
  RingProgress,
  Center,
  Tabs,
  Avatar,
  Divider,
  Table,
  ActionIcon,
} from '@mantine/core';
import {
  User,
  Activity,
  Calendar,
  TrendingUp,
  TrendingDown,
  Heart,
  Moon,
  Zap,
  MessageCircle,
  MapPin,
  Mountain,
  Clock,
  Target,
  Plus,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import coachService from '../../services/coachService';
import { format, formatDistanceToNow } from 'date-fns';
import { useUnits } from '../../utils/units';
import WorkoutAssignmentModal from './WorkoutAssignmentModal';

/**
 * Athlete Detail View
 * Comprehensive view of athlete's training, performance, and health data
 */
const AthleteDetailView = () => {
  const { athleteId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatDistance, formatElevation, formatSpeed } = useUnits();

  // State
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [recentRides, setRecentRides] = useState([]);
  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [healthMetrics, setHealthMetrics] = useState([]);
  const [workoutFeedback, setWorkoutFeedback] = useState([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState([]);
  const [assignWorkoutOpen, setAssignWorkoutOpen] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!user || !athleteId) return;
    loadAthleteData();
  }, [user, athleteId]);

  const loadAthleteData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load comprehensive athlete summary
      const { data: summaryData, error: summaryError } = await coachService.getAthleteSummary(
        user.id,
        athleteId
      );
      if (summaryError) throw summaryError;
      setSummary(summaryData);

      // Extract data from summary
      if (summaryData) {
        setRecentRides(summaryData.recent_rides || []);
        setTrainingMetrics(summaryData.training_metrics);
        setHealthMetrics(summaryData.health_metrics || []);
        setWorkoutFeedback(summaryData.recent_feedback || []);
      }

      // Load assigned workouts
      const { data: workoutsData, error: workoutsError } = await coachService.getAssignedWorkouts(
        user.id,
        athleteId
      );
      if (workoutsError) throw workoutsError;
      setAssignedWorkouts(workoutsData || []);

    } catch (err) {
      console.error('Error loading athlete data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignWorkoutSuccess = () => {
    setAssignWorkoutOpen(false);
    loadAthleteData(); // Refresh data
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Center h={400}>
          <Stack align="center" spacing="md">
            <ThemeIcon size="xl" variant="light" color="blue">
              <Activity size={32} />
            </ThemeIcon>
            <Text>Loading athlete data...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert icon={<AlertCircle size={20} />} title="Error" color="red">
          {error}
        </Alert>
        <Button
          leftIcon={<ArrowLeft size={18} />}
          variant="light"
          mt="md"
          onClick={() => navigate('/coach')}
        >
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  const profile = summary?.profile;

  // Calculate training stress balance interpretation
  const getTSBColor = (tsb) => {
    if (!tsb) return 'gray';
    if (tsb > 10) return 'blue'; // Fresh
    if (tsb > -10) return 'green'; // Optimal
    if (tsb > -30) return 'orange'; // Reaching
    return 'red'; // Overreaching
  };

  const getTSBLabel = (tsb) => {
    if (!tsb) return 'Unknown';
    if (tsb > 10) return 'Fresh';
    if (tsb > -10) return 'Optimal';
    if (tsb > -30) return 'Reaching';
    return 'Overreaching';
  };

  return (
    <Container size="xl" py="xl">
      <Stack spacing="xl">
        {/* Header */}
        <Group position="apart">
          <Group>
            <ActionIcon
              size="lg"
              variant="light"
              onClick={() => navigate('/coach')}
            >
              <ArrowLeft size={20} />
            </ActionIcon>
            <Avatar
              src={profile?.avatar_url}
              size="lg"
              radius="xl"
            >
              {profile?.display_name?.[0] || '?'}
            </Avatar>
            <div>
              <Title order={2}>{profile?.display_name || 'Athlete'}</Title>
              <Text c="dimmed" size="sm">
                {profile?.location_name || 'Location not set'}
              </Text>
            </div>
          </Group>
          <Group>
            <Button
              leftIcon={<Plus size={18} />}
              onClick={() => setAssignWorkoutOpen(true)}
            >
              Assign Workout
            </Button>
            <Button
              variant="light"
              leftIcon={<MessageCircle size={18} />}
              onClick={() => navigate(`/coach/messages/${athleteId}`)}
            >
              Message
            </Button>
          </Group>
        </Group>

        {/* Training Metrics Summary */}
        <SimpleGrid cols={4} breakpoints={[
          { maxWidth: 'md', cols: 2 },
          { maxWidth: 'sm', cols: 1 }
        ]}>
          {/* Chronic Training Load (CTL) */}
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="xs">
              <Group position="apart">
                <Text size="sm" c="dimmed" weight={500}>
                  Fitness (CTL)
                </Text>
                <ThemeIcon variant="light" color="blue" size="sm">
                  <TrendingUp size={16} />
                </ThemeIcon>
              </Group>
              <Text size={28} weight={700}>
                {trainingMetrics?.ctl?.toFixed(0) || '-'}
              </Text>
              <Text size="xs" c="dimmed">
                Long-term training load
              </Text>
            </Stack>
          </Card>

          {/* Acute Training Load (ATL) */}
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="xs">
              <Group position="apart">
                <Text size="sm" c="dimmed" weight={500}>
                  Fatigue (ATL)
                </Text>
                <ThemeIcon variant="light" color="orange" size="sm">
                  <Zap size={16} />
                </ThemeIcon>
              </Group>
              <Text size={28} weight={700}>
                {trainingMetrics?.atl?.toFixed(0) || '-'}
              </Text>
              <Text size="xs" c="dimmed">
                Recent training stress
              </Text>
            </Stack>
          </Card>

          {/* Training Stress Balance (TSB) */}
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="xs">
              <Group position="apart">
                <Text size="sm" c="dimmed" weight={500}>
                  Form (TSB)
                </Text>
                <ThemeIcon variant="light" color={getTSBColor(trainingMetrics?.tsb)} size="sm">
                  <Target size={16} />
                </ThemeIcon>
              </Group>
              <Text size={28} weight={700}>
                {trainingMetrics?.tsb?.toFixed(0) || '-'}
              </Text>
              <Badge
                size="xs"
                color={getTSBColor(trainingMetrics?.tsb)}
                variant="light"
              >
                {getTSBLabel(trainingMetrics?.tsb)}
              </Badge>
            </Stack>
          </Card>

          {/* Recent Activity */}
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="xs">
              <Group position="apart">
                <Text size="sm" c="dimmed" weight={500}>
                  Recent Rides
                </Text>
                <ThemeIcon variant="light" color="green" size="sm">
                  <Activity size={16} />
                </ThemeIcon>
              </Group>
              <Text size={28} weight={700}>
                {recentRides?.length || 0}
              </Text>
              <Text size="xs" c="dimmed">
                Last 10 activities
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onTabChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview" icon={<Activity size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="workouts" icon={<Calendar size={16} />}>
              Assigned Workouts
            </Tabs.Tab>
            <Tabs.Tab value="rides" icon={<Mountain size={16} />}>
              Recent Rides
            </Tabs.Tab>
            <Tabs.Tab value="health" icon={<Heart size={16} />}>
              Health Metrics
            </Tabs.Tab>
            <Tabs.Tab value="feedback" icon={<MessageCircle size={16} />}>
              Feedback
            </Tabs.Tab>
          </Tabs.List>

          {/* Overview Tab */}
          <Tabs.Panel value="overview" pt="xl">
            <SimpleGrid cols={2} breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
              {/* Recent Rides Card */}
              <Card shadow="sm" p="lg" radius="md" withBorder>
                <Stack spacing="md">
                  <Group position="apart">
                    <Text weight={500} size="lg">Recent Rides</Text>
                    <Badge>{recentRides?.length || 0}</Badge>
                  </Group>

                  {recentRides && recentRides.length > 0 ? (
                    <Stack spacing="sm">
                      {recentRides.slice(0, 5).map((ride) => (
                        <Paper key={ride.id} p="sm" withBorder>
                          <Group position="apart">
                            <div style={{ flex: 1 }}>
                              <Text size="sm" weight={500}>{ride.name}</Text>
                              <Group spacing={12} mt={4}>
                                <Text size="xs" c="dimmed">
                                  {formatDistance(ride.distance_km)}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {formatElevation(ride.elevation_gain)}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {Math.floor(ride.moving_time / 60)}min
                                </Text>
                              </Group>
                            </div>
                            <Text size="xs" c="dimmed">
                              {formatDistanceToNow(new Date(ride.ride_date), { addSuffix: true })}
                            </Text>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm" ta="center" py="lg">
                      No recent rides
                    </Text>
                  )}
                </Stack>
              </Card>

              {/* Health Metrics Card */}
              <Card shadow="sm" p="lg" radius="md" withBorder>
                <Stack spacing="md">
                  <Group position="apart">
                    <Text weight={500} size="lg">Health Metrics</Text>
                    <Badge>{healthMetrics?.length || 0} days</Badge>
                  </Group>

                  {healthMetrics && healthMetrics.length > 0 ? (
                    <Stack spacing="sm">
                      {healthMetrics.slice(0, 5).map((metric) => (
                        <Paper key={metric.date} p="sm" withBorder>
                          <Group position="apart">
                            <Text size="sm" weight={500}>
                              {format(new Date(metric.date), 'MMM dd')}
                            </Text>
                            <Group spacing="xs">
                              {metric.hrv && (
                                <Badge size="xs" variant="light" color="blue">
                                  HRV: {metric.hrv}
                                </Badge>
                              )}
                              {metric.sleep_hours && (
                                <Badge size="xs" variant="light" color="violet">
                                  Sleep: {metric.sleep_hours}h
                                </Badge>
                              )}
                              {metric.sleep_quality && (
                                <Badge size="xs" variant="light" color="green">
                                  Quality: {metric.sleep_quality}/10
                                </Badge>
                              )}
                            </Group>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm" ta="center" py="lg">
                      No health metrics recorded
                    </Text>
                  )}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          {/* Assigned Workouts Tab */}
          <Tabs.Panel value="workouts" pt="xl">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="md">
                <Group position="apart">
                  <Text weight={500} size="lg">Assigned Workouts</Text>
                  <Button
                    size="xs"
                    leftIcon={<Plus size={14} />}
                    onClick={() => setAssignWorkoutOpen(true)}
                  >
                    Assign New
                  </Button>
                </Group>

                {assignedWorkouts && assignedWorkouts.length > 0 ? (
                  <Table>
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th>Day</th>
                        <th>Type</th>
                        <th>Target TSS</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedWorkouts.map((workout) => {
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        return (
                        <tr key={workout.id}>
                          <td>Week {workout.week_number}</td>
                          <td>{dayNames[workout.day_of_week] || '-'}</td>
                          <td>
                            <Badge variant="light">
                              {workout.workout_type}
                            </Badge>
                          </td>
                          <td>{workout.target_tss || '-'}</td>
                          <td>{Math.floor(workout.target_duration / 60)} min</td>
                          <td>
                            <Badge
                              color={workout.completed ? 'green' : 'orange'}
                              variant="light"
                            >
                              {workout.completed ? 'Completed' : 'Pending'}
                            </Badge>
                          </td>
                          <td>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {workout.coach_notes || '-'}
                            </Text>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </Table>
                ) : (
                  <Text c="dimmed" size="sm" ta="center" py="lg">
                    No workouts assigned yet
                  </Text>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          {/* Other tabs would go here - rides, health, feedback */}
          <Tabs.Panel value="rides" pt="xl">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Text c="dimmed" ta="center" py="lg">
                Detailed rides view coming soon
              </Text>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="health" pt="xl">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Text c="dimmed" ta="center" py="lg">
                Detailed health metrics view coming soon
              </Text>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="feedback" pt="xl">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="md">
                <Text weight={500} size="lg">Workout Feedback</Text>

                {workoutFeedback && workoutFeedback.length > 0 ? (
                  <Stack spacing="sm">
                    {workoutFeedback.map((feedback, idx) => (
                      <Paper key={idx} p="md" withBorder>
                        <Stack spacing="xs">
                          <Group position="apart">
                            <Text size="sm" weight={500}>
                              {format(new Date(feedback.date), 'MMM dd, yyyy')}
                            </Text>
                            <Group spacing="xs">
                              <Badge size="sm" variant="light" color="blue">
                                RPE: {feedback.perceived_exertion}/10
                              </Badge>
                              {feedback.difficulty_rating && (
                                <Badge size="sm" variant="light" color="orange">
                                  Difficulty: {feedback.difficulty_rating}/10
                                </Badge>
                              )}
                            </Group>
                          </Group>
                          {feedback.notes && (
                            <Text size="sm" c="dimmed">
                              {feedback.notes}
                            </Text>
                          )}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text c="dimmed" size="sm" ta="center" py="lg">
                    No workout feedback yet
                  </Text>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>

      {/* Workout Assignment Modal */}
      <WorkoutAssignmentModal
        opened={assignWorkoutOpen}
        onClose={() => setAssignWorkoutOpen(false)}
        onSuccess={handleAssignWorkoutSuccess}
        coachId={user?.id}
        athleteId={athleteId}
      />
    </Container>
  );
};

export default AthleteDetailView;
