/**
 * Route Export Menu Component
 * Provides a dropdown menu for exporting routes to various formats
 * for use with Garmin and other GPS devices.
 * Includes direct "Send to Garmin" functionality.
 */

import { useState, useEffect } from 'react';
import { Menu, Button, Text, Stack, Divider, Loader } from '@mantine/core';
import {
  IconDownload,
  IconFileExport,
  IconRoute,
  IconDeviceWatch,
  IconChevronDown,
  IconCloudUpload,
  IconCheck,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { exportAndDownloadRoute } from '../utils/routeExport';
import { garminService } from '../utils/garminService';
import { trackFeature, EventType } from '../utils/activityTracking';

/**
 * RouteExportMenu - Dropdown menu for exporting routes
 *
 * @param {Object} props
 * @param {Object} props.route - Route data object with:
 *   - name: string
 *   - coordinates: [lng, lat][] or [lng, lat, ele][]
 *   - distanceKm?: number
 *   - elevationGainM?: number
 *   - waypoints?: { lat, lng, name?, type? }[]
 * @param {string} props.variant - Button variant ('filled', 'light', 'outline', 'subtle')
 * @param {string} props.size - Button size ('xs', 'sm', 'md', 'lg')
 * @param {boolean} props.compact - Use compact button style
 * @param {boolean} props.disabled - Disable the menu
 */
export function RouteExportMenu({
  route,
  variant = 'light',
  size = 'sm',
  compact = false,
  disabled = false,
}) {
  const [garminConnected, setGarminConnected] = useState(false);
  const [sendingToGarmin, setSendingToGarmin] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Check Garmin connection status on mount
  useEffect(() => {
    const checkGarmin = async () => {
      try {
        const status = await garminService.getConnectionStatus();
        setGarminConnected(status.connected && !status.requiresReconnect);
      } catch (error) {
        console.error('Error checking Garmin status:', error);
        setGarminConnected(false);
      } finally {
        setCheckingConnection(false);
      }
    };
    checkGarmin();
  }, []);

  if (!route || !route.coordinates || route.coordinates.length === 0) {
    return (
      <Button
        variant={variant}
        size={size}
        leftSection={<IconDownload size={16} />}
        disabled
      >
        Export
      </Button>
    );
  }

  const getRouteData = () => ({
    name: route.name || 'Untitled Route',
    description: route.description,
    coordinates: route.coordinates,
    waypoints: route.waypoints,
    distanceKm: route.distanceKm || route.distance_km,
    elevationGainM: route.elevationGainM || route.elevation_gain_m,
    elevationLossM: route.elevationLossM || route.elevation_loss_m,
    routeType: route.routeType || route.route_type,
    surfaceType: route.surfaceType || route.surface_type,
  });

  const handleExport = (format) => {
    try {
      exportAndDownloadRoute(getRouteData(), format);

      trackFeature(EventType.ROUTE_EXPORT, {
        format: format,
        routeName: getRouteData().name
      });

      notifications.show({
        title: 'Route Exported',
        message: `Your route has been exported as ${format.toUpperCase()}. You can now upload it to Garmin Connect or copy it to your device.`,
        color: 'green',
        icon: <IconFileExport size={16} />,
      });
    } catch (error) {
      console.error('Export failed:', error);
      notifications.show({
        title: 'Export Failed',
        message: error.message || 'Failed to export route',
        color: 'red',
      });
    }
  };

  const handleSendToGarmin = async () => {
    setSendingToGarmin(true);

    try {
      const result = await garminService.pushRoute(getRouteData());

      if (result.success) {
        trackFeature(EventType.ROUTE_SEND_TO_GARMIN, {
          routeName: getRouteData().name,
          success: true
        });

        notifications.show({
          title: 'Sent to Garmin!',
          message: result.message || 'Route sent to Garmin Connect. Sync your device to download it.',
          color: 'green',
          icon: <IconCheck size={16} />,
          autoClose: 5000,
        });
      } else {
        // Include details from Garmin if available
        const errorMsg = result.details
          ? `${result.error}: ${result.details}`
          : result.error || 'Failed to send route';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Send to Garmin failed:', error);

      // Check for specific error types
      if (error.message?.includes('reconnect') || error.message?.includes('authorization')) {
        notifications.show({
          title: 'Garmin Connection Issue',
          message: 'Please reconnect your Garmin account in Settings.',
          color: 'yellow',
        });
      } else {
        notifications.show({
          title: 'Send Failed',
          message: error.message || 'Failed to send route to Garmin',
          color: 'red',
          autoClose: 10000, // Show longer so user can read
        });
      }
    } finally {
      setSendingToGarmin(false);
    }
  };

  return (
    <Menu shadow="md" width={300} position="bottom-end">
      <Menu.Target>
        <Button
          variant={variant}
          size={size}
          leftSection={<IconDownload size={16} />}
          rightSection={compact ? null : <IconChevronDown size={14} />}
          disabled={disabled}
        >
          {compact ? '' : 'Export'}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        {/* Direct send to Garmin - only show if connected */}
        {garminConnected && (
          <>
            <Menu.Item
              leftSection={sendingToGarmin ? <Loader size={16} /> : <IconCloudUpload size={16} />}
              onClick={handleSendToGarmin}
              disabled={sendingToGarmin}
              color="blue"
            >
              <Stack gap={0}>
                <Text size="sm" fw={600}>
                  {sendingToGarmin ? 'Sending...' : 'Send to Garmin'}
                </Text>
                <Text size="xs" c="dimmed">
                  Push directly to Garmin Connect
                </Text>
              </Stack>
            </Menu.Item>
            <Divider my="xs" />
          </>
        )}

        <Menu.Label>Download Files</Menu.Label>

        <Menu.Item
          leftSection={<IconDeviceWatch size={16} />}
          onClick={() => handleExport('tcx')}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              TCX Course
            </Text>
            <Text size="xs" c="dimmed">
              Garmin's native format - best compatibility
            </Text>
          </Stack>
        </Menu.Item>

        <Menu.Item
          leftSection={<IconRoute size={16} />}
          onClick={() => handleExport('gpx')}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              GPX Track
            </Text>
            <Text size="xs" c="dimmed">
              Universal GPS format - works with all devices
            </Text>
          </Stack>
        </Menu.Item>

        {/* Show connection hint if not connected */}
        {!checkingConnection && !garminConnected && (
          <>
            <Divider my="xs" />
            <Text size="xs" c="dimmed" px="sm" pb="xs">
              💡 Connect your Garmin account in Settings to send routes directly to your device.
            </Text>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

export default RouteExportMenu;
