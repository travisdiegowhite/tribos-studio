import React, { useState, useEffect } from 'react';
import { Modal, Stack, Switch, Text, Button, Group, Loader, Center } from '@mantine/core';
import { Bell } from 'lucide-react';
import { supabase } from '../supabase';
import { notifications } from '@mantine/notifications';

/**
 * Reminder Settings Modal
 * Allows users to configure workout reminder preferences
 */
const ReminderSettingsModal = ({ opened, onClose, user }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    daily_workout_reminder: true,
    weekly_summary: true,
    workout_time: '08:00'
  });

  // Load user preferences
  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.id) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          throw error;
        }

        if (data) {
          setSettings({
            daily_workout_reminder: data.daily_workout_reminder ?? true,
            weekly_summary: data.weekly_summary ?? true,
            workout_time: data.workout_time ?? '08:00'
          });
        }
      } catch (error) {
        console.error('Error loading reminder settings:', error);
      } finally {
        setLoading(false);
      }
    };

    if (opened) {
      loadSettings();
    }
  }, [user, opened]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          daily_workout_reminder: settings.daily_workout_reminder,
          weekly_summary: settings.weekly_summary,
          workout_time: settings.workout_time,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      notifications.show({
        title: 'Settings Saved',
        message: 'Your reminder preferences have been updated',
        color: 'green'
      });

      onClose();
    } catch (error) {
      console.error('Error saving reminder settings:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save reminder settings',
        color: 'red'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Bell size={20} />
          <Text fw={600}>Reminder Settings</Text>
        </Group>
      }
      size="md"
    >
      {loading ? (
        <Center py="xl">
          <Stack gap="md" align="center">
            <Loader size="md" />
            <Text size="sm" c="dimmed">Loading reminder settings...</Text>
          </Stack>
        </Center>
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Configure when you'd like to receive workout reminders and training updates.
          </Text>

          <Switch
            label="Daily Workout Reminder"
            description="Get notified each morning about today's scheduled workout"
            checked={settings.daily_workout_reminder}
            onChange={(event) => setSettings({ ...settings, daily_workout_reminder: event.currentTarget.checked })}
          />

          <Switch
            label="Weekly Training Summary"
            description="Receive a summary of your training week every Sunday"
            checked={settings.weekly_summary}
            onChange={(event) => setSettings({ ...settings, weekly_summary: event.currentTarget.checked })}
          />

        <Text size="xs" c="dimmed" mt="md">
          Note: Email reminders will be sent to your account email address. Make sure to check your spam folder if you don't receive them.
        </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save Settings
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
};

export default ReminderSettingsModal;
