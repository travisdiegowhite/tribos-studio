/**
 * AvailabilitySettings Component
 * Allows users to configure their weekly training availability and preferences
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Text,
  Title,
  Group,
  Stack,
  Paper,
  Button,
  ActionIcon,
  Badge,
  NumberInput,
  Switch,
  Textarea,
  Tooltip,
  Loader,
  Alert,
  SegmentedControl,
  Modal,
} from '@mantine/core';
import {
  IconCalendarOff,
  IconStar,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
  IconInfoCircle,
} from '@tabler/icons-react';
import { useUserAvailability } from '../../hooks/useUserAvailability';
import type { AvailabilityStatus, SetDayAvailabilityInput } from '../../types/training';

interface AvailabilitySettingsProps {
  userId: string | null;
  onAvailabilityChange?: () => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS_CONFIG: Record<AvailabilityStatus, { label: string; color: string; icon: React.ReactNode }> = {
  available: { label: 'Available', color: 'green', icon: <IconCheck size={14} /> },
  blocked: { label: 'Blocked', color: 'red', icon: <IconCalendarOff size={14} /> },
  preferred: { label: 'Preferred', color: 'yellow', icon: <IconStar size={14} /> },
};

export function AvailabilitySettings({ userId, onAvailabilityChange }: AvailabilitySettingsProps) {
  const {
    weeklyAvailability,
    preferences,
    loading,
    error,
    setDayAvailability,
    setMultipleDayAvailabilities,
    updatePreferences,
    loadAvailability,
  } = useUserAvailability({ userId, autoLoad: true });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');

  // Local state for preferences form
  const [localPrefs, setLocalPrefs] = useState({
    maxWorkoutsPerWeek: preferences?.maxWorkoutsPerWeek ?? null,
    maxHoursPerWeek: preferences?.maxHoursPerWeek ?? null,
    maxHardDaysPerWeek: preferences?.maxHardDaysPerWeek ?? null,
    minRestDaysPerWeek: preferences?.minRestDaysPerWeek ?? 1,
    preferWeekendLongRides: preferences?.preferWeekendLongRides ?? true,
  });

  // Update local prefs when server data loads
  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        maxWorkoutsPerWeek: preferences.maxWorkoutsPerWeek,
        maxHoursPerWeek: preferences.maxHoursPerWeek,
        maxHardDaysPerWeek: preferences.maxHardDaysPerWeek,
        minRestDaysPerWeek: preferences.minRestDaysPerWeek,
        preferWeekendLongRides: preferences.preferWeekendLongRides,
      });
    }
  }, [preferences]);

  const handleDayStatusChange = async (dayOfWeek: number, newStatus: AvailabilityStatus) => {
    setIsSaving(true);
    const success = await setDayAvailability({
      dayOfWeek,
      status: newStatus,
    });
    setIsSaving(false);

    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      onAvailabilityChange?.();
    }
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    const success = await updatePreferences(localPrefs);
    setIsSaving(false);

    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      onAvailabilityChange?.();
    }
  };

  const handleSaveNotes = async (dayOfWeek: number) => {
    const currentDay = weeklyAvailability.find((d) => d.dayOfWeek === dayOfWeek);
    if (!currentDay) return;

    setIsSaving(true);
    await setDayAvailability({
      dayOfWeek,
      status: currentDay.status,
      notes: editNotes || null,
    });
    setIsSaving(false);
    setEditingDay(null);
    setEditNotes('');
  };

  const blockedCount = weeklyAvailability.filter((d) => d.status === 'blocked').length;
  const preferredCount = weeklyAvailability.filter((d) => d.status === 'preferred').length;

  if (loading) {
    return (
      <Box p="xl" style={{ textAlign: 'center' }}>
        <Loader size="lg" color="lime" />
        <Text mt="md" c="dimmed">Loading availability settings...</Text>
      </Box>
    );
  }

  return (
    <Stack gap="xl">
      {/* Header */}
      <Box>
        <Title order={3} mb="xs">Training Availability</Title>
        <Text c="dimmed" size="sm">
          Configure which days you can train. Blocked days will be avoided when generating training plans.
          Preferred days will be prioritized for key workouts.
        </Text>
      </Box>

      {error && (
        <Alert color="red" icon={<IconAlertCircle />}>
          {error}
        </Alert>
      )}

      {saveSuccess && (
        <Alert color="green" icon={<IconCheck />}>
          Settings saved successfully!
        </Alert>
      )}

      {/* Weekly Availability Grid */}
      <Paper p="md" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Text fw={500}>Weekly Schedule</Text>
          <Group gap="xs">
            <Badge color="red" variant="light" leftSection={<IconCalendarOff size={12} />}>
              {blockedCount} blocked
            </Badge>
            <Badge color="yellow" variant="light" leftSection={<IconStar size={12} />}>
              {preferredCount} preferred
            </Badge>
          </Group>
        </Group>

        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
          }}
        >
          {weeklyAvailability.map((day) => (
            <DayCard
              key={day.dayOfWeek}
              dayOfWeek={day.dayOfWeek}
              dayName={DAY_NAMES[day.dayOfWeek]}
              fullName={FULL_DAY_NAMES[day.dayOfWeek]}
              status={day.status}
              notes={day.notes}
              maxDuration={day.maxDurationMinutes}
              onChange={(status) => handleDayStatusChange(day.dayOfWeek, status)}
              onEditNotes={() => {
                setEditingDay(day.dayOfWeek);
                setEditNotes(day.notes || '');
              }}
              disabled={isSaving}
            />
          ))}
        </Box>

        <Text size="xs" c="dimmed" mt="md">
          Click on a day to cycle through: Available → Preferred → Blocked
        </Text>
      </Paper>

      {/* Training Preferences */}
      <Paper p="md" radius="md" withBorder>
        <Text fw={500} mb="md">Training Preferences</Text>

        <Stack gap="md">
          <Group grow>
            <NumberInput
              label="Max workouts per week"
              description="Leave empty for no limit"
              placeholder="e.g., 5"
              min={1}
              max={7}
              value={localPrefs.maxWorkoutsPerWeek ?? ''}
              onChange={(value) =>
                setLocalPrefs((prev) => ({
                  ...prev,
                  maxWorkoutsPerWeek: value === '' ? null : Number(value),
                }))
              }
            />

            <NumberInput
              label="Max hours per week"
              description="Leave empty for no limit"
              placeholder="e.g., 10"
              min={1}
              max={40}
              value={localPrefs.maxHoursPerWeek ?? ''}
              onChange={(value) =>
                setLocalPrefs((prev) => ({
                  ...prev,
                  maxHoursPerWeek: value === '' ? null : Number(value),
                }))
              }
            />
          </Group>

          <Group grow>
            <NumberInput
              label="Max hard days per week"
              description="High intensity workouts (VO2max, threshold)"
              placeholder="e.g., 2"
              min={0}
              max={4}
              value={localPrefs.maxHardDaysPerWeek ?? ''}
              onChange={(value) =>
                setLocalPrefs((prev) => ({
                  ...prev,
                  maxHardDaysPerWeek: value === '' ? null : Number(value),
                }))
              }
            />

            <NumberInput
              label="Min rest days per week"
              description="Required recovery days"
              min={0}
              max={4}
              value={localPrefs.minRestDaysPerWeek}
              onChange={(value) =>
                setLocalPrefs((prev) => ({
                  ...prev,
                  minRestDaysPerWeek: Number(value) || 1,
                }))
              }
            />
          </Group>

          <Switch
            label="Prefer weekend long rides"
            description="Schedule long endurance rides on Saturday or Sunday"
            checked={localPrefs.preferWeekendLongRides}
            onChange={(e) =>
              setLocalPrefs((prev) => ({
                ...prev,
                preferWeekendLongRides: e.currentTarget.checked,
              }))
            }
          />

          <Button
            onClick={handleSavePreferences}
            loading={isSaving}
            color="lime"
            leftSection={<IconCheck size={16} />}
          >
            Save Preferences
          </Button>
        </Stack>
      </Paper>

      {/* Info Box */}
      <Alert icon={<IconInfoCircle />} color="blue" variant="light">
        <Text size="sm">
          <strong>How it works:</strong> When you start a new training plan, workouts will automatically
          be redistributed away from blocked days. Key workouts like long rides and hard intervals will
          be placed on your preferred days when possible.
        </Text>
      </Alert>

      {/* Notes Modal */}
      <Modal
        opened={editingDay !== null}
        onClose={() => {
          setEditingDay(null);
          setEditNotes('');
        }}
        title={`Notes for ${editingDay !== null ? FULL_DAY_NAMES[editingDay] : ''}`}
      >
        <Stack gap="md">
          <Textarea
            placeholder="e.g., Work meetings all day, can only ride early morning"
            value={editNotes}
            onChange={(e) => setEditNotes(e.currentTarget.value)}
            minRows={3}
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setEditingDay(null);
                setEditNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              color="lime"
              onClick={() => editingDay !== null && handleSaveNotes(editingDay)}
              loading={isSaving}
            >
              Save Notes
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// Day Card Component
interface DayCardProps {
  dayOfWeek: number;
  dayName: string;
  fullName: string;
  status: AvailabilityStatus;
  notes: string | null;
  maxDuration: number | null;
  onChange: (status: AvailabilityStatus) => void | Promise<void>;
  onEditNotes: () => void;
  disabled?: boolean;
}

function DayCard({
  dayOfWeek,
  dayName,
  fullName,
  status,
  notes,
  maxDuration,
  onChange,
  onEditNotes,
  disabled,
}: DayCardProps) {
  const config = STATUS_CONFIG[status];

  const cycleStatus = () => {
    if (disabled) return;
    const statusOrder: AvailabilityStatus[] = ['available', 'preferred', 'blocked'];
    const currentIndex = statusOrder.indexOf(status);
    const nextIndex = (currentIndex + 1) % statusOrder.length;
    onChange(statusOrder[nextIndex]);
  };

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return (
    <Tooltip
      label={
        <Stack gap={4}>
          <Text size="sm" fw={500}>{fullName}</Text>
          <Badge size="xs" color={config.color}>{config.label}</Badge>
          {notes && <Text size="xs" c="dimmed">{notes}</Text>}
          {maxDuration && <Text size="xs" c="dimmed">Max: {maxDuration}min</Text>}
          <Text size="xs" c="dimmed" mt={4}>Click to change status</Text>
        </Stack>
      }
    >
      <Paper
        p="sm"
        radius="md"
        onClick={cycleStatus}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor:
            status === 'blocked'
              ? 'rgba(250, 82, 82, 0.15)'
              : status === 'preferred'
                ? 'rgba(250, 204, 21, 0.15)'
                : 'var(--mantine-color-dark-6)',
          border: `2px solid ${
            status === 'blocked'
              ? 'var(--mantine-color-red-6)'
              : status === 'preferred'
                ? 'var(--mantine-color-yellow-6)'
                : 'var(--mantine-color-dark-4)'
          }`,
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.6 : 1,
          textAlign: 'center',
        }}
      >
        <Text size="xs" c="dimmed" tt="uppercase">
          {dayName}
        </Text>
        <Box mt={4}>
          {config.icon}
        </Box>
        {notes && (
          <Text size="xs" c="dimmed" mt={4} lineClamp={1}>
            {notes}
          </Text>
        )}
      </Paper>
    </Tooltip>
  );
}

export default AvailabilitySettings;
