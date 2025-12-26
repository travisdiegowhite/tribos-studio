/**
 * Feedback Viewer Component
 * Displays beta feedback submissions
 * SECURITY: Only accessible by travis@tribos.studio
 */

import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Badge,
  Stack,
  Alert,
  Loader,
  Group,
  Card,
  Accordion,
  Button,
  Box
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBug,
  IconBulb,
  IconRefresh,
  IconMessage,
  IconQuestionMark,
  IconExternalLink
} from '@tabler/icons-react';
import { listFeedback } from '../../services/adminService';

const FEEDBACK_TYPE_CONFIG = {
  bug: { color: 'red', icon: IconBug, label: 'Bug Report' },
  feature: { color: 'blue', icon: IconBulb, label: 'Feature Request' },
  improvement: { color: 'green', icon: IconBulb, label: 'Improvement' },
  question: { color: 'yellow', icon: IconQuestionMark, label: 'Question' },
  general: { color: 'gray', icon: IconMessage, label: 'General' }
};

const STATUS_COLORS = {
  new: 'blue',
  reviewed: 'yellow',
  in_progress: 'orange',
  completed: 'green',
  wont_fix: 'gray'
};

export default function FeedbackViewer() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFeedback();
  }, []);

  async function loadFeedback() {
    setLoading(true);
    setError(null);
    try {
      const result = await listFeedback();
      setFeedback(result.feedback || []);
    } catch (err) {
      console.error('Failed to load feedback:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading feedback...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        icon={<IconAlertTriangle size={16} />}
        title="Error"
        color="red"
      >
        {error}
      </Alert>
    );
  }

  return (
    <Stack spacing="md">
      <Paper withBorder p="md">
        <Group justify="space-between">
          <Text fw={600}>
            {feedback.length} Feedback Submission{feedback.length !== 1 ? 's' : ''}
          </Text>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={loadFeedback}
          >
            Refresh
          </Button>
        </Group>
      </Paper>

      {feedback.length === 0 ? (
        <Paper withBorder p="xl">
          <Stack align="center">
            <IconMessage size={48} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed">No feedback submissions yet</Text>
          </Stack>
        </Paper>
      ) : (
        <Accordion variant="separated">
          {feedback.map(item => {
            const typeConfig = FEEDBACK_TYPE_CONFIG[item.feedback_type] || FEEDBACK_TYPE_CONFIG.general;
            const TypeIcon = typeConfig.icon;

            return (
              <Accordion.Item key={item.id} value={item.id}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr="md">
                    <Group spacing="sm">
                      <TypeIcon size={18} color={`var(--mantine-color-${typeConfig.color}-6)`} />
                      <div>
                        <Text size="sm" fw={500} lineClamp={1}>
                          {item.message?.slice(0, 100) || 'No message'}
                          {item.message?.length > 100 ? '...' : ''}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDate(item.created_at)}
                        </Text>
                      </div>
                    </Group>
                    <Group spacing="xs">
                      <Badge color={typeConfig.color} variant="light" size="sm">
                        {typeConfig.label}
                      </Badge>
                      {item.status && (
                        <Badge color={STATUS_COLORS[item.status] || 'gray'} variant="outline" size="sm">
                          {item.status}
                        </Badge>
                      )}
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack spacing="sm">
                    <Card withBorder padding="sm">
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {item.message || 'No message provided'}
                      </Text>
                    </Card>

                    <Group spacing="lg">
                      {item.user_id && (
                        <div>
                          <Text size="xs" c="dimmed">User ID</Text>
                          <Text size="xs" ff="monospace">{item.user_id.slice(0, 8)}...</Text>
                        </div>
                      )}
                      {item.page_url && (
                        <div>
                          <Text size="xs" c="dimmed">Page URL</Text>
                          <Group spacing={4}>
                            <Text size="xs" ff="monospace" lineClamp={1} style={{ maxWidth: 300 }}>
                              {item.page_url}
                            </Text>
                            <a href={item.page_url} target="_blank" rel="noopener noreferrer">
                              <IconExternalLink size={12} />
                            </a>
                          </Group>
                        </div>
                      )}
                      {item.priority && (
                        <div>
                          <Text size="xs" c="dimmed">Priority</Text>
                          <Badge size="sm" variant="dot">{item.priority}</Badge>
                        </div>
                      )}
                    </Group>

                    {item.user_agent && (
                      <Box>
                        <Text size="xs" c="dimmed">User Agent</Text>
                        <Text size="xs" ff="monospace" c="dimmed" lineClamp={2}>
                          {item.user_agent}
                        </Text>
                      </Box>
                    )}

                    {item.admin_notes && (
                      <Card withBorder padding="sm" bg="yellow.0">
                        <Text size="xs" c="dimmed">Admin Notes</Text>
                        <Text size="sm">{item.admin_notes}</Text>
                      </Card>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Stack>
  );
}
