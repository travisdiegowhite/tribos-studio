import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Stack,
  Group,
  Badge,
  LoadingOverlay,
  Alert,
  ActionIcon,
  SimpleGrid,
  RingProgress,
  Paper,
  Table,
  Center,
} from '@mantine/core';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  AlertCircle,
  Activity,
  Calendar,
  Target,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import coachService from '../../services/coachService';
import { formatDistanceToNow } from 'date-fns';

/**
 * Progress Tracking Page
 * View athlete's training progress and metrics
 */
const ProgressTracking = () => {
  const { user } = useAuth();
  const { athleteId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [athleteName, setAthleteName] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [rides, setRides] = useState([]);
  const [workouts, setWorkouts] = useState([]);

  useEffect(() => {
    if (!user || !athleteId) return;
    loadProgressData();
  }, [user, athleteId]);

  const loadProgressData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get athlete info
      const { data: athletes } = await coachService.getAthletes(user.id, 'active');
      const rel = athletes?.find(r => r.athlete_id === athleteId);

      if (!rel) {
        throw new Error('Athlete not found');
      }

      setAthleteName(rel.athlete?.display_name || 'Athlete');

      // Load metrics
      if (rel.can_view_performance_data) {
        const { data: metricsData } = await coachService.getAthleteMetrics(user.id, athleteId);
        setMetrics(metricsData);
      }

      // Load recent rides
      if (rel.can_view_rides) {
        const { data: ridesData } = await coachService.getAthleteRides(user.id, athleteId, 10);
        setRides(ridesData || []);
      }

      // Load assigned workouts
      const { data: workoutsData } = await coachService.getAssignedWorkouts(user.id, athleteId);
      setWorkouts(workoutsData || []);

    } catch (err) {
      console.error('Error loading progress data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <LoadingOverlay visible />
        <div style={{ height: 400 }} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Stack spacing="md">
          <Group>
            <ActionIcon
              size="lg"
              variant="light"
              onClick={() => navigate(`/coach/athletes/${athleteId}`)}
            >
              <ArrowLeft size={20} />
            </ActionIcon>
            <Title order={1}>Progress Tracking</Title>
          </Group>
          <Alert icon={<AlertCircle size={20} />} title="Error" color="red">
            {error}
          </Alert>
        </Stack>
      </Container>
    );
  }

  const completedWorkouts = workouts.filter(w => w.completed).length;
  const totalWorkouts = workouts.length;
  const complianceRate = totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 0;

  return (
    <Container size="xl" py="xl">
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
              <Title order={1}>Progress Tracking</Title>
              <Text c="dimmed">{athleteName}</Text>
            </div>
          </Group>
          <Badge size="lg" variant="light" color="blue">
            Active
          </Badge>
        </Group>

        {/* Training Metrics */}
        {metrics ? (
          <SimpleGrid cols={4} breakpoints={[{ maxWidth: 'md', cols: 2 }]}>
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="xs">
                <Group position="apart">
                  <Text size="sm" c="dimmed" weight={500}>
                    CTL (Fitness)
                  </Text>
                  <TrendingUp size={18} color="var(--mantine-color-blue-6)" />
                </Group>
                <Text size={32} weight={700}>
                  {metrics.ctl?.toFixed(1) || '-'}
                </Text>
                <Text size="xs" c="dimmed">
                  Chronic Training Load
                </Text>
              </Stack>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="xs">
                <Group position="apart">
                  <Text size="sm" c="dimmed" weight={500}>
                    ATL (Fatigue)
                  </Text>
                  <Activity size={18} color="var(--mantine-color-orange-6)" />
                </Group>
                <Text size={32} weight={700}>
                  {metrics.atl?.toFixed(1) || '-'}
                </Text>
                <Text size="xs" c="dimmed">
                  Acute Training Load
                </Text>
              </Stack>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="xs">
                <Group position="apart">
                  <Text size="sm" c="dimmed" weight={500}>
                    TSB (Form)
                  </Text>
                  <Zap size={18} color="var(--mantine-color-green-6)" />
                </Group>
                <Text size={32} weight={700}>
                  {metrics.tsb?.toFixed(1) || '-'}
                </Text>
                <Text size="xs" c="dimmed">
                  Training Stress Balance
                </Text>
              </Stack>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Stack spacing="xs">
                <Group position="apart">
                  <Text size="sm" c="dimmed" weight={500}>
                    FTP
                  </Text>
                  <Target size={18} color="var(--mantine-color-violet-6)" />
                </Group>
                <Text size={32} weight={700}>
                  {metrics.ftp || '-'}
                </Text>
                <Text size="xs" c="dimmed">
                  Watts
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>
        ) : (
          <Alert color="gray" variant="light">
            <Text size="sm">
              Performance metrics not available. You may not have permission to view this athlete's performance data.
            </Text>
          </Alert>
        )}

        {/* Workout Compliance */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <Group position="apart">
              <Title order={3}>Workout Compliance</Title>
              <Badge size="lg" variant="light" color={complianceRate >= 80 ? 'green' : complianceRate >= 60 ? 'orange' : 'red'}>
                {complianceRate}%
              </Badge>
            </Group>

            <Group position="center">
              <RingProgress
                size={200}
                thickness={20}
                sections={[
                  { value: complianceRate, color: complianceRate >= 80 ? 'green' : complianceRate >= 60 ? 'orange' : 'red' }
                ]}
                label={
                  <Center>
                    <Stack align="center" spacing={0}>
                      <Text size="xl" weight={700}>
                        {completedWorkouts}/{totalWorkouts}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Completed
                      </Text>
                    </Stack>
                  </Center>
                }
              />
            </Group>
          </Stack>
        </Card>

        {/* Recent Rides */}
        {rides.length > 0 && (
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="md">
              <Title order={3}>Recent Rides</Title>

              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Distance</th>
                    <th>Duration</th>
                    <th>Elevation</th>
                  </tr>
                </thead>
                <tbody>
                  {rides.map((ride) => (
                    <tr key={ride.id}>
                      <td>
                        <Text size="sm">
                          {ride.ride_date
                            ? formatDistanceToNow(new Date(ride.ride_date), { addSuffix: true })
                            : '-'}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm" weight={500}>
                          {ride.name || 'Untitled Ride'}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm">
                          {ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : '-'}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm">
                          {ride.moving_time
                            ? `${Math.floor(ride.moving_time / 60)}h ${ride.moving_time % 60}m`
                            : '-'}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm">
                          {ride.elevation_gain ? `${ride.elevation_gain.toFixed(0)}m` : '-'}
                        </Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Stack>
          </Card>
        )}

        {rides.length === 0 && (
          <Paper p="xl" withBorder>
            <Stack align="center" spacing="sm">
              <Activity size={48} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed">No recent rides to display</Text>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Container>
  );
};

export default ProgressTracking;
