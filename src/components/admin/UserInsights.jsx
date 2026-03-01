/**
 * User Insights Component
 * Activation funnel, feature adoption, retention cohorts, stale users
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
  Card,
  SimpleGrid,
  Tabs,
  ScrollArea,
  Box,
  Progress,
  Tooltip,
} from '@mantine/core';
import {
  IconRefresh,
  IconAlertTriangle,
  IconUsers,
  IconTrendingUp,
  IconFilter,
  IconActivity,
  IconUserOff,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconTargetArrow,
  IconHeartbeat,
} from '@tabler/icons-react';
import { getUserInsights } from '../../services/adminService';

export default function UserInsights() {
  const [activeTab, setActiveTab] = useState('funnel');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [insights, setInsights] = useState(null);

  // Sort state for stale users table
  const [staleSort, setStaleSort] = useState({ column: 'status', direction: 'asc' });
  // Sort state for adherence table
  const [adherenceSort, setAdherenceSort] = useState({ column: 'adherence_pct', direction: 'asc' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const result = await getUserInsights();
      setInsights(result.insights);
    } catch (err) {
      console.error('Failed to load user insights:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStaleSort(column) {
    setStaleSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  function StaleSortIcon({ column }) {
    if (staleSort.column !== column) return <IconSelector size={14} style={{ opacity: 0.3 }} />;
    return staleSort.direction === 'asc'
      ? <IconChevronUp size={14} />
      : <IconChevronDown size={14} />;
  }

  function getStatusColor(status) {
    switch (status) {
      case 'never_activated': return 'red';
      case 'churned': return 'orange';
      case 'at_risk': return 'yellow';
      default: return 'gray';
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'never_activated': return 'Never Activated';
      case 'churned': return 'Churned';
      case 'at_risk': return 'At Risk';
      default: return status;
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Analyzing user data...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red">
        {error}
      </Alert>
    );
  }

  if (!insights) return null;

  const { funnel, feature_adoption, retention_cohorts, stale_users, plan_adherence, summary, total_users } = insights;

  // Funnel steps in order
  const funnelSteps = [
    { key: 'signed_up', label: 'Signed Up', color: 'blue' },
    { key: 'profile_completed', label: 'Profile Completed', color: 'cyan' },
    { key: 'integration_connected', label: 'Integration Connected', color: 'teal' },
    { key: 'first_activity', label: 'First Activity Synced', color: 'green' },
    { key: 'route_created', label: 'Route Created', color: 'lime' },
    { key: 'training_plan', label: 'Training Plan', color: 'yellow' },
    { key: 'coach_used', label: 'AI Coach Used', color: 'orange' },
  ];

  // Adherence sort helpers
  function handleAdherenceSort(column) {
    setAdherenceSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  function AdherenceSortIcon({ column }) {
    if (adherenceSort.column !== column) return <IconSelector size={14} style={{ opacity: 0.3 }} />;
    return adherenceSort.direction === 'asc'
      ? <IconChevronUp size={14} />
      : <IconChevronDown size={14} />;
  }

  function getAdherenceColor(pct) {
    if (pct >= 80) return 'green';
    if (pct >= 60) return 'yellow';
    if (pct >= 40) return 'orange';
    return 'red';
  }

  // Sorted adherence users
  const sortedAdherenceUsers = plan_adherence ? [...plan_adherence.users].sort((a, b) => {
    const dir = adherenceSort.direction === 'asc' ? 1 : -1;
    switch (adherenceSort.column) {
      case 'email':
        return dir * (a.email || '').localeCompare(b.email || '');
      case 'plan_status':
        return dir * (a.plan_status || '').localeCompare(b.plan_status || '');
      case 'adherence_pct':
        return dir * ((a.adherence_pct ?? -1) - (b.adherence_pct ?? -1));
      case 'workouts_due':
        return dir * ((a.workouts_due || 0) - (b.workouts_due || 0));
      default:
        return 0;
    }
  }) : [];

  // Sorted stale users
  const sortedStaleUsers = [...stale_users].sort((a, b) => {
    const dir = staleSort.direction === 'asc' ? 1 : -1;
    const statusOrder = { never_activated: 0, churned: 1, at_risk: 2 };
    switch (staleSort.column) {
      case 'email':
        return dir * (a.email || '').localeCompare(b.email || '');
      case 'status':
        return dir * ((statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));
      case 'created_at':
        return dir * (new Date(a.created_at || 0) - new Date(b.created_at || 0));
      case 'days_inactive':
        return dir * ((a.days_inactive || 9999) - (b.days_inactive || 9999));
      case 'days_since_engaged':
        return dir * ((a.days_since_engaged ?? 9999) - (b.days_since_engaged ?? 9999));
      default:
        return 0;
    }
  });

  return (
    <Stack gap="md">
      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }}>
        <Card withBorder padding="md">
          <Group>
            <IconUsers size={24} color="var(--mantine-color-blue-6)" />
            <div>
              <Text size="xl" fw={700}>{total_users}</Text>
              <Text size="xs" c="dimmed">Total Users</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder padding="md">
          <Group>
            <IconActivity size={24} color="var(--mantine-color-green-6)" />
            <div>
              <Text size="xl" fw={700}>{summary.active_7d}</Text>
              <Text size="xs" c="dimmed">Signed In (7d)</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder padding="md">
          <Group>
            <IconHeartbeat size={24} color="var(--mantine-color-cyan-6)" />
            <div>
              <Text size="xl" fw={700}>{summary.engaged_7d ?? 0}</Text>
              <Text size="xs" c="dimmed">Engaged (7d)</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder padding="md">
          <Group>
            <IconTrendingUp size={24} color="var(--mantine-color-teal-6)" />
            <div>
              <Text size="xl" fw={700}>{summary.engaged_30d ?? 0}</Text>
              <Text size="xs" c="dimmed">Engaged (30d)</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder padding="md">
          <Group>
            <IconUserOff size={24} color="var(--mantine-color-red-6)" />
            <div>
              <Text size="xl" fw={700}>{summary.never_activated}</Text>
              <Text size="xs" c="dimmed">Never Activated</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder padding="md">
          <Group>
            <IconAlertCircle size={24} color="var(--mantine-color-orange-6)" />
            <div>
              <Text size="xl" fw={700}>{summary.churned}</Text>
              <Text size="xs" c="dimmed">Churned</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder padding="md">
          <Group>
            <IconAlertCircle size={24} color="var(--mantine-color-yellow-6)" />
            <div>
              <Text size="xl" fw={700}>{summary.at_risk}</Text>
              <Text size="xs" c="dimmed">At Risk</Text>
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="funnel" leftSection={<IconFilter size={16} />}>
            Activation Funnel
          </Tabs.Tab>
          <Tabs.Tab value="adoption" leftSection={<IconTrendingUp size={16} />}>
            Feature Adoption
          </Tabs.Tab>
          <Tabs.Tab value="retention" leftSection={<IconActivity size={16} />}>
            Retention Cohorts
          </Tabs.Tab>
          <Tabs.Tab value="stale" leftSection={<IconUserOff size={16} />}>
            Stale Users ({stale_users.length})
          </Tabs.Tab>
          <Tabs.Tab value="adherence" leftSection={<IconTargetArrow size={16} />}>
            Plan Adherence ({plan_adherence?.summary?.users_with_plans || 0})
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* Activation Funnel */}
      {activeTab === 'funnel' && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="md">
            <Text fw={600}>Activation Funnel</Text>
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
          <Stack gap="sm">
            {funnelSteps.map((step, index) => {
              const count = funnel[step.key];
              const pct = total_users > 0 ? Math.round((count / total_users) * 100) : 0;
              const prevCount = index > 0 ? funnel[funnelSteps[index - 1].key] : total_users;
              const dropoff = index > 0 && prevCount > 0
                ? Math.round(((prevCount - count) / prevCount) * 100)
                : 0;

              return (
                <Paper key={step.key} withBorder p="sm" radius="sm">
                  <Group justify="space-between" mb={4}>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{step.label}</Text>
                      {index > 0 && dropoff > 0 && (
                        <Badge size="xs" variant="light" color="red">
                          -{dropoff}% drop
                        </Badge>
                      )}
                    </Group>
                    <Group gap="xs">
                      <Text size="sm" fw={700}>{count}</Text>
                      <Text size="xs" c="dimmed">({pct}%)</Text>
                    </Group>
                  </Group>
                  <Progress
                    value={pct}
                    color={step.color}
                    size="lg"
                    radius="sm"
                  />
                </Paper>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* Feature Adoption */}
      {activeTab === 'adoption' && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="md">
            <Text fw={600}>Feature Adoption Rates</Text>
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
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {Object.entries(feature_adoption).map(([key, data]) => {
              const pct = total_users > 0 ? Math.round((data.users / total_users) * 100) : 0;
              return (
                <Paper key={key} withBorder p="sm" radius="sm">
                  <Group justify="space-between" mb={4}>
                    <Text size="sm" fw={500}>{data.label}</Text>
                    <Group gap="xs">
                      <Text size="sm" fw={700}>{data.users}</Text>
                      <Text size="xs" c="dimmed">/ {total_users} ({pct}%)</Text>
                    </Group>
                  </Group>
                  <Progress
                    value={pct}
                    color={pct > 30 ? 'green' : pct > 15 ? 'yellow' : 'red'}
                    size="md"
                    radius="sm"
                  />
                </Paper>
              );
            })}
          </SimpleGrid>
        </Paper>
      )}

      {/* Retention Cohorts */}
      {activeTab === 'retention' && (
        <Paper withBorder>
          <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Text fw={600}>Retention by Signup Week</Text>
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
          <ScrollArea>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Signup Week</Table.Th>
                  <Table.Th>Signed Up</Table.Th>
                  <Table.Th>Activated</Table.Th>
                  <Table.Th>Active (7d)</Table.Th>
                  <Table.Th>Active (30d)</Table.Th>
                  <Table.Th>Activation %</Table.Th>
                  <Table.Th>7d Retention</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {retention_cohorts.map(cohort => {
                  const activationPct = cohort.signed_up > 0
                    ? Math.round((cohort.activated / cohort.signed_up) * 100) : 0;
                  const retention7d = cohort.signed_up > 0
                    ? Math.round((cohort.active_7d / cohort.signed_up) * 100) : 0;

                  return (
                    <Table.Tr key={cohort.week}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {new Date(cohort.week + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric'
                          })}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light">{cohort.signed_up}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="green">{cohort.activated}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="blue">{cohort.active_7d}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="teal">{cohort.active_30d}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Progress
                            value={activationPct}
                            color={activationPct > 50 ? 'green' : activationPct > 25 ? 'yellow' : 'red'}
                            size="sm"
                            style={{ width: 60 }}
                          />
                          <Text size="xs" c="dimmed">{activationPct}%</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Progress
                            value={retention7d}
                            color={retention7d > 30 ? 'green' : retention7d > 15 ? 'yellow' : 'red'}
                            size="sm"
                            style={{ width: 60 }}
                          />
                          <Text size="xs" c="dimmed">{retention7d}%</Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            {retention_cohorts.length === 0 && (
              <Box p="xl" ta="center">
                <Text c="dimmed">No cohort data available.</Text>
              </Box>
            )}
          </ScrollArea>
        </Paper>
      )}

      {/* Plan Adherence */}
      {activeTab === 'adherence' && plan_adherence && (
        <Paper withBorder>
          <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Group gap="xs">
              <Text fw={600}>Training Plan Adherence</Text>
              <Badge variant="light" color="blue">{plan_adherence.summary.avg_adherence}% avg</Badge>
              <Badge variant="light" color="green">{plan_adherence.summary.excellent} excellent</Badge>
              <Badge variant="light" color="yellow">{plan_adherence.summary.good} good</Badge>
              <Badge variant="light" color="orange">{plan_adherence.summary.fair} fair</Badge>
              <Badge variant="light" color="red">{plan_adherence.summary.poor} poor</Badge>
              {plan_adherence.summary.no_data > 0 && (
                <Badge variant="light" color="gray">{plan_adherence.summary.no_data} no data</Badge>
              )}
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
          <ScrollArea h={500}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th onClick={() => handleAdherenceSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Email <AdherenceSortIcon column="email" /></Group>
                  </Table.Th>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th onClick={() => handleAdherenceSort('plan_status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Status <AdherenceSortIcon column="plan_status" /></Group>
                  </Table.Th>
                  <Table.Th>Week</Table.Th>
                  <Table.Th onClick={() => handleAdherenceSort('workouts_due')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Workouts <AdherenceSortIcon column="workouts_due" /></Group>
                  </Table.Th>
                  <Table.Th onClick={() => handleAdherenceSort('adherence_pct')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Adherence <AdherenceSortIcon column="adherence_pct" /></Group>
                  </Table.Th>
                  <Table.Th>TSS Accuracy</Table.Th>
                  <Table.Th>Duration Accuracy</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedAdherenceUsers.map((user, idx) => (
                  <Table.Tr key={idx}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{user.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1}>{user.plan_name || 'Unnamed'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={user.plan_status === 'active' ? 'green' : user.plan_status === 'completed' ? 'blue' : 'gray'}
                      >
                        {user.plan_status || 'unknown'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {user.weeks_in}{user.total_weeks ? ` / ${user.total_weeks}` : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {user.workouts_completed} / {user.workouts_due}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {user.adherence_pct !== null ? (
                        <Group gap={4}>
                          <Progress
                            value={user.adherence_pct}
                            color={getAdherenceColor(user.adherence_pct)}
                            size="sm"
                            style={{ width: 60 }}
                          />
                          <Text size="xs" fw={500} c={getAdherenceColor(user.adherence_pct)}>
                            {user.adherence_pct}%
                          </Text>
                        </Group>
                      ) : (
                        <Badge variant="light" color="gray" size="xs">No data</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {user.avg_tss_accuracy !== null ? (
                        <Text size="sm" fw={500} c={user.avg_tss_accuracy >= 85 ? 'green' : user.avg_tss_accuracy >= 70 ? 'yellow' : 'red'}>
                          {user.avg_tss_accuracy}%
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">--</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {user.avg_duration_accuracy !== null ? (
                        <Text size="sm" fw={500} c={user.avg_duration_accuracy >= 85 ? 'green' : user.avg_duration_accuracy >= 70 ? 'yellow' : 'red'}>
                          {user.avg_duration_accuracy}%
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">--</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            {sortedAdherenceUsers.length === 0 && (
              <Box p="xl" ta="center">
                <Text c="dimmed">No users with training plans found.</Text>
              </Box>
            )}
          </ScrollArea>
        </Paper>
      )}

      {/* Stale Users */}
      {activeTab === 'stale' && (
        <Paper withBorder>
          <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Group gap="xs">
              <Text fw={600}>Stale & At-Risk Users</Text>
              <Badge variant="light" color="red">{stale_users.filter(u => u.status === 'never_activated').length} never activated</Badge>
              <Badge variant="light" color="orange">{stale_users.filter(u => u.status === 'churned').length} churned</Badge>
              <Badge variant="light" color="yellow">{stale_users.filter(u => u.status === 'at_risk').length} at risk</Badge>
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
          <ScrollArea h={500}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th onClick={() => handleStaleSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Email <StaleSortIcon column="email" /></Group>
                  </Table.Th>
                  <Table.Th onClick={() => handleStaleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Status <StaleSortIcon column="status" /></Group>
                  </Table.Th>
                  <Table.Th onClick={() => handleStaleSort('created_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Signed Up <StaleSortIcon column="created_at" /></Group>
                  </Table.Th>
                  <Table.Th onClick={() => handleStaleSort('days_inactive')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Days Inactive <StaleSortIcon column="days_inactive" /></Group>
                  </Table.Th>
                  <Table.Th onClick={() => handleStaleSort('days_since_engaged')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <Group gap={4} wrap="nowrap">Last Engaged <StaleSortIcon column="days_since_engaged" /></Group>
                  </Table.Th>
                  <Table.Th>Progress</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedStaleUsers.map((user, idx) => (
                  <Table.Tr key={idx}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{user.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={getStatusColor(user.status)}>
                        {getStatusLabel(user.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(user.created_at)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500} c={user.days_inactive > 30 ? 'red' : user.days_inactive > 14 ? 'yellow' : 'dimmed'}>
                        {user.days_inactive != null ? `${user.days_inactive}d` : 'Never active'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500} c={
                        user.days_since_engaged == null ? 'dimmed'
                          : user.days_since_engaged > 30 ? 'red'
                          : user.days_since_engaged > 14 ? 'yellow'
                          : 'green'
                      }>
                        {user.days_since_engaged != null ? `${user.days_since_engaged}d ago` : 'Never'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <Tooltip label="Profile">
                          {user.has_profile
                            ? <IconCheck size={14} color="var(--mantine-color-green-6)" />
                            : <IconX size={14} color="var(--mantine-color-red-6)" />
                          }
                        </Tooltip>
                        <Tooltip label="Integration">
                          {user.has_integration
                            ? <IconCheck size={14} color="var(--mantine-color-green-6)" />
                            : <IconX size={14} color="var(--mantine-color-red-6)" />
                          }
                        </Tooltip>
                        <Tooltip label="Activity">
                          {user.has_activity
                            ? <IconCheck size={14} color="var(--mantine-color-green-6)" />
                            : <IconX size={14} color="var(--mantine-color-red-6)" />
                          }
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            {stale_users.length === 0 && (
              <Box p="xl" ta="center">
                <Text c="dimmed">No stale users found. All users are active!</Text>
              </Box>
            )}
          </ScrollArea>
        </Paper>
      )}
    </Stack>
  );
}
