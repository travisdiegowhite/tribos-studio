/**
 * User Management Component
 * Displays all users and allows data cleanup for testing
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
  Modal,
  Loader,
  TextInput,
  ActionIcon,
  Tooltip,
  Box,
  Card,
  SimpleGrid
} from '@mantine/core';
import {
  IconSearch,
  IconTrash,
  IconRefresh,
  IconAlertTriangle,
  IconUser,
  IconActivity,
  IconPlugConnected,
  IconCheck,
  IconInfoCircle,
  IconChevronUp,
  IconChevronDown,
  IconSelector
} from '@tabler/icons-react';
import { listUsers, getUserDetails, cleanUserData, getStats } from '../../services/adminService';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');

  // Modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);

  // Load users on mount
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [usersResult, statsResult] = await Promise.all([
        listUsers(),
        getStats()
      ]);
      setUsers(usersResult.users || []);
      setStats(statsResult.stats || null);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewDetails(user) {
    setSelectedUser(user);
    setDetailsLoading(true);
    setUserDetails(null);
    setCleanupResult(null);

    try {
      const result = await getUserDetails(user.id);
      setUserDetails(result);
    } catch (err) {
      console.error('Failed to load user details:', err);
      setError(err.message);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleCleanupConfirm() {
    if (!selectedUser) return;

    setCleanupLoading(true);
    setCleanupResult(null);

    try {
      const result = await cleanUserData(selectedUser.id);
      setCleanupResult(result);
      // Refresh the user list
      loadData();
      // Refresh details
      handleViewDetails(selectedUser);
    } catch (err) {
      console.error('Cleanup failed:', err);
      setCleanupResult({ success: false, error: err.message });
    } finally {
      setCleanupLoading(false);
      setShowCleanupConfirm(false);
    }
  }

  // Sort handler
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) return <IconSelector size={14} style={{ opacity: 0.3 }} />;
    return sortDirection === 'asc'
      ? <IconChevronUp size={14} />
      : <IconChevronDown size={14} />;
  };

  // Filter and sort users
  const filteredUsers = users
    .filter(user =>
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortColumn) {
        case 'email':
          return dir * (a.email || '').localeCompare(b.email || '');
        case 'created_at':
        case 'last_sign_in_at':
          return dir * (new Date(a[sortColumn] || 0) - new Date(b[sortColumn] || 0));
        case 'activity_count':
          return dir * ((a.activity_count || 0) - (b.activity_count || 0));
        case 'integrations':
          return dir * ((a.integrations?.length || 0) - (b.integrations?.length || 0));
        default:
          return 0;
      }
    });

  // Format date for display
  function formatDate(dateString) {
    if (!dateString) return 'Never';
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
        <Text c="dimmed">Loading users...</Text>
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
      {/* Stats Cards */}
      {stats && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <Card withBorder padding="md">
            <Group>
              <IconUser size={24} color="var(--mantine-color-blue-6)" />
              <div>
                <Text size="xl" fw={700}>{stats.total_users}</Text>
                <Text size="xs" c="dimmed">Total Users</Text>
              </div>
            </Group>
          </Card>
          <Card withBorder padding="md">
            <Group>
              <IconActivity size={24} color="var(--mantine-color-green-6)" />
              <div>
                <Text size="xl" fw={700}>{stats.total_activities}</Text>
                <Text size="xs" c="dimmed">Activities</Text>
              </div>
            </Group>
          </Card>
          <Card withBorder padding="md">
            <Group>
              <IconPlugConnected size={24} color="var(--mantine-color-orange-6)" />
              <div>
                <Text size="xl" fw={700}>{stats.total_training_plans}</Text>
                <Text size="xs" c="dimmed">Training Plans</Text>
              </div>
            </Group>
          </Card>
          <Card withBorder padding="md">
            <Group>
              <IconInfoCircle size={24} color="var(--mantine-color-violet-6)" />
              <div>
                <Text size="xl" fw={700}>{stats.total_feedback}</Text>
                <Text size="xs" c="dimmed">Feedback Items</Text>
              </div>
            </Group>
          </Card>
        </SimpleGrid>
      )}

      {/* Search and Actions */}
      <Paper withBorder p="md">
        <Group justify="space-between">
          <TextInput
            placeholder="Search by email or ID..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={loadData}
          >
            Refresh
          </Button>
        </Group>
      </Paper>

      {/* Users Table */}
      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th onClick={() => handleSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <Group gap={4} wrap="nowrap">Email <SortIcon column="email" /></Group>
              </Table.Th>
              <Table.Th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <Group gap={4} wrap="nowrap">Signed Up <SortIcon column="created_at" /></Group>
              </Table.Th>
              <Table.Th onClick={() => handleSort('last_sign_in_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <Group gap={4} wrap="nowrap">Last Sign In <SortIcon column="last_sign_in_at" /></Group>
              </Table.Th>
              <Table.Th onClick={() => handleSort('activity_count')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <Group gap={4} wrap="nowrap">Activities <SortIcon column="activity_count" /></Group>
              </Table.Th>
              <Table.Th onClick={() => handleSort('integrations')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <Group gap={4} wrap="nowrap">Integrations <SortIcon column="integrations" /></Group>
              </Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredUsers.map(user => (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Group spacing="xs">
                    <Text size="sm" fw={500}>{user.email}</Text>
                    {user.email_confirmed_at && (
                      <Tooltip label="Email verified">
                        <IconCheck size={14} color="var(--mantine-color-green-6)" />
                      </Tooltip>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">{user.id.slice(0, 8)}...</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(user.created_at)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(user.last_sign_in_at)}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={user.activity_count > 0 ? 'sage' : 'gray'}>
                    {user.activity_count}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group spacing={4}>
                    {user.integrations.map(integration => (
                      <Badge key={integration} size="xs" variant="outline">
                        {integration}
                      </Badge>
                    ))}
                    {user.integrations.length === 0 && (
                      <Text size="xs" c="dimmed">None</Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group spacing="xs">
                    <Tooltip label="View details & cleanup">
                      <ActionIcon
                        variant="light"
                        onClick={() => handleViewDetails(user)}
                      >
                        <IconInfoCircle size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {filteredUsers.length === 0 && (
          <Box p="xl" ta="center">
            <Text c="dimmed">No users found</Text>
          </Box>
        )}
      </Paper>

      {/* User Details Modal */}
      <Modal
        opened={!!selectedUser}
        onClose={() => {
          setSelectedUser(null);
          setUserDetails(null);
          setCleanupResult(null);
        }}
        title={
          <Group>
            <IconUser size={20} />
            <Text fw={600}>User Details</Text>
          </Group>
        }
        size="lg"
      >
        {detailsLoading ? (
          <Stack align="center" py="xl">
            <Loader />
            <Text c="dimmed">Loading details...</Text>
          </Stack>
        ) : userDetails ? (
          <Stack spacing="md">
            {/* User Info */}
            <Paper withBorder p="md">
              <Stack spacing="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Email</Text>
                  <Text size="sm" fw={500}>{userDetails.user.email}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">User ID</Text>
                  <Text size="xs" ff="monospace">{userDetails.user.id}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Created</Text>
                  <Text size="sm">{formatDate(userDetails.user.created_at)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Last Sign In</Text>
                  <Text size="sm">{formatDate(userDetails.user.last_sign_in_at)}</Text>
                </Group>
              </Stack>
            </Paper>

            {/* Data Counts */}
            <Paper withBorder p="md">
              <Text fw={600} mb="sm">Data Summary</Text>
              <SimpleGrid cols={2}>
                <Group>
                  <Badge variant="light" size="lg">{userDetails.data_counts.activities}</Badge>
                  <Text size="sm">Activities</Text>
                </Group>
                <Group>
                  <Badge variant="light" size="lg">{userDetails.data_counts.training_plans}</Badge>
                  <Text size="sm">Training Plans</Text>
                </Group>
                <Group>
                  <Badge variant="light" size="lg">{userDetails.data_counts.routes}</Badge>
                  <Text size="sm">Routes</Text>
                </Group>
                <Group>
                  <Badge variant="light" size="lg">{userDetails.data_counts.feedback}</Badge>
                  <Text size="sm">Feedback</Text>
                </Group>
              </SimpleGrid>
              {userDetails.integrations.length > 0 && (
                <Group mt="sm">
                  <Text size="sm" c="dimmed">Connected:</Text>
                  {userDetails.integrations.map(i => (
                    <Badge key={i} variant="outline">{i}</Badge>
                  ))}
                </Group>
              )}
            </Paper>

            {/* Cleanup Result */}
            {cleanupResult && (
              <Alert
                icon={cleanupResult.success ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
                color={cleanupResult.success ? 'sage' : 'red'}
                title={cleanupResult.success ? 'Cleanup Complete' : 'Cleanup Failed'}
              >
                {cleanupResult.message || cleanupResult.error}
              </Alert>
            )}

            {/* Danger Zone */}
            <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-red-6)' }}>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={600} c="red">Danger Zone</Text>
                  <Text size="sm" c="dimmed">
                    Delete all data for this user. This action cannot be undone.
                  </Text>
                </div>
                <Button
                  color="red"
                  variant="outline"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => setShowCleanupConfirm(true)}
                  loading={cleanupLoading}
                >
                  Clean User Data
                </Button>
              </Group>
            </Paper>
          </Stack>
        ) : null}
      </Modal>

      {/* Cleanup Confirmation Modal */}
      <Modal
        opened={showCleanupConfirm}
        onClose={() => setShowCleanupConfirm(false)}
        title={
          <Group>
            <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />
            <Text fw={600} c="red">Confirm Data Deletion</Text>
          </Group>
        }
        size="sm"
      >
        <Stack spacing="md">
          <Alert color="red" variant="light">
            <Text size="sm">
              This will permanently delete ALL data for <strong>{selectedUser?.email}</strong>, including:
            </Text>
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li>All activities</li>
              <li>Training plans and workouts</li>
              <li>Routes and preferences</li>
              <li>Health metrics and coach data</li>
              <li>Integration connections</li>
            </ul>
            <Text size="sm" fw={600}>This cannot be undone!</Text>
          </Alert>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setShowCleanupConfirm(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleCleanupConfirm}
              loading={cleanupLoading}
            >
              Yes, Delete All Data
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
