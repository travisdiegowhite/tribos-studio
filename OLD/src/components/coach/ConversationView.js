import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Stack,
  Group,
  Avatar,
  Textarea,
  Button,
  Paper,
  LoadingOverlay,
  Alert,
  Divider,
  Badge,
  ActionIcon,
} from '@mantine/core';
import {
  Send,
  AlertCircle,
  MessageCircle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import coachService from '../../services/coachService';
import { formatDistanceToNow } from 'date-fns';

/**
 * Conversation View
 * Individual conversation with an athlete
 */
const ConversationView = () => {
  const { user } = useAuth();
  const { relationshipId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [athleteName, setAthleteName] = useState(location.state?.athleteName || 'Athlete');

  useEffect(() => {
    if (!user || !relationshipId) return;
    loadMessages();

    // Set up auto-refresh every 10 seconds
    const interval = setInterval(() => {
      loadMessages(true); // Silent refresh
    }, 10000);

    return () => clearInterval(interval);
  }, [user, relationshipId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const { data, error: fetchError } = await coachService.getMessages(relationshipId);

      if (fetchError) throw fetchError;

      setMessages(data || []);

      // Mark messages as read
      if (data && data.length > 0) {
        data.forEach(msg => {
          if (msg.sender_id !== user.id && !msg.read_at) {
            coachService.markMessageAsRead(msg.id);
          }
        });
      }
    } catch (err) {
      console.error('Error loading messages:', err);
      setError(err.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    setError(null);

    try {
      const { error: sendError } = await coachService.sendMessage(
        relationshipId,
        user.id,
        newMessage
      );

      if (sendError) throw sendError;

      setNewMessage('');
      await loadMessages();
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
      <Stack spacing="lg">
        {/* Header */}
        <Group position="apart">
          <Group spacing="sm">
            <ActionIcon
              size="lg"
              variant="light"
              onClick={() => navigate('/coach/messages')}
            >
              <ArrowLeft size={20} />
            </ActionIcon>
            <MessageCircle size={24} />
            <div>
              <Title order={2}>{athleteName}</Title>
              <Text size="sm" c="dimmed">
                Conversation
              </Text>
            </div>
          </Group>
          <ActionIcon
            size="lg"
            variant="light"
            onClick={loadMessages}
            title="Refresh"
          >
            <RefreshCw size={20} />
          </ActionIcon>
        </Group>

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

        {/* Messages */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md" style={{ minHeight: '400px', maxHeight: '600px', overflowY: 'auto' }}>
            {messages.length === 0 ? (
              <Paper p="xl" withBorder>
                <Stack align="center" spacing="sm">
                  <MessageCircle size={48} color="var(--mantine-color-gray-5)" />
                  <Text c="dimmed" ta="center">
                    No messages yet. Start the conversation!
                  </Text>
                </Stack>
              </Paper>
            ) : (
              messages.map((message, index) => {
                const isCoach = message.sender_id === user.id;
                const showDivider = index === 0 || (
                  new Date(message.created_at).toDateString() !==
                  new Date(messages[index - 1].created_at).toDateString()
                );

                return (
                  <React.Fragment key={message.id}>
                    {showDivider && (
                      <Divider
                        label={new Date(message.created_at).toLocaleDateString()}
                        labelPosition="center"
                      />
                    )}
                    <Group position={isCoach ? 'right' : 'left'} align="start">
                      {!isCoach && (
                        <Avatar size="sm" radius="xl">
                          {athleteName[0]}
                        </Avatar>
                      )}
                      <Paper
                        p="sm"
                        radius="md"
                        style={{
                          backgroundColor: isCoach
                            ? '#3b82f6'
                            : '#64748b',
                          maxWidth: '70%',
                        }}
                      >
                        <Stack spacing={4}>
                          <Text size="sm" c="#FFFFFF" style={{ whiteSpace: 'pre-wrap' }}>
                            {message.message_text}
                          </Text>
                          <Group spacing={4}>
                            <Text size="xs" c="#e2e8f0">
                              {formatDistanceToNow(new Date(message.created_at), {
                                addSuffix: true,
                              })}
                            </Text>
                            {isCoach && message.read_at && (
                              <Badge size="xs" variant="dot" color="green">
                                Read
                              </Badge>
                            )}
                          </Group>
                        </Stack>
                      </Paper>
                      {isCoach && (
                        <Avatar size="sm" radius="xl" color="blue">
                          You
                        </Avatar>
                      )}
                    </Group>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </Stack>
        </Card>

        {/* Message Input */}
        <Card shadow="sm" p="md" radius="md" withBorder>
          <Stack spacing="sm">
            <Textarea
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              minRows={3}
              maxRows={6}
              autosize
            />
            <Group position="right">
              <Button
                leftIcon={<Send size={18} />}
                onClick={handleSend}
                loading={sending}
                disabled={!newMessage.trim()}
              >
                Send Message
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Info */}
        <Alert color="blue" variant="light">
          <Text size="sm">
            Press Enter to send, Shift+Enter for new line. Messages are private between you
            and your athlete.
          </Text>
        </Alert>
      </Stack>
    </Container>
  );
};

export default ConversationView;
