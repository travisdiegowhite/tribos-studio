/**
 * Activity Dashboard Component
 * Shows user activity tracking data for admin
 * SECURITY: Only accessible by travis@tribos.studio
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
  Select,
  Card,
  SimpleGrid,
  Tabs,
  ScrollArea,
  Box,
  Tooltip,
  ActionIcon,
  Modal
} from '@mantine/core';
import {
  IconRefresh,
  IconAlertTriangle,
  IconEye,
  IconUpload,
  IconCloudDownload,
  IconClick,
  IconUsers,
  IconActivity,
  IconChartBar,
  IconClock,
  IconUser
} from '@tabler/icons-react';
import {
  getActivitySummary,
  getRecentActivity,
  getActivityStats,
  getUserActivity
} from '../../services/adminService';

export default function ActivityDashboard() {
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [summary, setSummary] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedDays, setSelectedDays] = useState('7');
  const [categoryFilter, setCategoryFilter] = useState(null);

  // User activity modal
  const [selectedUser, setSelectedUser] = useState(null);
  const [userActivity, setUserActivity] = useState([]);
  const [userActivityLoading, setUserActivityLoading] = useState(false);

  // Load data based on active tab
  useEffect(() => {
    loadData();
  }, [activeTab, selectedDays, categoryFilter]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      switch (activeTab) {
        case 'summary':
          const summaryResult = await getActivitySummary();
          setSummary(summaryResult.summaries || []);
          break;

        case 'recent':
          const recentResult = await getRecentActivity(100, categoryFilter);
          setRecentActivity(recentResult.events || []);
          break;

        case 'stats':
          const statsResult = await getActivityStats(parseInt(selectedDays));
          setStats(statsResult.stats || null);
          break;
      }
    } catch (err) {
      console.error('Failed to load activity data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewUserActivity(userId, email) {
    setSelectedUser({ id: userId, email });
    setUserActivityLoading(true);

    try {
      const result = await getUserActivity(userId, 50);
      setUserActivity(result.events || []);
    } catch (err) {
      console.error('Failed to load user activity:', err);
    } finally {
      setUserActivityLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRelativeTime(dateString) {
    if (!dateString) return 'Never';
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  }

  function getCategoryIcon(category) {
    switch (category) {
      case 'page_view':
        return <IconEye size={14} />;
      case 'sync':
        return <IconCloudDownload size={14} />;
      case 'upload':
        return <IconUpload size={14} />;
      case 'feature':
        return <IconClick size={14} />;
      default:
        return <IconActivity size={14} />;
    }
  }

  function getCategoryColor(category) {
    switch (category) {
      case 'page_view':
        return 'blue';
      case 'sync':
        return 'sage';
      case 'upload':
        return 'orange';
      case 'feature':
        return 'violet';
      default:
        return 'gray';
    }
  }

  return (
    <Stack gap="md">
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="summary" leftSection={<IconUsers size={16} />}>
            User Summary
          </Tabs.Tab>
          <Tabs.Tab value="recent" leftSection={<IconClock size={16} />}>
            Recent Activity
          </Tabs.Tab>
          <Tabs.Tab value="stats" leftSection={<IconChartBar size={16} />}>
            Stats
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {error && (
        <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red">
          {error}
        </Alert>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <Paper withBorder>
          <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Text fw={600}>User Activity Summary</Text>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              size="xs"
              onClick={loadData}
              loading={loading}
            >
              Refresh
            </Button>
          </Group>

          {loading ? (
            <Stack align="center" py="xl">
              <Loader />
              <Text c="dimmed">Loading activity data...</Text>
            </Stack>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>User</Table.Th>
                    <Table.Th>Last Active</Table.Th>
                    <Table.Th>Page Views</Table.Th>
                    <Table.Th>Syncs</Table.Th>
                    <Table.Th>Uploads</Table.Th>
                    <Table.Th>Features</Table.Th>
                    <Table.Th>24h</Table.Th>
                    <Table.Th>7d</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {summary.map(user => (
                    <Table.Tr key={user.user_id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{user.email}</Text>
                        <Text size="xs" c="dimmed">{user.user_id.slice(0, 8)}...</Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label={formatDate(user.last_activity)}>
                          <Text size="sm">{formatRelativeTime(user.last_activity)}</Text>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="blue">{user.page_views}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="sage">{user.sync_events}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="orange">{user.upload_events}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="violet">{user.feature_uses}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={user.events_24h > 0 ? 'sage' : 'dimmed'}>
                          {user.events_24h}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{user.events_7d}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="View activity">
                          <ActionIcon
                            variant="light"
                            onClick={() => handleViewUserActivity(user.user_id, user.email)}
                          >
                            <IconUser size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {summary.length === 0 && (
                <Box p="xl" ta="center">
                  <Text c="dimmed">No activity data yet. Events will appear as users interact with the app.</Text>
                </Box>
              )}
            </ScrollArea>
          )}
        </Paper>
      )}

      {/* Recent Activity Tab */}
      {activeTab === 'recent' && (
        <Paper withBorder>
          <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Group>
              <Text fw={600}>Recent Activity</Text>
              <Select
                size="xs"
                placeholder="Filter by category"
                clearable
                value={categoryFilter}
                onChange={setCategoryFilter}
                data={[
                  { value: 'page_view', label: 'Page Views' },
                  { value: 'sync', label: 'Syncs' },
                  { value: 'upload', label: 'Uploads' },
                  { value: 'feature', label: 'Features' },
                  { value: 'interaction', label: 'Interactions' }
                ]}
                style={{ width: 150 }}
              />
            </Group>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              size="xs"
              onClick={loadData}
              loading={loading}
            >
              Refresh
            </Button>
          </Group>

          {loading ? (
            <Stack align="center" py="xl">
              <Loader />
              <Text c="dimmed">Loading recent activity...</Text>
            </Stack>
          ) : (
            <ScrollArea h={500}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Page</Table.Th>
                    <Table.Th>Details</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recentActivity.map(event => (
                    <Table.Tr key={event.id}>
                      <Table.Td>
                        <Tooltip label={formatDate(event.created_at)}>
                          <Text size="sm">{formatRelativeTime(event.created_at)}</Text>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{event.user_email}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={getCategoryColor(event.event_category)}
                          leftSection={getCategoryIcon(event.event_category)}
                        >
                          {event.event_type}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{event.page_path || '-'}</Text>
                      </Table.Td>
                      <Table.Td>
                        {event.event_data && Object.keys(event.event_data).length > 0 ? (
                          <Tooltip label={JSON.stringify(event.event_data, null, 2)}>
                            <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>
                              {Object.keys(event.event_data).length} fields
                            </Text>
                          </Tooltip>
                        ) : (
                          <Text size="xs" c="dimmed">-</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {recentActivity.length === 0 && (
                <Box p="xl" ta="center">
                  <Text c="dimmed">No recent activity found.</Text>
                </Box>
              )}
            </ScrollArea>
          )}
        </Paper>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <Stack gap="md">
          <Paper withBorder p="md">
            <Group justify="space-between">
              <Text fw={600}>Activity Statistics</Text>
              <Group>
                <Select
                  size="xs"
                  value={selectedDays}
                  onChange={setSelectedDays}
                  data={[
                    { value: '1', label: 'Last 24 hours' },
                    { value: '7', label: 'Last 7 days' },
                    { value: '30', label: 'Last 30 days' }
                  ]}
                  style={{ width: 150 }}
                />
                <Button
                  leftSection={<IconRefresh size={16} />}
                  variant="light"
                  size="xs"
                  onClick={loadData}
                  loading={loading}
                >
                  Refresh
                </Button>
              </Group>
            </Group>
          </Paper>

          {loading ? (
            <Stack align="center" py="xl">
              <Loader />
              <Text c="dimmed">Loading stats...</Text>
            </Stack>
          ) : stats ? (
            <>
              {/* Overview Cards */}
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                <Card withBorder padding="md">
                  <Group>
                    <IconActivity size={24} color="var(--mantine-color-blue-6)" />
                    <div>
                      <Text size="xl" fw={700}>{stats.total_events}</Text>
                      <Text size="xs" c="dimmed">Total Events</Text>
                    </div>
                  </Group>
                </Card>
                <Card withBorder padding="md">
                  <Group>
                    <IconUsers size={24} color="var(--mantine-color-green-6)" />
                    <div>
                      <Text size="xl" fw={700}>{stats.unique_users}</Text>
                      <Text size="xs" c="dimmed">Active Users</Text>
                    </div>
                  </Group>
                </Card>
                <Card withBorder padding="md">
                  <Group>
                    <IconEye size={24} color="var(--mantine-color-violet-6)" />
                    <div>
                      <Text size="xl" fw={700}>{stats.by_category?.page_view || 0}</Text>
                      <Text size="xs" c="dimmed">Page Views</Text>
                    </div>
                  </Group>
                </Card>
                <Card withBorder padding="md">
                  <Group>
                    <IconCloudDownload size={24} color="var(--mantine-color-orange-6)" />
                    <div>
                      <Text size="xl" fw={700}>{stats.by_category?.sync || 0}</Text>
                      <Text size="xs" c="dimmed">Syncs</Text>
                    </div>
                  </Group>
                </Card>
              </SimpleGrid>

              {/* Events by Category */}
              <Paper withBorder p="md">
                <Text fw={600} mb="md">Events by Category</Text>
                <SimpleGrid cols={{ base: 2, sm: 5 }}>
                  {Object.entries(stats.by_category || {}).map(([category, count]) => (
                    <Group key={category}>
                      <Badge variant="light" color={getCategoryColor(category)} size="lg">
                        {count}
                      </Badge>
                      <Text size="sm" tt="capitalize">{category.replace('_', ' ')}</Text>
                    </Group>
                  ))}
                </SimpleGrid>
              </Paper>

              {/* Events by Day */}
              {stats.by_day && Object.keys(stats.by_day).length > 0 && (
                <Paper withBorder p="md">
                  <Text fw={600} mb="md">Daily Activity</Text>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Events</Table.Th>
                        <Table.Th>Unique Users</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(stats.by_day)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([date, data]) => (
                          <Table.Tr key={date}>
                            <Table.Td>
                              <Text size="sm">{new Date(date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light">{data.total}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="sage">{data.unique_users}</Badge>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
              )}

              {/* Top Event Types */}
              {stats.by_type && Object.keys(stats.by_type).length > 0 && (
                <Paper withBorder p="md">
                  <Text fw={600} mb="md">Top Event Types</Text>
                  <SimpleGrid cols={{ base: 2, sm: 3 }}>
                    {Object.entries(stats.by_type)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 12)
                      .map(([type, count]) => (
                        <Group key={type} justify="space-between">
                          <Text size="sm" style={{ wordBreak: 'break-word' }}>{type}</Text>
                          <Badge variant="light">{count}</Badge>
                        </Group>
                      ))}
                  </SimpleGrid>
                </Paper>
              )}
            </>
          ) : (
            <Box p="xl" ta="center">
              <Text c="dimmed">No stats available for this period.</Text>
            </Box>
          )}
        </Stack>
      )}

      {/* User Activity Modal */}
      <Modal
        opened={!!selectedUser}
        onClose={() => {
          setSelectedUser(null);
          setUserActivity([]);
        }}
        title={
          <Group>
            <IconUser size={20} />
            <Text fw={600}>Activity: {selectedUser?.email}</Text>
          </Group>
        }
        size="xl"
      >
        {userActivityLoading ? (
          <Stack align="center" py="xl">
            <Loader />
            <Text c="dimmed">Loading user activity...</Text>
          </Stack>
        ) : (
          <ScrollArea h={400}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Page</Table.Th>
                  <Table.Th>Details</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {userActivity.map(event => (
                  <Table.Tr key={event.id}>
                    <Table.Td>
                      <Text size="sm">{formatDate(event.created_at)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={getCategoryColor(event.event_category)}
                        leftSection={getCategoryIcon(event.event_category)}
                      >
                        {event.event_type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">{event.page_path || '-'}</Text>
                    </Table.Td>
                    <Table.Td>
                      {event.event_data && Object.keys(event.event_data).length > 0 ? (
                        <Text size="xs" c="dimmed">
                          {JSON.stringify(event.event_data)}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            {userActivity.length === 0 && (
              <Box p="xl" ta="center">
                <Text c="dimmed">No activity found for this user.</Text>
              </Box>
            )}
          </ScrollArea>
        )}
      </Modal>
    </Stack>
  );
}
