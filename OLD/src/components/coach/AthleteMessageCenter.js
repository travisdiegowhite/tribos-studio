import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Stack,
  Group,
  Avatar,
  Badge,
  TextInput,
  Paper,
  ActionIcon,
  LoadingOverlay,
  Alert,
  Center,
  Button,
} from '@mantine/core';
import {
  MessageCircle,
  Search,
  Send,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import coachService from '../../services/coachService';
import { formatDistanceToNow } from 'date-fns';

/**
 * Athlete Message Center
 * Inbox for athletes to view all conversations with their coaches
 */
const AthleteMessageCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [coaches, setCoaches] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    if (!user) return;
    loadCoaches();
  }, [user]);

  const loadCoaches = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get all active coach relationships
      const { data, error: fetchError } = await coachService.getCoaches(user.id, 'active');

      if (fetchError) throw fetchError;

      setCoaches(data || []);

      // Load unread counts for all coach relationships in a single query
      if (data && data.length > 0) {
        const relationshipIds = data.map(rel => rel.id);
        const { data: counts } = await coachService.getAllUnreadCounts(user.id, relationshipIds);
        setUnreadCounts(counts || {});
      }
    } catch (err) {
      console.error('Error loading coaches:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConversation = (relationshipId, coachName) => {
    navigate(`/messages/${relationshipId}`, { state: { coachName } });
  };

  const filteredCoaches = coaches.filter(rel => {
    const coach = rel.coach;
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      coach?.display_name?.toLowerCase().includes(query) ||
      coach?.coach_bio?.toLowerCase().includes(query) ||
      rel.coach_id?.toLowerCase().includes(query)
    );
  });

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <LoadingOverlay visible />
        <div style={{ height: 400 }} />
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
    <Container size="lg" py="xl">
      <Stack spacing="xl">
        {/* Header */}
        <div>
          <Group spacing="xs" mb="xs">
            <MessageCircle size={28} />
            <Title order={1}>Messages</Title>
            {totalUnread > 0 && (
              <Badge size="lg" variant="filled" color="red" circle>
                {totalUnread}
              </Badge>
            )}
          </Group>
          <Text c="dimmed">
            Communicate with your coaches
          </Text>
        </div>

        {/* Search */}
        <TextInput
          placeholder="Search coaches..."
          icon={<Search size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="md"
        />

        {/* Conversations List */}
        {filteredCoaches.length === 0 ? (
          <Paper p="xl" withBorder>
            <Center>
              <Stack align="center" spacing="md">
                <Inbox size={48} color="var(--mantine-color-gray-5)" />
                <Stack align="center" spacing={4}>
                  <Text weight={500} size="lg">
                    {coaches.length === 0 ? 'No coaches yet' : 'No results found'}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {coaches.length === 0
                      ? 'Accept a coach invitation to start messaging'
                      : 'Try a different search term'}
                  </Text>
                </Stack>
                {coaches.length === 0 && (
                  <Button
                    variant="light"
                    onClick={() => navigate('/training')}
                  >
                    Go to Training Dashboard
                  </Button>
                )}
              </Stack>
            </Center>
          </Paper>
        ) : (
          <Stack spacing="md">
            {filteredCoaches.map((relationship) => {
              const coach = relationship.coach;
              const coachName = coach?.display_name || 'Unknown Coach';
              const unreadCount = unreadCounts[relationship.id] || 0;

              return (
                <Card
                  key={relationship.id}
                  shadow="sm"
                  p="md"
                  radius="md"
                  withBorder
                  style={{
                    cursor: 'pointer',
                    backgroundColor: unreadCount > 0 ? 'var(--mantine-color-blue-0)' : undefined,
                  }}
                  onClick={() => handleOpenConversation(relationship.id, coachName)}
                >
                  <Group position="apart">
                    <Group>
                      <Avatar
                        src={coach?.avatar_url}
                        radius="xl"
                        size="lg"
                        color="blue"
                      >
                        {coachName[0]}
                      </Avatar>
                      <div>
                        <Group spacing="xs">
                          <Text weight={500} size="md">
                            {coachName}
                          </Text>
                          {unreadCount > 0 && (
                            <Badge size="sm" variant="filled" color="red" circle>
                              {unreadCount}
                            </Badge>
                          )}
                        </Group>
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {coach?.coach_bio || coach?.location_name || 'Your coach'}
                        </Text>
                      </div>
                    </Group>

                    <Group spacing="xs">
                      <Badge variant="light" color="blue">
                        Active
                      </Badge>
                      <ActionIcon
                        size="lg"
                        variant="light"
                        color="blue"
                      >
                        <Send size={18} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}

        {/* Info */}
        {coaches.length > 0 && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              Click on a coach to view your conversation. You can discuss your training,
              ask questions, and receive personalized feedback.
            </Text>
          </Alert>
        )}
      </Stack>
    </Container>
  );
};

export default AthleteMessageCenter;
