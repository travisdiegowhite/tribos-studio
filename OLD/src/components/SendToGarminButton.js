import React, { useState, useEffect } from 'react';
import { Button, Menu, Loader, Text, Group } from '@mantine/core';
import { Download, Check, AlertCircle, Watch } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import garminService from '../utils/garminService';

/**
 * Button component to send a route to Garmin Connect
 *
 * Features:
 * - Checks Garmin connection status on mount
 * - Shows "Connect Garmin" button if not connected
 * - Dropdown menu to select upload format (JSON/GPX/FIT)
 * - Loading state during upload
 * - Success/error notifications
 * - Handles re-authorization if scope missing
 *
 * @param {Object} props
 * @param {Object} props.route - Route object from database
 * @param {Function} props.onSuccess - Callback after successful upload (optional)
 */
export default function SendToGarminButton({ route, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Check Garmin connection status on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      setCheckingConnection(true);
      const connected = await garminService.isConnected();
      setIsConnected(connected);
    } catch (error) {
      console.error('Error checking Garmin connection:', error);
      setIsConnected(false);
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleSendToGarmin = async (format = 'json') => {
    if (!isConnected) {
      notifications.show({
        title: 'Garmin Not Connected',
        message: 'Please connect your Garmin account first',
        color: 'yellow',
        icon: <AlertCircle size={18} />
      });
      return;
    }

    setLoading(true);

    try {
      console.log(`📤 Sending route "${route.name}" to Garmin (format: ${format})`);

      const response = await garminService.sendCourse(route.id, format);

      notifications.show({
        title: 'Sent to Garmin!',
        message: `"${route.name}" is now available on your Garmin device`,
        color: 'green',
        icon: <Check size={18} />,
        autoClose: 5000
      });

      if (onSuccess) {
        onSuccess(response);
      }

    } catch (error) {
      console.error('Failed to send route to Garmin:', error);

      // Check if error is due to missing scope
      if (error.message?.includes('Re-authorize') || error.message?.includes('permission')) {
        notifications.show({
          title: 'Re-authorization Required',
          message: 'Please re-connect Garmin to grant course upload permission',
          color: 'yellow',
          icon: <AlertCircle size={18} />,
          autoClose: 10000
        });
      } else {
        notifications.show({
          title: 'Upload Failed',
          message: error.message || 'Failed to send route to Garmin. Please try again.',
          color: 'red',
          icon: <AlertCircle size={18} />,
          autoClose: 8000
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Don't show button if route has no GPS data
  if (!route.has_gps_data && !route.track_points_count) {
    return null;
  }

  // Loading state while checking connection
  if (checkingConnection) {
    return (
      <Button
        variant="outline"
        leftSection={<Loader size={16} />}
        disabled
        size="xs"
      >
        Checking...
      </Button>
    );
  }

  // Show "Connect Garmin" if not connected
  if (isConnected === false) {
    return (
      <Button
        variant="outline"
        color="blue"
        leftSection={<Watch size={16} />}
        onClick={() => garminService.initiateAuth()}
        size="xs"
      >
        Connect Garmin
      </Button>
    );
  }

  // Show "Send to Garmin" button with format selection menu
  return (
    <Menu shadow="md" width={220}>
      <Menu.Target>
        <Button
          variant="outline"
          color="teal"
          leftSection={loading ? <Loader size={16} /> : <Download size={16} />}
          disabled={loading}
          size="xs"
        >
          {loading ? 'Sending...' : 'Send to Garmin'}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Select Upload Format</Menu.Label>

        <Menu.Item
          onClick={() => handleSendToGarmin('json')}
          disabled={loading}
        >
          <Group gap="xs">
            <div>
              <Text size="sm" fw={500}>JSON (Recommended)</Text>
              <Text size="xs" c="dimmed">Direct API upload, fastest</Text>
            </div>
          </Group>
        </Menu.Item>

        <Menu.Item
          onClick={() => handleSendToGarmin('gpx')}
          disabled={loading}
        >
          <Group gap="xs">
            <div>
              <Text size="sm" fw={500}>GPX File</Text>
              <Text size="xs" c="dimmed">Universal GPS format</Text>
            </div>
          </Group>
        </Menu.Item>

        <Menu.Item
          onClick={() => handleSendToGarmin('fit')}
          disabled={loading}
        >
          <Group gap="xs">
            <div>
              <Text size="sm" fw={500}>FIT File</Text>
              <Text size="xs" c="dimmed">Native Garmin format</Text>
            </div>
          </Group>
        </Menu.Item>

        <Menu.Divider />

        <Menu.Label>
          <Text size="xs" c="dimmed">
            Routes sync to all your Garmin devices
          </Text>
        </Menu.Label>
      </Menu.Dropdown>
    </Menu>
  );
}
