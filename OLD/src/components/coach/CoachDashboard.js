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
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  Users,
  UserPlus,
  Calendar,
  TrendingUp,
  Activity,
  MessageCircle,
  Award,
  Target,
  CheckCircle,
  Clock,
  AlertCircle,
  Settings,
  Book,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import coachService from '../../services/coachService';
import AthleteList from './AthleteList';
import AthleteInviteModal from './AthleteInviteModal';
import WorkoutSelector from '../WorkoutSelector';
import QuickAssignModal from './QuickAssignModal';
import CustomWorkoutsList from '../workout-builder/CustomWorkoutsList';

/**
 * Coach Dashboard
 * Main hub for coaches to manage athletes, view statistics, and access features
 */
const CoachDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(true);
  const [isCoach, setIsCoach] = useState(false);
  const [stats, setStats] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);

  // Load coach data
  useEffect(() => {
    if (!user) return;
    loadCoachData();
  }, [user]);

  const loadCoachData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if user is a coach
      const isCoachUser = await coachService.isCoach(user.id);
      setIsCoach(isCoachUser);

      if (!isCoachUser) {
        setLoading(false);
        return;
      }

      // Load coach stats
      const { data: statsData, error: statsError } = await coachService.getCoachStats(user.id);
      if (statsError) throw statsError;
      setStats(statsData);

      // Load active athletes
      const { data: athletesData, error: athletesError } = await coachService.getAthletes(user.id, 'active');
      if (athletesError) throw athletesError;
      setAthletes(athletesData || []);

      // Load pending invitations
      const { data: pendingData, error: pendingError } = await coachService.getAthletes(user.id, 'pending');
      if (pendingError) throw pendingError;
      setPendingInvitations(pendingData || []);

    } catch (err) {
      console.error('Error loading coach data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSuccess = () => {
    setInviteModalOpen(false);
    loadCoachData(); // Refresh data
  };

  const handleWorkoutSelect = (workout) => {
    setSelectedWorkout(workout);
    if (athletes.length > 0) {
      setQuickAssignOpen(true);
    } else {
      setError('Please add athletes before assigning workouts');
    }
  };

  const handleAssignmentSuccess = () => {
    setQuickAssignOpen(false);
    setSelectedWorkout(null);
    loadCoachData(); // Refresh stats
  };

  const handleEnableCoach = async () => {
    try {
      const { error } = await coachService.enableCoachAccount(user.id, {
        bio: '',
        certifications: [],
        specialties: [],
        maxAthletes: 50
      });

      if (error) throw error;

      setIsCoach(true);
      loadCoachData();
    } catch (err) {
      console.error('Error enabling coach account:', err);
      setError(err.message);
    }
  };

  // Not a coach yet - show upgrade option
  if (!loading && !isCoach) {
    return (
      <Container size="lg" py="xl">
        <Stack spacing="xl">
          <Alert
            icon={<Users size={20} />}
            title="Coach Account"
            color="blue"
          >
            You don't have a coach account yet. Enable coaching features to start working with athletes.
          </Alert>

          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="md">
              <Group spacing="xs">
                <ThemeIcon size="lg" variant="light" color="blue">
                  <Award size={24} />
                </ThemeIcon>
                <Title order={2}>Become a Coach on tribos.studio</Title>
              </Group>

              <Text c="dimmed">
                Enable your coach account to:
              </Text>

              <SimpleGrid cols={2} spacing="md">
                <Paper p="md" withBorder>
                  <Group spacing="xs">
                    <UserPlus size={20} color="var(--mantine-color-blue-6)" />
                    <Text weight={500}>Invite Athletes</Text>
                  </Group>
                  <Text size="sm" c="dimmed" mt="xs">
                    Connect with athletes and manage their training
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Group spacing="xs">
                    <Calendar size={20} color="var(--mantine-color-green-6)" />
                    <Text weight={500}>Assign Workouts</Text>
                  </Group>
                  <Text size="sm" c="dimmed" mt="xs">
                    Create and assign route-based training plans
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Group spacing="xs">
                    <Activity size={20} color="var(--mantine-color-orange-6)" />
                    <Text weight={500}>Track Progress</Text>
                  </Group>
                  <Text size="sm" c="dimmed" mt="xs">
                    Monitor training load, performance, and health metrics
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Group spacing="xs">
                    <MessageCircle size={20} color="var(--mantine-color-violet-6)" />
                    <Text weight={500}>Communicate</Text>
                  </Group>
                  <Text size="sm" c="dimmed" mt="xs">
                    Chat with athletes and provide feedback
                  </Text>
                </Paper>
              </SimpleGrid>

              <Button
                size="lg"
                leftIcon={<Award size={20} />}
                onClick={handleEnableCoach}
                fullWidth
              >
                Enable Coach Account
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Center h={400}>
          <Stack align="center" spacing="md">
            <ThemeIcon size="xl" variant="light" color="blue">
              <Activity size={32} />
            </ThemeIcon>
            <Text>Loading coach dashboard...</Text>
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
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack spacing="xl">
        {/* Header */}
        <Group position="apart">
          <div>
            <Title order={1}>Coach Dashboard</Title>
            <Text c="dimmed" mt={4}>
              Manage your athletes and training programs
            </Text>
          </div>
          <Group>
            <Button
              leftIcon={<UserPlus size={20} />}
              onClick={() => setInviteModalOpen(true)}
            >
              Invite Athlete
            </Button>
            <ActionIcon
              size="lg"
              variant="light"
              onClick={() => navigate('/coach/settings')}
            >
              <Settings size={20} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Statistics */}
        <SimpleGrid cols={4} breakpoints={[
          { maxWidth: 'md', cols: 2 },
          { maxWidth: 'sm', cols: 1 }
        ]}>
          {/* Active Athletes */}
          <Card shadow="sm" p={8} radius="md" withBorder>
            <Group position="apart" mb={4}>
              <Text size="sm" c="dimmed" weight={500}>Active Athletes</Text>
              <ThemeIcon variant="light" color="blue" size={26}>
                <Users size={14} />
              </ThemeIcon>
            </Group>
            <Group align="baseline" spacing={4}>
              <Text size={20} weight={700}>{stats?.active_athletes || 0}</Text>
              <Text size="sm" c="dimmed">/ {stats?.total_athletes || 0}</Text>
            </Group>
          </Card>

          {/* Pending Invitations */}
          <Card shadow="sm" p={8} radius="md" withBorder>
            <Group position="apart" mb={4}>
              <Text size="sm" c="dimmed" weight={500}>Pending Invites</Text>
              <ThemeIcon variant="light" color="orange" size={26}>
                <Clock size={14} />
              </ThemeIcon>
            </Group>
            <Group align="baseline" spacing={4}>
              <Text size={20} weight={700}>{stats?.pending_invitations || 0}</Text>
              <Text size="sm" c="dimmed">pending</Text>
            </Group>
          </Card>

          {/* Workouts Assigned */}
          <Card shadow="sm" p={8} radius="md" withBorder>
            <Group position="apart" mb={4}>
              <Text size="sm" c="dimmed" weight={500}>Workouts</Text>
              <ThemeIcon variant="light" color="green" size={26}>
                <Calendar size={14} />
              </ThemeIcon>
            </Group>
            <Group align="baseline" spacing={4}>
              <Text size={20} weight={700}>{stats?.total_workouts_assigned || 0}</Text>
              <Text size="sm" c="dimmed">total</Text>
            </Group>
          </Card>

          {/* Completion Rate */}
          <Card shadow="sm" p={8} radius="md" withBorder>
            <Group position="apart" mb={4}>
              <Text size="sm" c="dimmed" weight={500}>Completion</Text>
              <ThemeIcon variant="light" color="violet" size={26}>
                <CheckCircle size={14} />
              </ThemeIcon>
            </Group>
            {stats && stats.total_workouts_assigned > 0 ? (
              <Group align="baseline" spacing={4}>
                <Text size={20} weight={700}>
                  {Math.round((stats.completed_workouts / stats.total_workouts_assigned) * 100)}%
                </Text>
                <Text size="sm" c="dimmed">done</Text>
              </Group>
            ) : (
              <Text size={20} weight={700}>-</Text>
            )}
          </Card>
        </SimpleGrid>

        {/* Pending Invitations Alert */}
        {pendingInvitations.length > 0 && (
          <Alert
            icon={<Clock size={20} />}
            title="Pending Invitations"
            color="orange"
          >
            You have {pendingInvitations.length} athlete invitation{pendingInvitations.length !== 1 ? 's' : ''} pending.
            Athletes will appear in your active list once they accept.
          </Alert>
        )}

        {/* Athletes List */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <Group position="apart">
              <Title order={3}>Athletes</Title>
              {athletes.length > 0 && (
                <Badge size="lg" variant="light">
                  {athletes.length}
                </Badge>
              )}
            </Group>

            <AthleteList
              athletes={athletes}
              onRefresh={loadCoachData}
            />
          </Stack>
        </Card>

        {/* Workout Library */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <Group position="apart">
              <div>
                <Group spacing="xs" mb={4}>
                  <ThemeIcon size="lg" variant="light" color="green">
                    <Book size={24} />
                  </ThemeIcon>
                  <Title order={3}>Workout Library</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Browse and assign from 40+ research-backed workouts
                </Text>
              </div>
              <Badge size="lg" variant="light" color="green">
                40+ Workouts
              </Badge>
            </Group>

            <WorkoutSelector
              onWorkoutSelect={handleWorkoutSelect}
              selectedWorkoutId={selectedWorkout?.id}
              showFilters={true}
              compact={false}
            />
          </Stack>
        </Card>

        {/* Custom Workouts */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <CustomWorkoutsList />
        </Card>

        {/* Quick Actions */}
        <SimpleGrid cols={2} breakpoints={[
          { maxWidth: 'sm', cols: 1 }
        ]}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="xs">
              <ThemeIcon size="lg" variant="light" color="green">
                <TrendingUp size={24} />
              </ThemeIcon>
              <Text weight={500}>Performance Reports</Text>
              <Text size="sm" c="dimmed">
                Analyze athlete progress and trends
              </Text>
              <Button
                variant="light"
                fullWidth
                onClick={() => navigate('/coach/reports')}
                mt="xs"
              >
                View Reports
              </Button>
            </Stack>
          </Card>

          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="xs">
              <ThemeIcon size="lg" variant="light" color="violet">
                <MessageCircle size={24} />
              </ThemeIcon>
              <Text weight={500}>Messages</Text>
              <Text size="sm" c="dimmed">
                Communicate with your athletes
              </Text>
              <Button
                variant="light"
                fullWidth
                onClick={() => navigate('/coach/messages')}
                mt="xs"
              >
                View Messages
              </Button>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>

      {/* Invite Athlete Modal */}
      <AthleteInviteModal
        opened={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSuccess={handleInviteSuccess}
        coachId={user?.id}
      />

      {/* Quick Assign Workout Modal */}
      <QuickAssignModal
        opened={quickAssignOpen}
        onClose={() => setQuickAssignOpen(false)}
        workout={selectedWorkout}
        athletes={athletes}
        coachId={user?.id}
        onSuccess={handleAssignmentSuccess}
      />
    </Container>
  );
};

export default CoachDashboard;
