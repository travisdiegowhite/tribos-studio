import { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Badge,
  Button,
  Paper,
  Box,
  ActionIcon,
  ThemeIcon,
  Progress,
  Tooltip,
  Divider,
} from '@mantine/core';
import {
  IconTrophy,
  IconPlus,
  IconCalendarEvent,
  IconRoute,
  IconMountain,
  IconTarget,
  IconChevronRight,
  IconClock,
} from '@tabler/icons-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { tokens } from '../theme';
import RaceGoalModal from './RaceGoalModal';

// Race type icons and labels
const RACE_TYPE_INFO = {
  road_race: { icon: '🚴', label: 'Road Race' },
  criterium: { icon: '🔄', label: 'Criterium' },
  time_trial: { icon: '⏱️', label: 'Time Trial' },
  gran_fondo: { icon: '🏔️', label: 'Gran Fondo' },
  century: { icon: '💯', label: 'Century' },
  gravel: { icon: '🪨', label: 'Gravel' },
  cyclocross: { icon: '🌲', label: 'Cyclocross' },
  mtb: { icon: '🏔️', label: 'MTB' },
  triathlon: { icon: '🏊', label: 'Triathlon' },
  other: { icon: '🎯', label: 'Event' },
};

/**
 * RaceGoalsPanel Component
 * Displays upcoming race goals with countdown and allows management
 */
const RaceGoalsPanel = ({ isImperial = false, onRaceGoalChange }) => {
  const { user } = useAuth();
  const [raceGoals, setRaceGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRace, setSelectedRace] = useState(null);

  // Load race goals
  useEffect(() => {
    if (user?.id) {
      loadRaceGoals();
    }
  }, [user?.id]);

  const loadRaceGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'upcoming')
        .gte('race_date', new Date().toISOString().split('T')[0])
        .order('race_date', { ascending: true })
        .limit(5);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('race_goals table not yet available');
          return;
        }
        throw error;
      }

      setRaceGoals(data || []);
    } catch (err) {
      console.error('Failed to load race goals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRaceSaved = () => {
    loadRaceGoals();
    if (onRaceGoalChange) onRaceGoalChange();
  };

  const openEditModal = (race) => {
    setSelectedRace(race);
    setModalOpen(true);
  };

  const openAddModal = () => {
    setSelectedRace(null);
    setModalOpen(true);
  };

  // Calculate days until race
  const getDaysUntil = (dateStr) => {
    const raceDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));
  };

  // Get countdown color based on days
  const getCountdownColor = (days) => {
    if (days <= 7) return 'red';
    if (days <= 14) return 'orange';
    if (days <= 30) return 'yellow';
    return 'lime';
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    if (priority === 'A') return 'red';
    if (priority === 'B') return 'orange';
    return 'gray';
  };

  if (loading) {
    return (
      <Card withBorder p="md">
        <Text size="sm" c="dimmed">Loading race goals...</Text>
      </Card>
    );
  }

  return (
    <>
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <ThemeIcon size="lg" color="orange" variant="light">
              <IconTrophy size={18} />
            </ThemeIcon>
            <div>
              <Text fw={600}>Race Goals</Text>
              <Text size="xs" c="dimmed">
                {raceGoals.length > 0
                  ? `${raceGoals.length} upcoming race${raceGoals.length > 1 ? 's' : ''}`
                  : 'Set your target races'}
              </Text>
            </div>
          </Group>
          <Button
            size="xs"
            variant="light"
            color="orange"
            leftSection={<IconPlus size={14} />}
            onClick={openAddModal}
          >
            Add Race
          </Button>
        </Group>

        {raceGoals.length === 0 ? (
          <Paper
            p="lg"
            style={{
              backgroundColor: tokens.colors.bgTertiary,
              textAlign: 'center',
              border: `1px dashed ${tokens.colors.bgTertiary}`,
            }}
          >
            <IconTrophy size={32} style={{ color: tokens.colors.textMuted, marginBottom: 8 }} />
            <Text size="sm" c="dimmed" mb="xs">
              No race goals set
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              Add a race goal to help your AI coach plan your training
            </Text>
            <Button
              size="sm"
              variant="light"
              color="orange"
              leftSection={<IconTrophy size={16} />}
              onClick={openAddModal}
            >
              Add Your First Race Goal
            </Button>
          </Paper>
        ) : (
          <Stack gap="sm">
            {raceGoals.map((race) => {
              const daysUntil = getDaysUntil(race.race_date);
              const raceTypeInfo = RACE_TYPE_INFO[race.race_type] || RACE_TYPE_INFO.other;
              const weeksUntil = Math.round(daysUntil / 7);

              return (
                <Paper
                  key={race.id}
                  p="sm"
                  withBorder
                  style={{
                    cursor: 'pointer',
                    border: race.priority === 'A'
                      ? '2px solid rgba(250, 82, 82, 0.5)'
                      : race.priority === 'B'
                        ? '1px solid rgba(253, 126, 20, 0.3)'
                        : '1px solid var(--mantine-color-dark-4)',
                    backgroundColor: race.priority === 'A'
                      ? 'rgba(250, 82, 82, 0.05)'
                      : 'transparent',
                  }}
                  onClick={() => openEditModal(race)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={4}>
                        <Text size="lg">{raceTypeInfo.icon}</Text>
                        <Badge
                          size="sm"
                          color={getPriorityColor(race.priority)}
                          variant="filled"
                        >
                          {race.priority}
                        </Badge>
                        <Text fw={600} size="sm" lineClamp={1}>
                          {race.name}
                        </Text>
                      </Group>

                      <Group gap="md" wrap="wrap">
                        <Group gap={4}>
                          <IconCalendarEvent size={12} style={{ color: tokens.colors.textMuted }} />
                          <Text size="xs" c="dimmed">
                            {new Date(race.race_date + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </Text>
                        </Group>
                        {race.distance_km && (
                          <Group gap={4}>
                            <IconRoute size={12} style={{ color: tokens.colors.textMuted }} />
                            <Text size="xs" c="dimmed">
                              {isImperial
                                ? `${Math.round(race.distance_km * 0.621371)} mi`
                                : `${Math.round(race.distance_km)} km`}
                            </Text>
                          </Group>
                        )}
                        {race.goal_placement && (
                          <Group gap={4}>
                            <IconTarget size={12} style={{ color: tokens.colors.textMuted }} />
                            <Text size="xs" c="dimmed">{race.goal_placement}</Text>
                          </Group>
                        )}
                      </Group>
                    </Box>

                    <Box ta="center" style={{ minWidth: 60 }}>
                      <Text
                        size="xl"
                        fw={700}
                        c={getCountdownColor(daysUntil)}
                      >
                        {daysUntil}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {daysUntil === 1 ? 'day' : 'days'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        ({weeksUntil} wk{weeksUntil !== 1 ? 's' : ''})
                      </Text>
                    </Box>
                  </Group>

                  {/* Progress bar for races within 12 weeks */}
                  {daysUntil <= 84 && (
                    <Box mt="xs">
                      <Progress
                        value={Math.max(0, 100 - (daysUntil / 84) * 100)}
                        color={getCountdownColor(daysUntil)}
                        size="xs"
                        radius="xl"
                      />
                      <Text size="xs" c="dimmed" ta="right" mt={2}>
                        {daysUntil <= 7
                          ? 'Race Week!'
                          : daysUntil <= 14
                            ? 'Taper Time'
                            : daysUntil <= 28
                              ? 'Final Build'
                              : daysUntil <= 56
                                ? 'Build Phase'
                                : 'Base Building'}
                      </Text>
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>
        )}
      </Card>

      <RaceGoalModal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedRace(null);
        }}
        raceGoal={selectedRace}
        onSaved={handleRaceSaved}
        isImperial={isImperial}
      />
    </>
  );
};

export default RaceGoalsPanel;
