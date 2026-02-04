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
  Tooltip,
  Select,
  ActionIcon
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconRefresh,
  IconWebhook,
  IconCheck,
  IconX,
  IconClock,
  IconEye,
  IconFilter,
  IconFilterOff,
  IconUser
} from '@tabler/icons-react';
import { listWebhooks, getIntegrationHealth } from '../../services/adminService';

export default function WebhookViewer() {
  const [webhooks, setWebhooks] = useState([]);
  const [usersWithWebhooks, setUsersWithWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [filterUserId, setFilterUserId] = useState(null);

  // Integration health state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);

  useEffect(() => {
    loadWebhooks();
    loadIntegrationHealth();
  }, [filterUserId]);

  async function loadWebhooks() {
    setLoading(true);
    setError(null);
    try {
      const result = await listWebhooks(filterUserId);
      setWebhooks(result.webhooks || []);
      // Only update user list on initial load (when no filter applied)
      if (!filterUserId && result.usersWithWebhooks) {
        setUsersWithWebhooks(result.usersWithWebhooks);
      }
    } catch (err) {
      console.error('Failed to load webhooks:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadIntegrationHealth() {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const result = await getIntegrationHealth();
      setHealthData(result);
    } catch (err) {
      console.error('Failed to load integration health:', err);
      setHealthError(err.message);
    } finally {
      setHealthLoading(false);
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

  // Build filter options
  const filterOptions = [
    { value: '', label: 'All Users' },
    ...usersWithWebhooks.map(u => ({
      value: u.id,
      label: u.email
    }))
  ];

  // Count by status for the current filter
  const statusCounts = {
    total: webhooks.length,
    processed: webhooks.filter(w => w.processed && !w.process_error).length,
    errors: webhooks.filter(w => w.process_error).length,
    pending: webhooks.filter(w => !w.processed).length
  };

  if (loading && webhooks.length === 0) {
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
      {/* Integration Health Dashboard */}
      <Paper withBorder p="md" bg="var(--mantine-color-dark-7)">
        <Group justify="space-between" mb="md">
          <Group>
            <IconWebhook size={20} />
            <Text fw={600}>Garmin Integration Health</Text>
          </Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            onClick={loadIntegrationHealth}
            loading={healthLoading}
          >
            Refresh
          </Button>
        </Group>

        {healthError ? (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {healthError}
          </Alert>
        ) : healthLoading && !healthData ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Loading health data...</Text>
          </Group>
        ) : healthData ? (
          <Stack spacing="md">
            {/* Summary Stats */}
            <Group gap="lg">
              <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" tt="uppercase">Total</Text>
                <Text size="xl" fw={700}>{healthData.totals?.total || 0}</Text>
              </Paper>
              <Paper withBorder p="sm" radius="md" style={{ flex: 1, borderColor: 'var(--mantine-color-green-6)' }}>
                <Text size="xs" c="dimmed" tt="uppercase">Healthy</Text>
                <Text size="xl" fw={700} c="green">{healthData.totals?.healthy || 0}</Text>
              </Paper>
              <Paper withBorder p="sm" radius="md" style={{ flex: 1, borderColor: 'var(--mantine-color-red-6)' }}>
                <Text size="xs" c="dimmed" tt="uppercase">Need Reconnect</Text>
                <Text size="xl" fw={700} c="red">{healthData.totals?.needs_reconnect || 0}</Text>
              </Paper>
              <Paper withBorder p="sm" radius="md" style={{ flex: 1, borderColor: 'var(--mantine-color-yellow-6)' }}>
                <Text size="xs" c="dimmed" tt="uppercase">Auto-Recoverable</Text>
                <Text size="xl" fw={700} c="yellow">{healthData.totals?.auto_recoverable || 0}</Text>
              </Paper>
            </Group>

            {/* Detailed Breakdown */}
            {healthData.summary && (
              <Group gap="xs" wrap="wrap">
                <Badge color="green" variant="light" size="sm">
                  Healthy: {healthData.summary.healthy}
                </Badge>
                <Badge color="yellow" variant="light" size="sm">
                  Token Expired: {healthData.summary.token_expired}
                </Badge>
                <Badge color="red" variant="light" size="sm">
                  Refresh Invalid: {healthData.summary.refresh_token_invalid}
                </Badge>
                <Badge color="red" variant="light" size="sm">
                  Refresh Expired: {healthData.summary.refresh_token_expired}
                </Badge>
                <Badge color="orange" variant="light" size="sm">
                  Stale (No Expiry): {healthData.summary.stale_no_expiry}
                </Badge>
                <Badge color="orange" variant="light" size="sm">
                  Missing User ID: {healthData.summary.missing_user_id}
                </Badge>
              </Group>
            )}

            {/* Users Needing Reconnect */}
            {healthData.users_needing_reconnect?.length > 0 && (
              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={600} mb="xs" c="red">
                  Users Needing Reconnection ({healthData.users_needing_reconnect.length})
                </Text>
                <ScrollArea h={healthData.users_needing_reconnect.length > 5 ? 200 : 'auto'}>
                  <Table size="xs" striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Email</Table.Th>
                        <Table.Th>Reason</Table.Th>
                        <Table.Th>Last Sync</Table.Th>
                        <Table.Th>Recent Errors</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {healthData.users_needing_reconnect.map((user, idx) => (
                        <Table.Tr key={idx}>
                          <Table.Td>
                            <Text size="xs">{user.email}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color="red" variant="outline">
                              {user.reason?.replace(/_/g, ' ')}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {user.last_sync_at ? formatDate(user.last_sync_at) : 'Never'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color={user.recent_errors > 0 ? 'red' : 'gray'} variant="light">
                              {user.recent_errors || 0}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            )}
          </Stack>
        ) : null}
      </Paper>

      {/* Header with Filter */}
      <Paper withBorder p="md">
        <Group justify="space-between" wrap="wrap">
          <Group>
            <IconWebhook size={20} />
            <Text fw={600}>
              {webhooks.length} Webhook Event{webhooks.length !== 1 ? 's' : ''}
            </Text>
            {filterUserId && (
              <Badge color="blue" variant="light" leftSection={<IconFilter size={12} />}>
                Filtered
              </Badge>
            )}
          </Group>

          <Group>
            {/* User Filter */}
            <Select
              placeholder="Filter by user..."
              leftSection={<IconUser size={16} />}
              data={filterOptions}
              value={filterUserId || ''}
              onChange={(value) => setFilterUserId(value || null)}
              clearable
              searchable
              style={{ minWidth: 250 }}
              disabled={loading}
            />

            {filterUserId && (
              <Tooltip label="Clear filter">
                <ActionIcon
                  variant="light"
                  color="gray"
                  onClick={() => setFilterUserId(null)}
                >
                  <IconFilterOff size={16} />
                </ActionIcon>
              </Tooltip>
            )}

            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              onClick={loadWebhooks}
              loading={loading}
            >
              Refresh
            </Button>
          </Group>
        </Group>

        {/* Status Summary */}
        <Group mt="md" gap="lg">
          <Group gap="xs">
            <Badge color="gray" variant="outline" size="sm">Total: {statusCounts.total}</Badge>
          </Group>
          <Group gap="xs">
            <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={10} />}>
              Processed: {statusCounts.processed}
            </Badge>
          </Group>
          <Group gap="xs">
            <Badge color="red" variant="light" size="sm" leftSection={<IconX size={10} />}>
              Errors: {statusCounts.errors}
            </Badge>
          </Group>
          <Group gap="xs">
            <Badge color="yellow" variant="light" size="sm" leftSection={<IconClock size={10} />}>
              Pending: {statusCounts.pending}
            </Badge>
          </Group>
        </Group>
      </Paper>

      {webhooks.length === 0 ? (
        <Paper withBorder p="xl">
          <Stack align="center">
            <IconWebhook size={48} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed">
              {filterUserId ? 'No webhook events for this user' : 'No webhook events recorded'}
            </Text>
            {filterUserId && (
              <Button variant="light" onClick={() => setFilterUserId(null)}>
                Clear Filter
              </Button>
            )}
          </Stack>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Event Type</Table.Th>
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
                    {webhook.user_email ? (
                      <Tooltip label={`ID: ${webhook.user_id}`}>
                        <Badge
                          variant="light"
                          color="blue"
                          size="sm"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setFilterUserId(webhook.user_id)}
                        >
                          {webhook.user_email}
                        </Badge>
                      </Tooltip>
                    ) : webhook.user_id ? (
                      <Tooltip label="User ID not matched to account">
                        <Text size="xs" c="dimmed" ff="monospace">
                          {webhook.user_id.slice(0, 8)}...
                        </Text>
                      </Tooltip>
                    ) : (
                      <Tooltip label={`Garmin ID: ${webhook.garmin_user_id || 'unknown'}`}>
                        <Badge variant="outline" color="orange" size="sm">
                          Unmatched
                        </Badge>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="outline" size="sm">
                      {webhook.event_type || 'unknown'}
                    </Badge>
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

            {/* User Info */}
            <Paper withBorder p="md">
              <Text size="sm" fw={600} mb="xs">User Information</Text>
              <Stack spacing="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">User Email</Text>
                  {selectedWebhook.user_email ? (
                    <Badge color="blue" variant="light">{selectedWebhook.user_email}</Badge>
                  ) : (
                    <Text size="sm" c="dimmed">Not matched</Text>
                  )}
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Our User ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.user_id || 'N/A'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Garmin User ID</Text>
                  <Text size="xs" ff="monospace">{selectedWebhook.garmin_user_id || 'N/A'}</Text>
                </Group>
              </Stack>
            </Paper>

            <Paper withBorder p="md">
              <Text size="sm" fw={600} mb="xs">Activity IDs</Text>
              <Stack spacing="xs">
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
