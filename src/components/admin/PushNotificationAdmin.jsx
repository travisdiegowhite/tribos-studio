/**
 * Push Notification Admin Component
 * Send test notifications, broadcast to all users, send to select users.
 * View subscription stats and recent notification history.
 */

import { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  Text,
  Badge,
  Button,
  Group,
  Stack,
  Alert,
  Loader,
  TextInput,
  Textarea,
  Select,
  Tabs,
  SimpleGrid,
  Card,
  ScrollArea,
  TagsInput,
  Divider,
  Code,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  getPushStats,
  sendTestPush,
  sendPushToUsers,
  sendPushBroadcast,
  listPushSubscriptions,
  listRecentPushNotifications,
} from '../../services/adminService';
import {
  ArrowsClockwise,
  Bell,
  BellRinging,
  Check,
  DeviceMobile,
  Megaphone,
  PaperPlaneRight,
  TestTube,
  Users,
  Warning,
} from '@phosphor-icons/react';

const NOTIFICATION_TYPES = [
  { value: 'feature_broadcast', label: 'Feature Broadcast' },
  { value: 'post_ride_insight', label: 'Post-Ride Insight' },
  { value: 'workout_preview', label: 'Workout Preview' },
  { value: 'recovery_flag', label: 'Recovery Flag' },
  { value: 'weekly_summary', label: 'Weekly Summary' },
];

export default function PushNotificationAdmin() {
  const [activeTab, setActiveTab] = useState('send');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const result = await getPushStats();
      setStats(result.stats);
    } catch (err) {
      console.error('Failed to load push stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  return (
    <Stack gap="md">
      {/* Stats cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <StatCard
          label="Active Subscriptions"
          value={stats?.activeSubscriptions}
          loading={statsLoading}
        />
        <StatCard
          label="Subscribed Users"
          value={stats?.uniqueUsers}
          loading={statsLoading}
        />
        <StatCard
          label="Total Subscriptions"
          value={stats?.totalSubscriptions}
          loading={statsLoading}
        />
        <StatCard
          label="Recent Sends"
          value={stats?.recentNotifications?.length}
          loading={statsLoading}
        />
      </SimpleGrid>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="send" leftSection={<PaperPlaneRight size={16} />}>
            Send
          </Tabs.Tab>
          <Tabs.Tab value="subscriptions" leftSection={<DeviceMobile size={16} />}>
            Subscriptions
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<Bell size={16} />}>
            History
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="send" pt="md">
          <SendPanel onSent={loadStats} />
        </Tabs.Panel>

        <Tabs.Panel value="subscriptions" pt="md">
          <SubscriptionsPanel />
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <HistoryPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function StatCard({ label, value, loading }) {
  return (
    <Card withBorder p="md" style={{ borderRadius: 0 }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      {loading ? (
        <Loader size="sm" mt="xs" />
      ) : (
        <Text size="xl" fw={700} mt={4}>{value ?? 0}</Text>
      )}
    </Card>
  );
}

// ============================================================================
// Send Panel — Test, Select Users, or Broadcast
// ============================================================================

function SendPanel({ onSent }) {
  const [mode, setMode] = useState('test');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/dashboard');
  const [notificationType, setNotificationType] = useState('feature_broadcast');
  const [targetEmails, setTargetEmails] = useState(['travis@tribos.studio', 'travisdiegowhite@gmail.com']);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      notifications.show({ title: 'Missing fields', message: 'Title and body are required', color: 'red' });
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      let result;

      if (mode === 'test') {
        result = await sendTestPush({ title, body, url, targetEmails });
      } else if (mode === 'select') {
        result = await sendPushToUsers({
          title, body, url, notificationType,
          emails: targetEmails,
        });
      } else if (mode === 'broadcast') {
        result = await sendPushBroadcast({ title, body, url, notificationType });
      }

      setLastResult(result);
      notifications.show({
        title: 'Push sent',
        message: `Sent: ${result.sent || 0}, Skipped: ${result.skipped || 0}`,
        color: 'green',
        icon: <Check size={16} />,
      });
      onSent?.();
    } catch (err) {
      notifications.show({
        title: 'Send failed',
        message: err.message,
        color: 'red',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap="md">
      <Paper p="md" withBorder style={{ borderRadius: 0 }}>
        <Stack gap="sm">
          <Select
            label="Send mode"
            value={mode}
            onChange={setMode}
            data={[
              { value: 'test', label: 'Test — Send to my accounts' },
              { value: 'select', label: 'Select Users — Send to specific emails' },
              { value: 'broadcast', label: 'Broadcast — Send to all subscribers' },
            ]}
          />

          <TextInput
            label="Title"
            placeholder="e.g. New feature: Route sharing"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
          />

          <Textarea
            label="Body"
            placeholder="Notification body text..."
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            minRows={2}
            required
          />

          <Group grow>
            <TextInput
              label="Deep link URL"
              placeholder="/dashboard"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
            />
            {mode !== 'test' && (
              <Select
                label="Notification type"
                value={notificationType}
                onChange={setNotificationType}
                data={NOTIFICATION_TYPES}
              />
            )}
          </Group>

          {(mode === 'test' || mode === 'select') && (
            <TagsInput
              label={mode === 'test' ? 'Test recipient emails' : 'Target user emails'}
              value={targetEmails}
              onChange={setTargetEmails}
              placeholder="Add email and press Enter"
            />
          )}

          {mode === 'broadcast' && (
            <Alert icon={<Warning size={16} />} color="yellow" variant="light">
              This will send to <strong>all users</strong> with active push subscriptions
              who have not opted out of the selected notification type.
            </Alert>
          )}

          <Group justify="flex-end" mt="xs">
            <Button
              onClick={handleSend}
              loading={sending}
              leftSection={
                mode === 'test' ? <TestTube size={16} /> :
                mode === 'broadcast' ? <Megaphone size={16} /> :
                <PaperPlaneRight size={16} />
              }
              color={mode === 'broadcast' ? 'red' : undefined}
              variant={mode === 'broadcast' ? 'outline' : 'filled'}
              style={{ borderRadius: 0 }}
            >
              {mode === 'test' ? 'Send Test' :
               mode === 'broadcast' ? 'Send Broadcast' :
               'Send to Users'}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {lastResult && (
        <Paper p="sm" withBorder style={{ borderRadius: 0 }}>
          <Text size="xs" fw={600} mb="xs">Last send result:</Text>
          <Code block style={{ fontSize: 12 }}>
            {JSON.stringify(lastResult, null, 2)}
          </Code>
        </Paper>
      )}
    </Stack>
  );
}

// ============================================================================
// Subscriptions Panel
// ============================================================================

function SubscriptionsPanel() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    setLoading(true);
    setError(null);
    try {
      const result = await listPushSubscriptions();
      setSubscriptions(result.subscriptions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Group justify="center" py="xl"><Loader /></Group>;
  if (error) return <Alert color="red">{error}</Alert>;

  if (!subscriptions.length) {
    return (
      <Alert icon={<DeviceMobile size={16} />} color="gray" variant="light">
        No push subscriptions yet. Users can enable notifications in Settings.
      </Alert>
    );
  }

  return (
    <Paper withBorder style={{ borderRadius: 0 }}>
      <Group justify="space-between" p="sm" pb={0}>
        <Text size="sm" fw={600}>{subscriptions.length} subscription(s)</Text>
        <Button size="xs" variant="subtle" onClick={loadSubscriptions} leftSection={<ArrowsClockwise size={14} />}>
          Refresh
        </Button>
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover fontSize="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Browser</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Last Used</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {subscriptions.map((sub) => (
              <Table.Tr key={sub.id}>
                <Table.Td>
                  <Text size="xs" fw={500}>{sub.email}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    size="xs"
                    color={sub.is_active ? 'green' : 'gray'}
                    variant="light"
                  >
                    {sub.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ maxWidth: 200 }}>
                    {parseBrowser(sub.user_agent)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">{formatDate(sub.created_at)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">{formatDate(sub.last_used_at)}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

// ============================================================================
// History Panel
// ============================================================================

function HistoryPanel() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const result = await listRecentPushNotifications();
      setNotifications(result.notifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Group justify="center" py="xl"><Loader /></Group>;
  if (error) return <Alert color="red">{error}</Alert>;

  if (!notifications.length) {
    return (
      <Alert icon={<Bell size={16} />} color="gray" variant="light">
        No push notifications sent yet.
      </Alert>
    );
  }

  return (
    <Paper withBorder style={{ borderRadius: 0 }}>
      <Group justify="space-between" p="sm" pb={0}>
        <Text size="sm" fw={600}>Recent push notifications</Text>
        <Button size="xs" variant="subtle" onClick={loadNotifications} leftSection={<ArrowsClockwise size={14} />}>
          Refresh
        </Button>
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover fontSize="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Delivered</Table.Th>
              <Table.Th>Sent At</Table.Th>
              <Table.Th>Reference</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {notifications.map((n) => (
              <Table.Tr key={n.id}>
                <Table.Td>
                  <Text size="xs" fw={500}>{n.email}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light" color={typeColor(n.notification_type)}>
                    {n.notification_type}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    size="xs"
                    color={n.delivered ? 'green' : 'red'}
                    variant="light"
                  >
                    {n.delivered ? 'Yes' : 'No'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">{formatDate(n.sent_at)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ maxWidth: 150 }}>
                    {n.reference_id || '—'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseBrowser(ua) {
  if (!ua) return 'Unknown';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return ua.substring(0, 30);
}

function typeColor(type) {
  const colors = {
    feature_broadcast: 'violet',
    post_ride_insight: 'blue',
    workout_preview: 'green',
    recovery_flag: 'orange',
    weekly_summary: 'teal',
  };
  return colors[type] || 'gray';
}
