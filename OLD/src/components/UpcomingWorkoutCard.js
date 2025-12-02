import React, { useMemo, useState, useEffect } from 'react';
import { Card, Text, Group, Stack, Badge, ThemeIcon, Button, Tooltip, Menu } from '@mantine/core';
import { Calendar, Clock, Target, CheckCircle, Cloud, Wind, Map, Pencil, ChevronDown } from 'lucide-react';
import { WORKOUT_TYPES } from '../utils/trainingPlans';
import { supabase } from '../supabase';
import { notifications } from '@mantine/notifications';
import { getWeatherData, getOptimalTrainingConditions } from '../utils/weather';
import { useUnits } from '../utils/units';
import { useNavigate } from 'react-router-dom';

/**
 * Upcoming Workout Preview Card
 * Shows the next scheduled workout for motivation and preparation
 */
const UpcomingWorkoutCard = ({ activePlan, plannedWorkouts = [], onWorkoutComplete, userLocation }) => {
  const { formatTemperature } = useUnits();
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);
  const [weather, setWeather] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const nextWorkout = useMemo(() => {
    if (!activePlan || !plannedWorkouts.length) return null;

    const planStartDate = new Date(activePlan.started_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all future workouts (excluding rest days)
    const futureWorkouts = plannedWorkouts
      .filter(w => w.workout_type !== 'rest')
      .map(workout => {
        const workoutDate = new Date(planStartDate);
        workoutDate.setDate(workoutDate.getDate() + (workout.week_number - 1) * 7 + workout.day_of_week);
        workoutDate.setHours(0, 0, 0, 0);
        return { ...workout, date: workoutDate };
      })
      .filter(w => w.date >= today && !w.completed)
      .sort((a, b) => a.date - b.date);

    if (!futureWorkouts.length) return null;

    const next = futureWorkouts[0];
    const workoutType = WORKOUT_TYPES[next.workout_type] || WORKOUT_TYPES.endurance;

    // Calculate days until workout
    const daysUntil = Math.floor((next.date - today) / (24 * 60 * 60 * 1000));
    const isToday = daysUntil === 0;
    const isTomorrow = daysUntil === 1;

    // Format date
    const dayName = next.date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let whenText = '';
    if (isToday) {
      whenText = 'Today';
    } else if (isTomorrow) {
      whenText = 'Tomorrow';
    } else if (daysUntil <= 7) {
      whenText = `in ${daysUntil} days`;
    } else {
      whenText = dateStr;
    }

    return {
      ...next,
      workoutType,
      dayName,
      dateStr,
      whenText,
      isToday,
      isTomorrow,
      daysUntil
    };
  }, [activePlan, plannedWorkouts]);

  // Load weather for today's workout
  useEffect(() => {
    const loadWeather = async () => {
      if (!nextWorkout || !nextWorkout.isToday) {
        setWeather(null);
        return;
      }

      setLoadingWeather(true);
      try {
        // Try to get user's location from browser or use default
        if (userLocation) {
          const weatherData = await getWeatherData(userLocation.latitude, userLocation.longitude);
          setWeather(weatherData);
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const weatherData = await getWeatherData(
                position.coords.latitude,
                position.coords.longitude
              );
              setWeather(weatherData);
            },
            (error) => {
              console.log('Geolocation error:', error);
              // Silently fail - weather is optional
            }
          );
        }
      } catch (error) {
        console.error('Error loading weather:', error);
      } finally {
        setLoadingWeather(false);
      }
    };

    loadWeather();
  }, [nextWorkout, userLocation]);

  const handleMarkComplete = async () => {
    if (!nextWorkout) return;

    setCompleting(true);
    try {
      const { error } = await supabase
        .from('planned_workouts')
        .update({
          completed: true,
          completed_at: new Date().toISOString()
        })
        .eq('id', nextWorkout.id);

      if (error) throw error;

      notifications.show({
        title: 'Workout Complete! 🎉',
        message: 'Great job on completing your workout!',
        color: 'green'
      });

      // Notify parent to refresh data
      if (onWorkoutComplete) {
        onWorkoutComplete();
      }
    } catch (error) {
      console.error('Error marking workout complete:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to mark workout as complete',
        color: 'red'
      });
    } finally {
      setCompleting(false);
    }
  };

  if (!nextWorkout) return null;

  return (
    <Card withBorder p="md" style={{
      backgroundColor: nextWorkout.isToday ? '#e7f5ff' : 'white',
      borderColor: nextWorkout.isToday ? '#228be6' : undefined
    }}>
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size="lg" color={nextWorkout.workoutType.color} variant="light">
              <span style={{ fontSize: '18px' }}>{nextWorkout.workoutType.icon}</span>
            </ThemeIcon>
            <div>
              <Text size="sm" fw={600} c="dark">
                {nextWorkout.isToday ? 'Today\'s Workout' : 'Next Workout'}
              </Text>
              <Text size="xs" c="gray.7">
                {nextWorkout.dayName}, {nextWorkout.dateStr}
              </Text>
            </div>
          </Group>
          <Badge color={nextWorkout.isToday ? 'blue' : 'gray'} variant="light">
            {nextWorkout.whenText}
          </Badge>
        </Group>

        {/* Workout Details */}
        <Stack gap="xs">
          <Text size="md" fw={600} c="dark">
            {nextWorkout.workoutType.name}
          </Text>

          {nextWorkout.notes && (
            <Text size="sm" c="gray.7" lineClamp={2}>
              {nextWorkout.notes}
            </Text>
          )}

          <Group gap="md">
            {nextWorkout.target_duration && (
              <Group gap={4}>
                <Clock size={14} color="dark" />
                <Text size="xs" c="dark">{nextWorkout.target_duration} min</Text>
              </Group>
            )}

            {nextWorkout.target_tss && (
              <Group gap={4}>
                <Target size={14} color="dark" />
                <Text size="xs" c="dark">{nextWorkout.target_tss} TSS</Text>
              </Group>
            )}

            {nextWorkout.target_intensity && (
              <Badge size="xs" color={nextWorkout.workoutType.color} variant="light">
                {nextWorkout.target_intensity}
              </Badge>
            )}
          </Group>
        </Stack>

        {/* Weather for Today's Workout */}
        {nextWorkout.isToday && weather && !loadingWeather && (
          <Group gap="md" p="xs" style={{ backgroundColor: '#f0f9ff', borderRadius: 4 }}>
            <Group gap={4}>
              <Cloud size={16} color="#0284c7" />
              <Text size="xs" fw={500} c="dark">{formatTemperature(weather.temperature)}</Text>
            </Group>
            <Group gap={4}>
              <Wind size={16} color="#0284c7" />
              <Text size="xs" fw={500} c="dark">{weather.windSpeed} km/h {weather.windDirection}</Text>
            </Group>
            <Tooltip label={weather.description}>
              <Badge size="xs" color="blue" variant="light">
                {weather.description}
              </Badge>
            </Tooltip>
          </Group>
        )}

        {/* Motivation Message & Action Button */}
        {nextWorkout.isToday && !nextWorkout.completed && (
          <>
            <Text size="xs" c="blue" fw={500} style={{ fontStyle: 'italic' }}>
              Time to ride! This workout will help build your {nextWorkout.workoutType.name.toLowerCase()} fitness.
            </Text>

            {/* Route Builder Options */}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button
                  fullWidth
                  size="sm"
                  variant="filled"
                  color="blue"
                  rightSection={<ChevronDown size={14} />}
                >
                  Build Route for This Workout
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Map size={16} />}
                  onClick={() => navigate(`/ai-planner?workout=${nextWorkout.id}&plan=${activePlan.id}`)}
                >
                  AI Route Generator
                </Menu.Item>
                <Menu.Item
                  leftSection={<Pencil size={16} />}
                  onClick={() => navigate(`/route-studio?workout=${nextWorkout.id}`)}
                >
                  Manual Route Builder
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Button
              fullWidth
              size="sm"
              color="green"
              leftSection={<CheckCircle size={16} />}
              onClick={handleMarkComplete}
              loading={completing}
            >
              Mark as Complete
            </Button>
          </>
        )}

        {nextWorkout.isToday && nextWorkout.completed && (
          <Badge size="lg" color="green" variant="light" fullWidth>
            ✓ Completed!
          </Badge>
        )}
      </Stack>
    </Card>
  );
};

export default UpcomingWorkoutCard;
