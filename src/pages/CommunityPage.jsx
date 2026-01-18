/**
 * CommunityPage
 * Full community experience - pod view, check-ins, pod discovery
 */

import { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Button,
  Box,
  Badge,
  Avatar,
  Tabs,
  SimpleGrid,
  Skeleton,
  Modal,
  TextInput,
  Textarea,
  Select,
  SegmentedControl,
  Progress,
  Divider,
  ActionIcon,
  Tooltip,
  Paper,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconUsers,
  IconPlus,
  IconCheck,
  IconSearch,
  IconSettings,
  IconHeart,
  IconMessageCircle,
  IconTrophy,
  IconTarget,
  IconChevronRight,
} from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useCommunity } from '../hooks/useCommunity';
import AppShell from '../components/AppShell';
import PageHeader from '../components/PageHeader';
import { WeeklyCheckInWidget } from '../components/community';
import { tokens } from '../theme';

const GOAL_OPTIONS = [
  { value: 'general_fitness', label: 'General Fitness' },
  { value: 'century', label: 'Century / Long Distance' },
  { value: 'gran_fondo', label: 'Gran Fondo' },
  { value: 'racing', label: 'Racing' },
  { value: 'gravel', label: 'Gravel / Adventure' },
  { value: 'climbing', label: 'Climbing' },
  { value: 'time_crunched', label: 'Time Crunched' },
  { value: 'comeback', label: 'Comeback / Return to Fitness' },
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'social', label: 'Social / Fun' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'mixed', label: 'Mixed Levels Welcome' },
];

const MOOD_DISPLAY = {
  struggling: { emoji: '😓', label: 'Struggling', color: 'red' },
  okay: { emoji: '😐', label: 'Okay', color: 'yellow' },
  good: { emoji: '🙂', label: 'Good', color: 'blue' },
  great: { emoji: '😊', label: 'Great', color: 'green' },
  crushing_it: { emoji: '🔥', label: 'Crushing it', color: 'lime' },
};

function CommunityPage() {
  const { user } = useAuth();
  const {
    pods,
    activePod,
    checkIns,
    loading,
    error,
    currentWeekStart,
    hasCheckedInThisWeek,
    podCheckInCount,
    loadPods,
    loadCheckIns,
    createCheckIn,
    joinPod,
    leavePod,
    createPod,
    findMatchingPods,
    addEncouragement,
  } = useCommunity({ userId: user?.id });

  const [activeTab, setActiveTab] = useState('pod');
  const [matchingPods, setMatchingPods] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [findModalOpened, { open: openFindModal, close: closeFindModal }] = useDisclosure(false);

  // New pod form state
  const [newPod, setNewPod] = useState({
    name: '',
    description: '',
    goal_type: 'general_fitness',
    experience_level: 'mixed',
    max_members: 8,
  });

  // Search filters
  const [searchGoal, setSearchGoal] = useState(null);
  const [searchLevel, setSearchLevel] = useState(null);

  // Search for matching pods
  const handleSearch = async () => {
    setSearchLoading(true);
    try {
      const results = await findMatchingPods(searchGoal, searchLevel);
      setMatchingPods(results);
    } finally {
      setSearchLoading(false);
    }
  };

  // Open find modal and search
  const handleOpenFind = async () => {
    openFindModal();
    await handleSearch();
  };

  // Create new pod
  const handleCreatePod = async () => {
    if (!newPod.name.trim()) {
      notifications.show({
        title: 'Name required',
        message: 'Please enter a name for your pod',
        color: 'red',
      });
      return;
    }

    const result = await createPod(newPod);
    if (result) {
      notifications.show({
        title: 'Pod created',
        message: `${result.name} has been created. You're now the admin.`,
        color: 'green',
      });
      closeCreateModal();
      setNewPod({
        name: '',
        description: '',
        goal_type: 'general_fitness',
        experience_level: 'mixed',
        max_members: 8,
      });
    }
  };

  // Join a pod
  const handleJoinPod = async (podId, podName) => {
    const success = await joinPod(podId);
    if (success) {
      notifications.show({
        title: 'Joined pod',
        message: `You've joined ${podName}`,
        color: 'green',
      });
      closeFindModal();
    }
  };

  // Submit check-in
  const handleCheckIn = async (data) => {
    if (!activePod) return;

    const success = await createCheckIn(activePod.pod_id, data);
    if (success) {
      notifications.show({
        title: 'Check-in shared',
        message: 'Your pod can now see your update',
        color: 'green',
      });
    }
  };

  // Add encouragement to a check-in
  const handleEncourage = async (checkInId) => {
    await addEncouragement(checkInId, 'encourage');
  };

  // Calculate week stats from activities (would be passed from Dashboard in real use)
  const weekStats = {
    rides: 3,
    hours: 4.5,
    tss: 180,
  };

  const pod = activePod?.pod;

  return (
    <AppShell>
      <Container size="lg" py="xl">
        <PageHeader
          title="Community"
          subtitle="Your accountability pod and training community"
        />

        {loading ? (
          <Stack gap="md">
            <Skeleton height={200} radius="md" />
            <Skeleton height={300} radius="md" />
          </Stack>
        ) : !pod ? (
          // No pod - show discovery/creation
          <NoPodView
            onFind={handleOpenFind}
            onCreate={openCreateModal}
          />
        ) : (
          // Has pod - show pod view
          <Stack gap="lg">
            {/* Pod header */}
            <Card
              padding="lg"
              radius="md"
              style={{
                backgroundColor: tokens.colors.bgSecondary,
                border: `1px solid ${tokens.colors.bgTertiary}`,
              }}
            >
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="sm" mb="xs">
                    <IconUsers size={24} color={tokens.colors.electricLime} />
                    <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                      {pod.name}
                    </Title>
                  </Group>
                  {pod.description && (
                    <Text size="sm" c="dimmed" mb="sm">
                      {pod.description}
                    </Text>
                  )}
                  <Group gap="xs">
                    <Badge variant="light" color="gray">
                      {GOAL_OPTIONS.find(g => g.value === pod.goal_type)?.label || pod.goal_type}
                    </Badge>
                    <Badge variant="light" color="gray">
                      {EXPERIENCE_OPTIONS.find(e => e.value === pod.experience_level)?.label || pod.experience_level}
                    </Badge>
                    <Badge variant="light" color="gray">
                      {pod.member_count} / {pod.max_members} members
                    </Badge>
                  </Group>
                </Box>
                <Button
                  variant="subtle"
                  size="xs"
                  color="gray"
                  leftSection={<IconSettings size={14} />}
                >
                  Settings
                </Button>
              </Group>
            </Card>

            {/* Check-in prompt (if not checked in) */}
            {!hasCheckedInThisWeek && (
              <WeeklyCheckInWidget
                podName={pod.name}
                hasCheckedIn={hasCheckedInThisWeek}
                weekStats={weekStats}
                onSubmit={handleCheckIn}
              />
            )}

            {/* Tabs for pod content */}
            <Tabs value={activeTab} onChange={setActiveTab}>
              <Tabs.List>
                <Tabs.Tab value="pod" leftSection={<IconMessageCircle size={16} />}>
                  Check-Ins
                </Tabs.Tab>
                <Tabs.Tab value="members" leftSection={<IconUsers size={16} />}>
                  Members
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="pod" pt="md">
                <Stack gap="md">
                  {/* This week's check-ins */}
                  <Box>
                    <Group justify="space-between" mb="sm">
                      <Text size="sm" fw={500}>This Week</Text>
                      <Text size="xs" c="dimmed">
                        {podCheckInCount} of {pod.member_count} checked in
                      </Text>
                    </Group>

                    {checkIns.filter(c => c.week_start === currentWeekStart).length === 0 ? (
                      <Card
                        padding="lg"
                        radius="md"
                        style={{
                          backgroundColor: tokens.colors.bgSecondary,
                          border: `1px dashed ${tokens.colors.bgTertiary}`,
                          textAlign: 'center',
                        }}
                      >
                        <Text size="sm" c="dimmed">
                          No check-ins yet this week. Be the first to share.
                        </Text>
                      </Card>
                    ) : (
                      <Stack gap="sm">
                        {checkIns
                          .filter(c => c.week_start === currentWeekStart)
                          .map(checkIn => (
                            <CheckInCard
                              key={checkIn.id}
                              checkIn={checkIn}
                              isOwn={checkIn.user_id === user?.id}
                              onEncourage={() => handleEncourage(checkIn.id)}
                            />
                          ))}
                      </Stack>
                    )}
                  </Box>

                  {/* Previous weeks */}
                  <Divider label="Previous Weeks" labelPosition="center" />

                  <Stack gap="sm">
                    {checkIns
                      .filter(c => c.week_start !== currentWeekStart)
                      .map(checkIn => (
                        <CheckInCard
                          key={checkIn.id}
                          checkIn={checkIn}
                          isOwn={checkIn.user_id === user?.id}
                          onEncourage={() => handleEncourage(checkIn.id)}
                          compact
                        />
                      ))}
                  </Stack>

                  {checkIns.filter(c => c.week_start !== currentWeekStart).length === 0 && (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No previous check-ins yet.
                    </Text>
                  )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="members" pt="md">
                <Text size="sm" c="dimmed">
                  Member list coming soon...
                </Text>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        )}
      </Container>

      {/* Find Pod Modal */}
      <Modal
        opened={findModalOpened}
        onClose={closeFindModal}
        title="Find a Pod"
        size="lg"
        styles={{
          header: {
            backgroundColor: tokens.colors.bgSecondary,
          },
          content: {
            backgroundColor: tokens.colors.bgSecondary,
          },
          title: {
            color: tokens.colors.textPrimary,
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Find a pod that matches your goals and experience level.
          </Text>

          <Group grow>
            <Select
              label="Goal"
              placeholder="Any goal"
              value={searchGoal}
              onChange={setSearchGoal}
              data={GOAL_OPTIONS}
              clearable
              styles={{
                input: { backgroundColor: tokens.colors.bgTertiary },
              }}
            />
            <Select
              label="Experience"
              placeholder="Any level"
              value={searchLevel}
              onChange={setSearchLevel}
              data={EXPERIENCE_OPTIONS}
              clearable
              styles={{
                input: { backgroundColor: tokens.colors.bgTertiary },
              }}
            />
          </Group>

          <Button
            variant="light"
            onClick={handleSearch}
            loading={searchLoading}
            leftSection={<IconSearch size={16} />}
          >
            Search
          </Button>

          <Divider />

          {matchingPods.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              {searchLoading ? 'Searching...' : 'No matching pods found. Try different filters or create your own.'}
            </Text>
          ) : (
            <Stack gap="sm">
              {matchingPods.map(pod => (
                <Card
                  key={pod.pod_id}
                  padding="md"
                  radius="md"
                  style={{
                    backgroundColor: tokens.colors.bgTertiary,
                  }}
                >
                  <Group justify="space-between">
                    <Box>
                      <Text fw={500}>{pod.pod_name}</Text>
                      {pod.pod_description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {pod.pod_description}
                        </Text>
                      )}
                      <Group gap="xs" mt="xs">
                        <Badge size="xs" variant="light">
                          {GOAL_OPTIONS.find(g => g.value === pod.goal_type)?.label}
                        </Badge>
                        <Badge size="xs" variant="light">
                          {pod.member_count} / {pod.max_members}
                        </Badge>
                      </Group>
                    </Box>
                    <Button
                      size="xs"
                      onClick={() => handleJoinPod(pod.pod_id, pod.pod_name)}
                      style={{
                        backgroundColor: tokens.colors.electricLime,
                        color: tokens.colors.bgPrimary,
                      }}
                    >
                      Join
                    </Button>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}

          <Divider label="or" labelPosition="center" />

          <Button
            variant="outline"
            onClick={() => {
              closeFindModal();
              openCreateModal();
            }}
            leftSection={<IconPlus size={16} />}
          >
            Create Your Own Pod
          </Button>
        </Stack>
      </Modal>

      {/* Create Pod Modal */}
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Create a Pod"
        styles={{
          header: {
            backgroundColor: tokens.colors.bgSecondary,
          },
          content: {
            backgroundColor: tokens.colors.bgSecondary,
          },
          title: {
            color: tokens.colors.textPrimary,
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Pod Name"
            placeholder="e.g., 'Century Chasers' or 'Morning Riders'"
            value={newPod.name}
            onChange={(e) => setNewPod({ ...newPod, name: e.target.value })}
            required
            styles={{
              input: { backgroundColor: tokens.colors.bgTertiary },
            }}
          />

          <Textarea
            label="Description (optional)"
            placeholder="What is this pod about?"
            value={newPod.description}
            onChange={(e) => setNewPod({ ...newPod, description: e.target.value })}
            styles={{
              input: { backgroundColor: tokens.colors.bgTertiary },
            }}
          />

          <Select
            label="Primary Goal"
            value={newPod.goal_type}
            onChange={(val) => setNewPod({ ...newPod, goal_type: val })}
            data={GOAL_OPTIONS}
            styles={{
              input: { backgroundColor: tokens.colors.bgTertiary },
            }}
          />

          <Select
            label="Experience Level"
            value={newPod.experience_level}
            onChange={(val) => setNewPod({ ...newPod, experience_level: val })}
            data={EXPERIENCE_OPTIONS}
            styles={{
              input: { backgroundColor: tokens.colors.bgTertiary },
            }}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeCreateModal}>Cancel</Button>
            <Button
              onClick={handleCreatePod}
              style={{
                backgroundColor: tokens.colors.electricLime,
                color: tokens.colors.bgPrimary,
              }}
            >
              Create Pod
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  );
}

// No pod view component
function NoPodView({ onFind, onCreate }) {
  return (
    <Card
      padding="xl"
      radius="md"
      style={{
        backgroundColor: tokens.colors.bgSecondary,
        border: `1px solid ${tokens.colors.bgTertiary}`,
        textAlign: 'center',
      }}
    >
      <Stack gap="lg" align="center">
        <IconUsers size={48} color={tokens.colors.textMuted} />

        <Box>
          <Title order={3} mb="xs" style={{ color: tokens.colors.textPrimary }}>
            Join an Accountability Pod
          </Title>
          <Text size="sm" c="dimmed" maw={400} mx="auto">
            Pods are small groups (5-10 cyclists) with similar goals.
            Share weekly check-ins, support each other, and stay accountable.
          </Text>
        </Box>

        <SimpleGrid cols={2} spacing="md" style={{ maxWidth: 400 }}>
          <FeatureItem
            icon={IconTarget}
            title="Goal-Matched"
            description="Find riders with similar objectives"
          />
          <FeatureItem
            icon={IconMessageCircle}
            title="Weekly Check-Ins"
            description="Share reflections, not ride spam"
          />
          <FeatureItem
            icon={IconHeart}
            title="Supportive"
            description="Encouragement over competition"
          />
          <FeatureItem
            icon={IconTrophy}
            title="Accountable"
            description="Stay consistent together"
          />
        </SimpleGrid>

        <Group>
          <Button
            size="md"
            onClick={onFind}
            style={{
              backgroundColor: tokens.colors.electricLime,
              color: tokens.colors.bgPrimary,
            }}
            leftSection={<IconSearch size={18} />}
          >
            Find a Pod
          </Button>
          <Button
            size="md"
            variant="outline"
            onClick={onCreate}
            leftSection={<IconPlus size={18} />}
          >
            Create One
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

// Feature item for no pod view
function FeatureItem({ icon: Icon, title, description }) {
  return (
    <Box ta="left">
      <Icon size={20} color={tokens.colors.electricLime} style={{ marginBottom: 4 }} />
      <Text size="sm" fw={500}>{title}</Text>
      <Text size="xs" c="dimmed">{description}</Text>
    </Box>
  );
}

// Check-in card component
function CheckInCard({ checkIn, isOwn, onEncourage, compact = false }) {
  const mood = MOOD_DISPLAY[checkIn.training_mood] || null;
  const displayName = checkIn.user_profile?.community_display_name ||
                      checkIn.user_profile?.display_name ||
                      'Rider';

  return (
    <Card
      padding={compact ? 'sm' : 'md'}
      radius="md"
      style={{
        backgroundColor: tokens.colors.bgSecondary,
        border: `1px solid ${isOwn ? tokens.colors.electricLime + '40' : tokens.colors.bgTertiary}`,
      }}
    >
      <Stack gap="xs">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="sm">
            <Avatar size={compact ? 'sm' : 'md'} radius="xl" color="gray">
              {displayName.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Text size="sm" fw={500}>{displayName}</Text>
              <Text size="xs" c="dimmed">
                {new Date(checkIn.created_at).toLocaleDateString()}
              </Text>
            </Box>
          </Group>
          {mood && (
            <Badge
              variant="light"
              color={mood.color}
              size={compact ? 'xs' : 'sm'}
            >
              {mood.emoji} {mood.label}
            </Badge>
          )}
        </Group>

        {/* Stats */}
        {!compact && (
          <Group gap="lg">
            <Box>
              <Text size="lg" fw={600}>{checkIn.rides_completed}</Text>
              <Text size="xs" c="dimmed">rides</Text>
            </Box>
            {checkIn.total_hours && (
              <Box>
                <Text size="lg" fw={600}>{checkIn.total_hours.toFixed(1)}</Text>
                <Text size="xs" c="dimmed">hours</Text>
              </Box>
            )}
            {checkIn.total_tss > 0 && (
              <Box>
                <Text size="lg" fw={600}>{checkIn.total_tss}</Text>
                <Text size="xs" c="dimmed">TSS</Text>
              </Box>
            )}
          </Group>
        )}

        {/* Reflection */}
        {checkIn.reflection && (
          <Text size="sm" c="dimmed">
            {checkIn.reflection}
          </Text>
        )}

        {/* Next week focus */}
        {checkIn.next_week_focus && !compact && (
          <Box
            p="xs"
            style={{
              backgroundColor: tokens.colors.bgTertiary,
              borderRadius: 8,
            }}
          >
            <Text size="xs" c="dimmed" mb={2}>Next week's focus:</Text>
            <Text size="sm">{checkIn.next_week_focus}</Text>
          </Box>
        )}

        {/* Actions */}
        <Group justify="space-between">
          <Group gap="xs">
            {checkIn.encouragement_count > 0 && (
              <Badge size="xs" variant="light" color="pink">
                {checkIn.encouragement_count} encouragements
              </Badge>
            )}
          </Group>
          {!isOwn && (
            <Tooltip label="Send encouragement">
              <ActionIcon
                variant="subtle"
                color="pink"
                onClick={onEncourage}
              >
                <IconHeart size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

export default CommunityPage;
