import { useState, useEffect } from 'react';
import { Alert, Button, Group, Text, Stack } from '@mantine/core';
import { IconAlertTriangle, IconRefresh, IconX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { garminService } from '../utils/garminService';

/**
 * IntegrationAlert - Proactively alerts users about integration issues
 *
 * Checks for:
 * - Invalid/expired refresh tokens (requires reconnect)
 * - Missing Garmin User ID (requires reconnect)
 * - Refresh token expiring soon (warning)
 */
export default function IntegrationAlert({ onDismiss }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkIntegrationStatus = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Check if user has dismissed this alert recently (stored in localStorage)
        const dismissedUntil = localStorage.getItem('integration_alert_dismissed');
        if (dismissedUntil && new Date(dismissedUntil) > new Date()) {
          setDismissed(true);
          setLoading(false);
          return;
        }

        // Check Garmin connection status first
        const garminStatus = await garminService.getConnectionStatus();

        if (!garminStatus.connected) {
          // Not connected - no alert needed
          setLoading(false);
          return;
        }

        // Get detailed webhook status
        const webhookStatus = await garminService.getWebhookStatus();
        const health = webhookStatus?.stats?.connectionHealth;

        if (!health) {
          setLoading(false);
          return;
        }

        // Check for critical issues that require user action
        if (health.status === 'refresh_token_invalid') {
          setAlert({
            type: 'error',
            title: 'Garmin Connection Issue',
            message: 'Your Garmin connection has expired. Activities are not syncing.',
            detail: 'This can happen if you changed your Garmin password or revoked app access.',
            action: 'Reconnect Garmin',
            severity: 'critical'
          });
        } else if (health.status === 'refresh_token_expired') {
          setAlert({
            type: 'error',
            title: 'Garmin Connection Expired',
            message: 'Your Garmin refresh token has expired. Activities are not syncing.',
            action: 'Reconnect Garmin',
            severity: 'critical'
          });
        } else if (health.status === 'missing_refresh_token') {
          setAlert({
            type: 'error',
            title: 'Garmin Connection Incomplete',
            message: 'Your Garmin connection is missing authentication data.',
            action: 'Reconnect Garmin',
            severity: 'critical'
          });
        } else if (health.status === 'missing_user_id') {
          setAlert({
            type: 'warning',
            title: 'Garmin Setup Incomplete',
            message: 'Your Garmin User ID is missing. Activities may not sync correctly.',
            action: 'Reconnect Garmin',
            severity: 'high'
          });
        } else if (webhookStatus?.stats?.integration?.refreshTokenExpiresIn) {
          // Check if refresh token expires soon (within 14 days)
          const expiresIn = webhookStatus.stats.integration.refreshTokenExpiresIn;
          if (typeof expiresIn === 'string' && expiresIn.includes('days')) {
            const days = parseInt(expiresIn);
            if (!isNaN(days) && days <= 14 && days > 0) {
              setAlert({
                type: 'warning',
                title: 'Garmin Connection Expiring Soon',
                message: `Your Garmin connection will expire in ${days} days.`,
                detail: 'Reconnect now to avoid sync interruption.',
                action: 'Reconnect Garmin',
                severity: 'medium'
              });
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error checking integration status:', error);
        setLoading(false);
      }
    };

    checkIntegrationStatus();
  }, [user]);

  const handleDismiss = () => {
    // Dismiss for different durations based on severity
    let dismissDuration;
    if (alert?.severity === 'critical') {
      dismissDuration = 24 * 60 * 60 * 1000; // 24 hours for critical
    } else if (alert?.severity === 'high') {
      dismissDuration = 3 * 24 * 60 * 60 * 1000; // 3 days for high
    } else {
      dismissDuration = 7 * 24 * 60 * 60 * 1000; // 7 days for medium/low
    }

    const dismissUntil = new Date(Date.now() + dismissDuration).toISOString();
    localStorage.setItem('integration_alert_dismissed', dismissUntil);
    setDismissed(true);
    onDismiss?.();
  };

  const handleReconnect = () => {
    navigate('/settings?tab=integrations&reconnect=garmin');
  };

  if (loading || dismissed || !alert) {
    return null;
  }

  return (
    <Alert
      icon={<IconAlertTriangle size={20} />}
      title={alert.title}
      color={alert.type === 'error' ? 'red' : 'yellow'}
      withCloseButton
      onClose={handleDismiss}
      mb="md"
      styles={{
        root: {
          borderLeft: `4px solid ${alert.type === 'error' ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-yellow-6)'}`,
        }
      }}
    >
      <Stack gap="xs">
        <Text size="sm">{alert.message}</Text>
        {alert.detail && (
          <Text size="xs" c="dimmed">{alert.detail}</Text>
        )}
        <Group gap="xs" mt="xs">
          <Button
            size="xs"
            variant="filled"
            color={alert.type === 'error' ? 'red' : 'yellow'}
            leftSection={<IconRefresh size={14} />}
            onClick={handleReconnect}
          >
            {alert.action}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={handleDismiss}
          >
            Remind me later
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
