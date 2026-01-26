/**
 * CommunityPage
 * Full community experience - The Cafe view, check-ins, cafe discovery
 * "The Cafe" - named after cycling's tradition of cafe stops where riders gather
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
  IconCoffee,
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
import { useDiscussions, CATEGORY_LABELS } from '../hooks/useDiscussions';
import AppShell from '../components/AppShell';
import PageHeader from '../components/PageHeader';
import { WeeklyCheckInWidget, DiscussionList, DiscussionThread, CafeSettingsModal } from '../components/community';
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
    cafes,
    activeCafe,
    checkIns,
    loading,
    error,
    currentWeekStart,
    hasCheckedInThisWeek,
    cafeCheckInCount,
    loadCafes,
    loadCheckIns,
    createCheckIn,
    joinCafe,
    leaveCafe,
    createCafe,
    findMatchingCafes,
    addEncouragement,
    updateCafe,
    deleteCafe,
    loadCafeMembers,
    removeMember,
    updateMemberRole,
    isUserAdmin,
  } = useCommunity({ userId: user?.id });

  // Get cafe ID for discussions
  const cafeId = activeCafe?.cafe_id || null;

  // Discussion hook
  const {
    discussions,
    activeDiscussion,
    replies,
    loading: discussionsLoading,
    loadDiscussions,
    loadDiscussion,
    loadReplies,
    createDiscussion,
    createReply,
    markHelpful,
    unmarkHelpful,
    deleteReply,
    clearActiveDiscussion,
  } = useDiscussions({ cafeId, userId: user?.id });

  const [activeTab, setActiveTab] = useState('cafe');
  const [discussionCategory, setDiscussionCategory] = useState('');
  const [matchingCafes, setMatchingCafes] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [findModalOpened, { open: openFindModal, close: closeFindModal }] = useDisclosure(false);
  const [newDiscussionModalOpened, { open: openNewDiscussionModal, close: closeNewDiscussionModal }] = useDisclosure(false);
  const [settingsModalOpened, { open: openSettingsModal, close: closeSettingsModal }] = useDisclosure(false);

  // New cafe form state
  const [newCafe, setNewCafe] = useState({
    name: '',
    description: '',
    goal_type: 'general_fitness',
    experience_level: 'mixed',
    max_members: 8,
  });

  // Search filters
  const [searchGoal, setSearchGoal] = useState(null);
  const [searchLevel, setSearchLevel] = useState(null);

  // New discussion form state
  const [newDiscussion, setNewDiscussion] = useState({
    title: '',
    body: '',
    category: 'general',
  });

  // Search for matching cafes
  const handleSearch = async () => {
    setSearchLoading(true);
    try {
      const results = await findMatchingCafes(searchGoal, searchLevel);
      setMatchingCafes(results);
    } finally {
      setSearchLoading(false);
    }
  };

  // Open find modal and search
  const handleOpenFind = async () => {
    openFindModal();
    await handleSearch();
  };

  // Create new cafe
  const handleCreateCafe = async () => {
    if (!newCafe.name.trim()) {
      notifications.show({
        title: 'Name required',
        message: 'Please enter a name for your cafe',
        color: 'red',
      });
      return;
    }

    const result = await createCafe(newCafe);
    if (result) {
      notifications.show({
        title: 'Cafe created',
        message: `${result.name} has been created. You're now the admin.`,
        color: 'green',
      });
      closeCreateModal();
      setNewCafe({
        name: '',
        description: '',
        goal_type: 'general_fitness',
        experience_level: 'mixed',
        max_members: 8,
      });
    }
  };

  // Join a cafe
  const handleJoinCafe = async (cafeId, cafeName) => {
    const success = await joinCafe(cafeId);
    if (success) {
      notifications.show({
        title: 'Joined cafe',
        message: `You've joined ${cafeName}`,
        color: 'green',
      });
      closeFindModal();
    }
  };

  // Submit check-in
  const handleCheckIn = async (data) => {
    if (!activeCafe) return;

    const success = await createCheckIn(activeCafe.cafe_id, data);
    if (success) {
      notifications.show({
        title: 'Check-in shared',
        message: 'Your cafe can now see your update',
        color: 'green',
      });
    }
  };

  // Add encouragement to a check-in
  const handleEncourage = async (checkInId) => {
    await addEncouragement(checkInId, 'encourage');
  };

  // Load discussions when tab changes to discussions
  const handleTabChange = (value) => {
    setActiveTab(value);
    if (value === 'discussions' && cafeId) {
      loadDiscussions(discussionCategory || undefined);
    }
  };

  // Handle discussion category filter change
  const handleDiscussionCategoryChange = (category) => {
    setDiscussionCategory(category);
    loadDiscussions(category || undefined);
  };

  // Select a discussion to view
  const handleSelectDiscussion = async (discussion) => {
    await loadDiscussion(discussion.id);
    await loadReplies(discussion.id);
  };

  // Go back to discussion list
  const handleBackToList = () => {
    clearActiveDiscussion();
  };

  // Create new discussion
  const handleCreateDiscussion = async () => {
    if (!newDiscussion.title.trim() || !newDiscussion.body.trim()) {
      notifications.show({
        title: 'Missing fields',
        message: 'Please enter a title and body for your discussion',
        color: 'red',
      });
      return;
    }

    const result = await createDiscussion(newDiscussion);
    if (result) {
      notifications.show({
        title: 'Discussion created',
        message: 'Your discussion has been posted',
        color: 'green',
      });
      closeNewDiscussionModal();
      setNewDiscussion({ title: '', body: '', category: 'general' });
    }
  };

  // Create a reply
  const handleCreateReply = async (data) => {
    if (!activeDiscussion) return;
    await createReply(activeDiscussion.id, data);
  };

  // Calculate week stats from activities (would be passed from Dashboard in real use)
  const weekStats = {
    rides: 3,
    hours: 4.5,
    tss: 180,
  };

  const cafe = activeCafe?.cafe;

  return (
    <AppShell>
      <Container size="lg" py="xl">
        <PageHeader
          title="The Cafe"
          subtitle="Your cycling community and accountability group"
        />

        {loading ? (
          <Stack gap="md">
            <Skeleton height={200} radius="md" />
            <Skeleton height={300} radius="md" />
          </Stack>
        ) : !cafe ? (
          // No cafe - show discovery/creation
          <NoCafeView
            onFind={handleOpenFind}
            onCreate={openCreateModal}
          />
        ) : (
          // Has cafe - show cafe view
          <Stack gap="lg">
            {/* Cafe header */}
            <Card
              padding="lg"
              radius="md"
              style={{
                backgroundColor: 'var(--tribos-bg-secondary)',
                border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
              }}
            >
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="sm" mb="xs">
                    <IconCoffee size={24} color={'var(--tribos-lime)'} />
                    <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                      {cafe.name}
                    </Title>
                  </Group>
                  {cafe.description && (
                    <Text size="sm" c="dimmed" mb="sm">
                      {cafe.description}
                    </Text>
                  )}
                  <Group gap="xs">
                    <Badge variant="light" color="gray">
                      {GOAL_OPTIONS.find(g => g.value === cafe.goal_type)?.label || cafe.goal_type}
                    </Badge>
                    <Badge variant="light" color="gray">
                      {EXPERIENCE_OPTIONS.find(e => e.value === cafe.experience_level)?.label || cafe.experience_level}
                    </Badge>
                    <Badge variant="light" color="gray">
                      {cafe.member_count} / {cafe.max_members} members
                    </Badge>
                  </Group>
                </Box>
                <Button
                  variant="subtle"
                  size="xs"
                  color="gray"
                  leftSection={<IconSettings size={14} />}
                  onClick={openSettingsModal}
                >
                  Settings
                </Button>
              </Group>
            </Card>

            {/* Check-in prompt (if not checked in) */}
            {!hasCheckedInThisWeek && (
              <WeeklyCheckInWidget
                cafeName={cafe.name}
                hasCheckedIn={hasCheckedInThisWeek}
                weekStats={weekStats}
                onSubmit={handleCheckIn}
              />
            )}

            {/* Tabs for cafe content */}
            <Tabs value={activeTab} onChange={handleTabChange}>
              <Tabs.List>
                <Tabs.Tab value="cafe" leftSection={<IconHeart size={16} />}>
                  Check-Ins
                </Tabs.Tab>
                <Tabs.Tab value="discussions" leftSection={<IconMessageCircle size={16} />}>
                  Discussions
                </Tabs.Tab>
                <Tabs.Tab value="members" leftSection={<IconCoffee size={16} />}>
                  Members
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="cafe" pt="md">
                <Stack gap="md">
                  {/* This week's check-ins */}
                  <Box>
                    <Group justify="space-between" mb="sm">
                      <Text size="sm" fw={500}>This Week</Text>
                      <Text size="xs" c="dimmed">
                        {cafeCheckInCount} of {cafe.member_count} checked in
                      </Text>
                    </Group>

                    {checkIns.filter(c => c.week_start === currentWeekStart).length === 0 ? (
                      <Card
                        padding="lg"
                        radius="md"
                        style={{
                          backgroundColor: 'var(--tribos-bg-secondary)',
                          border: `1px dashed ${'var(--tribos-bg-tertiary)'}`,
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

              <Tabs.Panel value="discussions" pt="md">
                <Stack gap="md">
                  {/* New Discussion Button */}
                  <Group justify="flex-end">
                    <Button
                      size="sm"
                      leftSection={<IconPlus size={16} />}
                      onClick={openNewDiscussionModal}
                      style={{
                        backgroundColor: 'var(--tribos-lime)',
                        color: 'var(--tribos-bg-primary)',
                      }}
                    >
                      New Discussion
                    </Button>
                  </Group>

                  {/* Discussion Thread View or List */}
                  {activeDiscussion ? (
                    <DiscussionThread
                      discussion={activeDiscussion}
                      replies={replies}
                      currentUserId={user?.id}
                      onBack={handleBackToList}
                      onCreateReply={handleCreateReply}
                      onMarkHelpful={markHelpful}
                      onUnmarkHelpful={unmarkHelpful}
                      onDeleteReply={deleteReply}
                      loading={discussionsLoading}
                    />
                  ) : (
                    <DiscussionList
                      discussions={discussions}
                      loading={discussionsLoading}
                      selectedCategory={discussionCategory}
                      onCategoryChange={handleDiscussionCategoryChange}
                      onSelectDiscussion={handleSelectDiscussion}
                    />
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

      {/* Find Cafe Modal */}
      <Modal
        opened={findModalOpened}
        onClose={closeFindModal}
        title="Find a Cafe"
        size="lg"
        styles={{
          header: {
            backgroundColor: 'var(--tribos-bg-secondary)',
          },
          content: {
            backgroundColor: 'var(--tribos-bg-secondary)',
          },
          title: {
            color: 'var(--tribos-text-primary)',
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Find a cafe that matches your goals and experience level.
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
                input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
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
                input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
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

          {matchingCafes.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              {searchLoading ? 'Searching...' : 'No matching cafes found. Try different filters or create your own.'}
            </Text>
          ) : (
            <Stack gap="sm">
              {matchingCafes.map(cafe => (
                <Card
                  key={cafe.cafe_id}
                  padding="md"
                  radius="md"
                  style={{
                    backgroundColor: 'var(--tribos-bg-tertiary)',
                  }}
                >
                  <Group justify="space-between">
                    <Box>
                      <Text fw={500}>{cafe.cafe_name}</Text>
                      {cafe.cafe_description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {cafe.cafe_description}
                        </Text>
                      )}
                      <Group gap="xs" mt="xs">
                        <Badge size="xs" variant="light">
                          {GOAL_OPTIONS.find(g => g.value === cafe.goal_type)?.label}
                        </Badge>
                        <Badge size="xs" variant="light">
                          {cafe.member_count} / {cafe.max_members}
                        </Badge>
                      </Group>
                    </Box>
                    <Button
                      size="xs"
                      onClick={() => handleJoinCafe(cafe.cafe_id, cafe.cafe_name)}
                      style={{
                        backgroundColor: 'var(--tribos-lime)',
                        color: 'var(--tribos-bg-primary)',
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
            Create Your Own Cafe
          </Button>
        </Stack>
      </Modal>

      {/* Create Cafe Modal */}
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Create a Cafe"
        styles={{
          header: {
            backgroundColor: 'var(--tribos-bg-secondary)',
          },
          content: {
            backgroundColor: 'var(--tribos-bg-secondary)',
          },
          title: {
            color: 'var(--tribos-text-primary)',
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Cafe Name"
            placeholder="e.g., 'Century Chasers' or 'Morning Espresso Riders'"
            value={newCafe.name}
            onChange={(e) => setNewCafe({ ...newCafe, name: e.target.value })}
            required
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Textarea
            label="Description (optional)"
            placeholder="What is this cafe about?"
            value={newCafe.description}
            onChange={(e) => setNewCafe({ ...newCafe, description: e.target.value })}
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Select
            label="Primary Goal"
            value={newCafe.goal_type}
            onChange={(val) => setNewCafe({ ...newCafe, goal_type: val })}
            data={GOAL_OPTIONS}
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Select
            label="Experience Level"
            value={newCafe.experience_level}
            onChange={(val) => setNewCafe({ ...newCafe, experience_level: val })}
            data={EXPERIENCE_OPTIONS}
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeCreateModal}>Cancel</Button>
            <Button
              onClick={handleCreateCafe}
              style={{
                backgroundColor: 'var(--tribos-lime)',
                color: 'var(--tribos-bg-primary)',
              }}
            >
              Create Cafe
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* New Discussion Modal */}
      <Modal
        opened={newDiscussionModalOpened}
        onClose={closeNewDiscussionModal}
        title="Start a Discussion"
        size="lg"
        styles={{
          header: {
            backgroundColor: 'var(--tribos-bg-secondary)',
          },
          content: {
            backgroundColor: 'var(--tribos-bg-secondary)',
          },
          title: {
            color: 'var(--tribos-text-primary)',
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="What do you want to discuss?"
            value={newDiscussion.title}
            onChange={(e) => setNewDiscussion({ ...newDiscussion, title: e.target.value })}
            required
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Select
            label="Category"
            value={newDiscussion.category}
            onChange={(val) => setNewDiscussion({ ...newDiscussion, category: val })}
            data={[
              { value: 'general', label: 'General' },
              { value: 'training', label: 'Training' },
              { value: 'nutrition', label: 'Nutrition' },
              { value: 'gear', label: 'Gear' },
              { value: 'motivation', label: 'Motivation' },
              { value: 'race_prep', label: 'Race Prep' },
              { value: 'recovery', label: 'Recovery' },
              { value: 'question', label: 'Question' },
            ]}
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Textarea
            label="Body"
            placeholder="Share your thoughts, questions, or experiences..."
            value={newDiscussion.body}
            onChange={(e) => setNewDiscussion({ ...newDiscussion, body: e.target.value })}
            minRows={4}
            required
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeNewDiscussionModal}>Cancel</Button>
            <Button
              onClick={handleCreateDiscussion}
              style={{
                backgroundColor: 'var(--tribos-lime)',
                color: 'var(--tribos-bg-primary)',
              }}
            >
              Post Discussion
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Cafe Settings Modal */}
      <CafeSettingsModal
        opened={settingsModalOpened}
        onClose={closeSettingsModal}
        cafe={activeCafe}
        isAdmin={isUserAdmin(activeCafe)}
        currentUserId={user?.id}
        onUpdateCafe={updateCafe}
        onDeleteCafe={deleteCafe}
        onLeaveCafe={leaveCafe}
        onLoadMembers={loadCafeMembers}
        onRemoveMember={removeMember}
        onUpdateMemberRole={updateMemberRole}
      />
    </AppShell>
  );
}

// No cafe view component
function NoCafeView({ onFind, onCreate }) {
  return (
    <Card
      padding="xl"
      radius="md"
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
        textAlign: 'center',
      }}
    >
      <Stack gap="lg" align="center">
        <IconCoffee size={48} color={'var(--tribos-text-muted)'} />

        <Box>
          <Title order={3} mb="xs" style={{ color: 'var(--tribos-text-primary)' }}>
            Find Your Cafe
          </Title>
          <Text size="sm" c="dimmed" maw={400} mx="auto">
            Cafes are small groups (5-10 cyclists) with similar goals.
            Share weekly check-ins, support each other, and stay accountable -
            just like meeting up at your favorite cafe stop.
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
              backgroundColor: 'var(--tribos-lime)',
              color: 'var(--tribos-bg-primary)',
            }}
            leftSection={<IconSearch size={18} />}
          >
            Find a Cafe
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

// Feature item for no cafe view
function FeatureItem({ icon: Icon, title, description }) {
  return (
    <Box ta="left">
      <Icon size={20} color={'var(--tribos-lime)'} style={{ marginBottom: 4 }} />
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
        backgroundColor: 'var(--tribos-bg-secondary)',
        border: `1px solid ${isOwn ? 'var(--tribos-lime)' + '40' : 'var(--tribos-bg-tertiary)'}`,
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
              backgroundColor: 'var(--tribos-bg-tertiary)',
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
