/**
 * Route Export Menu Component
 * Provides a dropdown menu for exporting routes to various formats
 * for use with Garmin and other GPS devices.
 */

import { Menu, Button, Text, Stack, Divider } from '@mantine/core';
import {
  IconDownload,
  IconFileExport,
  IconRoute,
  IconDeviceWatch,
  IconChevronDown,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { exportAndDownloadRoute } from '../utils/routeExport';

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

  const handleExport = (format) => {
    try {
      exportAndDownloadRoute(
        {
          name: route.name || 'Untitled Route',
          description: route.description,
          coordinates: route.coordinates,
          waypoints: route.waypoints,
          distanceKm: route.distanceKm || route.distance_km,
          elevationGainM: route.elevationGainM || route.elevation_gain_m,
          elevationLossM: route.elevationLossM || route.elevation_loss_m,
          routeType: route.routeType || route.route_type,
          surfaceType: route.surfaceType || route.surface_type,
        },
        format
      );

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

  return (
    <Menu shadow="md" width={280} position="bottom-end">
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
        <Menu.Label>Export for Garmin</Menu.Label>

        <Menu.Item
          leftSection={<IconDeviceWatch size={16} />}
          onClick={() => handleExport('tcx')}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              TCX Course (Recommended)
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

        <Divider my="xs" />

        <Menu.Label>How to use</Menu.Label>
        <Text size="xs" c="dimmed" px="sm" pb="xs">
          1. Download the file
          <br />
          2. Go to Garmin Connect web or app
          <br />
          3. Import the course file
          <br />
          4. Sync to your device
        </Text>
      </Menu.Dropdown>
    </Menu>
  );
}

export default RouteExportMenu;
