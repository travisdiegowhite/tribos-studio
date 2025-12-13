import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  ActionIcon,
  Tooltip,
  Button,
  Modal,
  Select,
  NumberInput,
  Textarea,
  Paper,
  Progress,
  Box,
  Divider,
  SimpleGrid,
  ThemeIcon,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconCircle,
  IconEdit,
  IconTrash,
  IconPlus,
  IconX,
  IconFlame,
  IconClock,
  IconRoute,
  IconCalendarEvent,
  IconTrendingUp,
  IconGripVertical,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { WORKOUT_TYPES, TRAINING_PHASES, calculateTSS, estimateTSS } from '../utils/trainingPlans';
import { WORKOUT_LIBRARY, getWorkoutById } from '../data/workoutLibrary';
import { tokens } from '../theme';
import { formatLocalDate, addDays, startOfMonth, endOfMonth, parsePlanStartDate } from '../utils/dateUtils';

/**
 * Enhanced Training Calendar Component
 * Displays monthly calendar with planned workouts, completed rides,
 * weekly summaries, and workout editing capabilities
 */
const TrainingCalendar = ({ activePlan, rides = [], formatDistance: formatDistanceProp, ftp, onPlanUpdated }) => {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    workout_type: 'rest',
    workout_id: '',
    target_tss: 0,
    target_duration: 0,
    notes: '',
  });

  // Drag and drop state
  const [draggedWorkout, setDraggedWorkout] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  // Helper to get plan start date (supports both old and new schema)
  const getPlanStartDate = (plan) => plan?.started_at || plan?.start_date;

  // Load planned workouts for current month
  useEffect(() => {
    if (!user?.id || !activePlan?.id) return;
    loadPlannedWorkouts();
  }, [user?.id, activePlan?.id, currentDate]);

  const loadPlannedWorkouts = async () => {
    try {
      // Calculate date range for current month view (with buffer for prev/next month days shown)
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);

      // Add buffer for calendar view (may show days from prev/next month)
      const rangeStart = addDays(monthStart, -7);
      const rangeEnd = addDays(monthEnd, 7);

      // Use formatLocalDate to avoid timezone issues
      const startDateStr = formatLocalDate(rangeStart);
      const endDateStr = formatLocalDate(rangeEnd);

      // Query by scheduled_date range for simpler, more reliable matching
      const { data } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', activePlan.id)
        .gte('scheduled_date', startDateStr)
        .lte('scheduled_date', endDateStr);

      if (data) {
        setPlannedWorkouts(data);
      }
    } catch (error) {
      console.error('Failed to load planned workouts:', error);
    }
  };

  // Get days in month
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  // Get workout for a specific date
  const getWorkoutForDate = (date) => {
    if (!date || !activePlan) return null;

    // Match by scheduled_date for reliable date matching
    // Use formatLocalDate to avoid timezone issues
    const dateStr = formatLocalDate(date);
    return plannedWorkouts.find(w => w.scheduled_date === dateStr);
  };

  // Get rides for a specific date
  const getRidesForDate = (date) => {
    if (!date) return [];

    // Use formatLocalDate to avoid timezone issues
    const dateStr = formatLocalDate(date);

    return rides.filter(ride => {
      const rideDate = new Date(ride.start_date || ride.recorded_at || ride.created_at);
      const rideDateStr = formatLocalDate(rideDate);
      return rideDateStr === dateStr;
    });
  };

  // Calculate weekly summary stats
  const weeklyStats = useMemo(() => {
    if (!activePlan) return {};

    // Use parsePlanStartDate for timezone-safe parsing
    const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
    if (!planStartDate) return {};

    const stats = {};

    // Group workouts by week
    plannedWorkouts.forEach(workout => {
      if (!stats[workout.week_number]) {
        stats[workout.week_number] = {
          plannedTSS: 0,
          actualTSS: 0,
          completedCount: 0,
          totalCount: 0,
          plannedDuration: 0,
          actualDuration: 0,
        };
      }
      if (workout.workout_type !== 'rest') {
        stats[workout.week_number].totalCount++;
        stats[workout.week_number].plannedTSS += workout.target_tss || 0;
        stats[workout.week_number].plannedDuration += workout.target_duration || 0;
        if (workout.completed) {
          stats[workout.week_number].completedCount++;
          stats[workout.week_number].actualTSS += workout.actual_tss || workout.target_tss || 0;
          stats[workout.week_number].actualDuration += workout.actual_duration || workout.target_duration || 0;
        }
      }
    });

    // Add actual ride TSS from activities
    rides.forEach(ride => {
      const rideDate = new Date(ride.start_date);
      const daysSinceStart = Math.floor((rideDate - planStartDate) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.floor(daysSinceStart / 7) + 1;

      if (weekNumber > 0 && weekNumber <= activePlan.duration_weeks) {
        if (!stats[weekNumber]) {
          stats[weekNumber] = {
            plannedTSS: 0,
            actualTSS: 0,
            completedCount: 0,
            totalCount: 0,
            plannedDuration: 0,
            actualDuration: 0,
          };
        }
        // Calculate TSS for this ride
        let rideTSS;
        if (ride.average_watts && ftp) {
          rideTSS = calculateTSS(ride.moving_time, ride.average_watts, ftp);
        } else {
          rideTSS = estimateTSS(
            (ride.moving_time || 0) / 60,
            (ride.distance || 0) / 1000,
            ride.total_elevation_gain || 0,
            'endurance'
          );
        }
        stats[weekNumber].actualTSS += rideTSS || 0;
        stats[weekNumber].actualDuration += (ride.moving_time || 0) / 60;
      }
    });

    return stats;
  }, [plannedWorkouts, rides, activePlan, ftp]);

  // Get current week number
  const getCurrentWeekNumber = () => {
    if (!activePlan) return 0;
    // Use parsePlanStartDate for timezone-safe parsing
    const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
    if (!planStartDate) return 1;

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare at midnight
    const daysSinceStart = Math.floor((now - planStartDate) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  };

  // Get current phase
  const getCurrentPhase = () => {
    if (!activePlan) return null;
    const currentWeek = getCurrentWeekNumber();
    const totalWeeks = activePlan.duration_weeks || 8;
    const progress = currentWeek / totalWeeks;

    if (progress <= 0.3) return { name: 'Base', color: 'blue' };
    if (progress <= 0.6) return { name: 'Build', color: 'orange' };
    if (progress <= 0.85) return { name: 'Peak', color: 'red' };
    return { name: 'Taper', color: 'green' };
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  // Toggle workout completion
  const toggleWorkoutCompletion = async (workout) => {
    try {
      const newCompletedStatus = !workout.completed;

      const updates = {
        completed: newCompletedStatus,
        completed_at: newCompletedStatus ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('planned_workouts')
        .update(updates)
        .eq('id', workout.id);

      if (error) throw error;

      // Reload workouts to reflect changes
      loadPlannedWorkouts();
    } catch (error) {
      console.error('Failed to toggle workout completion:', error);
    }
  };

  // Open edit modal for a workout or date
  const openEditModal = (workout, date) => {
    setSelectedWorkout(workout);
    setSelectedDate(date);

    if (workout) {
      setEditForm({
        workout_type: workout.workout_type || 'rest',
        workout_id: workout.workout_id || '',
        target_tss: workout.target_tss || 0,
        target_duration: workout.target_duration || 0,
        notes: workout.notes || '',
      });
    } else {
      // New workout for this date
      setEditForm({
        workout_type: 'endurance',
        workout_id: '',
        target_tss: 50,
        target_duration: 60,
        notes: '',
      });
    }

    setEditModalOpen(true);
  };

  // Save workout changes
  const saveWorkout = async () => {
    if (!activePlan || !selectedDate) return;
    setSaving(true);

    try {
      // Use parsePlanStartDate for timezone-safe parsing
      const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
      if (!planStartDate) {
        throw new Error('Unable to parse plan start date');
      }

      // Normalize selectedDate to midnight for accurate comparison
      const normalizedSelectedDate = new Date(selectedDate);
      normalizedSelectedDate.setHours(0, 0, 0, 0);

      const daysSinceStart = Math.floor((normalizedSelectedDate - planStartDate) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.floor(daysSinceStart / 7) + 1;
      const dayOfWeek = selectedDate.getDay();

      const workoutData = {
        workout_type: editForm.workout_type,
        workout_id: editForm.workout_id || null,
        target_tss: editForm.target_tss,
        target_duration: editForm.target_duration,
        notes: editForm.notes,
      };

      if (selectedWorkout?.id) {
        // Update existing workout
        const { error } = await supabase
          .from('planned_workouts')
          .update(workoutData)
          .eq('id', selectedWorkout.id);

        if (error) throw error;
      } else {
        // Create new workout
        const workoutInfo = editForm.workout_id ? WORKOUT_LIBRARY[editForm.workout_id] : null;
        const { error } = await supabase
          .from('planned_workouts')
          .insert({
            ...workoutData,
            plan_id: activePlan.id,
            user_id: user.id, // Required by database schema
            week_number: weekNumber,
            day_of_week: dayOfWeek,
            scheduled_date: formatLocalDate(selectedDate), // Critical: include date for calendar matching
            name: workoutInfo?.name || (editForm.workout_type === 'rest' ? 'Rest Day' : `${editForm.workout_type} Workout`), // Required NOT NULL
            duration_minutes: editForm.target_duration || 0, // Required NOT NULL
            completed: false,
          });

        if (error) throw error;
      }

      notifications.show({
        title: 'Workout Saved',
        message: 'Your workout has been updated',
        color: 'lime',
      });

      setEditModalOpen(false);
      loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (error) {
      console.error('Failed to save workout:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save workout',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete workout
  const deleteWorkout = async () => {
    if (!selectedWorkout?.id) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('id', selectedWorkout.id);

      if (error) throw error;

      notifications.show({
        title: 'Workout Removed',
        message: 'Workout has been removed from your plan',
        color: 'gray',
      });

      setEditModalOpen(false);
      loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (error) {
      console.error('Failed to delete workout:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to remove workout',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, workout, date) => {
    if (!workout || workout.workout_type === 'rest') {
      e.preventDefault();
      return;
    }
    setDraggedWorkout({ workout, sourceDate: date });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', workout.id);
  };

  const handleDragOver = (e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (date && draggedWorkout) {
      // Use formatLocalDate for consistent date comparison
      setDragOverDate(formatLocalDate(date));
    }
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDragEnd = () => {
    setDraggedWorkout(null);
    setDragOverDate(null);
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedWorkout || !targetDate || !activePlan) {
      setDraggedWorkout(null);
      return;
    }

    const { workout, sourceDate } = draggedWorkout;

    // Don't drop on same day
    if (sourceDate.toDateString() === targetDate.toDateString()) {
      setDraggedWorkout(null);
      return;
    }

    try {
      // Use parsePlanStartDate for timezone-safe parsing
      const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
      if (!planStartDate) {
        notifications.show({
          title: 'Error',
          message: 'Unable to parse plan start date',
          color: 'red',
        });
        setDraggedWorkout(null);
        return;
      }

      // Normalize targetDate to midnight for accurate comparison
      const normalizedTargetDate = new Date(targetDate);
      normalizedTargetDate.setHours(0, 0, 0, 0);

      // Calculate new week number and day of week for target date
      const daysSinceStart = Math.floor((normalizedTargetDate - planStartDate) / (24 * 60 * 60 * 1000));
      const newWeekNumber = Math.floor(daysSinceStart / 7) + 1;
      const newDayOfWeek = targetDate.getDay();

      // Check if target date is within plan duration
      if (newWeekNumber < 1 || newWeekNumber > activePlan.duration_weeks) {
        notifications.show({
          title: 'Cannot Move Workout',
          message: 'Target date is outside the plan duration',
          color: 'yellow',
        });
        setDraggedWorkout(null);
        return;
      }

      // Calculate new scheduled_date using formatLocalDate to avoid timezone issues
      const newScheduledDate = formatLocalDate(targetDate);

      // Check if there's already a workout on target date
      const existingWorkout = plannedWorkouts.find(
        w => w.week_number === newWeekNumber && w.day_of_week === newDayOfWeek && w.id !== workout.id
      );

      if (existingWorkout && existingWorkout.workout_type !== 'rest') {
        // Swap the workouts
        const sourceWeekNumber = workout.week_number;
        const sourceDayOfWeek = workout.day_of_week;
        const sourceScheduledDate = formatLocalDate(sourceDate);

        // Update dragged workout to new position
        const { error: error1 } = await supabase
          .from('planned_workouts')
          .update({
            week_number: newWeekNumber,
            day_of_week: newDayOfWeek,
            scheduled_date: newScheduledDate,
          })
          .eq('id', workout.id);

        if (error1) throw error1;

        // Update existing workout to old position
        const { error: error2 } = await supabase
          .from('planned_workouts')
          .update({
            week_number: sourceWeekNumber,
            day_of_week: sourceDayOfWeek,
            scheduled_date: sourceScheduledDate,
          })
          .eq('id', existingWorkout.id);

        if (error2) throw error2;

        notifications.show({
          title: 'Workouts Swapped',
          message: 'Workouts have been swapped between days',
          color: 'lime',
        });
      } else {
        // Simply move the workout
        const { error } = await supabase
          .from('planned_workouts')
          .update({
            week_number: newWeekNumber,
            day_of_week: newDayOfWeek,
            scheduled_date: newScheduledDate,
          })
          .eq('id', workout.id);

        if (error) throw error;

        notifications.show({
          title: 'Workout Moved',
          message: `Moved to ${targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
          color: 'lime',
        });
      }

      loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (error) {
      console.error('Failed to move workout:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to move workout',
        color: 'red',
      });
    } finally {
      setDraggedWorkout(null);
    }
  };

  // When workout type changes, auto-fill from library
  const handleWorkoutTypeChange = (type) => {
    setEditForm(prev => ({ ...prev, workout_type: type }));

    // Find a workout from library matching this type
    const matchingWorkout = Object.values(WORKOUT_LIBRARY).find(
      w => w.category === type || w.tags?.includes(type)
    );

    if (matchingWorkout) {
      setEditForm(prev => ({
        ...prev,
        workout_id: matchingWorkout.id,
        target_tss: matchingWorkout.targetTSS || prev.target_tss,
        target_duration: matchingWorkout.duration || prev.target_duration,
      }));
    }
  };

  // Format distance - use prop if provided, otherwise default to simple format
  const formatDistance = formatDistanceProp || ((km) => `${km?.toFixed(1) || 0} km`);

  const days = getDaysInMonth();
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentWeek = getCurrentWeekNumber();
  const currentPhase = getCurrentPhase();

  // Get workout type options for select
  const workoutTypeOptions = Object.entries(WORKOUT_TYPES).map(([key, type]) => ({
    value: key,
    label: `${type.icon} ${type.name}`,
  }));

  return (
    <Stack gap="md">
      {/* Plan Overview Header */}
      {activePlan && (
        <Paper p="md" withBorder>
          <Group justify="space-between" wrap="wrap" gap="md">
            <Group gap="md">
              <Box>
                <Text size="sm" c="dimmed">Active Plan</Text>
                <Text fw={600}>{activePlan.name}</Text>
              </Box>
              {currentPhase && (
                <Badge color={currentPhase.color} variant="light" size="lg">
                  {currentPhase.name} Phase
                </Badge>
              )}
            </Group>
            <Group gap="lg">
              <Box ta="center">
                <Text size="xl" fw={700} c="lime">{currentWeek}</Text>
                <Text size="xs" c="dimmed">of {activePlan.duration_weeks} weeks</Text>
              </Box>
              <Box ta="center">
                <Text size="xl" fw={700} c="blue">
                  {activePlan.compliance_percentage ? Math.round(activePlan.compliance_percentage) : 0}%
                </Text>
                <Text size="xs" c="dimmed">compliance</Text>
              </Box>
            </Group>
          </Group>

          {/* Overall Progress */}
          <Progress
            value={(currentWeek / activePlan.duration_weeks) * 100}
            color="lime"
            size="sm"
            radius="xl"
            mt="md"
          />
        </Paper>
      )}

      {/* Weekly Summary */}
      {activePlan && weeklyStats[currentWeek] && (
        <Paper p="md" withBorder>
          <Group justify="space-between" mb="sm">
            <Text fw={600} size="sm">Week {currentWeek} Summary</Text>
            <Badge variant="light" color="gray">Current Week</Badge>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="orange" variant="light">
                  <IconFlame size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">TSS</Text>
              </Group>
              <Text fw={600}>
                {Math.round(weeklyStats[currentWeek].actualTSS)} / {weeklyStats[currentWeek].plannedTSS}
              </Text>
            </Box>
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="blue" variant="light">
                  <IconClock size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">Duration</Text>
              </Group>
              <Text fw={600}>
                {Math.round(weeklyStats[currentWeek].actualDuration)} / {weeklyStats[currentWeek].plannedDuration} min
              </Text>
            </Box>
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="green" variant="light">
                  <IconCheck size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">Completed</Text>
              </Group>
              <Text fw={600}>
                {weeklyStats[currentWeek].completedCount} / {weeklyStats[currentWeek].totalCount} workouts
              </Text>
            </Box>
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="grape" variant="light">
                  <IconTrendingUp size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">Compliance</Text>
              </Group>
              <Text fw={600}>
                {weeklyStats[currentWeek].totalCount > 0
                  ? Math.round((weeklyStats[currentWeek].completedCount / weeklyStats[currentWeek].totalCount) * 100)
                  : 0}%
              </Text>
            </Box>
          </SimpleGrid>
        </Paper>
      )}

      {/* Calendar */}
      <Card>
        {/* Calendar Header */}
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={600} style={{ color: tokens.colors.textPrimary }}>{monthName}</Text>
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={previousMonth}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <ActionIcon variant="subtle" onClick={nextMonth}>
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Show info about no active plan */}
        {!activePlan && rides.length === 0 && (
          <Text style={{ color: tokens.colors.textMuted }} ta="center" py="xl">
            No rides recorded yet. Connect Strava or upload rides to see them on the calendar.
          </Text>
        )}

        {/* Show calendar if there's a plan OR rides */}
        {(activePlan || rides.length > 0) && (
          <>
            {/* Day Names */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              marginBottom: '8px'
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} size="xs" fw={600} style={{ color: tokens.colors.textMuted }} ta="center">
                  {day}
                </Text>
              ))}
            </div>

            {/* Calendar Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px'
            }}>
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} style={{ minHeight: 80 }} />;
                }

                const workout = getWorkoutForDate(date);
                const dayRides = getRidesForDate(date);
                const isToday = date.toDateString() === new Date().toDateString();
                const isPast = date < new Date() && !isToday;
                const isFuture = date > new Date();

                // Calculate day's TSS
                let dayTSS = 0;
                dayRides.forEach(ride => {
                  if (ride.average_watts && ftp) {
                    dayTSS += calculateTSS(ride.moving_time, ride.average_watts, ftp);
                  } else {
                    dayTSS += estimateTSS(
                      (ride.moving_time || 0) / 60,
                      (ride.distance || 0) / 1000,
                      ride.total_elevation_gain || 0,
                      'endurance'
                    );
                  }
                });

                // Determine border color based on workout completion
                let borderColor = isToday ? tokens.colors.electricLime : tokens.colors.bgTertiary;
                let backgroundColor = isToday ? `${tokens.colors.electricLime}15` : isPast ? tokens.colors.bgSecondary : tokens.colors.bgTertiary;

                if (workout && isPast) {
                  if (workout.completed) {
                    borderColor = '#51cf66';
                    backgroundColor = 'rgba(81, 207, 102, 0.15)';
                  } else if (workout.workout_type !== 'rest') {
                    borderColor = '#ff6b6b';
                    backgroundColor = 'rgba(255, 107, 107, 0.15)';
                  }
                }

                // Check if this date is a drop target (use formatLocalDate for consistent comparison)
                const isDropTarget = dragOverDate === formatLocalDate(date);
                const hasDraggableWorkout = workout && workout.workout_type !== 'rest';

                return (
                  <Card
                    key={index}
                    withBorder
                    p="xs"
                    draggable={hasDraggableWorkout}
                    onDragStart={(e) => handleDragStart(e, workout, date)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, date)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date)}
                    style={{
                      minHeight: 110,
                      backgroundColor: isDropTarget ? 'rgba(132, 216, 99, 0.3)' : backgroundColor,
                      border: isDropTarget ? `2px dashed ${tokens.colors.electricLime}` : `2px solid ${borderColor}`,
                      opacity: isPast && !workout?.completed && !dayRides.length ? 0.7 : 1,
                      cursor: hasDraggableWorkout ? 'grab' : (activePlan ? 'pointer' : 'default'),
                      transition: 'background-color 0.2s, border 0.2s',
                    }}
                    onClick={() => activePlan && openEditModal(workout, date)}
                  >
                    <Stack gap={4}>
                      {/* Date and completion checkbox */}
                      <Group justify="space-between" align="center">
                        <Text size="sm" fw={700} style={{ color: tokens.colors.textPrimary }}>
                          {date.getDate()}
                        </Text>
                        {workout && workout.workout_type !== 'rest' && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color={workout.completed ? 'green' : 'gray'}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWorkoutCompletion(workout);
                            }}
                          >
                            {workout.completed ? <IconCheck size={14} /> : <IconCircle size={14} />}
                          </ActionIcon>
                        )}
                      </Group>

                      {/* Workout info - visible at a glance */}
                      {workout && workout.workout_type !== 'rest' && (
                        <Box>
                          {/* Workout type with icon */}
                          <Group gap={4} mb={4}>
                            <Text size="lg">{WORKOUT_TYPES[workout.workout_type]?.icon || '🚴'}</Text>
                            <Badge
                              size="sm"
                              color={WORKOUT_TYPES[workout.workout_type]?.color || 'gray'}
                              variant={workout.completed ? 'filled' : 'light'}
                            >
                              {WORKOUT_TYPES[workout.workout_type]?.name || workout.workout_type}
                            </Badge>
                          </Group>
                          {/* Workout name */}
                          <Text
                            size="xs"
                            fw={600}
                            lineClamp={1}
                            mb={2}
                            style={{ color: workout.completed ? tokens.colors.textSecondary : tokens.colors.textPrimary }}
                          >
                            {workout.name || 'Workout'}
                          </Text>
                          {/* Duration and TSS - prominent */}
                          <Group gap={8}>
                            {workout.duration_minutes > 0 && (
                              <Text size="xs" fw={500} style={{ color: tokens.colors.textSecondary }}>
                                {workout.duration_minutes} min
                              </Text>
                            )}
                            {workout.target_tss > 0 && (
                              <Text size="xs" fw={600} c="orange">
                                {workout.target_tss} TSS
                              </Text>
                            )}
                          </Group>
                        </Box>
                      )}

                      {/* Rest day indicator */}
                      {workout && workout.workout_type === 'rest' && (
                        <Group gap={4}>
                          <Text size="lg">😴</Text>
                          <Text size="xs" c="dimmed" fw={500}>Rest Day</Text>
                        </Group>
                      )}

                      {/* Completed rides */}
                      {dayRides.length > 0 && (
                        <Tooltip label={dayRides.map(r => r.name || 'Ride').join(', ')}>
                          <Badge size="xs" color="green" variant="filled">
                            🚴 {dayRides.length}
                          </Badge>
                        </Tooltip>
                      )}

                      {/* Show actual TSS if rides */}
                      {dayTSS > 0 && (
                        <Text size="xs" c="orange" fw={500}>{Math.round(dayTSS)} TSS</Text>
                      )}

                      {dayRides.length > 0 && (
                        <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                          {formatDistance(dayRides.reduce((sum, r) => sum + ((r.distance || 0) / 1000), 0))}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                );
              })}
            </div>

            {/* Legend */}
            <Stack gap="xs" mt="md">
              <Group gap="xs">
                <Text size="xs" style={{ color: tokens.colors.textMuted }} fw={600}>Workout Types:</Text>
                {Object.entries(WORKOUT_TYPES).slice(1, 6).map(([key, type]) => (
                  <Group gap={4} key={key}>
                    <Text size="lg">{type.icon}</Text>
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>{type.name}</Text>
                  </Group>
                ))}
              </Group>
              {activePlan && (
                <Group gap="md">
                  <Text size="xs" style={{ color: tokens.colors.textMuted }} fw={600}>Status:</Text>
                  <Group gap={4}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#51cf66', border: '1px solid #51cf66' }} />
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Completed</Text>
                  </Group>
                  <Group gap={4}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: 'rgba(255, 107, 107, 0.15)', border: '2px solid #ff6b6b' }} />
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Missed</Text>
                  </Group>
                  <Group gap={4}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: `${tokens.colors.electricLime}15`, border: `2px solid ${tokens.colors.electricLime}` }} />
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Today</Text>
                  </Group>
                  <Text size="xs" c="dimmed" ml="auto">Drag workouts to move • Click to edit</Text>
                </Group>
              )}
            </Stack>
          </>
        )}
      </Card>

      {/* Edit Workout Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={
          <Group gap="sm">
            <ThemeIcon size="lg" color="lime" variant="light">
              <IconCalendarEvent size={18} />
            </ThemeIcon>
            <Text fw={600}>
              {selectedWorkout ? 'Edit Workout' : 'Add Workout'}
            </Text>
            {selectedDate && (
              <Badge variant="light" color="gray">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Badge>
            )}
          </Group>
        }
        size="md"
      >
        <Stack gap="md">
          <Select
            label="Workout Type"
            value={editForm.workout_type}
            onChange={handleWorkoutTypeChange}
            data={workoutTypeOptions}
          />

          <Group grow>
            <NumberInput
              label="Target TSS"
              value={editForm.target_tss}
              onChange={(val) => setEditForm(prev => ({ ...prev, target_tss: val || 0 }))}
              min={0}
              max={500}
            />
            <NumberInput
              label="Duration (min)"
              value={editForm.target_duration}
              onChange={(val) => setEditForm(prev => ({ ...prev, target_duration: val || 0 }))}
              min={0}
              max={480}
            />
          </Group>

          <Textarea
            label="Notes"
            value={editForm.notes}
            onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Any notes for this workout..."
            rows={3}
          />

          <Divider />

          <Group justify="space-between">
            {selectedWorkout?.id && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={deleteWorkout}
                loading={saving}
              >
                Delete
              </Button>
            )}
            <Group gap="sm" ml="auto">
              <Button variant="subtle" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                color="lime"
                leftSection={<IconCheck size={16} />}
                onClick={saveWorkout}
                loading={saving}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default TrainingCalendar;
