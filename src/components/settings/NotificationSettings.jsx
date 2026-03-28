/**
 * NotificationSettings — Manage push notification preferences from Settings page.
 *
 * Shows push permission status, subscribe/unsubscribe controls, and
 * per-notification-type toggles.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Text,
  Paper,
  Group,
  Button,
  Switch,
  Alert,
  Badge,
  Box,
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Bell, BellSlash, DeviceMobile, Info, Warning } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { usePushNotifications } from '../../hooks/usePushNotifications.ts';
import { tokens } from '../../theme';

const NOTIFICATION_TYPES = [
  {
    key: 'post_ride_insight',
    label: 'Post-ride insights',
    description: 'Get notified when your ride is processed with training load updates',
  },
  {
    key: 'workout_preview',
    label: 'Tomorrow\'s workout',
    description: 'Nightly preview of your scheduled workout for the next day',
  },
  {
    key: 'recovery_flag',
    label: 'Recovery alerts',
    description: 'Warnings when fatigue is high and recovery may be needed',
    comingSoon: true,
  },
  {
    key: 'weekly_summary',
    label: 'Weekly summary',
    description: 'Sunday evening recap of your training week',
    comingSoon: true,
  },
  {
    key: 'feature_updates',
    label: 'Feature updates',
    description: 'Occasional announcements about new tribos.studio features',
    comingSoon: true,
  },
];

export default function NotificationSettings({ userId }) {
  const {
    permission,
    isSubscribed,
    isSupported,
    needsHomeScreenInstall,
    loading: pushLoading,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [preferences, setPreferences] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    setPreferences(data);
    setPrefsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const handleToggle = async (key, value) => {
    // Optimistic update
    setPreferences((prev) => ({ ...prev, [key]: value }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          [key]: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      // Revert on failure
      setPreferences((prev) => ({ ...prev, [key]: !value }));
      notifications.show({
        title: 'Error',
        message: 'Failed to update notification preference',
        color: 'red',
      });
    }
  };

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      notifications.show({
        title: 'Notifications enabled',
        message: 'You\'ll receive training updates on this device',
        color: 'green',
      });
    }
  };

  const handleUnsubscribe = async () => {
    await unsubscribe();
    notifications.show({
      title: 'Notifications disabled',
      message: 'Push notifications turned off for this device',
      color: 'gray',
    });
  };

  return (
    <Stack gap="md">
      {/* Push support status */}
      {!isSupported && (
        <Alert icon={<Warning size={16} />} color="yellow" variant="light">
          Push notifications are not supported in this browser.
          Try Chrome, Edge, or Safari 16+.
        </Alert>
      )}

      {needsHomeScreenInstall && (
        <Alert icon={<DeviceMobile size={16} />} color="blue" variant="light">
          <Text size="sm" fw={500}>Add to Home Screen required</Text>
          <Text size="sm" mt={4}>
            On iOS, push notifications only work when tribos.studio is installed
            to your home screen. Tap the share button (
            <Box component="span" style={{ display: 'inline' }}>⎙</Box>
            ) then "Add to Home Screen".
          </Text>
        </Alert>
      )}

      {/* Permission / subscription status */}
      <Paper p="md" withBorder style={{ borderRadius: 0 }}>
        <Group justify="space-between" align="center">
          <div>
            <Group gap="xs">
              <Text fw={600} size="sm">Push Notifications</Text>
              {isSubscribed && (
                <Badge size="xs" color="green" variant="light">Active</Badge>
              )}
              {permission === 'denied' && (
                <Badge size="xs" color="red" variant="light">Blocked</Badge>
              )}
              {!isSubscribed && permission !== 'denied' && (
                <Badge size="xs" color="gray" variant="light">Off</Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" mt={2}>
              {isSubscribed
                ? 'Receiving notifications on this device'
                : permission === 'denied'
                  ? 'Notifications are blocked. Re-enable in your browser settings.'
                  : 'Enable to receive training alerts on this device'}
            </Text>
          </div>

          {isSupported && !needsHomeScreenInstall && (
            <>
              {isSubscribed ? (
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={handleUnsubscribe}
                  loading={pushLoading}
                  leftSection={<BellSlash size={14} />}
                >
                  Turn off
                </Button>
              ) : permission !== 'denied' ? (
                <Button
                  size="xs"
                  variant="filled"
                  onClick={handleSubscribe}
                  loading={pushLoading}
                  leftSection={<Bell size={14} />}
                  style={{
                    backgroundColor: tokens.colors.terracotta,
                    borderRadius: 0,
                  }}
                >
                  Enable notifications
                </Button>
              ) : null}
            </>
          )}
        </Group>
      </Paper>

      {/* Per-type toggles */}
      {(isSubscribed || prefsLoading) && (
        <Paper p="md" withBorder style={{ borderRadius: 0 }}>
          <Text fw={600} size="sm" mb="md">Notification Types</Text>

          {prefsLoading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : (
            <Stack gap="sm">
              {NOTIFICATION_TYPES.map(({ key, label, description, comingSoon }) => (
                <Group
                  key={key}
                  justify="space-between"
                  align="flex-start"
                  wrap="nowrap"
                >
                  <div style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{label}</Text>
                      {comingSoon && (
                        <Badge size="xs" color="gray" variant="light">Coming soon</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">{description}</Text>
                  </div>
                  <Switch
                    checked={preferences?.[key] ?? true}
                    onChange={(e) => handleToggle(key, e.currentTarget.checked)}
                    disabled={comingSoon}
                    size="sm"
                  />
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
      )}

      {/* Info note */}
      <Alert icon={<Info size={16} />} color="gray" variant="light">
        <Text size="xs">
          Notifications are sent per-device. If you use tribos.studio on multiple
          devices, enable notifications on each one separately.
        </Text>
      </Alert>
    </Stack>
  );
}
