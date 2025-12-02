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
 * Coach Messages Hub
 * Overview of all conversations with athletes
 */
const CoachMessages = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadAthletes();
  }, [user]);

  const loadAthletes = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get all active athletes
      const { data, error: fetchError } = await coachService.getAthletes(user.id, 'active');

      if (fetchError) throw fetchError;

      setAthletes(data || []);
    } catch (err) {
      console.error('Error loading athletes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConversation = (relationshipId, athleteName) => {
    navigate(`/coach/messages/${relationshipId}`, { state: { athleteName } });
  };

  const filteredAthletes = athletes.filter(rel => {
    const athlete = rel.athlete;
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      athlete?.display_name?.toLowerCase().includes(query) ||
      rel.athlete_id?.toLowerCase().includes(query)
    );
  });

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
          </Group>
          <Text c="dimmed">
            Communicate with your athletes
          </Text>
        </div>

        {/* Search */}
        <TextInput
          placeholder="Search athletes..."
          icon={<Search size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="md"
        />

        {/* Conversations List */}
        {filteredAthletes.length === 0 ? (
          <Paper p="xl" withBorder>
            <Center>
              <Stack align="center" spacing="md">
                <Inbox size={48} color="var(--mantine-color-gray-5)" />
                <Stack align="center" spacing={4}>
                  <Text weight={500} size="lg">
                    {athletes.length === 0 ? 'No athletes yet' : 'No results found'}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {athletes.length === 0
                      ? 'Invite athletes to start messaging'
                      : 'Try a different search term'}
                  </Text>
                </Stack>
                {athletes.length === 0 && (
                  <Button
                    variant="light"
                    onClick={() => navigate('/coach')}
                  >
                    Go to Dashboard
                  </Button>
                )}
              </Stack>
            </Center>
          </Paper>
        ) : (
          <Stack spacing="md">
            {filteredAthletes.map((relationship) => {
              const athlete = relationship.athlete;
              const athleteName = athlete?.display_name || 'Unknown';

              return (
                <Card
                  key={relationship.id}
                  shadow="sm"
                  p="md"
                  radius="md"
                  withBorder
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleOpenConversation(relationship.id, athleteName)}
                >
                  <Group position="apart">
                    <Group>
                      <Avatar
                        src={athlete?.avatar_url}
                        radius="xl"
                        size="lg"
                      >
                        {athleteName[0]}
                      </Avatar>
                      <div>
                        <Text weight={500} size="md">
                          {athleteName}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {athlete?.location_name || 'No location'}
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
        {athletes.length > 0 && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              Click on an athlete to start a conversation. You can discuss workouts,
              provide feedback, and answer questions.
            </Text>
          </Alert>
        )}
      </Stack>
    </Container>
  );
};

export default CoachMessages;
