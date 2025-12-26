/**
 * Webhook Viewer Component
 * Displays Garmin webhook events for debugging
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
  Table,
  Button,
  Code,
  Modal,
  ScrollArea,
  Box,
  Tooltip
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconRefresh,
  IconWebhook,
  IconCheck,
  IconX,
  IconClock,
  IconEye
} from '@tabler/icons-react';
import { listWebhooks } from '../../services/adminService';

export default function WebhookViewer() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedWebhook, setSelectedWebhook] = useState(null);

  useEffect(() => {
    loadWebhooks();
  }, []);

  async function loadWebhooks() {
    setLoading(true);
    setError(null);
    try {
      const result = await listWebhooks();
      setWebhooks(result.webhooks || []);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
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
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getStatusBadge(webhook) {
    if (webhook.processed) {
      if (webhook.process_error) {
        return <Badge color="red" variant="light" leftSection={<IconX size={12} />}>Error</Badge>;
      }
      return <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>Processed</Badge>;
    }
    return <Badge color="yellow" variant="light" leftSection={<IconClock size={12} />}>Pending</Badge>;
  }

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading webhooks...</Text>
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
          <Group>
            <IconWebhook size={20} />
            <Text fw={600}>
              {webhooks.length} Webhook Event{webhooks.length !== 1 ? 's' : ''}
            </Text>
          </Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={loadWebhooks}
          >
            Refresh
          </Button>
        </Group>
      </Paper>

      {webhooks.length === 0 ? (
        <Paper withBorder p="xl">
          <Stack align="center">
            <IconWebhook size={48} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed">No webhook events recorded</Text>
          </Stack>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                <Table.Th>Event Type</Table.Th>
                <Table.Th>Garmin User</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Activity ID</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {webhooks.map(webhook => (
                <Table.Tr key={webhook.id}>
                  <Table.Td>
                    <Text size="sm">{formatDate(webhook.created_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="outline" size="sm">
                      {webhook.event_type || 'unknown'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={webhook.garmin_user_id || 'N/A'}>
                      <Text size="xs" ff="monospace">
                        {webhook.garmin_user_id?.slice(0, 12) || 'N/A'}...
                      </Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    {getStatusBadge(webhook)}
                  </Table.Td>
                  <Table.Td>
                    {webhook.activity_imported_id ? (
                      <Text size="xs" ff="monospace">
                        {webhook.activity_imported_id.slice(0, 8)}...
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="View details">
                      <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<IconEye size={14} />}
                        onClick={() => setSelectedWebhook(webhook)}
                      >
                        Details
                      </Button>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* Webhook Details Modal */}
      <Modal
        opened={!!selectedWebhook}
        onClose={() => setSelectedWebhook(null)}
        title={
          <Group>
            <IconWebhook size={20} />
            <Text fw={600}>Webhook Details</Text>
          </Group>
        }
        size="lg"
      >
        {selectedWebhook && (
          <Stack spacing="md">
            <Paper withBorder p="md">
              <Stack spacing="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Event ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.id}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Event Type</Text>
                  <Badge variant="outline">{selectedWebhook.event_type}</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Created</Text>
                  <Text size="sm">{formatDate(selectedWebhook.created_at)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Status</Text>
                  {getStatusBadge(selectedWebhook)}
                </Group>
              </Stack>
            </Paper>

            <Paper withBorder p="md">
              <Text size="sm" fw={600} mb="xs">IDs</Text>
              <Stack spacing="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Garmin User ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.garmin_user_id || 'N/A'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Our User ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.user_id || 'Not matched'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Garmin Activity ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.activity_id || 'N/A'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Imported Activity ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.activity_imported_id || 'N/A'}</Text>
                </Group>
              </Stack>
            </Paper>

            {selectedWebhook.process_error && (
              <Alert color="red" icon={<IconX size={16} />} title="Processing Error">
                <Text size="sm">{selectedWebhook.process_error}</Text>
              </Alert>
            )}

            {selectedWebhook.file_url && (
              <Paper withBorder p="md">
                <Text size="sm" fw={600} mb="xs">File Info</Text>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">File Type</Text>
                  <Badge size="sm">{selectedWebhook.file_type || 'unknown'}</Badge>
                </Group>
                <Box mt="xs">
                  <Text size="sm" c="dimmed">File URL</Text>
                  <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                    {selectedWebhook.file_url}
                  </Text>
                </Box>
              </Paper>
            )}

            {selectedWebhook.payload && (
              <Paper withBorder p="md">
                <Text size="sm" fw={600} mb="xs">Raw Payload</Text>
                <ScrollArea h={200}>
                  <Code block style={{ fontSize: '11px' }}>
                    {JSON.stringify(selectedWebhook.payload, null, 2)}
                  </Code>
                </ScrollArea>
              </Paper>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
