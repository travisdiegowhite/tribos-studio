import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  NumberInput,
  Textarea,
  Button,
  Divider,
  Badge,
  ThemeIcon,
  SegmentedControl,
  Paper,
  Box,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { RaceFuelCard } from './fueling';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { tokens } from '../theme';
import { formatLocalDate } from '../utils/dateUtils';
import { CalendarBlank, CaretDown, CaretUp, Check, Clock, Fire, MapPin, Mountains, Path, Target, Trash, Trophy } from '@phosphor-icons/react';
import { RACE_TYPES as BASE_RACE_TYPES } from '../utils/raceTypes';
import { listRoutes } from '../utils/routesService';

// Race type options with emoji labels for the modal
const RACE_TYPES = BASE_RACE_TYPES.map(t => {
  const emojiMap = {
    road_race: '🚴', criterium: '🔄', time_trial: '⏱️', gran_fondo: '🏔️',
    century: '💯', gravel: '🪨', cyclocross: '🌲', mtb: '🏔️',
    triathlon: '🏊', other: '🎯',
  };
  return { ...t, label: `${emojiMap[t.value] || '🎯'} ${t.label}` };
});

// Priority options with descriptions
const PRIORITY_OPTIONS = [
  { value: 'A', label: 'A Race', description: 'Main goal - peak for this event' },
  { value: 'B', label: 'B Race', description: 'Important - race well but not peak' },
  { value: 'C', label: 'C Race', description: 'Training race - use as hard workout' },
];

/**
 * RaceGoalModal Component
 * Modal for adding/editing race goals with AI coach awareness
 */
const RaceGoalModal = ({
  opened,
  onClose,
  raceGoal = null, // Pass existing race goal for editing
  onSaved,
  isImperial = false,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fuelPlanOpen, { toggle: toggleFuelPlan }] = useDisclosure(false);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    race_date: null,
    race_type: 'road_race',
    distance_km: null,
    elevation_gain_m: null,
    location: '',
    priority: 'B',
    goal_time_minutes: null,
    goal_power_watts: null,
    goal_placement: '',
    notes: '',
    course_description: '',
    route_id: null,
  });

  // Load saved routes when modal opens
  useEffect(() => {
    if (opened) {
      setRoutesLoading(true);
      listRoutes()
        .then((routes) => setSavedRoutes(routes || []))
        .catch(() => setSavedRoutes([]))
        .finally(() => setRoutesLoading(false));
    }
  }, [opened]);

  // Populate form when editing
  useEffect(() => {
    if (raceGoal) {
      setForm({
        name: raceGoal.name || '',
        race_date: raceGoal.race_date ? new Date(raceGoal.race_date + 'T00:00:00') : null,
        race_type: raceGoal.race_type || 'road_race',
        distance_km: raceGoal.distance_km || null,
        elevation_gain_m: raceGoal.elevation_gain_m || null,
        location: raceGoal.location || '',
        priority: raceGoal.priority || 'B',
        goal_time_minutes: raceGoal.goal_time_minutes || null,
        goal_power_watts: raceGoal.goal_power_watts || null,
        goal_placement: raceGoal.goal_placement || '',
        notes: raceGoal.notes || '',
        course_description: raceGoal.course_description || '',
        route_id: raceGoal.route_id || null,
      });
    } else {
      // Reset form for new race
      setForm({
        name: '',
        race_date: null,
        race_type: 'road_race',
        distance_km: null,
        elevation_gain_m: null,
        location: '',
        priority: 'B',
        goal_time_minutes: null,
        goal_power_watts: null,
        goal_placement: '',
        notes: '',
        course_description: '',
        route_id: null,
      });
    }
  }, [raceGoal, opened]);

  // Convert distance based on unit preference
  const displayDistance = isImperial && form.distance_km
    ? Math.round(form.distance_km * 0.621371)
    : form.distance_km;

  const displayElevation = isImperial && form.elevation_gain_m
    ? Math.round(form.elevation_gain_m * 3.28084)
    : form.elevation_gain_m;

  const handleDistanceChange = (value) => {
    // Store in km internally
    const km = isImperial && value ? value / 0.621371 : value;
    setForm(prev => ({ ...prev, distance_km: km }));
  };

  const handleElevationChange = (value) => {
    // Store in meters internally
    const meters = isImperial && value ? value / 3.28084 : value;
    setForm(prev => ({ ...prev, elevation_gain_m: meters }));
  };

  // Format time for display (minutes to HH:MM)
  const formatGoalTime = (minutes) => {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Calculate days until race
  const getDaysUntil = () => {
    if (!form.race_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const raceDate = new Date(form.race_date);
    raceDate.setHours(0, 0, 0, 0);
    const diffTime = raceDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntil = getDaysUntil();

  // Format date to YYYY-MM-DD string (more robust than relying on formatLocalDate)
  const getFormattedDate = (date) => {
    if (!date) return null;
    try {
      let d;
      if (date instanceof Date) {
        d = date;
      } else if (typeof date === 'string') {
        // If it's already a YYYY-MM-DD string, return it directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
        // Parse date string as LOCAL time by appending T00:00:00
        d = new Date(date + 'T00:00:00');
      } else {
        d = new Date(date);
      }

      if (isNaN(d.getTime())) return null;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return null;
    }
  };

  // Save race goal
  const handleSave = async () => {
    if (!user?.id) {
      notifications.show({
        title: 'Error',
        message: 'You must be logged in to save race goals',
        color: 'red',
      });
      return;
    }

    // Validate required fields - check if date is valid
    const formattedDate = getFormattedDate(form.race_date);

    console.log('Saving race goal:', {
      race_date_raw: form.race_date,
      race_date_formatted: formattedDate,
      race_date_type: typeof form.race_date,
      race_date_instanceof: form.race_date instanceof Date
    });

    if (!form.name?.trim() || !formattedDate) {
      notifications.show({
        title: 'Missing Information',
        message: 'Please enter a race name and select a date',
        color: 'yellow',
      });
      return;
    }

    setSaving(true);

    try {
      const raceData = {
        user_id: user.id,
        name: form.name.trim(),
        race_date: formattedDate,
        race_type: form.race_type,
        distance_km: form.distance_km || null,
        elevation_gain_m: form.elevation_gain_m || null,
        location: form.location.trim() || null,
        priority: form.priority,
        goal_time_minutes: form.goal_time_minutes || null,
        goal_power_watts: form.goal_power_watts || null,
        goal_placement: form.goal_placement.trim() || null,
        notes: form.notes.trim() || null,
        course_description: form.course_description.trim() || null,
        route_id: form.route_id || null,
      };

      if (raceGoal?.id) {
        // Update existing
        const { error } = await supabase
          .from('race_goals')
          .update(raceData)
          .eq('id', raceGoal.id);

        if (error) throw error;

        notifications.show({
          title: 'Race Goal Updated',
          message: `${form.name} has been updated`,
          color: 'terracotta',
        });
      } else {
        // Create new
        const { error } = await supabase
          .from('race_goals')
          .insert(raceData);

        if (error) throw error;

        notifications.show({
          title: 'Race Goal Added',
          message: `${form.name} has been added to your calendar`,
          color: 'terracotta',
          icon: <Trophy size={18} />,
        });
      }

      if (onSaved) onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to save race goal:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save race goal',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete race goal
  const handleDelete = async () => {
    if (!raceGoal?.id) return;

    setDeleting(true);

    try {
      const { error } = await supabase
        .from('race_goals')
        .delete()
        .eq('id', raceGoal.id);

      if (error) throw error;

      notifications.show({
        title: 'Race Goal Removed',
        message: `${raceGoal.name} has been removed`,
        color: 'gray',
      });

      if (onSaved) onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to delete race goal:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete race goal',
        color: 'red',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <ThemeIcon size="lg" color="orange" variant="light">
            <Trophy size={18} />
          </ThemeIcon>
          <Text fw={600}>
            {raceGoal ? 'Edit Race Goal' : 'Add Race Goal'}
          </Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        {/* Race Name */}
        <TextInput
          label="Race Name"
          placeholder="e.g., Tour de France, Local Century"
          value={form.name}
          onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
          required
        />

        {/* Date and Type */}
        <Group grow>
          <DateInput
            label="Race Date"
            placeholder="Select date"
            value={form.race_date}
            onChange={(date) => setForm(prev => ({ ...prev, race_date: date }))}
            minDate={new Date()}
            required
          />
          <Select
            label="Race Type"
            data={RACE_TYPES}
            value={form.race_type}
            onChange={(val) => setForm(prev => ({ ...prev, race_type: val }))}
          />
        </Group>

        {/* Days until race badge */}
        {daysUntil !== null && daysUntil >= 0 && (
          <Paper p="sm" withBorder style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <Group justify="center" gap="md">
              <ThemeIcon size="lg" color={daysUntil < 14 ? 'red' : daysUntil < 30 ? 'orange' : 'terracotta'} variant="light">
                <CalendarBlank size={18} />
              </ThemeIcon>
              <Box ta="center">
                <Text size="xl" fw={700} c={daysUntil < 14 ? 'red' : daysUntil < 30 ? 'orange' : 'terracotta'}>
                  {daysUntil}
                </Text>
                <Text size="xs" c="dimmed">days until race</Text>
              </Box>
            </Group>
          </Paper>
        )}

        {/* Priority Selection */}
        <Box>
          <Text size="sm" fw={500} mb="xs">Race Priority</Text>
          <SegmentedControl
            fullWidth
            data={PRIORITY_OPTIONS.map(opt => ({
              value: opt.value,
              label: (
                <Group gap="xs" justify="center">
                  <Badge
                    size="sm"
                    color={opt.value === 'A' ? 'red' : opt.value === 'B' ? 'orange' : 'gray'}
                    variant="filled"
                  >
                    {opt.value}
                  </Badge>
                  <Text size="sm">{opt.label.split(' ')[1]}</Text>
                </Group>
              ),
            }))}
            value={form.priority}
            onChange={(val) => setForm(prev => ({ ...prev, priority: val }))}
          />
          <Text size="xs" c="dimmed" mt="xs" ta="center">
            {PRIORITY_OPTIONS.find(p => p.value === form.priority)?.description}
          </Text>
        </Box>

        <Divider label="Race Details" labelPosition="center" />

        {/* Link Route */}
        <Select
          label="Link a Route"
          placeholder={routesLoading ? 'Loading routes...' : 'Select a saved route (optional)'}
          value={form.route_id}
          onChange={(routeId) => {
            setForm(prev => ({ ...prev, route_id: routeId }));
            // Auto-populate distance and elevation from route
            if (routeId) {
              const route = savedRoutes.find(r => r.id === routeId);
              if (route) {
                setForm(prev => ({
                  ...prev,
                  route_id: routeId,
                  distance_km: route.distance_km || prev.distance_km,
                  elevation_gain_m: route.elevation_gain_m || prev.elevation_gain_m,
                }));
              }
            }
          }}
          data={savedRoutes.map(r => ({
            value: r.id,
            label: `${r.name}${r.distance_km ? ` — ${Math.round(r.distance_km)} km` : ''}${r.elevation_gain_m ? `, ${Math.round(r.elevation_gain_m)}m` : ''}`,
          }))}
          clearable
          searchable
          leftSection={<MapPin size={16} />}
          disabled={routesLoading}
          nothingFoundMessage="No saved routes"
        />

        {/* Distance and Elevation */}
        <Group grow>
          <NumberInput
            label={`Distance (${isImperial ? 'mi' : 'km'})`}
            placeholder="e.g., 100"
            value={displayDistance}
            onChange={handleDistanceChange}
            min={0}
            max={1000}
            leftSection={<Path size={16} />}
          />
          <NumberInput
            label={`Elevation (${isImperial ? 'ft' : 'm'})`}
            placeholder="e.g., 2000"
            value={displayElevation}
            onChange={handleElevationChange}
            min={0}
            max={30000}
            leftSection={<Mountains size={16} />}
          />
        </Group>

        {/* Location */}
        <TextInput
          label="Location"
          placeholder="e.g., Boulder, Colorado"
          value={form.location}
          onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
        />

        <Divider label="Performance Goals" labelPosition="center" />

        {/* Goal Time and Power */}
        <Group grow>
          <NumberInput
            label="Goal Time (minutes)"
            placeholder="e.g., 180 for 3 hours"
            value={form.goal_time_minutes}
            onChange={(val) => setForm(prev => ({ ...prev, goal_time_minutes: val }))}
            min={0}
            max={1440}
            leftSection={<Clock size={16} />}
            description={form.goal_time_minutes ? formatGoalTime(form.goal_time_minutes) : null}
          />
          <NumberInput
            label="Goal Power (watts)"
            placeholder="e.g., 250"
            value={form.goal_power_watts}
            onChange={(val) => setForm(prev => ({ ...prev, goal_power_watts: val }))}
            min={0}
            max={1000}
            leftSection={<Fire size={16} />}
          />
        </Group>

        {/* Goal Placement */}
        <TextInput
          label="Placement Goal"
          placeholder="e.g., Top 10, Finish, Podium, PR"
          value={form.goal_placement}
          onChange={(e) => setForm(prev => ({ ...prev, goal_placement: e.target.value }))}
          leftSection={<Target size={16} />}
        />

        <Divider label="Additional Info" labelPosition="center" />

        {/* Course Description */}
        <Textarea
          label="Course Description"
          placeholder="Describe the course - hills, terrain, key sections..."
          value={form.course_description}
          onChange={(e) => setForm(prev => ({ ...prev, course_description: e.target.value }))}
          rows={2}
        />

        {/* Notes */}
        <Textarea
          label="Notes"
          placeholder="Any other notes about this race..."
          value={form.notes}
          onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
        />

        {/* Race Fuel Plan - Show for existing races with duration */}
        {raceGoal && form.goal_time_minutes && form.goal_time_minutes >= 60 && (
          <>
            <Divider
              label={
                <Button
                  variant="subtle"
                  size="xs"
                  rightSection={fuelPlanOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
                  onClick={toggleFuelPlan}
                  style={{ color: 'var(--color-teal)' }}
                >
                  Race Day Fuel Plan
                </Button>
              }
              labelPosition="center"
            />

            {fuelPlanOpen && (
              <RaceFuelCard
                race={{
                  name: form.name,
                  estimatedDurationMinutes: form.goal_time_minutes,
                  elevationGainMeters: form.elevation_gain_m || 0,
                }}
                useImperial={isImperial}
              />
            )}
          </>
        )}

        <Divider />

        {/* Action Buttons */}
        <Group justify="space-between">
          {raceGoal?.id && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<Trash size={16} />}
              onClick={handleDelete}
              loading={deleting}
            >
              Delete
            </Button>
          )}
          <Group gap="sm" ml="auto">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="teal"
              leftSection={<Check size={16} />}
              onClick={handleSave}
              loading={saving}
            >
              {raceGoal ? 'Update' : 'Add Race Goal'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default RaceGoalModal;
