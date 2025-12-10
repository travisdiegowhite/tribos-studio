/**
 * ActivityLinkingModal Component
 * Allows users to link completed activities to planned workouts
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Text,
  Group,
  Stack,
  Button,
  Card,
  Badge,
  Progress,
  ThemeIcon,
  Divider,
  ScrollArea,
  Alert,
  Loader,
  ActionIcon,
  Tooltip,
  SimpleGrid,
  Box,
} from '@mantine/core';
import {
  IconLink,
  IconCheck,
  IconX,
  IconActivity,
  IconClock,
  IconFlame,
  IconRoute,
  IconCalendar,
  IconSparkles,
  IconAlertCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  suggestActivityLinks,
  activityToSummary,
  getMatchQuality,
  findMatchingActivities,
} from '../../utils/activityMatching';
import { getWorkoutById } from '../../data/workoutLibrary';
import { formatDistance } from '../../utils/units';

export default function ActivityLinkingModal({
  opened,
  onClose,
  activePlan,
  plannedWorkouts = [],
  onLinkComplete,
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [activities, setActivities] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedLinks, setSelectedLinks] = useState({});

  // Load recent activities
  useEffect(() => {
    if (opened && user?.id && activePlan) {
      loadActivities();
    }
  }, [opened, user?.id, activePlan]);

  const loadActivities = async () => {
    try {
      setLoading(true);

      // Get activities from plan start date to now
      const startDate = new Date(activePlan.started_at);
      startDate.setDate(startDate.getDate() - 7); // Include a week before for flexibility

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_date', startDate.toISOString())
        .order('start_date', { ascending: false });

      if (error) throw error;

      const activitySummaries = (data || []).map(activityToSummary);
      setActivities(activitySummaries);

      // Generate suggestions
      const unlinkedWorkouts = plannedWorkouts.filter(
        (w) => !w.completed && !w.activity_id && w.workout_id && w.workout_type !== 'rest'
      );
      const newSuggestions = suggestActivityLinks(activitySummaries, unlinkedWorkouts);
      setSuggestions(newSuggestions);

      // Pre-select high-confidence matches
      const preSelected = {};
      newSuggestions.forEach((s) => {
        if (s.matchScore >= 70) {
          preSelected[s.plannedWorkoutId] = s.activityId;
        }
      });
      setSelectedLinks(preSelected);
    } catch (err) {
      console.error('Error loading activities:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to load activities',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  // Get activity by ID
  const getActivity = (id) => activities.find((a) => a.id === id);

  // Get workout details
  const getWorkout = (workout) => {
    const details = workout.workout_id ? getWorkoutById(workout.workout_id) : null;
    return { ...workout, details };
  };

  // Toggle link selection
  const toggleLink = (workoutId, activityId) => {
    setSelectedLinks((prev) => {
      if (prev[workoutId] === activityId) {
        const { [workoutId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [workoutId]: activityId };
    });
  };

  // Apply selected links
  const applyLinks = async () => {
    const linksToApply = Object.entries(selectedLinks);
    if (linksToApply.length === 0) {
      notifications.show({
        title: 'No Links Selected',
        message: 'Please select at least one activity to link',
        color: 'yellow',
      });
      return;
    }

    try {
      setLinking(true);

      for (const [workoutId, activityId] of linksToApply) {
        const activity = getActivity(activityId);
        if (!activity) continue;

        const { error } = await supabase
          .from('planned_workouts')
          .update({
            activity_id: activityId,
            completed: true,
            completed_at: activity.date,
            actual_tss: activity.tss,
            actual_duration: activity.duration,
            actual_distance_km: activity.distance,
          })
          .eq('id', workoutId);

        if (error) throw error;
      }

      notifications.show({
        title: 'Activities Linked',
        message: `Successfully linked ${linksToApply.length} activities to workouts`,
        color: 'green',
        icon: <IconCheck size={18} />,
      });

      onLinkComplete?.();
      onClose();
    } catch (err) {
      console.error('Error linking activities:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to link some activities',
        color: 'red',
      });
    } finally {
      setLinking(false);
    }
  };

  // Get unlinked workouts with their best matches
  const workoutsWithMatches = useMemo(() => {
    const unlinked = plannedWorkouts.filter(
      (w) => !w.completed && !w.activity_id && w.workout_id && w.workout_type !== 'rest'
    );

    return unlinked.map((workout) => {
      const matches = findMatchingActivities(workout, activities, {}, 30);
      const suggestion = suggestions.find((s) => s.plannedWorkoutId === workout.id);
      const selected = selectedLinks[workout.id];

      return {
        workout: getWorkout(workout),
        matches,
        suggestion,
        selected,
      };
    });
  }, [plannedWorkouts, activities, suggestions, selectedLinks]);

  // Count stats
  const stats = useMemo(() => {
    const total = workoutsWithMatches.length;
    const withMatches = workoutsWithMatches.filter((w) => w.matches.length > 0).length;
    const selected = Object.keys(selectedLinks).length;
    return { total, withMatches, selected };
  }, [workoutsWithMatches, selectedLinks]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <IconLink size={20} />
          <Text fw={600}>Link Activities to Workouts</Text>
        </Group>
      }
      size="xl"
    >
      {loading ? (
        <Stack align="center" py="xl">
          <Loader size="lg" />
          <Text c="dimmed">Analyzing activities...</Text>
        </Stack>
      ) : (
        <Stack spacing="md">
          {/* Stats Summary */}
          <SimpleGrid cols={3} spacing="sm">
            <Card padding="xs" withBorder>
              <Text size="xs" c="dimmed" tt="uppercase">
                Unlinked Workouts
              </Text>
              <Text size="lg" fw={600}>
                {stats.total}
              </Text>
            </Card>
            <Card padding="xs" withBorder>
              <Text size="xs" c="dimmed" tt="uppercase">
                Matches Found
              </Text>
              <Text size="lg" fw={600} c="blue">
                {stats.withMatches}
              </Text>
            </Card>
            <Card padding="xs" withBorder>
              <Text size="xs" c="dimmed" tt="uppercase">
                Selected to Link
              </Text>
              <Text size="lg" fw={600} c="green">
                {stats.selected}
              </Text>
            </Card>
          </SimpleGrid>

          {stats.withMatches > 0 && (
            <Alert icon={<IconSparkles size={18} />} color="blue" variant="light">
              Found {stats.withMatches} potential matches. Review and confirm the links below.
            </Alert>
          )}

          {/* Workouts List */}
          <ScrollArea h={400}>
            <Stack spacing="sm">
              {workoutsWithMatches.length === 0 ? (
                <Alert icon={<IconCheck size={18} />} color="green">
                  All workouts are already linked to activities!
                </Alert>
              ) : (
                workoutsWithMatches.map(({ workout, matches, suggestion, selected }) => (
                  <Card key={workout.id} padding="sm" withBorder>
                    {/* Workout Info */}
                    <Group position="apart" mb="xs">
                      <div>
                        <Text fw={500}>
                          {workout.details?.name || workout.workout_type || 'Workout'}
                        </Text>
                        <Group spacing={8} mt={2}>
                          <Badge size="xs" variant="light">
                            <Group spacing={4}>
                              <IconCalendar size={10} />
                              {new Date(workout.scheduled_date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Group>
                          </Badge>
                          {workout.target_duration && (
                            <Badge size="xs" variant="outline" color="gray">
                              {workout.target_duration} min
                            </Badge>
                          )}
                          {workout.target_tss && (
                            <Badge size="xs" variant="outline" color="gray">
                              {workout.target_tss} TSS
                            </Badge>
                          )}
                        </Group>
                      </div>
                      {selected && (
                        <Badge color="green" leftSection={<IconCheck size={12} />}>
                          Linked
                        </Badge>
                      )}
                    </Group>

                    <Divider my="xs" />

                    {/* Matching Activities */}
                    {matches.length === 0 ? (
                      <Text size="sm" c="dimmed" fs="italic">
                        No matching activities found
                      </Text>
                    ) : (
                      <Stack spacing={4}>
                        {matches.slice(0, 3).map((match) => {
                          const activity = getActivity(match.activityId);
                          if (!activity) return null;

                          const quality = getMatchQuality(match.matchScore);
                          const isSelected = selected === match.activityId;

                          return (
                            <Card
                              key={match.activityId}
                              padding="xs"
                              withBorder
                              style={{
                                cursor: 'pointer',
                                borderColor: isSelected
                                  ? 'var(--mantine-color-green-6)'
                                  : undefined,
                                backgroundColor: isSelected
                                  ? 'var(--mantine-color-green-0)'
                                  : undefined,
                              }}
                              onClick={() => toggleLink(workout.id, match.activityId)}
                            >
                              <Group position="apart" noWrap>
                                <Group spacing="xs" noWrap style={{ flex: 1 }}>
                                  <ThemeIcon
                                    size="sm"
                                    radius="xl"
                                    color={isSelected ? 'green' : 'gray'}
                                    variant={isSelected ? 'filled' : 'light'}
                                  >
                                    {isSelected ? <IconCheck size={12} /> : <IconActivity size={12} />}
                                  </ThemeIcon>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text size="sm" fw={500} lineClamp={1}>
                                      {activity.name}
                                    </Text>
                                    <Group spacing={6}>
                                      <Text size="xs" c="dimmed">
                                        {new Date(activity.date).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                        })}
                                      </Text>
                                      <Text size="xs" c="dimmed">
                                        {activity.duration} min
                                      </Text>
                                      {activity.tss && (
                                        <Text size="xs" c="dimmed">
                                          {activity.tss} TSS
                                        </Text>
                                      )}
                                    </Group>
                                  </div>
                                </Group>
                                <Tooltip
                                  label={match.matchReasons.join(', ')}
                                  withArrow
                                  multiline
                                  w={200}
                                >
                                  <Badge size="sm" color={quality.color} variant="light">
                                    {match.matchScore}% match
                                  </Badge>
                                </Tooltip>
                              </Group>
                            </Card>
                          );
                        })}
                      </Stack>
                    )}
                  </Card>
                ))
              )}
            </Stack>
          </ScrollArea>

          {/* Actions */}
          <Group position="apart" mt="md">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={applyLinks}
              loading={linking}
              disabled={stats.selected === 0}
              leftIcon={<IconLink size={18} />}
            >
              Link {stats.selected} Activities
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
