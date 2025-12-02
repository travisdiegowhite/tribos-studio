/**
 * Coach History Modal
 * Displays conversation history with AI coach
 * Includes search, filter by topic, and delete functionality
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  ActionIcon,
  Badge,
  Card,
  ScrollArea,
  Loader,
  Select,
  Divider,
  Tooltip
} from '@mantine/core';
import {
  Search,
  X,
  Trash2,
  MessageCircle,
  Sparkles,
  Filter,
  Calendar,
  Activity,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import {
  fetchConversationHistory,
  deleteMessage as deleteMessageAPI,
  groupMessagesByDate,
  searchMessages as searchMessagesUtil,
  filterMessagesByTopic as filterByTopicUtil
} from '../services/coachHistory';
import { useAuth } from '../contexts/AuthContext';

export default function CoachHistoryModal({ opened, onClose }) {
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState(null);

  // Load messages when modal opens
  useEffect(() => {
    if (opened && user?.id) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, user?.id, includeArchived]);

  // Apply filters when search term or topic changes
  useEffect(() => {
    let filtered = messages;

    // Apply topic filter
    if (selectedTopic !== 'all') {
      filtered = filterByTopicUtil(filtered, selectedTopic);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = searchMessagesUtil(filtered, searchTerm);
    }

    setFilteredMessages(filtered);
  }, [messages, searchTerm, selectedTopic]);

  /**
   * Load conversation history from API
   */
  const loadHistory = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await fetchConversationHistory(user.id, {
        includeArchived,
        limit: 200
      });

      if (fetchError) {
        throw new Error(fetchError);
      }

      setMessages(data || []);
      console.log(`✅ Loaded ${data.length} messages for history view`);

    } catch (err) {
      console.error('Error loading history:', err);
      setError(err.message || 'Failed to load conversation history');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete a message
   */
  const handleDeleteMessage = async (messageId) => {
    if (!user?.id || !messageId) return;

    if (!window.confirm('Delete this message from your history?')) {
      return;
    }

    try {
      const { success, error: deleteError } = await deleteMessageAPI(user.id, messageId);

      if (!success) {
        throw new Error(deleteError);
      }

      // Remove from local state
      setMessages(prev => prev.filter(msg => msg.id !== messageId));

      console.log(`✅ Deleted message ${messageId}`);

    } catch (err) {
      console.error('Error deleting message:', err);
      alert('Failed to delete message: ' + err.message);
    }
  };

  /**
   * Clear search and filters
   */
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTopic('all');
  };

  // Group messages by date
  const groupedMessages = groupMessagesByDate(filteredMessages);

  // Topic options for filter
  const topicOptions = [
    { value: 'all', label: 'All Topics' },
    { value: 'workouts', label: 'Workouts' },
    { value: 'recovery', label: 'Recovery' },
    { value: 'metrics', label: 'Metrics' },
    { value: 'planning', label: 'Planning' },
    { value: 'general', label: 'General' }
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <MessageCircle size={20} />
          <Text weight={600}>Conversation History</Text>
        </Group>
      }
      size="xl"
      styles={{
        modal: {
          backgroundColor: '#1e293b',
          color: '#E8E8E8'
        },
        header: {
          backgroundColor: '#1e293b',
          borderBottom: '1px solid #32CD32'
        },
        title: {
          color: '#E8E8E8'
        }
      }}
    >
      <Stack spacing="md">
        {/* Search and Filters */}
        <Group spacing="xs" grow>
          <TextInput
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftSection={<Search size={16} />}
            rightSection={
              searchTerm && (
                <ActionIcon size="xs" onClick={() => setSearchTerm('')}>
                  <X size={14} />
                </ActionIcon>
              )
            }
            styles={{
              input: {
                backgroundColor: '#0f172a',
                borderColor: '#475569',
                color: '#E8E8E8'
              }
            }}
          />

          <Select
            value={selectedTopic}
            onChange={setSelectedTopic}
            data={topicOptions}
            leftSection={<Filter size={16} />}
            styles={{
              input: {
                backgroundColor: '#0f172a',
                borderColor: '#475569',
                color: '#E8E8E8'
              },
              dropdown: {
                backgroundColor: '#1e293b',
                borderColor: '#475569'
              },
              option: {
                color: '#E8E8E8',
                '&[data-selected]': {
                  backgroundColor: '#1e3a5f'
                },
                '&:hover': {
                  backgroundColor: '#334155'
                }
              }
            }}
          />
        </Group>

        <Group position="apart">
          <Group spacing="xs">
            <Button
              size="xs"
              variant="subtle"
              leftSection={<RefreshCw size={14} />}
              onClick={loadHistory}
              disabled={isLoading}
            >
              Refresh
            </Button>

            {(searchTerm || selectedTopic !== 'all') && (
              <Button
                size="xs"
                variant="subtle"
                leftSection={<X size={14} />}
                onClick={clearFilters}
              >
                Clear Filters
              </Button>
            )}
          </Group>

          <Button
            size="xs"
            variant={includeArchived ? 'filled' : 'subtle'}
            onClick={() => setIncludeArchived(!includeArchived)}
          >
            {includeArchived ? 'Hide' : 'Show'} Archived
          </Button>
        </Group>

        <Divider />

        {/* Messages */}
        <ScrollArea style={{ height: 500 }}>
          {isLoading ? (
            <Group spacing="xs" style={{ padding: '2rem', justifyContent: 'center' }}>
              <Loader size="sm" />
              <Text size="sm" color="dimmed">
                Loading conversation history...
              </Text>
            </Group>
          ) : error ? (
            <Card p="md" style={{ backgroundColor: '#dc2626', color: 'white' }}>
              <Text size="sm">{error}</Text>
              <Button size="xs" mt="xs" onClick={loadHistory}>
                Try Again
              </Button>
            </Card>
          ) : filteredMessages.length === 0 ? (
            <Card p="xl" style={{ backgroundColor: '#334155', textAlign: 'center' }}>
              <Text size="sm" color="dimmed">
                {messages.length === 0
                  ? 'No conversation history yet. Start chatting with your AI coach!'
                  : 'No messages match your filters.'}
              </Text>
            </Card>
          ) : (
            <Stack spacing="lg">
              {Object.entries(groupedMessages).map(([dateGroup, groupMessages]) => (
                <Stack key={dateGroup} spacing="xs">
                  {/* Date Header */}
                  <Group spacing="xs">
                    <Calendar size={14} color="#94a3b8" />
                    <Text size="xs" weight={600} c="#94a3b8" tt="uppercase">
                      {dateGroup}
                    </Text>
                    <Badge size="xs" variant="light">
                      {groupMessages.length}
                    </Badge>
                  </Group>

                  {/* Messages in this group */}
                  {groupMessages.map((message) => (
                    <HistoryMessage
                      key={message.id}
                      message={message}
                      onDelete={handleDeleteMessage}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
          )}
        </ScrollArea>

        {/* Footer */}
        <Divider />
        <Group position="apart">
          <Text size="xs" c="dimmed">
            {filteredMessages.length} of {messages.length} messages
          </Text>
          <Button onClick={onClose} variant="light">
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Individual message in history view
 */
function HistoryMessage({ message, onDelete }) {
  const isUser = message.role === 'user';

  // Get topic icon
  const getTopicIcon = (topic) => {
    switch (topic) {
      case 'workouts':
        return <Activity size={12} />;
      case 'recovery':
        return <TrendingUp size={12} />;
      case 'metrics':
        return <TrendingUp size={12} />;
      case 'planning':
        return <Calendar size={12} />;
      default:
        return <MessageCircle size={12} />;
    }
  };

  // Get topic color
  const getTopicColor = (topic) => {
    switch (topic) {
      case 'workouts':
        return 'green';
      case 'recovery':
        return 'blue';
      case 'metrics':
        return 'violet';
      case 'planning':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  return (
    <Card
      p="sm"
      style={{
        backgroundColor: isUser ? '#1e3a5f' : '#475569',
        border: `1px solid ${isUser ? '#32CD32' : '#64748b'}`,
        position: 'relative'
      }}
    >
      <Group position="apart" align="flex-start" spacing="xs">
        {/* Message header */}
        <Group spacing="xs" style={{ flex: 1 }}>
          {isUser ? (
            <MessageCircle size={14} />
          ) : (
            <Sparkles size={14} color="#a78bfa" />
          )}

          <Text size="xs" weight={600} c="dimmed">
            {isUser ? 'You' : 'AI Coach'}
          </Text>

          {message.topic && (
            <Badge
              size="xs"
              variant="light"
              color={getTopicColor(message.topic)}
              leftSection={getTopicIcon(message.topic)}
            >
              {message.topic}
            </Badge>
          )}

          {message.is_archived && (
            <Badge size="xs" variant="outline" color="gray">
              Archived
            </Badge>
          )}
        </Group>

        {/* Actions */}
        <Group spacing={4}>
          <Text size="xs" c="dimmed">
            {formatTimestamp(message.created_at)}
          </Text>

          <Tooltip label="Delete message">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Message content */}
      <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
        {message.content}
      </Text>

      {/* Workout recommendations badge */}
      {message.workout_recommendations && message.workout_recommendations.length > 0 && (
        <Badge size="xs" variant="filled" color="teal" mt="xs">
          {message.workout_recommendations.length} workout{message.workout_recommendations.length !== 1 ? 's' : ''} recommended
        </Badge>
      )}
    </Card>
  );
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();

  // If today, show time only
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // Otherwise show date and time
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
