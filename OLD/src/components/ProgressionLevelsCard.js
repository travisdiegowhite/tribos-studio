import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Text,
  Group,
  Progress,
  Badge,
  Button,
  Tooltip,
  SimpleGrid,
  Modal,
  Table,
  Alert
} from '@mantine/core';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  BarChart3
} from 'lucide-react';
import {
  getProgressionLevels,
  getProgressionLevelInfo,
  getZoneLabel,
  formatProgressionLevel,
  seedProgressionFromRPE
} from '../services/progressionLevels';
import { notifications } from '@mantine/notifications';

export default function ProgressionLevelsCard({ user }) {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadProgressionLevels();
    }
  }, [user]);

  const loadProgressionLevels = async () => {
    setLoading(true);
    try {
      const data = await getProgressionLevels(user.id);
      setLevels(data);
    } catch (error) {
      console.error('Error loading progression levels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedFromRPE = async () => {
    setSeeding(true);
    try {
      const result = await seedProgressionFromRPE(user.id);
      notifications.show({
        title: 'Success',
        message: result,
        color: 'green'
      });
      await loadProgressionLevels();
    } catch (error) {
      console.error('Error seeding progression levels:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to seed progression levels',
        color: 'red'
      });
    } finally {
      setSeeding(false);
    }
  };

  const getLevelChangeIcon = (change) => {
    if (!change || change === 0) return <Minus size={14} strokeWidth={1.5} />;
    if (change > 0) return <TrendingUp size={14} color="green" strokeWidth={2.5} />;
    return <TrendingDown size={14} color="red" strokeWidth={2.5} />;
  };

  const getLevelChangeColor = (change) => {
    if (!change || change === 0) return 'gray';
    return change > 0 ? 'green' : 'red';
  };

  const formatLevelChange = (change) => {
    if (!change || change === 0) return 'No change';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <Card withBorder p="md">
        <Text c="dimmed">Loading progression levels...</Text>
      </Card>
    );
  }

  if (levels.length === 0) {
    return (
      <Card withBorder p="md">
        <Stack gap="sm">
          <Group gap="xs">
            <BarChart3 size={20} />
            <Text fw={600}>Progression Levels</Text>
          </Group>
          <Alert icon={<Info size={16} />} color="blue" variant="light">
            Track your fitness level (1-10 scale) across 7 training zones. Levels update automatically
            based on your workout performance.
          </Alert>
          <Button
            variant="light"
            onClick={handleSeedFromRPE}
            loading={seeding}
          >
            Initialize from Past Workouts
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <>
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <BarChart3 size={20} />
              <Text fw={600}>Progression Levels</Text>
            </Group>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowDetails(true)}
            >
              View Details
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 7 }} spacing="xs">
            {levels.map((level) => {
              const info = getProgressionLevelInfo(level.level);
              const progressPercent = (level.level / 10) * 100;

              return (
                <Tooltip
                  key={level.zone}
                  label={
                    <div>
                      <div><strong>{getZoneLabel(level.zone)}</strong></div>
                      <div>Level: {formatProgressionLevel(level.level, true)}</div>
                      <div>Workouts: {level.workouts_completed || 0}</div>
                      {level.last_level_change && (
                        <div>Last change: {formatLevelChange(level.last_level_change)}</div>
                      )}
                    </div>
                  }
                  multiline
                  withArrow
                >
                  <div>
                    <Text size="xs" c="dimmed" mb={4} ta="center">
                      {getZoneLabel(level.zone)}
                    </Text>
                    <Text size="lg" fw={700} ta="center" c={info.color}>
                      {level.level.toFixed(1)}
                    </Text>
                    <Progress
                      value={progressPercent}
                      size="xs"
                      color={info.color}
                      mt={4}
                    />
                    {level.last_level_change && level.last_level_change !== 0 && (
                      <Group justify="center" gap={4} mt={2}>
                        {getLevelChangeIcon(level.last_level_change)}
                        <Text
                          size="xs"
                          c={getLevelChangeColor(level.last_level_change)}
                        >
                          {formatLevelChange(level.last_level_change)}
                        </Text>
                      </Group>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </SimpleGrid>

          <Text size="xs" c="dimmed" ta="center">
            Levels update automatically based on workout performance
          </Text>
        </Stack>
      </Card>

      <Modal
        opened={showDetails}
        onClose={() => setShowDetails(false)}
        title="Progression Levels Details"
        size="lg"
      >
        <Stack gap="md">
          <Alert icon={<Info size={16} />} color="blue" variant="light">
            Your progression level represents your fitness in each training zone on a 1-10 scale.
            Levels increase when you successfully complete workouts and decrease if you struggle.
          </Alert>

          <Table
            striped
            highlightOnHover
            styles={{
              table: {
                '--table-striped-color': 'rgba(59, 130, 246, 0.05)', // Light blue
                '--table-hover-color': 'rgba(59, 130, 246, 0.1)', // Slightly darker blue on hover
              }
            }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Zone</Table.Th>
                <Table.Th>Level</Table.Th>
                <Table.Th>Workouts</Table.Th>
                <Table.Th>Last Workout</Table.Th>
                <Table.Th>Last Change</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {levels.map((level) => {
                const info = getProgressionLevelInfo(level.level);

                return (
                  <Table.Tr key={level.zone}>
                    <Table.Td>
                      <Text fw={600}>{getZoneLabel(level.zone)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text fw={700} c={info.color}>
                          {level.level.toFixed(1)}
                        </Text>
                        <Badge size="xs" color={info.color} variant="light">
                          {info.label}
                        </Badge>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{level.workouts_completed || 0}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDate(level.last_workout_date)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {level.last_level_change ? (
                        <Group gap={4}>
                          {getLevelChangeIcon(level.last_level_change)}
                          <Text
                            size="sm"
                            c={getLevelChangeColor(level.last_level_change)}
                            fw={600}
                          >
                            {formatLevelChange(level.last_level_change)}
                          </Text>
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">
                          -
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <div>
            <Text size="sm" fw={600} mb="xs">
              Progression Level Scale
            </Text>
            <Stack gap="xs">
              {[
                { range: '1.0-2.0', label: 'Beginner', color: '#868e96' },
                { range: '2.0-3.0', label: 'Novice', color: '#adb5bd' },
                { range: '3.0-5.0', label: 'Intermediate', color: '#4dabf7' },
                { range: '5.0-6.0', label: 'Trained', color: '#51cf66' },
                { range: '6.0-8.0', label: 'Advanced', color: '#ff922b' },
                { range: '8.0-9.0', label: 'Expert', color: '#ff6b6b' },
                { range: '9.0-10.0', label: 'Elite', color: '#862e9c' }
              ].map((item) => (
                <Group key={item.range} gap="xs">
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: item.color
                    }}
                  />
                  <Text size="sm">
                    <strong>{item.range}</strong> - {item.label}
                  </Text>
                </Group>
              ))}
            </Stack>
          </div>
        </Stack>
      </Modal>
    </>
  );
}
